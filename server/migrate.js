import { pool, one, readSql } from "./db.js";
import { seed } from "./seed.js";

async function migrate() {
  const ready = await one("SELECT to_regclass('core.lookup_type') AS t");
  if (!ready?.t) {
    console.log("Applying 01_foundation_schema.sql");
    await pool.query(readSql("01_foundation_schema.sql"));
    console.log("Applying 02_iam_rls.sql");
    await pool.query(readSql("02_iam_rls.sql"));
  } else {
    console.log("Foundation schema already present");
  }
  console.log("Applying 03_iam_local_auth.sql");
  await pool.query(readSql("03_iam_local_auth.sql"));
  await seed();
  console.log("Neon migrate complete");
}

migrate()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
