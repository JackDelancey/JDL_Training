"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth } = require("../middleware");
const {
  toNum,
  parseISODate,
  parseISODateLocal,
  toISODateLocal,
  toISODateUTC,
  weekdayLocal,
  trainingSessionIndexLocal,
  findBlockForWeek,
  buildEntriesFromPlanRows,
  normalizeExerciseName,
  parseTrainingLoad,
  parseLoadNumber,
  e1rmEpley,
} = require("../utils");

// ─── Helper: fire PR events into group feed ───────────────────────────

async function createPrEventsForGroups({ userId, exercise, e1rm, top, reps, date }) {
  const groupQ = await pool.query(
    `select group_id from public.group_members where user_id = $1`,
    [userId]
  );
  const groupIds = groupQ.rows.map((r) => r.group_id);
  if (!groupIds.length) return;

  for (const groupId of groupIds) {
    const exists = await pool.query(
      `select 1 from public.group_events
       where group_id = $1 and user_id = $2
         and event_type = 'pr_e1rm'
         and payload->>'exercise' = $3
         and payload->>'date' = $4
       limit 1`,
      [groupId, userId, exercise, String(date)]
    );
    if (exists.rowCount > 0) continue;

    await pool.query(
      `insert into public.group_events (group_id, user_id, event_type, payload, created_at)
       values ($1, $2, 'pr_e1rm', $3::jsonb, now())`,
      [groupId, userId, JSON.stringify({ exercise, e1rm, top, reps, date })]
    );
  }
}

// ─── GET daily range ──────────────────────────────────────────────────

