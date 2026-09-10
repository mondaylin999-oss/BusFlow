import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool, transaction, audit } from "./database.js";
import { ENV } from "./env.js";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  readSessionToken,
  consumeLoginAttempt,
} from "./auth.js";
import {
  type User,
  HttpError,
  requirePermission,
  branchAllowed,
  ownsBooking,
  checkTransition,
} from "./policy.js";
import { calculatePercent } from "./rules.js";

export const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: ENV.origin }));
app.use(express.json({ limit: "64kb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  next();
});
type Request = express.Request & { user: User };
const route =
  (
    fn: (req: Request, res: express.Response) => Promise<unknown>,
  ): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req as Request, res)).catch(next);
  };
const id = (v: unknown) => z.coerce.number().int().positive().parse(v);
const text = z.string().trim().min(1).max(160);
const paging = (req: Request) => ({
  page: z.coerce.number().int().min(1).default(1).parse(req.query.page),
  size: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .parse(req.query.pageSize),
});
const safeUser = (u: any) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
  company_id: u.company_id,
  region_id: u.region_id,
  branch_id: u.branch_id,
  counter_id: u.counter_id,
  permissions: u.permissions,
});
async function loadUser(userId: number) {
  const { rows } = await pool.query(
    `SELECT u.*,COALESCE((SELECT json_agg(permission) FROM role_permissions WHERE role=u.role),'[]') permissions FROM users u WHERE id=$1 AND status='active'`,
    [userId],
  );
  return rows[0];
}
async function branch(db: PoolClient, branchId: number) {
  const { rows } = await db.query(
    "SELECT b.*,c.region_id,r.company_id FROM branches b JOIN cities c ON c.id=b.city_id JOIN regions r ON r.id=c.region_id WHERE b.id=$1",
    [branchId],
  );
  if (!rows[0]) throw new HttpError(404, "Branch not found");
  return rows[0];
}
async function scopedTrip(
  db: PoolClient,
  user: User,
  tripId: number,
  operational = false,
) {
  const { rows } = await db.query(
    "SELECT * FROM trips WHERE id=$1 FOR UPDATE",
    [tripId],
  );
  const trip = rows[0];
  if (!trip) throw new HttpError(404, "Trip not found");
  const b = await branch(db, trip.origin_branch_id);
  if (b.company_id !== user.company_id)
    throw new HttpError(403, "Outside your company");
  if (["driver", "conductor"].includes(user.role)) {
    if (trip[`${user.role}_id`] !== user.id)
      throw new HttpError(403, "Trip is not assigned to you");
  } else if (operational || !["customer", "agent"].includes(user.role)) {
    if (!branchAllowed(user, b))
      throw new HttpError(403, "Outside your organization scope");
  }
  return trip;
}
async function scopedBooking(db: PoolClient, user: User, bookingId: number) {
  const lookup = (
    await db.query("SELECT trip_id FROM bookings WHERE id=$1", [bookingId])
  ).rows[0];
  if (!lookup) throw new HttpError(404, "Booking not found");
  await db.query("SELECT id FROM trips WHERE id=$1 FOR UPDATE", [
    lookup.trip_id,
  ]);
  const { rows } = await db.query(
    "SELECT * FROM bookings WHERE id=$1 FOR UPDATE",
    [bookingId],
  );
  const booking = rows[0];
  if (!booking) throw new HttpError(404, "Booking not found");
  if (!ownsBooking(user, booking, await branch(db, booking.branch_id)))
    throw new HttpError(403, "Outside your booking scope");
  return booking;
}
async function expire(db: PoolClient, tripId: number) {
  await db.query(
    `UPDATE bookings SET status='expired' WHERE trip_id=$1 AND status='held' AND held_until<=now()`,
    [tripId],
  );
  await db.query(
    `UPDATE trip_seats SET status='available',booking_id=NULL,held_until=NULL WHERE trip_id=$1 AND status='held' AND held_until<=now()`,
    [tripId],
  );
}
async function notify(db: PoolClient, userId: number, message: string) {
  await db.query("INSERT INTO notifications(user_id,message) VALUES($1,$2)", [
    userId,
    message,
  ]);
}

