"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth } = require("../middleware");
const {
  toNum,
  e1rmEpley,
  parseLoadNumber,
  parseISODate,
  toISODateUTC,
  toISODateLocal,
  trainingDatesForProgramWeek,
} = require("../utils");

// ─── GET all weekly entries ───────────────────────────────────────────

router.get("/weekly", requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `select id, week_number, unit, bodyweight, sleep_hours, pec_pain_0_10,
              zone2_mins, notes, entries, created_at, updated_at
       from public.weekly_entries_app
       where user_id = $1
       order by week_number asc`,
      [req.user.id]
    );

    const out = q.rows.map((row) => {
      const entries = Array.isArray(row.entries) ? row.entries : [];
      const metrics_by_exercise = {};
      for (const e of entries) {
        const ex = String(e?.exercise || "").trim();
        if (!ex) continue;
        const val = e1rmEpley(e?.top, e?.reps);
        if (val == null) continue;
        const prev = metrics_by_exercise[ex]?.e1rm;
        if (prev == null || val > prev) {
          metrics_by_exercise[ex] = { e1rm: val, progress_pct: null };
        }
      }
      return {
        ...row,
        week: row.week_number,
        entries,
        metrics_by_exercise,
      };
    });

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── PUT save weekly entry ────────────────────────────────────────────

router.put("/weekly/:week", requireAuth, async (req, res) => {
  try {
    const week = Number(req.params.week);
    if (!Number.isInteger(week) || week <= 0) {
      return res.status(400).json({ error: "Invalid week number" });
    }

    const payload = req.body || {};
    const unit = (payload.unit || "kg").toString();
    const bodyweight = toNum(payload.bodyweight);
    const sleep_hours = toNum(payload.sleep_hours);
    const pec_pain_0_10 = payload.pec_pain_0_10 != null ? Number(payload.pec_pain_0_10) : null;
    const zone2_mins = payload.zone2_mins != null ? Number(payload.zone2_mins) : null;
    const notes = payload.notes != null ? String(payload.notes) : null;
    const entries = Array.isArray(payload.entries) ? payload.entries : [];

    const q = await pool.query(
      `insert into public.weekly_entries_app
        (user_id, week_number, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, entries, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
       on conflict (user_id, week_number) do update set
         unit = excluded.unit,
         bodyweight = excluded.bodyweight,
         sleep_hours = excluded.sleep_hours,
         pec_pain_0_10 = excluded.pec_pain_0_10,
         zone2_mins = excluded.zone2_mins,
         notes = excluded.notes,
         entries = excluded.entries,
         updated_at = now()
       returning week_number`,
      [req.user.id, week, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, JSON.stringify(entries)]
    );

    res.json({ ok: true, week_number: q.rows[0]?.week_number });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── POST auto-fill weekly from daily ────────────────────────────────

router.post("/weekly/from-daily/:week", requireAuth, async (req, res) => {
  try {
    const week = Number(req.params.week);
    if (!Number.isInteger(week) || week <= 0) {
      return res.status(400).json({ error: "Invalid week number" });
    }

    const u = await pool.query(
      `select active_program_id, tracked_exercises from public.app_users where id = $1`,
      [req.user.id]
    );
    const activeId = u.rows?.[0]?.active_program_id || null;
    const tracked = Array.isArray(u.rows?.[0]?.tracked_exercises)
      ? u.rows[0].tracked_exercises
      : ["Bench", "Squat", "Deadlift"];

    if (!activeId) return res.status(400).json({ error: "No active program" });

    const p = await pool.query(
      `select id, start_date, training_days, days_per_week
       from public.programs_app
       where id = $1 and user_id = $2`,
      [activeId, req.user.id]
    );
    if (p.rowCount === 0) return res.status(400).json({ error: "Active program missing" });

    const prog = p.rows[0];
    const startISO = prog.start_date ? toISODateUTC(new Date(prog.start_date)) : null;
    if (!startISO) return res.status(400).json({ error: "Active program missing start_date" });

    const trainingDays = Array.isArray(prog.training_days) ? prog.training_days : [];
    const dates = trainingDatesForProgramWeek(startISO, week, prog.days_per_week, trainingDays);

    if (!dates.length) {
      return res.json({ ok: true, week_number: week, date_range: null, derived_entries: [], note: "No training dates found." });
    }

    const from = dates[0];
    const to = dates[dates.length - 1];

    const dq = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, entries
       from public.daily_entries_app
       where user_id = $1 and entry_date between $2::date and $3::date
       order by entry_date asc`,
      [req.user.id, from, to]
    );

    const bestByEx = new Map();
    for (const d of dq.rows || []) {
      const entries = Array.isArray(d.entries) ? d.entries : [];
      const iso = toISODateUTC(new Date(d.entry_date));
      for (const e of entries) {
        const ex = String(e?.exercise || "").trim();
        if (!ex || !tracked.includes(ex)) continue;
        const top = parseLoadNumber(e?.actual?.top ?? e?.top);
        const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
        const val = e1rmEpley(top, reps);
        if (val == null) continue;
        const cur = bestByEx.get(ex);
        if (!cur || val > cur.e1rm) bestByEx.set(ex, { e1rm: val, top, reps, rpe: e?.actual?.rpe ?? e?.rpe ?? null, date: iso });
      }
    }

    const derivedEntries = tracked.map((ex) => {
      const b = bestByEx.get(ex);
      return { exercise: ex, top: b?.top ?? "", reps: b?.reps ?? 3, rpe: b?.rpe ?? "", derived_from: b?.date ?? null };
    });

    const latest = dq.rows.length ? dq.rows[dq.rows.length - 1] : null;
    const unit = (req.body?.unit || latest?.unit || "kg").toString();
    const notes = `Auto-filled from daily logs (${from} → ${to})` + (latest?.notes ? `\n\nLatest day notes:\n${String(latest.notes)}` : "");

    const up = await pool.query(
      `insert into public.weekly_entries_app
        (user_id, week_number, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, entries, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
       on conflict (user_id, week_number) do update set
         unit = excluded.unit, bodyweight = excluded.bodyweight,
         sleep_hours = excluded.sleep_hours, pec_pain_0_10 = excluded.pec_pain_0_10,
         zone2_mins = excluded.zone2_mins, notes = excluded.notes,
         entries = excluded.entries, updated_at = now()
       returning week_number`,
      [req.user.id, week, unit, latest?.bodyweight ?? null, latest?.sleep_hours ?? null,
       latest?.pec_pain_0_10 ?? null, latest?.zone2_mins ?? null, notes, JSON.stringify(derivedEntries)]
    );

    res.json({ ok: true, week_number: up.rows?.[0]?.week_number ?? week, date_range: { from, to }, derived_entries: derivedEntries });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
