"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ensureSchema } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", async (_req, res) => {
  try {
    const { pool } = require("./db");
    const r = await pool.query("select 1 as ok");
    res.json({ ok: true, db: r.rows?.[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────
app.use("/api", require("./routes/auth"));
app.use("/api", require("./routes/weekly"));
app.use("/api", require("./routes/programs"));
app.use("/api", require("./routes/daily"));
app.use("/api", require("./routes/adherence"));
app.use("/api", require("./routes/exercises"));
app.use("/api", require("./routes/groups"));
app.use("/api", require("./routes/connections"));
app.use("/api", require("./routes/coach"));

// ─── Boot ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`API running on port ${PORT}`));
  })
  .catch((e) => {
    console.error("Schema init failed:", e);
    process.exit(1);
  });