app.get(
  "/health",
  route(async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({
        status: "ok",
        database: "connected",
        version: ENV.version,
        environment: process.env.NODE_ENV || "development",
      });
    } catch {
      res
        .status(503)
        .json({
          status: "unavailable",
          database: "unavailable",
          version: ENV.version,
        });
    }
  }),
);
app.get(
  "/branding",
  route(async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM companies ORDER BY id LIMIT 1",
    );
    res.json(rows[0] || { name: ENV.companyName });
  }),
);
app.post(
  "/auth/login",
  route(async (req, res) => {
    if (!consumeLoginAttempt(req.ip || "unknown"))
      throw new HttpError(429, "Too many login attempts. Try later.");
    const input = z
      .object({ username: text, password: z.string().max(256) })
      .parse(req.body);
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE username=$1 AND status='active'",
      [input.username],
    );
    if (!rows[0] || !verifyPassword(input.password, rows[0].password_hash)) {
      console.warn("[auth] Login failed");
      throw new HttpError(401, "Invalid username or password");
    }
    const u = await loadUser(rows[0].id);
    res.json({
      token: await createSessionToken({
        sub: String(u.id),
        uid: u.id,
        role: u.role,
        username: u.username,
      }),
      user: safeUser(u),
    });
  }),
);
app.post(
  "/auth/register",
  route(async (req, res) => {
    if (!consumeLoginAttempt(req.ip || "unknown"))
      throw new HttpError(429, "Try later");
    const input = z
      .object({
        name: text,
        username: z.string().regex(/^[a-zA-Z0-9_.-]{3,40}$/),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const company = (
      await pool.query("SELECT id FROM companies ORDER BY id LIMIT 1")
    ).rows[0];
    if (!company) throw new HttpError(503, "Company has not been configured");
    const { rows } = await pool.query(
      `INSERT INTO users(username,name,password_hash,role,company_id) VALUES($1,$2,$3,'customer',$4) RETURNING id`,
      [input.username, input.name, hashPassword(input.password), company.id],
    );
    const u = await loadUser(rows[0].id);
    res
      .status(201)
      .json({
        token: await createSessionToken({
          sub: String(u.id),
          uid: u.id,
          role: u.role,
          username: u.username,
        }),
        user: safeUser(u),
      });
  }),
);
app.use((req, res, next) => {
  (async () => {
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "";
    const claims = await readSessionToken(token);
    if (!claims) throw new HttpError(401, "Please sign in");
    const user = await loadUser(claims.uid);
    if (!user) throw new HttpError(401, "Account is inactive");
    (req as Request).user = safeUser(user) as User;
    next();
  })().catch(next);
});
app.get(
  "/auth/me",
  route(async (req, res) => res.json({ user: req.user })),
);
app.post("/auth/logout", (_req, res) => res.json({ ok: true }));
app.post(
  "/auth/password",
  route(async (req, res) => {
    const input = z
      .object({
        currentPassword: z.string().max(256),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const u = await loadUser(req.user.id);
    if (!verifyPassword(input.currentPassword, u.password_hash))
      throw new HttpError(403, "Current password is incorrect");
    await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
      hashPassword(input.password),
      u.id,
    ]);
    res.json({ ok: true });
  }),
);

// SQL scope is applied before pagination; identifiers below are fixed server code.
function scope(
  user: User,
  alias = "br",
  mode = "branch",
): { sql: string; values: unknown[] } {
  const base = `rg.company_id=$1`;
  const values: unknown[] = [user.company_id];
  if (mode === "booking" && ["customer", "agent"].includes(user.role))
    return {
      sql: `${base} AND bk.created_by=$2`,
      values: [...values, user.id],
    };
  if (mode === "trip" && ["driver", "conductor"].includes(user.role))
    return {
      sql: `${base} AND t.${user.role}_id=$2`,
      values: [...values, user.id],
    };
  if (mode === "trip" && ["customer", "agent"].includes(user.role))
    return { sql: base, values };
  if (
    [
      "super_admin",
      "head_office_admin",
      "finance_staff",
      "operations_staff",
    ].includes(user.role)
  )
    return { sql: base, values };
  if (user.role === "regional_manager")
    return {
      sql: `${base} AND ci.region_id=$2`,
      values: [...values, user.region_id],
    };
  if (mode === "booking" && user.role === "counter_staff")
    return {
      sql: `${base} AND ${alias}.id=$2 AND bk.counter_id=$3`,
      values: [...values, user.branch_id, user.counter_id],
    };
  return {
    sql: `${base} AND ${alias}.id=$2`,
    values: [...values, user.branch_id],
  };
}
const orgJoin =
  " JOIN branches br ON br.id=t.origin_branch_id JOIN cities ci ON ci.id=br.city_id JOIN regions rg ON rg.id=ci.region_id ";
app.get(
  "/trips",
  route(async (req, res) => {
    requirePermission(req.user, "trips.view");
    const s = scope(req.user, "br", "trip");
    const { page, size } = paging(req);
    const values = [...s.values];
    let where = s.sql;
    for (const [key, col] of [
      ["from", "rt.origin"],
      ["to", "rt.destination"],
      ["date", "(t.departure_at AT TIME ZONE 'Asia/Yangon')::date::text"],
      ["status", "t.status"],
      ["branch", "br.id::text"],
    ])
      if (req.query[key]) {
        values.push(text.parse(req.query[key]));
        where += ` AND ${col}=$${values.length}`;
      }
    const joins = `FROM trips t JOIN routes rt ON rt.id=t.route_id JOIN buses bu ON bu.id=t.bus_id ${orgJoin}`;
    const count = await pool.query(
      `SELECT count(*) ${joins} WHERE ${where}`,
      values,
    );
    values.push(size, (page - 1) * size);
    const { rows } = await pool.query(
      `SELECT t.*,rt.origin,rt.destination,bu.code bus,br.name gate,(SELECT count(*)::int FROM trip_seats ts WHERE ts.trip_id=t.id) seats,(SELECT count(*)::int FROM trip_seats ts WHERE ts.trip_id=t.id AND (ts.status='available' OR (ts.status='held' AND ts.held_until<=now()))) available ${joins} WHERE ${where} ORDER BY t.departure_at LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    res.json({
      items: rows,
      page,
      pageSize: size,
      total: Number(count.rows[0].count),
      totalPages: Math.ceil(Number(count.rows[0].count) / size),
    });
  }),
);
app.get(
  "/trips/:id/seats",
  route(async (req, res) => {
    requirePermission(req.user, "trips.view");
    res.json(
      await transaction(async (db) => {
        const trip = await scopedTrip(db, req.user, id(req.params.id));
        await expire(db, trip.id);
        return (
          await db.query(
            "SELECT s.*,ts.status,ts.held_until FROM trip_seats ts JOIN seats s ON s.id=ts.seat_id WHERE ts.trip_id=$1 ORDER BY row_number,column_number",
            [trip.id],
          )
        ).rows;
      }),
    );
  }),
);
app.get(
  "/trips/:id/stops",
  route(async (req, res) => {
    res.json(
      await transaction(async (db) => {
        const trip = await scopedTrip(db, req.user, id(req.params.id));
        return (
          await db.query(
            'SELECT *,stop_order AS "nodeOrder" FROM route_stops WHERE route_id=$1 ORDER BY stop_order',
            [trip.route_id],
          )
        ).rows;
      }),
    );
  }),
);
app.post(
  "/trips/:id/status",
  route(async (req, res) => {
    requirePermission(req.user, "trips.update");
    const input = z.object({ status: text }).parse(req.body);
    res.json(
      await transaction(async (db) => {
        const trip = await scopedTrip(db, req.user, id(req.params.id), true);
        checkTransition(trip.status, input.status);
        await db.query("UPDATE trips SET status=$1 WHERE id=$2", [
          input.status,
          trip.id,
        ]);
        await audit(db, req.user.id, "trip.status", "trip", trip.id, {
          from: trip.status,
          to: input.status,
        });
        return { ok: true };
      }),
    );
  }),
);

app.post(
  "/bookings",
  route(async (req, res) => {
    requirePermission(req.user, "bookings.create");
    const input = z
      .object({
        tripId: z.number().int().positive(),
        passengers: z
          .array(
            z.object({
              seatId: z.number().int().positive(),
              name: text,
              phone: z.string().trim().min(5).max(30),
            }),
          )
          .min(1)
          .max(6),
      })
      .strict()
      .parse(req.body);
    const seatIds = input.passengers.map((p) => p.seatId).sort((a, b) => a - b);
    if (new Set(seatIds).size !== seatIds.length)
      throw new HttpError(400, "Each passenger needs a different seat");
    const result = await transaction(async (db) => {
      const trip = await scopedTrip(db, req.user, input.tripId);
      if (
        !["scheduled", "boarding", "delayed"].includes(trip.status) ||
        new Date(trip.departure_at) <= new Date()
      )
        throw new HttpError(409, "Trip is closed for booking");
      await expire(db, trip.id);
      const { rows } = await db.query(
        "SELECT * FROM trip_seats WHERE trip_id=$1 AND seat_id=ANY($2::int[]) ORDER BY seat_id FOR UPDATE",
        [trip.id, seatIds],
      );
      if (
        rows.length !== seatIds.length ||
        rows.some((s) => s.status !== "available")
      )
        throw new HttpError(409, "One or more seats are no longer available");
      const source =
        req.user.role === "customer"
          ? "online"
          : req.user.role === "agent"
            ? "agent"
            : req.user.role === "counter_staff"
              ? "counter"
              : "admin";
      const ref = `BNG-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const booking = (
        await db.query(
          `INSERT INTO bookings(reference,trip_id,created_by,branch_id,counter_id,source,status,total,held_until) VALUES($1,$2,$3,$4,$5,$6,'held',$7,now()+$8*interval '1 minute') RETURNING *`,
          [
            ref,
            trip.id,
            req.user.id,
            trip.origin_branch_id,
            req.user.counter_id,
            source,
            trip.fare * seatIds.length,
            ENV.holdMinutes,
          ],
        )
      ).rows[0];
      for (const p of input.passengers) {
        const passenger = (
          await db.query(
            "INSERT INTO passengers(name,phone) VALUES($1,$2) RETURNING id",
            [p.name, p.phone],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO booking_passengers(booking_id,passenger_id,seat_id) VALUES($1,$2,$3)",
          [booking.id, passenger.id, p.seatId],
        );
      }
      await db.query(
        `UPDATE trip_seats SET status='held',booking_id=$1,held_until=$2 WHERE trip_id=$3 AND seat_id=ANY($4::int[])`,
        [booking.id, booking.held_until, trip.id, seatIds],
      );
      await audit(db, req.user.id, "booking.hold", "booking", booking.id, {
        seats: seatIds,
      });
      return booking;
    });
    res.status(201).json(result);
  }),
);
app.get(
  "/bookings",
  route(async (req, res) => {
    requirePermission(req.user, "bookings.view");
    const s = scope(req.user, "br", "booking");
    const { page, size } = paging(req);
    let where = s.sql;
    const values = [...s.values];
    if (req.query.q) {
      values.push("%" + text.parse(req.query.q) + "%");
      where += ` AND (bk.reference ILIKE $${values.length} OR EXISTS(SELECT 1 FROM booking_passengers bp JOIN passengers p ON p.id=bp.passenger_id WHERE bp.booking_id=bk.id AND (p.name ILIKE $${values.length} OR p.phone ILIKE $${values.length})))`;
    }
    const joins = `FROM bookings bk JOIN trips t ON t.id=bk.trip_id JOIN routes rt ON rt.id=t.route_id ${orgJoin}`;
    const count = Number(
      (await pool.query(`SELECT count(*) ${joins} WHERE ${where}`, values))
        .rows[0].count,
    );
    values.push(size, (page - 1) * size);
    const { rows } = await pool.query(
      `SELECT bk.*,CASE WHEN bk.status='held' AND bk.held_until<=now() THEN 'expired' ELSE bk.status END status,rt.origin,rt.destination,t.departure_at,EXISTS(SELECT 1 FROM payments p WHERE p.booking_id=bk.id) paid ${joins} WHERE ${where} ORDER BY bk.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    res.json({
      items: rows,
      page,
      pageSize: size,
      total: count,
      totalPages: Math.ceil(count / size),
    });
  }),
);
app.get(
  "/bookings/:id",
  route(async (req, res) => {
    requirePermission(req.user, "bookings.view");
    res.json(
      await transaction(async (db) => {
        const b = await scopedBooking(db, req.user, id(req.params.id));
        const trip = (
          await db.query(
            "SELECT t.*,rt.origin,rt.destination,bu.code bus,br.name gate FROM trips t JOIN routes rt ON rt.id=t.route_id JOIN buses bu ON bu.id=t.bus_id JOIN branches br ON br.id=t.origin_branch_id WHERE t.id=$1",
            [b.trip_id],
          )
        ).rows[0];
        const passengers = (
          await db.query(
            "SELECT bp.id,p.name,p.phone,s.seat_number,bp.boarding_status FROM booking_passengers bp JOIN passengers p ON p.id=bp.passenger_id JOIN seats s ON s.id=bp.seat_id WHERE booking_id=$1",
            [b.id],
          )
        ).rows;
        const ticket = (
          await db.query("SELECT * FROM tickets WHERE booking_id=$1", [b.id])
        ).rows[0];
        const payment = (
          await db.query("SELECT * FROM payments WHERE booking_id=$1", [b.id])
        ).rows[0];
        return {
          ...b,
          status:
            b.status === "held" && new Date(b.held_until) <= new Date()
              ? "expired"
              : b.status,
          trip,
          passengers,
          ticket,
          payment,
        };
      }),
    );
  }),
);
app.post(
  "/bookings/:id/payment",
  route(async (req, res) => {
    requirePermission(req.user, "payments.record");
    const input = z
      .object({
        method: z.enum(["cash", "bank_transfer", "mobile_wallet"]),
        reference: z.string().trim().min(4).max(100),
      })
      .parse(req.body);
    res.json(
      await transaction(async (db) => {
        const b = await scopedBooking(db, req.user, id(req.params.id));
        if (b.status === "confirmed") return { ok: true, alreadyPaid: true };
        if (b.status !== "held" || new Date(b.held_until) <= new Date())
          throw new HttpError(409, "Seat hold has expired or was cancelled");
        const trip = await scopedTrip(db, req.user, b.trip_id);
        if (
          !["scheduled", "boarding", "delayed"].includes(trip.status) ||
          new Date(trip.departure_at) <= new Date()
        )
          throw new HttpError(409, "Trip is no longer open");
        const held = (
          await db.query(
            `SELECT seat_id FROM trip_seats WHERE booking_id=$1 AND status='held' AND held_until>now() FOR UPDATE`,
            [b.id],
          )
        ).rows;
        const expected = Number(
          (
            await db.query(
              "SELECT count(*) FROM booking_passengers WHERE booking_id=$1",
              [b.id],
            )
          ).rows[0].count,
        );
        if (held.length !== expected)
          throw new HttpError(
            409,
            "Seat hold no longer belongs to this booking",
          );
        await db.query(
          "INSERT INTO payments(booking_id,reference,method,amount,processed_by) VALUES($1,$2,$3,$4,$5)",
          [b.id, input.reference, input.method, b.total, req.user.id],
        );
        await db.query(`UPDATE bookings SET status='confirmed' WHERE id=$1`, [
          b.id,
        ]);
        await db.query(
          `UPDATE trip_seats SET status='booked',held_until=NULL WHERE booking_id=$1`,
          [b.id],
        );
        await db.query("INSERT INTO tickets(booking_id,number) VALUES($1,$2)", [
          b.id,
          "TKT-" + randomUUID(),
        ]);
        const owner = (
          await db.query("SELECT role FROM users WHERE id=$1", [b.created_by])
        ).rows[0];
        if (owner.role === "agent")
          await db.query(
            "INSERT INTO commissions(booking_id,agent_id,amount) VALUES($1,$2,$3)",
            [
              b.id,
              b.created_by,
              await calculatePercent(b.total, ENV.commissionPercent),
            ],
          );
        await audit(db, req.user.id, "payment.record", "booking", b.id, {
          amount: b.total,
          method: input.method,
        });
        await notify(
          db,
          b.created_by,
          `Booking ${b.reference} confirmed. Payment received.`,
        );
        return { ok: true };
      }),
    );
  }),
);
app.post(
  "/bookings/:id/cancel",
  route(async (req, res) => {
    requirePermission(req.user, "bookings.cancel");
    const { reason } = z.object({ reason: text }).parse(req.body);
    res.json(
      await transaction(async (db) => {
        const b = await scopedBooking(db, req.user, id(req.params.id));
        if (b.status === "cancelled") return { ok: true };
        const trip = (
          await db.query("SELECT * FROM trips WHERE id=$1 FOR UPDATE", [
            b.trip_id,
          ])
        ).rows[0];
        if (
          !["held", "confirmed"].includes(b.status) ||
          !["scheduled", "boarding", "delayed"].includes(trip.status) ||
          new Date(trip.departure_at).getTime() - Date.now() <
            ENV.cancelHours * 3600000
        )
          throw new HttpError(409, "Cancellation window is closed");
        const boarded = await db.query(
          `SELECT id FROM booking_passengers WHERE booking_id=$1 AND boarding_status='boarded'`,
          [b.id],
        );
        if (boarded.rowCount)
          throw new HttpError(409, "Boarded tickets cannot be cancelled");
        const p = (
          await db.query("SELECT * FROM payments WHERE booking_id=$1", [b.id])
        ).rows[0];
        if (p)
          await db.query(
            "INSERT INTO refunds(booking_id,payment_id,amount,reason) VALUES($1,$2,$3,$4)",
            [
              b.id,
              p.id,
              await calculatePercent(p.amount, ENV.refundPercent),
              reason,
            ],
          );
        await db.query(`UPDATE bookings SET status='cancelled' WHERE id=$1`, [
          b.id,
        ]);
        await db.query(
          `UPDATE trip_seats SET status='available',booking_id=NULL,held_until=NULL WHERE booking_id=$1`,
          [b.id],
        );
        await db.query(
          `UPDATE tickets SET status='cancelled' WHERE booking_id=$1`,
          [b.id],
        );
        await db.query(
          `UPDATE commissions SET status='reversed' WHERE booking_id=$1`,
          [b.id],
        );
        await audit(db, req.user.id, "booking.cancel", "booking", b.id, {
          reason,
        });
        await notify(
          db,
          b.created_by,
          `Booking ${b.reference} cancelled${p ? "; refund pending staff processing" : ""}.`,
        );
        return { ok: true };
      }),
    );
  }),
);

app.get(
  "/trips/:id/manifest",
  route(async (req, res) => {
    requirePermission(req.user, "manifest.view");
    res.json(
      await transaction(async (db) => {
        const trip = await scopedTrip(db, req.user, id(req.params.id), true);
        return (
          await db.query(
            `SELECT bp.id,p.name,p.phone,s.seat_number,bp.boarding_status,tk.number ticket FROM booking_passengers bp JOIN passengers p ON p.id=bp.passenger_id JOIN seats s ON s.id=bp.seat_id JOIN bookings bk ON bk.id=bp.booking_id JOIN tickets tk ON tk.booking_id=bk.id WHERE bk.trip_id=$1 AND bk.status='confirmed' ORDER BY s.row_number,s.column_number`,
            [trip.id],
          )
        ).rows;
      }),
    );
  }),
);
app.post(
  "/trips/:id/boarding",
  route(async (req, res) => {
    requirePermission(req.user, "boarding.update");
    const input = z
      .object({
        passengerId: z.number().int().positive(),
        status: z.enum(["boarded", "no_show"]),
      })
      .parse(req.body);
    res.json(
      await transaction(async (db) => {
        const trip = await scopedTrip(db, req.user, id(req.params.id), true);
        if (!["boarding", "departed"].includes(trip.status))
          throw new HttpError(409, "Trip must be boarding or departed");
        const { rows } = await db.query(
          `UPDATE booking_passengers bp SET boarding_status=$1 FROM bookings b WHERE bp.id=$2 AND b.id=bp.booking_id AND b.trip_id=$3 AND b.status='confirmed' RETURNING bp.id`,
          [input.status, input.passengerId, trip.id],
        );
        if (!rows.length)
          throw new HttpError(404, "Confirmed passenger not found");
        await audit(
          db,
          req.user.id,
          "boarding." + input.status,
          "booking_passenger",
          input.passengerId,
        );
        return { ok: true };
      }),
    );
  }),
);
app.get(
  "/notifications",
  route(async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 50",
          [req.user.id],
        )
      ).rows,
    ),
  ),
);
app.get(
  "/commissions",
  route(async (req, res) => {
    requirePermission(req.user, "commissions.view");
    res.json(
      (
        await pool.query(
          "SELECT c.*,b.reference FROM commissions c JOIN bookings b ON b.id=c.booking_id WHERE c.agent_id=$1 ORDER BY c.id DESC LIMIT 100",
          [req.user.id],
        )
      ).rows,
    );
  }),
);

app.get(
  "/branches",
  route(async (req, res) => {
    requirePermission(req.user, "branches.view");
    const s = scope(req.user);
    res.json(
      (
        await pool.query(
          `SELECT br.*,ci.name city,ci.region_id,rg.name region FROM branches br JOIN cities ci ON ci.id=br.city_id JOIN regions rg ON rg.id=ci.region_id WHERE ${s.sql} ORDER BY br.id`,
          s.values,
        )
      ).rows,
    );
  }),
);
app.get(
  "/catalog",
  route(async (req, res) => {
    requirePermission(req.user, "catalog.view");
    const s = scope(req.user);
    const branches = (
      await pool.query(
        `SELECT br.* FROM branches br JOIN cities ci ON ci.id=br.city_id JOIN regions rg ON rg.id=ci.region_id WHERE ${s.sql}`,
        s.values,
      )
    ).rows;
    const branchIds = branches.map((b) => b.id);
    const buses = (
      await pool.query(
        "SELECT b.*,(SELECT count(*)::int FROM seats WHERE bus_id=b.id) seats FROM buses b WHERE branch_id=ANY($1::int[]) ORDER BY id",
        [branchIds],
      )
    ).rows;
    const counters = (
      await pool.query(
        "SELECT * FROM counters WHERE branch_id=ANY($1::int[])",
        [branchIds],
      )
    ).rows;
    const routes = (
      await pool.query("SELECT * FROM routes WHERE company_id=$1 ORDER BY id", [
        req.user.company_id,
      ])
    ).rows;
    const cities = (
      await pool.query(
        "SELECT c.* FROM cities c JOIN regions r ON r.id=c.region_id WHERE r.company_id=$1",
        [req.user.company_id],
      )
    ).rows;
    res.json({ branches, buses, counters, routes, cities });
  }),
);
app.post(
  "/branches",
  route(async (req, res) => {
    requirePermission(req.user, "branches.create");
    const input = z
      .object({
        name: text,
        code: text,
        city_id: z.number().int().positive(),
        address: z.string().max(300),
        phone: z.string().max(30),
      })
      .parse(req.body);
    res.status(201).json(
      await transaction(async (db) => {
        const ci = (
          await db.query(
            "SELECT c.*,r.company_id FROM cities c JOIN regions r ON r.id=c.region_id WHERE c.id=$1",
            [input.city_id],
          )
        ).rows[0];
        if (!ci || ci.company_id !== req.user.company_id)
          throw new HttpError(403, "City outside your company");
        const row = (
          await db.query(
            "INSERT INTO branches(name,code,city_id,address,phone) VALUES($1,$2,$3,$4,$5) RETURNING *",
            [input.name, input.code, input.city_id, input.address, input.phone],
          )
        ).rows[0];
        await audit(db, req.user.id, "branch.create", "branch", row.id);
        return row;
      }),
    );
  }),
);
app.post(
  "/buses",
  route(async (req, res) => {
    requirePermission(req.user, "buses.create");
    const i = z
      .object({
        code: text,
        plate_number: text,
        model: text,
        branch_id: z.number().int().positive(),
        rows: z.number().int().min(1).max(20),
        columns: z.number().int().min(2).max(5),
      })
      .parse(req.body);
    res.status(201).json(
      await transaction(async (db) => {
        if (!branchAllowed(req.user, await branch(db, i.branch_id)))
          throw new HttpError(403, "Branch outside scope");
        const b = (
          await db.query(
            "INSERT INTO buses(code,plate_number,model,branch_id) VALUES($1,$2,$3,$4) RETURNING *",
            [i.code, i.plate_number, i.model, i.branch_id],
          )
        ).rows[0];
        for (let r = 1; r <= i.rows; r++)
          for (let c = 1; c <= i.columns; c++)
            await db.query(
              "INSERT INTO seats(bus_id,seat_number,row_number,column_number) VALUES($1,$2,$3,$4)",
              [b.id, String.fromCharCode(64 + r) + c, r, c],
            );
        await audit(db, req.user.id, "bus.create", "bus", b.id);
        return b;
      }),
    );
  }),
);
app.post(
  "/routes",
  route(async (req, res) => {
    requirePermission(req.user, "routes.create");
    const i = z
      .object({
        code: text,
        origin: text,
        destination: text,
        duration_minutes: z.number().int().positive().max(4320),
        distance_km: z.number().int().positive().max(10000),
        stops: z
          .array(
            z.object({
              name: text,
              latitude: z.number().min(-90).max(90),
              longitude: z.number().min(-180).max(180),
            }),
          )
          .min(2)
          .max(30),
      })
      .parse(req.body);
    res.status(201).json(
      await transaction(async (db) => {
        const r = (
          await db.query(
            "INSERT INTO routes(company_id,code,origin,destination,duration_minutes,distance_km) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              req.user.company_id,
              i.code,
              i.origin,
              i.destination,
              i.duration_minutes,
              i.distance_km,
            ],
          )
        ).rows[0];
        for (const [index, s] of i.stops.entries())
          await db.query(
            "INSERT INTO route_stops(route_id,name,stop_order,latitude,longitude) VALUES($1,$2,$3,$4,$5)",
            [r.id, s.name, index, s.latitude, s.longitude],
          );
        await audit(db, req.user.id, "route.create", "route", r.id);
        return r;
      }),
    );
  }),
);
app.get(
  "/users",
  route(async (req, res) => {
    requirePermission(req.user, "users.view");
    const { rows } = await pool.query(
      "SELECT id,username,name,role,region_id,branch_id,counter_id,status FROM users WHERE company_id=$1 ORDER BY id LIMIT 100",
      [req.user.company_id],
    );
    res.json(rows);
  }),
);
app.post(
  "/users",
  route(async (req, res) => {
    requirePermission(req.user, "users.create");
    const i = z
      .object({
        username: z.string().regex(/^[a-zA-Z0-9_.-]{3,40}$/),
        name: text,
        password: z.string().min(12).max(128),
        role: z.enum([
          "branch_manager",
          "counter_staff",
          "agent",
          "driver",
          "conductor",
          "customer",
        ]),
        branch_id: z.number().int().positive().nullable(),
        counter_id: z.number().int().positive().nullable(),
      })
      .parse(req.body);
    res.status(201).json(
      await transaction(async (db) => {
        if (i.role !== "customer" && !i.branch_id)
          throw new HttpError(400, "Staff require a branch");
        if (
          i.branch_id &&
          !branchAllowed(req.user, await branch(db, i.branch_id))
        )
          throw new HttpError(403, "Branch outside scope");
        if (i.role === "counter_staff" && !i.counter_id)
          throw new HttpError(400, "Counter staff require a counter");
        const row = (
          await db.query(
            "INSERT INTO users(username,name,password_hash,role,company_id,branch_id,counter_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [
              i.username,
              i.name,
              hashPassword(i.password),
              i.role,
              req.user.company_id,
              i.branch_id,
              i.counter_id,
            ],
          )
        ).rows[0];
        await audit(db, req.user.id, "user.create", "user", row.id);
        return row;
      }),
    );
  }),
);
app.post(
  "/trips",
  route(async (req, res) => {
    requirePermission(req.user, "trips.create");
    const i = z
      .object({
        route_id: z.number().int().positive(),
        bus_id: z.number().int().positive(),
        origin_branch_id: z.number().int().positive(),
        destination_branch_id: z.number().int().positive(),
        departure_at: z.string().datetime({ offset: true }),
        arrival_at: z.string().datetime({ offset: true }),
        fare: z.number().int().positive().max(10000000),
        driver_id: z.number().int().positive(),
        conductor_id: z.number().int().positive(),
      })
      .parse(req.body);
    res.status(201).json(
      await transaction(async (db) => {
        for (const b of [i.origin_branch_id, i.destination_branch_id])
          if (!branchAllowed(req.user, await branch(db, b)))
            throw new HttpError(403, "Branch outside scope");
        const bu = (
          await db.query("SELECT * FROM buses WHERE id=$1 FOR UPDATE", [
            i.bus_id,
          ])
        ).rows[0];
        if (
          !bu ||
          bu.status !== "active" ||
          bu.branch_id !== i.origin_branch_id
        )
          throw new HttpError(400, "Active bus must belong to origin branch");
        const rt = (
          await db.query(
            "SELECT id FROM routes WHERE id=$1 AND company_id=$2",
            [i.route_id, req.user.company_id],
          )
        ).rows[0];
        if (!rt) throw new HttpError(403, "Route outside company");
        for (const [userId, role] of [
          [i.driver_id, "driver"],
          [i.conductor_id, "conductor"],
        ]) {
          const u = (
            await db.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
              userId,
            ])
          ).rows[0];
          if (
            !u ||
            u.role !== role ||
            u.status !== "active" ||
            u.company_id !== req.user.company_id
          )
            throw new HttpError(400, "Invalid crew assignment");
        }
        const conflicts = await db.query(
          `SELECT id FROM trips WHERE status<>'cancelled' AND (bus_id=$1 OR driver_id=$2 OR conductor_id=$3) AND departure_at<$5 AND arrival_at>$4`,
          [i.bus_id, i.driver_id, i.conductor_id, i.departure_at, i.arrival_at],
        );
        if (conflicts.rowCount)
          throw new HttpError(
            409,
            "Bus or crew already assigned during this period",
          );
        const t = (
          await db.query(
            "INSERT INTO trips(route_id,bus_id,origin_branch_id,destination_branch_id,departure_at,arrival_at,fare,driver_id,conductor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
            [
              i.route_id,
              i.bus_id,
              i.origin_branch_id,
              i.destination_branch_id,
              i.departure_at,
              i.arrival_at,
              i.fare,
              i.driver_id,
              i.conductor_id,
            ],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO trip_seats(trip_id,seat_id) SELECT $1,id FROM seats WHERE bus_id=$2",
          [t.id, i.bus_id],
        );
        await audit(db, req.user.id, "trip.create", "trip", t.id);
        return t;
      }),
    );
  }),
);
app.get(
  "/finance",
  route(async (req, res) => {
    requirePermission(req.user, "finance.view");
    const s = scope(req.user, "br", "booking");
    const joins = `JOIN bookings bk ON bk.id=p.booking_id JOIN trips t ON t.id=bk.trip_id ${orgJoin}`;
    const payments = (
      await pool.query(
        `SELECT p.*,bk.reference booking ${joins} WHERE ${s.sql} ORDER BY p.id DESC LIMIT 100`,
        s.values,
      )
    ).rows;
    const refunds = (
      await pool.query(
        `SELECT f.*,bk.reference booking FROM refunds f JOIN payments p ON p.id=f.payment_id ${joins} WHERE ${s.sql} ORDER BY f.id DESC LIMIT 100`,
        s.values,
      )
    ).rows;
    res.json({ payments, refunds });
  }),
);
app.post(
  "/refunds/:id/complete",
  route(async (req, res) => {
    requirePermission(req.user, "finance.refund");
    res.json(
      await transaction(async (db) => {
        const f = (
          await db.query("SELECT * FROM refunds WHERE id=$1 FOR UPDATE", [
            id(req.params.id),
          ])
        ).rows[0];
        if (!f) throw new HttpError(404, "Refund not found");
        const b = await scopedBooking(db, req.user, f.booking_id);
        if (f.status === "completed") return { ok: true };
        await db.query(
          `UPDATE refunds SET status='completed',processed_by=$1 WHERE id=$2`,
          [req.user.id, f.id],
        );
        await audit(db, req.user.id, "refund.complete", "refund", f.id, {
          amount: f.amount,
        });
        await notify(
          db,
          b.created_by,
          `Refund for ${b.reference} marked completed by staff.`,
        );
        return { ok: true };
      }),
    );
  }),
);
app.get(
  "/audit",
  route(async (req, res) => {
    requirePermission(req.user, "audit.view");
    res.json(
      (
        await pool.query(
          "SELECT a.* FROM audit_logs a JOIN users u ON u.id=a.user_id WHERE u.company_id=$1 ORDER BY a.id DESC LIMIT 100",
          [req.user.company_id],
        )
      ).rows,
    );
  }),
);
app.patch(
  "/branding",
  route(async (req, res) => {
    requirePermission(req.user, "settings.update");
    const i = z
      .object({
        name: text,
        phone: z.string().max(40),
        email: z.string().max(160),
        address: z.string().max(300),
        ticket_footer: z.string().max(400),
      })
      .parse(req.body);
    res.json(
      await transaction(async (db) => {
        await db.query(
          "UPDATE companies SET name=$1,phone=$2,email=$3,address=$4,ticket_footer=$5 WHERE id=$6",
          [
            i.name,
            i.phone,
            i.email,
            i.address,
            i.ticket_footer,
            req.user.company_id,
          ],
        );
        await audit(
          db,
          req.user.id,
          "branding.update",
          "company",
          req.user.company_id,
        );
        return { ok: true };
      }),
    );
  }),
);
app.use((_req, res) => res.status(404).json({ error: "Endpoint not found" }));
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
    if (error instanceof HttpError)
      return res.status(error.status).json({ error: error.message });
    if (error.code === "23505")
      return res
        .status(409)
        .json({ error: "A record with this identifier already exists" });
    if (["23503", "23514"].includes(error.code))
      return res
        .status(400)
        .json({ error: "Invalid assignment or data constraint" });
    console.error("[api] Operation failed", error.code || error.name);
    res
      .status(500)
      .json({
        error: "Operation failed. Please retry or contact your administrator.",
      });
  },
);
