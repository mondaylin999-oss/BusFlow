import assert from "node:assert/strict";
import { app } from "./app.js";
import { pool } from "./database.js";
if (process.env.ALLOW_TEST_WRITES !== "yes")
  throw new Error(
    "Integration tests write records. Use a disposable seeded database and set ALLOW_TEST_WRITES=yes.",
  );
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address() as { port: number };
const base = "http://127.0.0.1:" + address.port;
let checks = 0;
function check(value: unknown, label: string) {
  assert.ok(value, label);
  checks++;
  console.log("PASS " + label);
}
async function call(
  path: string,
  sessionCookie = "",
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as any, headers: r.headers };
}
async function login(username: string) {
  const r = await call("/auth/login", "", "POST", {
    username,
    password: process.env.SEED_PASSWORD,
  });
  assert.equal(r.status, 200);
  const cookie = r.headers?.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
}
try {
  check((await call("/health")).status === 200, "database health");
  check((await call("/trips")).status === 401, "anonymous access denied");
  const admin = await login("admin"),
    counter = await login("counter01"),
    customer = await login("customer01"),
    other = await login("customer02"),
    agent = await login("agent01"),
    agent2 = await login("agent02"),
    branch2 = await login("branch02"),
    driver = await login("driver01"),
    conductor = await login("conductor01");
  check(
    (await call("/users", counter)).status === 403,
    "counter cannot access admin users",
  );
  check(
    (await call("/trips", branch2)).data.total === 0,
    "branch manager cannot list another branch trips",
  );
  const trip = (await call("/trips", customer)).data.items.find(
    (t: any) => new Date(t.departure_at).getTime() > Date.now() + 7200000,
  );
  assert.ok(trip);
  check(
    (await call("/trips/" + trip.id + "/seats", branch2)).status === 403,
    "branch ID tampering denied",
  );
  const seats = (
    await call("/trips/" + trip.id + "/seats", customer)
  ).data.filter((s: any) => s.status === "available");
  const body = {
    tripId: trip.id,
    passengers: [
      { seatId: seats[0].id, name: "Concurrency Test", phone: "09000000001" },
    ],
  };
  const race = await Promise.all([
    call("/bookings", customer, "POST", body),
    call("/bookings", other, "POST", body),
  ]);
  check(
    race.filter((r) => r.status === 201).length === 1 &&
      race.filter((r) => r.status === 409).length === 1,
    "simultaneous seat requests: one success, one conflict",
  );
  const winner = race.findIndex((r) => r.status === 201),
    owner = winner === 0 ? customer : other,
    outsider = winner === 0 ? other : customer,
    booking = race[winner].data;
  check(
    (await call("/bookings/" + booking.id, outsider)).status === 403,
    "customer cannot read another booking",
  );
  check(
    (
      await call("/bookings/" + booking.id + "/payment", owner, "POST", {
        method: "cash",
        reference: "FORGED-PAYMENT",
      })
    ).status === 403,
    "customer cannot mark own booking paid",
  );
  check(
    (await call("/bookings", counter, "POST", { ...body, branchId: 4 }))
      .status === 400,
    "forged branch assignment rejected",
  );
  const pay = () =>
    call("/bookings/" + booking.id + "/payment", admin, "POST", {
      method: "cash",
      reference: "TEST-" + booking.id,
    });
  const payments = await Promise.all([pay(), pay()]);
  check(
    payments.every((r) => r.status === 200),
    "duplicate payment requests are idempotent",
  );
  const detail = (await call("/bookings/" + booking.id, owner)).data;
  check(
    detail.status === "confirmed" && detail.ticket && detail.payment,
    "payment creates confirmed ticket",
  );
  check(
    Number(
      (
        await pool.query("SELECT count(*) FROM payments WHERE booking_id=$1", [
          booking.id,
        ])
      ).rows[0].count,
    ) === 1,
    "only one payment persisted",
  );
  check(
    (
      await call("/bookings/" + booking.id + "/cancel", owner, "POST", {
        reason: "Test cancellation",
      })
    ).status === 200,
    "policy cancellation succeeds",
  );
  const refund = (
    await pool.query("SELECT * FROM refunds WHERE booking_id=$1", [booking.id])
  ).rows[0];
  check(
    refund.amount === Math.floor(trip.fare * 0.9),
    "refund uses configured integer calculation",
  );
  check(
    (await call("/refunds/" + refund.id + "/complete", admin, "POST"))
      .status === 200,
    "authorized refund processing",
  );
  const free = (await call("/trips/" + trip.id + "/seats", customer)).data.find(
    (s: any) => s.id === seats[0].id,
  );
  check(free.status === "available", "cancelled seat becomes available");
  const hold = (
    await call("/bookings", customer, "POST", {
      ...body,
      passengers: [
        { seatId: seats[1].id, name: "Expiry Test", phone: "09000000002" },
      ],
    })
  ).data;
  await pool.query(
    "UPDATE bookings SET held_until=now()-interval '1 minute' WHERE id=$1",
    [hold.id],
  );
  await pool.query(
    "UPDATE trip_seats SET held_until=now()-interval '1 minute' WHERE booking_id=$1",
    [hold.id],
  );
  check(
    (
      await call("/bookings/" + hold.id + "/payment", admin, "POST", {
        method: "cash",
        reference: "EXPIRED",
      })
    ).status === 409,
    "expired hold cannot be paid",
  );
  const expiredSeats = (await call("/trips/" + trip.id + "/seats", customer))
    .data;
  check(
    expiredSeats.find((s: any) => s.id === seats[1].id).status === "available",
    "expired holds released automatically",
  );
  const a = await call("/bookings", agent, "POST", {
    tripId: trip.id,
    passengers: [
      { seatId: seats[2].id, name: "Agent Test", phone: "09000000003" },
    ],
  });
  check(a.status === 201, "agent booking");
  check(
    (await call("/bookings/" + a.data.id, agent2)).status === 403,
    "agent cannot read another agent booking",
  );
  check(
    (
      await call("/bookings/" + a.data.id + "/payment", admin, "POST", {
        method: "cash",
        reference: "AGENT-" + a.data.id,
      })
    ).status === 200,
    "staff confirms agent booking",
  );
  check(
    (await call("/commissions", agent)).data.some(
      (c: any) => c.booking_id === a.data.id,
    ),
    "commission statement populated",
  );
  check(
    (
      await call("/trips/" + trip.id + "/status", driver, "POST", {
        status: "completed",
      })
    ).status === 409,
    "invalid trip transition denied",
  );
  check(
    (
      await call("/trips/" + trip.id + "/status", driver, "POST", {
        status: "boarding",
      })
    ).status === 200,
    "assigned driver starts boarding",
  );
  const manifest = (await call("/trips/" + trip.id + "/manifest", conductor))
    .data;
  check(manifest.length > 0, "assigned conductor gets manifest");
  check(
    (
      await call("/trips/" + trip.id + "/boarding", conductor, "POST", {
        passengerId: manifest[0].id,
        status: "boarded",
      })
    ).status === 200,
    "conductor boards passenger",
  );
  check(
    (await call("/trips/" + trip.id + "/manifest", customer)).status === 403,
    "customer cannot read passenger manifest",
  );
  const audit = (await call("/audit", admin)).data;
  check(audit.length >= 8, "business mutations produce audit records");
  let immutable = false;
  try {
    await pool.query("UPDATE audit_logs SET action=action WHERE id=$1", [
      audit[0].id,
    ]);
  } catch {
    immutable = true;
  }
  check(immutable, "audit records reject updates");
  console.log(`Integration checks passed: ${checks}`);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
}
