"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth, requireCoachAccess } = require("../middleware");
const {
  parseISODate,
  parseISODateLocal,
  toISODateLocal,
  trainingSessionIndexLocal,
  isDayCompleted,
  eachDateUTC,
  weekdayUTC,
  trainingSessionIndex,
  daysBetweenUTC,
} = require("../utils");

// ─── GET clients list ─────────────────────────────────────────────────

router.get("/coach/clients", requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `select c.id as connection_id,
              u.id as user_id, u.name, u.email, u.unit_pref
       from public.user_connections c
       join public.app_users u on u.id = case
         when c.requester_user_id = $1 then c.target_user_id
         else c.requester_user_id
       end
       where (c.requester_user_id = $1 or c.target_user_id = $1)
         and c.status = 'accepted'
         and c.relationship_type = 'coach'`,
      [req.user.id]
    );
    res.json({ clients: q.rows || [] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET client weekly entries ────────────────────────────────────────

router.get("/coach/clients/:clientId/weekly", requireAuth, async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!await requireCoachAccess(req.user.id, clientId)) {
      return res.status(403).json({ error: "Not authorised to view this client" });
    }
    const q = await pool.query(
      `select id, week_number, unit, bodyweight, sleep_hours, pec_pain_0_10,
              zone2_mins, notes, entries, created_at, updated_at
       from public.weekly_entries_app
       where user_id = $1
       order by week_number asc`,
      [clientId]
    );
    const { e1rmEpley } = require("../utils");
    const out = q.rows.map((row) => {
      const entries = Array.isArray(row.entries) ? row.entries : [];
      const metrics_by_exercise = {};
      for (const e of entries) {
        const ex = String(e?.exercise || "").trim();
        if (!ex) continue;
        const val = e1rmEpley(e?.top, e?.reps);
        if (val == null) continue;
        const prev = metrics_by_exercise[ex]?.e1rm;
        if (prev == null || val > prev) metrics_by_exercise[ex] = { e1rm: val };
      }
      return { ...row, entries, metrics_by_exercise };
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET client daily range ───────────────────────────────────────────

router.get("/coach/clients/:clientId/daily", requireAuth, async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!await requireCoachAccess(req.user.id, clientId)) {
      return res.status(403).json({ error: "Not authorised to view this client" });
    }
    const from = String(req.query?.from || "");
    const to = String(req.query?.to || "");
    if (!parseISODate(from) || !parseISODate(to)) {
      return res.status(400).json({ error: "from/to required (YYYY-MM-DD)" });
    }
    const q = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins,
              notes, entries, is_completed, completed_at, created_at, updated_at
       from public.daily_entries_app
       where user_id = $1 and entry_date between $2::date and $3::date
       order by entry_date asc`,
      [clientId, from, to]
    );
    res.json(q.rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET client single day ────────────────────────────────────────────

router.get("/coach/clients/:clientId/daily/:date", requireAuth, async (req, res) => {
  try {
    const { clientId, date } = req.params;
    if (!await requireCoachAccess(req.user.id, clientId)) {
      return res.status(403).json({ error: "Not authorised to view this client" });
    }
    if (!parseISODate(date)) return res.status(400).json({ error: "Invalid date (YYYY-MM-DD)" });

    const q = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins,
              notes, entries, is_completed, completed_at, created_at, updated_at
       from public.daily_entries_app
       where user_id = $1 and entry_date = $2::date`,
      [clientId, date]
    );
    res.json({ day: q.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET client adherence ─────────────────────────────────────────────

router.get("/coach/clients/:clientId/adherence", requireAuth, async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!await requireCoachAccess(req.user.id, clientId)) {
      return res.status(403).json({ error: "Not authorised to view this client" });
    }
    const from = String(req.query?.from || "");
    const to = String(req.query?.to || "");
    if (!parseISODate(from) || !parseISODate(to)) {
      return res.status(400).json({ error: "from/to required (YYYY-MM-DD)" });
    }

    const u = await pool.query(
      `select active_program_id from public.app_users where id = $1`,
      [clientId]
    );
    const pid = u.rows?.[0]?.active_program_id || null;
    if (!pid) return res.json({ reason: "no_active_program", planned_sessions: 0, completed_sessions: 0, adherence_pct: null, by_week: [] });

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days
       from public.programs_app
       where id = $1 and user_id = $2`,
      [pid, clientId]
    );
    if (!p.rowCount) return res.json({ reason: "program_missing", planned_sessions: 0, completed_sessions: 0, adherence_pct: null, by_week: [] });

    const prog = p.rows[0];
    const startISO = prog.start_date ? String(prog.start_date) : null;
    if (!parseISODate(startISO || "")) return res.json({ reason: "no_start_date", planned_sessions: 0, completed_sessions: 0, adherence_pct: null, by_week: [] });

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const totalSessions = Number(prog.total_weeks || 0) * daysPerWeek;
    const trainingDays = Array.isArray(prog.training_days) ? prog.training_days.map(Number) : [];
    const trainingSet = new Set(trainingDays);

    const dQ = await pool.query(
      `select entry_date, entries from public.daily_entries_app
       where user_id = $1 and entry_date between $2::date and $3::date`,
      [clientId, from, to]
    );
    const dailyByDate = new Map(dQ.rows.map((r) => [String(r.entry_date), r]));
    const dates = eachDateUTC(from, to);
    let planned = 0, completed = 0;
    const byWeekMap = new Map();

    for (const iso of dates) {
      const wd = weekdayUTC(iso);
      if (!trainingSet.has(wd)) continue;
      const idx = trainingSessionIndex(startISO, iso, trainingDays);
      if (idx == null || idx < 0 || idx >= totalSessions) continue;
      const week_number = Math.floor(idx / daysPerWeek) + 1;
      planned++;
      const isCompleted = isDayCompleted(dailyByDate.get(iso));
      if (isCompleted) completed++;
      if (!byWeekMap.has(week_number)) byWeekMap.set(week_number, { week_number, planned: 0, completed: 0 });
      byWeekMap.get(week_number).planned++;
      if (isCompleted) byWeekMap.get(week_number).completed++;
    }

    res.json({
      program_name: prog.name, planned_sessions: planned, completed_sessions: completed,
      adherence_pct: planned ? (completed / planned) * 100 : null,
      by_week: Array.from(byWeekMap.values()).sort((a, b) => a.week_number - b.week_number),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET client program progress ──────────────────────────────────────

router.get("/coach/clients/:clientId/progress", requireAuth, async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!await requireCoachAccess(req.user.id, clientId)) {
      return res.status(403).json({ error: "Not authorised to view this client" });
    }

    const u = await pool.query(
      `select active_program_id from public.app_users where id = $1`,
      [clientId]
    );
    const pid = u.rows?.[0]?.active_program_id || null;
    if (!pid) return res.json({ has_program: false });

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days
       from public.programs_app
       where id = $1 and user_id = $2`,
      [pid, clientId]
    );
    if (!p.rowCount) return res.json({ has_program: false });

    const prog = p.rows[0];
    const startISO = prog.start_date ? toISODateLocal(new Date(prog.start_date)) : null;
    if (!startISO) return res.json({ has_program: true, program_name: prog.name, reason: "missing_start_date" });

    const today = toISODateLocal(new Date());
    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const totalWeeks = Number(prog.total_weeks || 0);
    const totalSessions = totalWeeks * daysPerWeek;
    const trainingDays = Array.isArray(prog.training_days) ? prog.training_days.map(Number) : [];
    const idx = trainingSessionIndexLocal(startISO, today, trainingDays);

    let current_week = null, current_day = null, progress_pct = null;
    if (idx != null && idx >= 0 && idx < totalSessions) {
      current_week = Math.floor(idx / daysPerWeek) + 1;
      current_day = (idx % daysPerWeek) + 1;
      progress_pct = ((idx + 1) / totalSessions) * 100;
    }

    res.json({
      has_program: true, program_name: prog.name,
      current_week, current_day, progress_pct,
      total_weeks: totalWeeks, days_per_week: daysPerWeek,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
