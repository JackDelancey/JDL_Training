"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth } = require("../middleware");
const {
  normalizeExerciseName,
  parseLoadNumber,
  parseTrainingLoad,
  e1rmEpley,
  bucketForReps,
  parseSetsRepsTargetReps,
  formatDateWithWeeksAgo,
  resolveExerciseAlias,
} = require("../utils");

// ─── Explorer ─────────────────────────────────────────────────────────

router.get("/exercises/explorer", requireAuth, async (req, res) => {
  try {
    const exercise = String(req.query?.exercise || "").trim();
    if (!exercise) return res.status(400).json({ error: "exercise is required" });

    const target = normalizeExerciseName(resolveExerciseAlias(exercise));

    const [dailyQ, weeklyQ, programQ] = await Promise.all([
      pool.query(
        `select entry_date, unit, entries from public.daily_entries_app where user_id=$1 order by entry_date asc`,
        [req.user.id]
      ),
      pool.query(
        `select week_number, unit, entries from public.weekly_entries_app where user_id=$1 order by week_number asc`,
        [req.user.id]
      ),
      pool.query(
        `select id, name, blocks from public.programs_app where user_id=$1 order by created_at desc`,
        [req.user.id]
      ),
    ]);

    const hits = [];

    function matchName(rawName) {
  return normalizeExerciseName(resolveExerciseAlias(rawName)) === target;
}

    // Daily hits
    const dailyBestByDate = new Map();
for (const row of dailyQ.rows || []) {
  const dateStr = row.entry_date ? new Date(row.entry_date).toISOString().slice(0, 10) : null;
  if (!dateStr) continue;
  for (const e of Array.isArray(row.entries) ? row.entries : []) {
    if (!matchName(e?.exercise)) continue;
    const top = parseLoadNumber(e?.actual?.top ?? e?.top);
    const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
    if (!Number.isFinite(top) || !Number.isFinite(reps) || top <= 0 || reps <= 0) continue;
    const e1rm = e1rmEpley(top, reps);
    const existing = dailyBestByDate.get(dateStr);
    if (!existing || e1rm > existing.e1rm) {
      dailyBestByDate.set(dateStr, {
        source: "daily", priority: 3, week: null, date: dateStr,
        top, reps, rpe: e?.actual?.rpe ?? e?.rpe ?? null,
        e1rm, submitted_at_label: formatDateWithWeeksAgo(dateStr),
      });
    }
  }
}
for (const hit of dailyBestByDate.values()) hits.push(hit);

    // Weekly hits
    for (const row of weeklyQ.rows || []) {
      for (const e of Array.isArray(row.entries) ? row.entries : []) {
        if (!matchName(e?.exercise)) continue;
        const top = parseLoadNumber(e?.actual?.top ?? e?.top);
        const reps = parseLoadNumber(e?.reps ?? e?.actual?.reps);
        if (!Number.isFinite(top) || !Number.isFinite(reps) || top <= 0 || reps <= 0) continue;
        hits.push({
          source: "weekly", priority: 2, week: row.week_number, date: null,
          top, reps, rpe: e?.rpe ?? e?.actual?.rpe ?? null,
          e1rm: e1rmEpley(top, reps),
          submitted_at_label: row.week_number != null ? `Week ${row.week_number}` : null,
        });
      }
    }

    // Program hits
    for (const program of programQ.rows || []) {
      for (const block of Array.isArray(program.blocks) ? program.blocks : []) {
        for (const day of Array.isArray(block?.days) ? block.days : []) {
          for (const row of Array.isArray(day?.rows) ? day.rows : []) {
            if (!matchName(row?.exercise)) continue;
            const targetReps = parseSetsRepsTargetReps(row?.sets_reps);
            if (!Number.isFinite(targetReps) || targetReps <= 0) continue;
            for (const [wkKey, wkValue] of Object.entries(row?.week_values || {})) {
              const m = String(wkKey).match(/^W(\d+)$/i);
              if (!m) continue;
              const top = parseLoadNumber(wkValue);
              if (!Number.isFinite(top) || top <= 0) continue;
              hits.push({
                source: "program", priority: 1, top, reps: targetReps,
                e1rm: e1rmEpley(top, targetReps), date: null,
                week: Number(m[1]), rpe: row?.load_rpe ?? null,
                submitted_at_label: `Program week ${Number(m[1])}`,
              });
            }
          }
        }
      }
    }

    const sortBest = (a, b) => {
      const e1 = (Number(b?.e1rm) || -Infinity) - (Number(a?.e1rm) || -Infinity);
      if (e1 !== 0) return e1;
      const td = (Number(b?.top) || -Infinity) - (Number(a?.top) || -Infinity);
      if (td !== 0) return td;
      const prio = (Number(b?.priority) || 0) - (Number(a?.priority) || 0);
      if (prio !== 0) return prio;
      const bd = b?.date ? new Date(b.date).getTime() : 0;
      const ad = a?.date ? new Date(a.date).getTime() : 0;
      if (bd !== ad) return bd - ad;
      return (Number(b?.week) || 0) - (Number(a?.week) || 0);
    };

    const bucketOrder = ["1","2","3","4","5","6","8","10","12","13+"];

    const best_by_rep_bucket = bucketOrder.map((bucket) => {
      const best = hits.filter((h) => bucketForReps(h.reps) === bucket).sort(sortBest)[0] || null;
      return { bucket, top: best?.top ?? null, reps: best?.reps ?? null, e1rm: best?.e1rm ?? null, date: best?.date ?? null, week: best?.week ?? null, submitted_at_label: best?.submitted_at_label ?? null, source: best?.source ?? null };
    });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 56);
    const recentHits = hits.filter((h) => {
      if (!h.date) return false;
      const d = new Date(h.date);
      return Number.isFinite(d.getTime()) && d >= cutoff;
    });

    const best_by_rep_bucket_recent = bucketOrder.map((bucket) => {
      const best = recentHits.filter((h) => bucketForReps(h.reps) === bucket).sort(sortBest)[0] || null;
      return { bucket, top: best?.top ?? null, reps: best?.reps ?? null, e1rm: best?.e1rm ?? null, date: best?.date ?? null, week: best?.week ?? null, submitted_at_label: best?.submitted_at_label ?? null, source: best?.source ?? null };
    });

    const validHits = hits.filter((h) => Number.isFinite(h.top) && Number.isFinite(h.reps) && h.top > 0 && h.reps > 0);
    const bestE1 = [...validHits].sort(sortBest)[0] || null;
    const bestLoad = [...validHits].sort((a, b) => (Number(b?.top) || -Infinity) - (Number(a?.top) || -Infinity))[0] || null;

    const actualTrend = validHits
      .filter((h) => h.source === "daily")
      .sort((a, b) => {
        if (a.date && b.date) return new Date(a.date).getTime() - new Date(b.date).getTime();
        if (!a.date && !b.date) return (Number(a.week) || 0) - (Number(b.week) || 0);
        return a.date ? -1 : 1;
      });

    const plannedBestByWeek = new Map();
    for (const h of validHits.filter((x) => x.source === "program" && Number.isFinite(x?.week))) {
      const wk = Number(h.week);
      const cur = plannedBestByWeek.get(wk);
      if (!cur || Number(h.e1rm) > Number(cur.e1rm)) plannedBestByWeek.set(wk, h);
    }

    const trend_history = [
      ...actualTrend.map((h, idx) => ({
        idx: idx + 1,
        label: h?.date ? new Date(h.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : h?.week != null ? `W${h.week}` : `Point ${idx + 1}`,
        source: h?.source || null, top: h?.top ?? null, reps: h?.reps ?? null,
        e1rm: h?.e1rm ?? null, date: h?.date ?? null, week: h?.week ?? null,
        submitted_at_label: h?.submitted_at_label ?? null,
      })),
      ...Array.from(plannedBestByWeek.values()).sort((a, b) => Number(a.week) - Number(b.week)).map((h, idx) => ({
        idx: actualTrend.length + idx + 1,
        label: h?.week != null ? `W${h.week}` : `Plan ${idx + 1}`,
        source: "program", top: h?.top ?? null, reps: h?.reps ?? null,
        e1rm: h?.e1rm ?? null, date: null, week: h?.week ?? null,
        submitted_at_label: h?.submitted_at_label ?? null,
      })),
    ];

    res.json({
      exercise, total_sets_found: validHits.length,
      best_by_rep_bucket, best_by_rep_bucket_recent, trend_history,
      best_e1rm: bestE1 ? { top: bestE1.top, reps: bestE1.reps, e1rm: bestE1.e1rm, date: bestE1.date, week: bestE1.week, submitted_at_label: bestE1.submitted_at_label, source: bestE1.source } : null,
      best_load: bestLoad ? { top: bestLoad.top, reps: bestLoad.reps, e1rm: bestLoad.e1rm, date: bestLoad.date, week: bestLoad.week, submitted_at_label: bestLoad.submitted_at_label, source: bestLoad.source } : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Batch history ────────────────────────────────────────────────────

router.post("/exercises/history/batch", requireAuth, async (req, res) => {
  try {
    const names = Array.isArray(req.body?.exercises)
      ? req.body.exercises.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    if (!names.length) return res.json({ history_by_exercise: {} });

    const uniqueNames = Array.from(new Set(names)).slice(0, 50);
    const q = await pool.query(
      `select entry_date, entries from public.daily_entries_app where user_id=$1 order by entry_date desc`,
      [req.user.id]
    );

    const historyByExercise = {};
    for (const name of uniqueNames) {
      const target = normalizeExerciseName(name);
      const hits = [];

      for (const row of q.rows) {
        for (const e of Array.isArray(row.entries) ? row.entries : []) {
          if (normalizeExerciseName(e?.exercise) !== target) continue;
          const top = parseLoadNumber(e?.actual?.top ?? e?.top);
          const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
          const e1rm = e1rmEpley(top, reps);
          if (top == null || reps == null) continue;
          hits.push({ date: String(row.entry_date).slice(0, 10), top, reps, rpe: e?.actual?.rpe ?? e?.rpe ?? null, e1rm });
        }
      }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 56);

      const bestAllTime = hits.filter((x) => Number.isFinite(Number(x.e1rm))).sort((a, b) => Number(b.e1rm) - Number(a.e1rm))[0] || null;
      const bestRecent = hits.filter((x) => {
        const d = new Date(x.date);
        return Number.isFinite(d.getTime()) && d >= cutoff;
      }).filter((x) => Number.isFinite(Number(x.e1rm))).sort((a, b) => Number(b.e1rm) - Number(a.e1rm))[0] || null;

      historyByExercise[name] = {
        last_entries: hits.slice(0, 3),
        best_recent_e1rm: bestRecent?.e1rm ?? null,
        best_all_time_e1rm: bestAllTime?.e1rm ?? null,
      };
    }

    res.json({ history_by_exercise: historyByExercise });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
