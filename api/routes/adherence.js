"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth } = require("../middleware");
const {
  parseISODate,
  parseISODateLocal,
  toISODateUTC,
  daysBetweenUTC,
  weekdayUTC,
  eachDateUTC,
  trainingSessionIndex,
  findBlockForWeek,
  isDayCompleted,
  isNonEmpty,
  plannedSessionForWeekAndDay,
  addDaysISO,
} = require("../utils");

router.get("/adherence/program", requireAuth, async (req, res) => {
  try {
    const from = String(req.query?.from || "");
    const to = String(req.query?.to || "");
    if (!parseISODate(from) || !parseISODate(to)) {
      return res.status(400).json({ error: "from/to required (YYYY-MM-DD)" });
    }
    const span = daysBetweenUTC(from, to);
    if (span == null || span < 0 || span > 365) {
      return res.status(400).json({ error: "Invalid date range (max 365 days)" });
    }

    const u = await pool.query(
      `select active_program_id from public.app_users where id = $1`,
      [req.user.id]
    );
    const pid = u.rows?.[0]?.active_program_id || null;
    if (!pid) {
      return res.json({ from, to, program_id: null, planned_sessions: 0, completed_sessions: 0, adherence_pct: null, by_week: [], reason: "no_active_program" });
    }

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days
       from public.programs_app
       where id = $1 and user_id = $2`,
      [pid, req.user.id]
    );
    if (p.rowCount === 0) {
      return res.json({ from, to, program_id: pid, planned_sessions: 0, completed_sessions: 0, adherence_pct: null, by_week: [], reason: "program_missing" });
    }

    const prog = p.rows[0];
    const startISO = prog.start_date ? String(prog.start_date) : null;
    if (!parseISODate(startISO || "")) {
      return res.json({ from, to, program_id: prog.id, planned_sessions: 0, completed_sessions: 0, adherence_pct: null, by_week: [], reason: "program_missing_start_date" });
    }

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const totalSessions = Number(prog.total_weeks || 0) * daysPerWeek;
    const trainingDays = Array.isArray(prog.training_days) ? prog.training_days.map(Number) : [];
    const trainingSet = new Set(trainingDays);

    const dQ = await pool.query(
      `select entry_date, entries
       from public.daily_entries_app
       where user_id = $1 and entry_date between $2::date and $3::date`,
      [req.user.id, from, to]
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
      const bucket = byWeekMap.get(week_number);
      bucket.planned++;
      if (isCompleted) bucket.completed++;
    }

    res.json({
      from, to,
      program_id: prog.id, program_name: prog.name,
      start_date: startISO, training_days: trainingDays,
      days_per_week: daysPerWeek, total_weeks: Number(prog.total_weeks || 0),
      planned_sessions: planned, completed_sessions: completed,
      adherence_pct: planned ? (completed / planned) * 100 : null,
      by_week: Array.from(byWeekMap.values()).sort((a, b) => a.week_number - b.week_number),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
