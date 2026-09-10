import { app } from "./app.js";
import { pool } from "./database.js";
import { ENV } from "./env.js";
await pool.query("SELECT id FROM companies LIMIT 1");
const server = app.listen(ENV.port, "0.0.0.0", () =>
  console.log(
    `[api] Listening on ${ENV.port}; database connected; ${ENV.version}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    }),
  );
