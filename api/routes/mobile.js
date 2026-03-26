"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth } = require("../middleware");
const { isoLocalToday: _isoLocalToday, safeJsonArray } = require("../utils");

function isoLocalToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── GET /api/mobile/today ────────────────────────────────────────────
// Returns today's session from the active program + any logged daily entries

router.get("/mobile/today", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = isoLocalToday();

    // Get active program
    const userQ = await pool.query(
      `select active_program_id, unit_pref from public.app_users where id = $1`,
      [userId]
    );
    const user = userQ.rows[0];
    if (!user?.active_program_id) {
      return res.json({ date: today, has_program: false, reason: "no_active_program" });
    }

    const progQ = await pool.query(
      `select id, name, blocks, days_per_week, total_weeks, start_date, training_days
       from public.programs_app where id = $1 and user_id = $2`,
      [user.active_program_id, userId]
    );
    if (!progQ.rows[0]) {
      return res.json({ date: today, has_program: false, reason: "program_not_found" });
    }

    const prog = progQ.rows[0];
    const blocks = safeJsonArray(prog.blocks);
    const trainingDays = safeJsonArray(prog.training_days).map(Number);
    const startDate = prog.start_date ? String(prog.start_date).slice(0, 10) : null;
    const unit = user.unit_pref || "kg";

    // Find today's position in the program
    let planResult = null;
    if (startDate && trainingDays.length) {
      const startD = new Date(startDate + "T00:00:00Z");
      const todayD = new Date(today + "T00:00:00Z");
      const tset = new Set(trainingDays);
      const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));

      // Is today a training day?
      const todayDow = todayD.getUTCDay();
      if (tset.has(todayDow)) {
        // Count sessions from start to today
        let sessionCount = 0;
        let d = new Date(startD);
        while (d <= todayD) {
          if (tset.has(d.getUTCDay())) sessionCount++;
          d.setUTCDate(d.getUTCDate() + 1);
        }

        // Map session count to block/week/day
        let absoluteWeek = 1;
        let found = null;
        let sessionsSoFar = 0;
        outer: for (let bi = 0; bi < blocks.length; bi++) {
          const block = blocks[bi];
          const weeksInBlock = Math.max(1, Number(block.weeks || 4));
          const days = Array.isArray(block.days) ? block.days : [];
          for (let w = 1; w <= weeksInBlock; w++) {
            for (let di = 0; di < days.length; di++) {
              sessionsSoFar++;
              if (sessionsSoFar === sessionCount) {
                const wkKey = `W${absoluteWeek}`;
                const dayObj = days[di];
                const rows = (Array.isArray(dayObj?.rows) ? dayObj.rows : []).map((r) => ({
                  ...r,
                  week_target: r?.week_values?.[wkKey] ?? "",
                }));
                found = {
                  block_number: bi + 1,
                  block_week: w,
                  week_number: absoluteWeek,
                  day_number: dayObj.day_number || di + 1,
                  day_title: dayObj.title || `Day ${di + 1}`,
                  rows,
                };
                break outer;
              }
            }
            absoluteWeek++;
          }
        }
        planResult = found;
      }
    }

    // Get today's daily entry
    const dailyQ = await pool.query(
      `select entries, is_completed, bodyweight, sleep_hours, notes
       from public.daily_entries_app
       where user_id = $1 and entry_date = $2::date`,
      [userId, today]
    );
    const dailyEntry = dailyQ.rows[0] || null;
    const entries = safeJsonArray(dailyEntry?.entries);

    return res.json({
      date: today,
      has_program: true,
      program_id: prog.id,
      program_name: prog.name,
      unit,
      is_training_day: !!planResult,
      is_completed: dailyEntry?.is_completed === true,
      block_number: planResult?.block_number ?? null,
      block_week: planResult?.block_week ?? null,
      week_number: planResult?.week_number ?? null,
      day_number: planResult?.day_number ?? null,
      day_title: planResult?.day_title ?? null,
      planned_rows: planResult?.rows || [],
      entries: entries.length > 0 ? entries : (planResult?.rows || []).map((r) => ({
        exercise: r.exercise,
        source: "program",
        planned: {
          sets_reps: r.sets_reps || "",
          load_rpe: r.load_rpe || "",
          target: r.week_target || "",
          notes: r.notes || "",
        },
        actual: { top: "", reps: "", rpe: "" },
        completed: false,
        notes: "",
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET /api/mobile/program-sessions ────────────────────────────────
// Returns all sessions from the active program for the session picker

router.get("/mobile/program-sessions", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const userQ = await pool.query(
      `select active_program_id, unit_pref from public.app_users where id = $1`,
      [userId]
    );
    const user = userQ.rows[0];
    if (!user?.active_program_id) return res.json({ sessions: [] });

    const progQ = await pool.query(
      `select id, name, blocks, days_per_week, total_weeks, start_date, training_days
       from public.programs_app where id = $1 and user_id = $2`,
      [user.active_program_id, userId]
    );
    if (!progQ.rows[0]) return res.json({ sessions: [] });

    const prog = progQ.rows[0];
    const blocks = safeJsonArray(prog.blocks);
    const trainingDays = safeJsonArray(prog.training_days).map(Number);
    const startDate = prog.start_date ? String(prog.start_date).slice(0, 10) : null;
    const unit = user.unit_pref || "kg";
    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const tset = new Set(trainingDays);

    // Get all daily entries for this program period
    const dailyQ = startDate ? await pool.query(
      `select entry_date, entries, is_completed from public.daily_entries_app
       where user_id = $1 and entry_date >= $2::date order by entry_date asc`,
      [userId, startDate]
    ) : { rows: [] };
    const dailyByDate = new Map(dailyQ.rows.map((r) => [String(r.entry_date).slice(0, 10), r]));

    const sessions = [];
    let absoluteWeek = 1;
    let sessionCount = 0;

    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi];
      const weeksInBlock = Math.max(1, Number(block.weeks || 4));
      const days = Array.isArray(block.days) ? block.days : [];

      for (let w = 1; w <= weeksInBlock; w++) {
        for (let di = 0; di < days.length; di++) {
          sessionCount++;
          const wkKey = `W${absoluteWeek}`;
          const dayObj = days[di];
          const dayNum = dayObj.day_number || di + 1;
          const key = `B${bi + 1}-W${w}-D${dayNum}`;

          // Calculate date for this session
          let sessionDate = null;
          if (startDate && trainingDays.length) {
            const startD = new Date(startDate + "T00:00:00Z");
            let count = 0;
            let d = new Date(startD);
            for (let i = 0; i < 730; i++) {
              if (tset.has(d.getUTCDay())) {
                count++;
                if (count === sessionCount) {
                  sessionDate = d.toISOString().slice(0, 10);
                  break;
                }
              }
              d.setUTCDate(d.getUTCDate() + 1);
            }
          }

          const dailyEntry = sessionDate ? dailyByDate.get(sessionDate) : null;
          const entries = safeJsonArray(dailyEntry?.entries);

          const rows = (Array.isArray(dayObj?.rows) ? dayObj.rows : []).map((r) => ({
            ...r,
            week_target: r?.week_values?.[wkKey] ?? "",
          }));

          sessions.push({
            key,
            label: `B${bi + 1} · W${w} · Day ${dayNum}${dayObj.title && dayObj.title !== `Day ${dayNum}` ? ` — ${dayObj.title}` : ""}`,
            date: sessionDate,
            unit,
            has_program: true,
            program_id: prog.id,
            program_name: prog.name,
            block_number: bi + 1,
            block_week: w,
            week_number: absoluteWeek,
            day_number: dayNum,
            day_title: dayObj.title || `Day ${dayNum}`,
            is_training_day: true,
            is_completed: dailyEntry?.is_completed === true,
            entries: entries.length > 0 ? entries : rows.map((r) => ({
              exercise: r.exercise,
              source: "program",
              planned: { sets_reps: r.sets_reps || "", load_rpe: r.load_rpe || "", target: r.week_target || "", notes: r.notes || "" },
              actual: { top: "", reps: "", rpe: "" },
              completed: false,
              notes: "",
            })),
          });
        }
        absoluteWeek++;
      }
    }

    res.json({ sessions, program_name: prog.name, program_id: prog.id });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
