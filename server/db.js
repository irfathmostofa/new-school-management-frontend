import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { seed } from "./seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "../data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "sms.db"));
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec(readFileSync(join(__dirname, "schema.sql"), "utf8"));
seed(db);

export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function insert(stmt, ...params) {
  const result = stmt.run(...params);
  return Number(result.lastInsertRowid);
}

export function lv(type, code) {
  const row = db.prepare(`
    SELECT v.id FROM core_lookup_value v
    JOIN core_lookup_type t ON t.id = v.lookup_type_id
    WHERE t.code = ? AND v.code = ?
  `).get(type, code);
  return row?.id ?? null;
}

export default db;
