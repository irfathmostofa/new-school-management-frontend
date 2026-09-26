import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

pg.types.setTypeParser(1082, (val) => val);
pg.types.setTypeParser(1114, (val) => val);
pg.types.setTypeParser(1184, (val) => val);
pg.types.setTypeParser(20, (val) => Number(val));

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and paste your Neon connection string.");
}

export const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function one(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows[0] ?? null;
}

export async function many(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function lv(type, code) {
  const row = await one(
    `SELECT v.id
     FROM core.lookup_value v
     JOIN core.lookup_type t ON t.id = v.lookup_type_id
     WHERE t.code = $1 AND v.code = $2`,
    [type, code]
  );
  return row?.id ?? null;
}

export function readSql(name) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  return readFileSync(join(root, "schema", name), "utf8");
}
