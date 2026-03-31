export function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n % 1 === 0 ? String(n.toFixed(0)) : String(n.toFixed(2));
}

export function e1rmFromTopReps(top, reps) {
  const t = Number(top);
  const r = Number(reps);
  if (!Number.isFinite(t) || !Number.isFinite(r) || t <= 0 || r <= 0) return null;
  return Math.round(t * (1 + r / 30) * 10) / 10;
}

export function normalizeExerciseName(x) {
  return String(x || "")
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");
}

export function sumWeeks(blocks) {
  return (blocks || []).reduce((a, b) => a + (Number(b?.weeks) || 0), 0);
}

export function draftKey(programId) {
  return `jdl_program_draft_${programId}`;
}

export function hasDraft(programId) {
  return !!localStorage.getItem(draftKey(programId));
}

export function dailyDraftKey(date) {
  return `jdl_daily_draft_${date}`;
}

export function buildEntriesFromPlanRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      exercise: (r?.exercise || "").toString().trim(),
      source: "program",
      planned: {
        sets_reps: (r?.sets_reps || "").toString(),
        load_rpe: (r?.load_rpe || "").toString(),
        notes: (r?.notes || "").toString(),
        target: (r?.week_target || "").toString(),
      },
      completed: false,
      notes: "",
      actual: { top: "", reps: 3, rpe: "" },
    }))
    .filter((x) => x.exercise);
}

export const KG_TO_LB = 2.20462;
export const LB_TO_KG = 1 / 2.20462;

export function toDisplayUnit(kgValue, unit) {
  const n = Number(kgValue);
  if (!Number.isFinite(n)) return null;
  return unit === "lb" ? Math.round(n * KG_TO_LB * 10) / 10 : n;
}

export function toStorageKg(displayValue, unit) {
  const n = Number(displayValue);
  if (!Number.isFinite(n)) return null;
  return unit === "lb" ? Math.round((n * LB_TO_KG) * 10) / 10 : n;
}