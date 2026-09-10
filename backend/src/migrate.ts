import { readFile } from "node:fs/promises";
import { pool } from "./database.js";
await pool.query(
  await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"),
);
console.log("Schema installed");
await pool.end();
