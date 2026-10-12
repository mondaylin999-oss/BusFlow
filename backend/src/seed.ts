import { pool, transaction } from "./database.js";
import { hashPassword } from "./auth.js";
import { ENV } from "./env.js";
const password = process.env.SEED_PASSWORD;
if (
  process.env.NODE_ENV === "production" ||
  !password ||
  password.length < 12 ||
  password === "CHOOSE_A_DEVELOPMENT_PASSWORD"
)
  throw new Error(
    "Set a development SEED_PASSWORD with at least 12 characters. Seeding production is disabled.",
  );
export const rolePermissions: Record<string, string[]> = {
  super_admin: [
    "trips.view",
    "trips.update",
    "trips.create",
    "bookings.create",
    "bookings.view",
    "bookings.cancel",
    "payments.record",
    "manifest.view",
    "boarding.update",
    "branches.view",
    "branches.create",
    "catalog.view",
    "buses.create",
    "routes.create",
    "users.view",
    "users.create",
    "finance.view",
    "finance.refund",
    "audit.view",
    "settings.update",
  ],
  head_office_admin: [
    "trips.view",
    "trips.update",
    "trips.create",
    "bookings.create",
    "bookings.view",
    "bookings.cancel",
    "payments.record",
    "manifest.view",
    "branches.view",
    "branches.create",
    "catalog.view",
    "buses.create",
    "routes.create",
    "users.view",
    "users.create",
    "finance.view",
  ],
  regional_manager: [
    "trips.view",
    "bookings.view",
    "manifest.view",
    "branches.view",
    "catalog.view",
    "finance.view",
  ],
  branch_manager: [
    "trips.view",
    "trips.update",
    "bookings.create",
    "bookings.view",
    "bookings.cancel",
    "payments.record",
    "manifest.view",
    "boarding.update",
    "branches.view",
    "catalog.view",
    "finance.view",
  ],
  counter_staff: [
    "trips.view",
    "bookings.create",
    "bookings.view",
    "bookings.cancel",
    "payments.record",
  ],
  agent: [
    "trips.view",
    "bookings.create",
    "bookings.view",
    "bookings.cancel",
    "commissions.view",
  ],
  driver: ["trips.view", "trips.update", "manifest.view"],
  conductor: ["trips.view", "manifest.view", "boarding.update"],
  customer: [
    "trips.view",
    "bookings.create",
    "bookings.view",
    "bookings.cancel",
  ],
  finance_staff: [
    "bookings.view",
    "finance.view",
    "finance.refund",
    "payments.record",
  ],
  operations_staff: [
    "trips.view",
    "trips.update",
    "manifest.view",
    "branches.view",
    "catalog.view",
  ],
};
await transaction(async (db) => {
  if (Number((await db.query("SELECT count(*) FROM companies")).rows[0].count))
    throw new Error(
      "Seed requires an empty database; existing records were not modified.",
    );
  await db.query("INSERT INTO companies(name) VALUES($1)", [ENV.companyName]);
  for (const [role, perms] of Object.entries(rolePermissions)) {
    await db.query("INSERT INTO roles(name) VALUES($1)", [role]);
    for (const p of perms) {
      await db.query(
        "INSERT INTO permissions(key) VALUES($1) ON CONFLICT DO NOTHING",
        [p],
      );
      await db.query(
        "INSERT INTO role_permissions(role,permission) VALUES($1,$2)",
        [role, p],
      );
    }
  }
  await db.query(
    "INSERT INTO regions(company_id,name) VALUES(1,'Yangon Region'),(1,'Mandalay Region'),(1,'Shan Region')",
  );
  await db.query(
    "INSERT INTO cities(region_id,name) VALUES(1,'Yangon'),(1,'Bago'),(2,'Naypyidaw'),(2,'Mandalay'),(3,'Taunggyi')",
  );
  for (const [i, name] of [
    "Yangon Central Gate",
    "Bago Gate",
    "Naypyidaw Gate",
    "Mandalay Gate",
    "Taunggyi Gate",
  ].entries()) {
    await db.query(
      "INSERT INTO branches(city_id,name,code,address) VALUES($1,$2,$3,$4)",
      [i + 1, name, "BR-0" + (i + 1), name + " Terminal"],
    );
    await db.query("INSERT INTO counters(branch_id,name) VALUES($1,$2)", [
      i + 1,
      "Counter 1",
    ]);
  }
  const accounts = [
    ["admin", "super_admin", null, null, null],
    ["head01", "head_office_admin", null, null, null],
    ["regional01", "regional_manager", 1, null, null],
    ["branch01", "branch_manager", 1, 1, null],
    ["counter01", "counter_staff", 1, 1, 1],
    ["agent01", "agent", 1, 1, null],
    ["driver01", "driver", 1, 1, null],
    ["conductor01", "conductor", 1, 1, null],
    ["customer01", "customer", null, null, null],
    ["finance01", "finance_staff", null, null, null],
    ["operations01", "operations_staff", null, null, null],
    ["branch02", "branch_manager", 2, 4, null],
    ["customer02", "customer", null, null, null],
    ["agent02", "agent", 2, 4, null],
  ];
  for (const [username, role, region, branch, counter] of accounts)
    await db.query(
      "INSERT INTO users(username,name,password_hash,role,company_id,region_id,branch_id,counter_id) VALUES($1,$2,$3,$4,1,$5,$6,$7)",
      [
        username,
        String(username).replace("01", ""),
        await hashPassword(password),
        role,
        region,
        branch,
        counter,
      ],
    );
  const paths = [
    {
      code: "YGN-MDY",
      from: "Yangon",
      to: "Mandalay",
      branch: 4,
      mins: 540,
      km: 625,
      stops: [
        ["Yangon", 16.8661, 96.1951],
        ["Bago", 17.3367, 96.4797],
        ["Naypyidaw", 19.7633, 96.0785],
        ["Mandalay", 21.9588, 96.0891],
      ],
    },
    {
      code: "YGN-TGI",
      from: "Yangon",
      to: "Taunggyi",
      branch: 5,
      mins: 660,
      km: 650,
      stops: [
        ["Yangon", 16.8661, 96.1951],
        ["Naypyidaw", 19.7633, 96.0785],
        ["Taunggyi", 20.7888, 97.0337],
      ],
    },
  ];
  for (const [index, p] of paths.entries()) {
    const bus = (
      await db.query(
        "INSERT INTO buses(branch_id,code,plate_number,model) VALUES(1,$1,$2,$3) RETURNING id",
        [
          "B-10" + (index + 1),
          "YGN-" + (8001 + index),
          index ? "VIP 2+1" : "Express 2+2",
        ],
      )
    ).rows[0];
    for (let r = 1; r <= 8; r++)
      for (let c = 1; c <= (index ? 3 : 4); c++)
        await db.query(
          "INSERT INTO seats(bus_id,seat_number,row_number,column_number) VALUES($1,$2,$3,$4)",
          [bus.id, String.fromCharCode(64 + r) + c, r, c],
        );
    const rt = (
      await db.query(
        "INSERT INTO routes(company_id,code,origin,destination,duration_minutes,distance_km) VALUES(1,$1,$2,$3,$4,$5) RETURNING id",
        [p.code, p.from, p.to, p.mins, p.km],
      )
    ).rows[0];
    for (const [order, s] of p.stops.entries())
      await db.query(
        "INSERT INTO route_stops(route_id,name,stop_order,latitude,longitude) VALUES($1,$2,$3,$4,$5)",
        [rt.id, s[0], order, s[1], s[2]],
      );
    const schedule = (
      await db.query(
        "INSERT INTO schedules(route_id,bus_id,departure_time) VALUES($1,$2,'06:30') RETURNING id",
        [rt.id, bus.id],
      )
    ).rows[0];
    // Alternate days so seeded crew have no overlapping trips.
    for (let day = 1 + index; day <= 14; day += 2) {
      const departure = new Date(Date.now() + day * 86400000);
      departure.setUTCHours(0, 0, 0, 0);
      const arrival = new Date(departure.getTime() + p.mins * 60000);
      const t = (
        await db.query(
          "INSERT INTO trips(schedule_id,route_id,bus_id,origin_branch_id,destination_branch_id,driver_id,conductor_id,departure_at,arrival_at,fare) VALUES($1,$2,$3,1,$4,7,8,$5,$6,$7) RETURNING id",
          [
            schedule.id,
            rt.id,
            bus.id,
            p.branch,
            departure,
            arrival,
            index ? 45000 : 30000,
          ],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO trip_seats(trip_id,seat_id) SELECT $1,id FROM seats WHERE bus_id=$2",
        [t.id, bus.id],
      );
    }
  }
  const trip = (
    await db.query("SELECT * FROM trips ORDER BY departure_at LIMIT 1")
  ).rows[0];
  const seat = (
    await db.query(
      "SELECT seat_id FROM trip_seats WHERE trip_id=$1 ORDER BY seat_id LIMIT 1",
      [trip.id],
    )
  ).rows[0];
  const bk = (
    await db.query(
      "INSERT INTO bookings(reference,trip_id,created_by,branch_id,counter_id,source,status,total,held_until) VALUES('BNG-DEMO-0001',$1,5,1,1,'counter','confirmed',$2,now()) RETURNING id",
      [trip.id, trip.fare],
    )
  ).rows[0];
  const passenger = (
    await db.query(
      "INSERT INTO passengers(name,phone) VALUES('Demo Passenger','09000000000') RETURNING id",
    )
  ).rows[0];
  await db.query(
    "INSERT INTO booking_passengers(booking_id,passenger_id,seat_id) VALUES($1,$2,$3)",
    [bk.id, passenger.id, seat.seat_id],
  );
  await db.query(
    "UPDATE trip_seats SET status='booked',booking_id=$1 WHERE trip_id=$2 AND seat_id=$3",
    [bk.id, trip.id, seat.seat_id],
  );
  await db.query(
    "INSERT INTO payments(booking_id,reference,method,amount,processed_by) VALUES($1,'DEMO-CASH-0001','cash',$2,5)",
    [bk.id, trip.fare],
  );
  await db.query(
    "INSERT INTO tickets(booking_id,number) VALUES($1,'TKT-DEMO-0001')",
    [bk.id],
  );
});
console.log(
  "Development seed complete. Accounts use your configured SEED_PASSWORD.",
);
await pool.end();
