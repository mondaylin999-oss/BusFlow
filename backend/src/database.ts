import pg from "pg";
import type { PoolClient } from "pg";
import { ENV } from "./env.js";
export const pool = new pg.Pool({
  connectionString: ENV.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
});
pool.on("error", () => console.error("[database] Connection error"));
export async function transaction<T>(fn: (db: PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function audit(
  db: PoolClient,
  userId: number,
  action: string,
  entity: string,
  id: number,
  details: unknown = {},
) {
  await db.query(
    "INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)",
    [userId, action, entity, id, JSON.stringify(details)],
  );
}
