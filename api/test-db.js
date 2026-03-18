// api/test-db.js
require("dotenv").config();
const { Pool } = require("pg");

(async () => {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("MISSING: env DATABASE_URL (check .env)");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const r = await pool.query("select now() as now, version() as ver");
    console.log("CONNECTED OK:");
    console.log(r.rows[0]);
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("DB CONNECTION ERROR:");
    console.error(err && err.message ? err.message : err);
    await pool.end().catch(()=>{});
    process.exit(1);
  }
})();