router.get("/daily", requireAuth, async (req, res) => {
  try {
    const from = String(req.query?.from || "");
    const to = String(req.query?.to || "");
    if (!parseISODateLocal(from) || !parseISODateLocal(to)) {
      return res.status(400).json({ error: "from/to required (YYYY-MM-DD)" });
    }
    const q = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins,
              notes, entries, is_completed, completed_at, created_at, updated_at
       from public.daily_entries_app
       where user_id = $1 and entry_date between $2::date and $3::date
       order by entry_date asc`,
      [req.user.id, from, to]
    );
    res.json(q.rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET single day ───────────────────────────────────────────────────

router.get("/daily/:date", requireAuth, async (req, res) => {
  try {
    const date = String(req.params.date || "");
    if (!parseISODate(date)) return res.status(400).json({ error: "Invalid date (YYYY-MM-DD)" });

    const q = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins,
              notes, entries, is_completed, completed_at, created_at, updated_at
       from public.daily_entries_app
       where user_id = $1 and entry_date = $2::date`,
      [req.user.id, date]
    );
    res.json({ day: q.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── PUT save day ─────────────────────────────────────────────────────

router.put("/daily/:date", requireAuth, async (req, res) => {
  try {
    const date = String(req.params.date || "");
    if (!parseISODate(date)) return res.status(400).json({ error: "Invalid date (YYYY-MM-DD)" });

    const payload = req.body || {};
    const unit = (payload.unit || "kg").toString();
    const bodyweight = toNum(payload.bodyweight);
    const sleep_hours = toNum(payload.sleep_hours);
    const pec_pain_0_10 = payload.pec_pain_0_10 != null ? Number(payload.pec_pain_0_10) : null;
    const zone2_mins = payload.zone2_mins != null ? Number(payload.zone2_mins) : null;
    const notes = payload.notes != null ? String(payload.notes) : null;
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const is_completed = payload.is_completed === true;
    const completed_at = payload.completed_at ? new Date(payload.completed_at) : null;
    const completedAtSafe = completed_at && Number.isFinite(completed_at.getTime())
      ? completed_at.toISOString() : null;

    const q = await pool.query(
      `insert into public.daily_entries_app
        (user_id, entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes,
         entries, is_completed, completed_at, updated_at)
       values ($1,$2::date,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,now())
       on conflict (user_id, entry_date) do update set
         unit = excluded.unit, bodyweight = excluded.bodyweight,
         sleep_hours = excluded.sleep_hours, pec_pain_0_10 = excluded.pec_pain_0_10,
         zone2_mins = excluded.zone2_mins, notes = excluded.notes,
         entries = excluded.entries, is_completed = excluded.is_completed,
         completed_at = case
           when excluded.is_completed = true
             then coalesce(excluded.completed_at, public.daily_entries_app.completed_at, now())
           else null
         end,
         updated_at = now()
       returning entry_date, is_completed, completed_at`,
      [req.user.id, date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins,
       notes, JSON.stringify(entries), is_completed, completedAtSafe]
    );

    // PR detection — pull prior daily rows once
    const priorQ = await pool.query(
      `select entry_date, bodyweight, entries
       from public.daily_entries_app
       where user_id = $1 and entry_date < $2::date
       order by entry_date asc`,
      [req.user.id, date]
    );

    // Find best top set per exercise in today's entries
    const bestByExercise = {};
    for (const e of entries) {
      const exercise = String(e?.exercise || "").trim();
      if (!exercise) continue;
      const top = parseTrainingLoad(e?.actual?.top ?? e?.top, bodyweight);
      const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
      const e1rm = e1rmEpley(top, reps);
      if (e1rm == null) continue;
      if (!bestByExercise[exercise] || top > bestByExercise[exercise].top) {
        bestByExercise[exercise] = { top, reps, e1rm };
      }
    }

    // Compare against prior bests and fire PR events
    for (const [exercise, candidate] of Object.entries(bestByExercise)) {
      let prevBest = 0;
      for (const row of priorQ.rows || []) {
        const rowEntries = Array.isArray(row.entries) ? row.entries : [];
        for (const e of rowEntries) {
          if (normalizeExerciseName(e?.exercise) !== normalizeExerciseName(exercise)) continue;
          const prevTop = parseTrainingLoad(e?.actual?.top ?? e?.top, row?.bodyweight ?? null);
          if (Number.isFinite(prevTop) && prevTop > prevBest) prevBest = prevTop;
        }
      }
      if (candidate.top > prevBest) {
        await createPrEventsForGroups({
          userId: req.user.id,
          exercise,
          e1rm: candidate.e1rm,
          top: candidate.top,
          reps: candidate.reps,
          date,
        });
      }
    }

    res.json({
      ok: true,
      entry_date: q.rows[0]?.entry_date,
      is_completed: q.rows[0]?.is_completed,
      completed_at: q.rows[0]?.completed_at,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// selected session dedupe

async function copySelectedSession() {
  try {
    const rows = selectedSlotObj?.rows || plan?.rows || [];
    if (!rows.length) return;
    setBusy(true);

    // Dedup — don't add exercises already in the log
    const existingExercises = new Set((day?.entries || []).map((e) => e.exercise));
    const newEntries = buildEntriesFromPlanRows(rows).filter((e) => !existingExercises.has(e.exercise));
    const entries = [...(day?.entries || []), ...newEntries];

    await apiFetch(`/api/daily/${date}`, {
      token, method: "PUT",
      body: { unit, bodyweight: day?.bodyweight ?? null, sleep_hours: day?.sleep_hours ?? null, pec_pain_0_10: day?.pec_pain_0_10 ?? null, zone2_mins: day?.zone2_mins ?? null, notes: day?.notes ?? null, entries, is_completed: day?.is_completed === true, completed_at: day?.completed_at ?? null },
      onInvalidToken,
    });
    await loadAll(date);
  } catch (e) { setErr(e.message); } finally { setBusy(false); }
}

// ─── POST append single entry ─────────────────────────────────────────

router.post("/daily/:date/entries", requireAuth, async (req, res) => {
  try {
    const date = String(req.params.date || "");
    if (!parseISODate(date)) return res.status(400).json({ error: "Invalid date (YYYY-MM-DD)" });

    const entry = req.body?.entry;
    if (!entry || typeof entry !== "object") {
      return res.status(400).json({ error: "entry object is required" });
    }

    const q = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins,
              notes, entries, is_completed, completed_at
       from public.daily_entries_app
       where user_id = $1 and entry_date = $2::date`,
      [req.user.id, date]
    );

    const existing = q.rows[0] || null;
    const entries = [...(Array.isArray(existing?.entries) ? existing.entries : []), entry];

    const up = await pool.query(
      `insert into public.daily_entries_app
        (user_id, entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins,
         notes, entries, is_completed, completed_at, updated_at)
       values ($1,$2::date,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,now())
       on conflict (user_id, entry_date) do update set
         entries = excluded.entries, updated_at = now()
       returning entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins,
                 notes, entries, is_completed, completed_at, created_at, updated_at`,
      [req.user.id, date, existing?.unit || "kg", existing?.bodyweight ?? null,
       existing?.sleep_hours ?? null, existing?.pec_pain_0_10 ?? null, existing?.zone2_mins ?? null,
       existing?.notes ?? null, JSON.stringify(entries), existing?.is_completed === true, existing?.completed_at ?? null]
    );

    res.json({ ok: true, day: up.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET active program plan for a date ──────────────────────────────

router.get("/programs/active/plan", requireAuth, async (req, res) => {
  try {
    const date = String(req.query?.date || "");
    if (!parseISODateLocal(date)) {
      return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });
    }

    const u = await pool.query(
      `select active_program_id from public.app_users where id = $1`,
      [req.user.id]
    );
    const pid = u.rows?.[0]?.active_program_id;
    if (!pid) return res.json({ date, is_training_day: false, reason: "no_active_program" });

    const p = await pool.query(
      `select id, name, days_per_week, blocks, start_date, training_days
       from public.programs_app
       where id = $1 and user_id = $2`,
      [pid, req.user.id]
    );
    if (p.rowCount === 0) return res.json({ date, is_training_day: false, reason: "program_missing" });

    const prog = p.rows[0];
    const start = prog.start_date ? toISODateLocal(new Date(prog.start_date)) : null;
    if (!start) return res.json({ date, is_training_day: false, reason: "program_missing_start_date", program_id: prog.id });

    const trainingDays = Array.isArray(prog.training_days) ? prog.training_days.map(Number) : [];
    const todayWd = weekdayLocal(date);
    if (!trainingDays.includes(todayWd)) return res.json({ date, is_training_day: false, program_id: prog.id });

    const idx = trainingSessionIndexLocal(start, date, trainingDays);
    if (idx == null || idx < 0) return res.json({ date, is_training_day: false, program_id: prog.id });

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const week_number = Math.floor(idx / daysPerWeek) + 1;
    const day_number = (idx % daysPerWeek) + 1;

    const blocks = Array.isArray(prog.blocks) ? prog.blocks : [];
    const blockInfo = findBlockForWeek(blocks, week_number);
    if (!blockInfo) {
      return res.json({ date, is_training_day: true, program_id: prog.id, week_number, day_number, rows: [], reason: "week_out_of_range" });
    }

    const day = (blockInfo.block?.days || []).find((d) => Number(d?.day_number) === day_number) || null;
    const wkKey = `W${week_number}`;
    const rows = (Array.isArray(day?.rows) ? day.rows : []).map((r) => ({
      ...r,
      week_target: r?.week_values?.[wkKey] ?? "",
      wk_key: wkKey,
    }));

    res.json({
      date, is_training_day: true, program_id: prog.id,
      week_number, day_number,
      block_number: blockInfo.block_number, block_week: blockInfo.block_week,
      day_title: day?.title || `Day ${day_number}`,
      wk_key: wkKey, rows,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
