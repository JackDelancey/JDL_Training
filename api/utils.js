"use strict";

/* =====================================================================
   utils.js — shared helpers for all route files
   Import with: const { e1rmEpley, parseLoadNumber, ... } = require('../utils');
===================================================================== */

// ─── Number helpers ──────────────────────────────────────────────────

function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n % 1 === 0 ? String(n.toFixed(0)) : String(n.toFixed(2));
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isNonEmpty(x) {
  return x != null && String(x).trim() !== "";
}

function clampInt(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const xi = Math.trunc(x);
  if (xi < lo || xi > hi) return null;
  return xi;
}

function makeJoinCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function normalizeRelationshipType(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "friend" || v === "coach" || v === "client") return v;
  return "friend";
}

// ─── Load / e1RM helpers ─────────────────────────────────────────────

function parseLoadNumber(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/(-?\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseTrainingLoad(value, bodyweight) {
  const raw = String(value || "").trim().toUpperCase();
  const bw = Number(bodyweight);
  if (!raw) return null;

  if (/^BW\s*\+\s*-?\d+(\.\d+)?$/.test(raw)) {
    const extra = Number(raw.replace(/^BW\s*\+\s*/, ""));
    if (!Number.isFinite(bw)) return null;
    return bw + extra;
  }

  if (/^-?\d+(\.\d+)?\s*\+\s*-?\d+(\.\d+)?$/.test(raw)) {
    const [a, b] = raw.split("+").map((x) => Number(x.trim()));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a + b;
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function e1rmEpley(load, reps) {
  const l = Number(load);
  const r = Number(reps);
  if (!Number.isFinite(l) || !Number.isFinite(r) || l <= 0 || r <= 0) return null;
  return Math.round(l * (1 + r / 30) * 10) / 10;
}

function calcE1RM(weight, reps) {
  if (!weight || !reps) return null;
  return Math.round(weight * (1 + reps / 30));
}

function bucketForReps(reps) {
  const r = Math.trunc(Number(reps));
  if (!Number.isFinite(r) || r <= 0) return null;
  if (r >= 13) return "13+";
  return String(r);
}

// ─── Date helpers (UTC) ───────────────────────────────────────────────

function parseISODate(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isFinite(d.getTime()) ? d : null;
}

function toISODateUTC(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso, n) {
  const d = parseISODate(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return toISODateUTC(d);
}

function daysBetweenUTC(aISO, bISO) {
  const a = parseISODate(aISO);
  const b = parseISODate(bISO);
  if (!a || !b) return null;
  return Math.floor((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

function weekdayUTC(isoDateStr) {
  const d = parseISODate(isoDateStr);
  if (!d) return null;
  return d.getUTCDay();
}

function eachDateUTC(fromISO, toISO) {
  const fromD = parseISODate(fromISO);
  const toD = parseISODate(toISO);
  if (!fromD || !toD) return [];
  const diff = daysBetweenUTC(fromISO, toISO);
  if (diff == null || diff < 0) return [];
  const out = [];
  for (let i = 0; i <= diff; i++) {
    const d = new Date(fromD.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    out.push(toISODateUTC(d));
  }
  return out;
}

function trainingSessionIndex(startISO, targetISO, trainingDays) {
  const diff = daysBetweenUTC(startISO, targetISO);
  if (diff == null || diff < 0) return null;
  const tset = new Set((trainingDays || []).map(Number));
  let count = 0;
  for (let i = 0; i <= diff; i++) {
    const d = parseISODate(startISO);
    d.setUTCDate(d.getUTCDate() + i);
    if (tset.has(d.getUTCDay())) count++;
  }
  return count - 1;
}

const EXERCISE_ALIASES = {
  "orm bench": "Bench",
  "bench press": "Bench",
  "flat bench": "Bench",
  "squat": "Squat",
  "back squat": "Squat",
  "high bar squat": "Squat",
  "conventional deadlift": "Deadlift",
  "conv deadlift": "Deadlift",
  "ohp": "Overhead Press",
  "overhead press": "Overhead Press",
  "press": "Overhead Press",
};

function resolveExerciseAlias(name) {
  if (!name) return name;
  const norm = String(name).trim().toLowerCase();
  return EXERCISE_ALIASES[norm] || name;
}

// ─── Date helpers (Local) ─────────────────────────────────────────────

function parseISODateLocal(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toISODateLocal(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function weekdayLocal(isoDateStr) {
  const d = parseISODateLocal(isoDateStr);
  if (!d) return null;
  return d.getDay();
}

function daysBetweenLocal(aISO, bISO) {
  const a = parseISODateLocal(aISO);
  const b = parseISODateLocal(bISO);
  if (!a || !b) return null;
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 0, 0, 0, 0);
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 0, 0, 0, 0);
  return Math.floor((b0.getTime() - a0.getTime()) / (24 * 3600 * 1000));
}

function trainingSessionIndexLocal(startISO, targetISO, trainingDays) {
  const diff = daysBetweenLocal(startISO, targetISO);
  if (diff == null || diff < 0) return null;
  const tset = new Set((trainingDays || []).map(Number));
  let count = 0;
  const start = parseISODateLocal(startISO);
  for (let i = 0; i <= diff; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 0, 0, 0, 0);
    if (tset.has(d.getDay())) count++;
  }
  return count - 1;
}

function buildTrainingDatesBetween(startISO, endISO, trainingDays) {
  const s = parseISODate(startISO);
  const e = parseISODate(endISO);
  if (!s || !e) return [];
  const tset = new Set((trainingDays || []).map(Number));
  const out = [];
  const cur = new Date(s.getTime());
  while (cur.getTime() <= e.getTime()) {
    if (tset.has(cur.getUTCDay())) out.push(toISODateUTC(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function trainingDatesForProgramWeek(startISO, weekNumber, daysPerWeek, trainingDays) {
  const wk = Number(weekNumber);
  if (!Number.isFinite(wk) || wk <= 0) return [];
  const dpw = Math.max(1, Number(daysPerWeek || 4));
  const sessionStartIdx = (wk - 1) * dpw;
  const sessionEndIdx = wk * dpw - 1;
  const tset = new Set((trainingDays || []).map(Number));
  const dates = [];
  let idx = -1;
  let cursor = parseISODate(startISO);
  if (!cursor) return [];
  for (let day = 0; day < 730; day++) {
    const iso = toISODateUTC(cursor);
    if (tset.has(cursor.getUTCDay())) {
      idx++;
      if (idx >= sessionStartIdx && idx <= sessionEndIdx) dates.push(iso);
      if (idx > sessionEndIdx) break;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// ─── Program helpers ─────────────────────────────────────────────────

function sumProgramWeeks(blocks) {
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((a, b) => a + (Number(b?.weeks) || 0), 0);
}

function findBlockForWeek(blocks, weekNumber) {
  let offset = 0;
  for (let i = 0; i < (blocks || []).length; i++) {
    const w = Number(blocks[i]?.weeks || 0);
    const start = offset + 1;
    const end = offset + w;
    if (weekNumber >= start && weekNumber <= end) {
      return {
        block: blocks[i],
        block_number: i + 1,
        block_week: weekNumber - offset,
      };
    }
    offset += w;
  }
  return null;
}

function plannedSessionForWeekAndDay(blocks, week_number, day_number) {
  const blockInfo = findBlockForWeek(blocks, week_number);
  if (!blockInfo) {
    return { rows: [], block_number: null, block_week: null, day_title: `Day ${day_number}` };
  }
  const day =
    (blockInfo.block?.days || []).find(
      (d) => Number(d?.day_number) === Number(day_number)
    ) || null;
  return {
    rows: Array.isArray(day?.rows) ? day.rows : [],
    block_number: blockInfo.block_number,
    block_week: blockInfo.block_week,
    day_title: day?.title || `Day ${day_number}`,
  };
}

function buildEntriesFromPlanRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      exercise: String(r?.exercise || "").trim(),
      source: "program",
      planned: {
        sets_reps: String(r?.sets_reps || ""),
        load_rpe: String(r?.load_rpe || ""),
        notes: String(r?.notes || ""),
        target: String(r?.week_target || ""),
      },
      completed: false,
      notes: "",
      actual: { top: "", reps: 3, rpe: "" },
    }))
    .filter((x) => x.exercise);
}

function isDayCompleted(dayRow) {
  const entries = Array.isArray(dayRow?.entries) ? dayRow.entries : [];
  for (const e of entries) {
    const a = e?.actual || {};
    if (Number.isFinite(Number(a?.top)) && Number(a.top) > 0) return true;
    if (Number.isFinite(Number(a?.reps)) && Number(a.reps) > 0) return true;
    if (a?.rpe != null && String(a.rpe).trim() !== "") return true;
    if (Number.isFinite(Number(e?.top)) && Number(e.top) > 0) return true;
    if (Number.isFinite(Number(e?.reps)) && Number(e.reps) > 0) return true;
    if (e?.rpe != null && String(e.rpe).trim() !== "") return true;
  }
  return false;
}

function cloneProgramForUser(programRow, newUserId) {
  const blocks = Array.isArray(programRow?.blocks)
    ? JSON.parse(JSON.stringify(programRow.blocks))
    : [];
  return {
    name: `${programRow?.name || "Shared Program"} (Copy)`,
    user_id: newUserId,
    days_per_week: Number(programRow?.days_per_week || 4),
    total_weeks: Number(programRow?.total_weeks || 0),
    blocks,
    start_date: null,
    training_days: null,
  };
}

// ─── Explorer helpers ────────────────────────────────────────────────

function normalizeExerciseName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
}

function parseSetsRepsTargetReps(v) {
  const s = String(v || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (/[x×]/.test(s)) {
    const afterX = s.split(/[x×]/).pop();
    if (!afterX) return null;
    let m = afterX.match(/^(\d+)-(\d+)$/);
    if (m) return Number(m[2]);
    m = afterX.match(/^(\d+)$/);
    if (m) return Number(m[1]);
  }
  let m = s.match(/^(\d+)-(\d+)$/);
  if (m) return Number(m[2]);
  m = s.match(/^(\d+)reps?$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d+)$/);
  if (m) return Number(m[1]);
  return null;
}

function formatDateWithWeeksAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return null;
  const now = new Date();
  const weeks = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 7));
  const pretty = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (weeks <= 0) return `${pretty} • this week`;
  if (weeks === 1) return `${pretty} • 1 week ago`;
  return `${pretty} • ${weeks} weeks ago`;
}

function safeDateLabel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ─── Group / score helpers ───────────────────────────────────────────

function scoreWindowStart(window) {
  const now = new Date();
  const out = new Date(now);
  if (window === "14d") out.setDate(out.getDate() - 14);
  else if (window === "30d") out.setDate(out.getDate() - 30);
  else if (window === "60d") out.setDate(out.getDate() - 60);
  else if (window === "90d") out.setDate(out.getDate() - 90);
  else return null;
  return toISODateLocal(out);
}

function rankRows(rows) {
  let rank = 0;
  let prevScore = null;
  return rows.map((r, idx) => {
    const score = Number(r.score);
    if (prevScore == null || score !== prevScore) {
      rank = idx + 1;
      prevScore = score;
    }
    return { ...r, rank };
  });
}

function safeJsonArray(v) {
  return Array.isArray(v) ? v : [];
}

function buildMetricRowsFromEntries(entries) {
  const out = [];
  for (const e of safeJsonArray(entries)) {
    const exercise = String(e?.exercise || "").trim();
    if (!exercise) continue;
    const top = parseLoadNumber(e?.actual?.top ?? e?.top);
    const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
    const rpe = e?.actual?.rpe ?? e?.rpe ?? null;
    const e1rm = e1rmEpley(top, reps);
    out.push({ exercise, top, reps, rpe, e1rm });
  }
  return out;
}

function bestExerciseMetricFromDailyRows(rows, exercise) {
  const target = normalizeExerciseName(exercise);
  let best = null;
  for (const row of rows) {
    for (const m of buildMetricRowsFromEntries(row.entries)) {
      if (normalizeExerciseName(m.exercise) !== target) continue;
      if (!Number.isFinite(m.e1rm)) continue;
      if (!best || m.e1rm > best.e1rm) {
        best = {
          e1rm: m.e1rm,
          top: m.top,
          reps: m.reps,
          date: String(row.entry_date),
          bodyweight: toNum(row.bodyweight),
        };
      }
    }
  }
  return best;
}

function sumExerciseVolumeFromDailyRows(rows, exercise) {
  const target = normalizeExerciseName(exercise);
  let total = 0;
  for (const row of rows) {
    for (const m of buildMetricRowsFromEntries(row.entries)) {
      if (normalizeExerciseName(m.exercise) !== target) continue;
      if (!Number.isFinite(m.top) || !Number.isFinite(m.reps)) continue;
      total += Number(m.top) * Number(m.reps);
    }
  }
  return total;
}

function countCompletedSessions(rows) {
  return rows.filter((r) => r.is_completed === true || isDayCompleted(r)).length;
}

function buildE1rmHistory(rows, exercise) {
  const target = normalizeExerciseName(exercise);
  const points = [];
  for (const row of rows) {
    let best = null;
    for (const m of buildMetricRowsFromEntries(row.entries)) {
      if (normalizeExerciseName(m.exercise) !== target) continue;
      if (!Number.isFinite(m.e1rm)) continue;
      if (!best || m.e1rm > best.e1rm) best = m;
    }
    if (best) {
      points.push({
        date: String(row.entry_date),
        label: String(row.entry_date),
        e1rm: best.e1rm,
        top: best.top,
        reps: best.reps,
      });
    }
  }
  return points;
}

// ─── Exports ─────────────────────────────────────────────────────────

module.exports = {
  // number
  fmt,
  toNum,
  isNonEmpty,
  clampInt,
  makeJoinCode,
  normalizeRelationshipType,
  resolveExerciseAlias,
  // load / e1rm
  parseLoadNumber,
  parseTrainingLoad,
  e1rmEpley,
  calcE1RM,
  bucketForReps,
  // dates UTC
  parseISODate,
  toISODateUTC,
  addDaysISO,
  daysBetweenUTC,
  weekdayUTC,
  eachDateUTC,
  trainingSessionIndex,
  buildTrainingDatesBetween,
  trainingDatesForProgramWeek,
  // dates local
  parseISODateLocal,
  toISODateLocal,
  weekdayLocal,
  daysBetweenLocal,
  trainingSessionIndexLocal,
  // program
  sumProgramWeeks,
  findBlockForWeek,
  plannedSessionForWeekAndDay,
  buildEntriesFromPlanRows,
  isDayCompleted,
  cloneProgramForUser,
  // explorer
  normalizeExerciseName,
  parseSetsRepsTargetReps,
  formatDateWithWeeksAgo,
  safeDateLabel,
  // groups
  scoreWindowStart,
  rankRows,
  safeJsonArray,
  buildMetricRowsFromEntries,
  bestExerciseMetricFromDailyRows,
  sumExerciseVolumeFromDailyRows,
  countCompletedSessions,
  buildE1rmHistory,
};
