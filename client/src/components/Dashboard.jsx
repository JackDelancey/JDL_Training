import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, LineElement, PointElement, CategoryScale,
  LinearScale, Tooltip, Legend, Filler,
} from "chart.js";
import { fmt, e1rmFromTopReps, normalizeExerciseName, toDisplayUnit } from "../utils/calcs";
import { formatDate } from "../utils/dates";

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const CHART_OPTIONS_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: true, labels: { color: "rgba(255,255,255,0.85)", boxWidth: 12 } },
    tooltip: {
      enabled: true,
      backgroundColor: "rgba(0,0,0,0.85)",
      titleColor: "rgba(255,255,255,0.95)",
      bodyColor: "rgba(255,255,255,0.9)",
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
    },
  },
  scales: {
    x: { ticks: { color: "rgba(255,255,255,0.65)", maxRotation: 45 }, grid: { color: "rgba(255,255,255,0.06)" } },
    y: { beginAtZero: false, ticks: { color: "rgba(255,255,255,0.65)" }, grid: { color: "rgba(255,255,255,0.06)" } },
  },
};

export function Dashboard({ weekly, dailyOverview, unit, tracked, activeProgram }) {
  const latest = useMemo(() => weekly?.length ? weekly[weekly.length - 1] : null, [weekly]);

  // All e1RM values stored in kg — compute raw then convert for display
  const dailyBestByExercise = useMemo(() => {
    const out = {};
    for (const ex of tracked || []) {
      const norm = normalizeExerciseName(ex);
      for (const day of dailyOverview || []) {
        for (const e of day?.entries || []) {
          if (normalizeExerciseName(e?.exercise) !== norm) continue;
          const val = e1rmFromTopReps(e?.actual?.top ?? e?.top, e?.actual?.reps ?? e?.reps);
          if (!Number.isFinite(val)) continue;
          if (!Number.isFinite(out[ex]) || val > out[ex]) out[ex] = val;
        }
      }
    }
    return out;
  }, [dailyOverview, tracked]);

  const dailyLatestByExercise = useMemo(() => {
    const out = {};
    const sorted = [...(dailyOverview || [])].sort((a, b) =>
      String(a.entry_date || "").slice(0, 10).localeCompare(String(b.entry_date || "").slice(0, 10))
    );
    for (const ex of tracked || []) {
      const norm = normalizeExerciseName(ex);
      let latestVal = null;
      for (const day of sorted) {
        for (const e of day?.entries || []) {
          if (normalizeExerciseName(e?.exercise) !== norm) continue;
          const val = e1rmFromTopReps(e?.actual?.top ?? e?.top, e?.actual?.reps ?? e?.reps);
          if (Number.isFinite(val)) latestVal = val;
        }
      }
      out[ex] = latestVal;
    }
    return out;
  }, [dailyOverview, tracked]);

  const nextWeek = useMemo(() => {
    const last = weekly?.length ? Number(weekly[weekly.length - 1]?.week_number) : null;
    return Number.isFinite(last) && last > 0 ? last + 1 : 1;
  }, [weekly]);

  const plannedByExercise = useMemo(() => {
    if (!activeProgram) return {};
    const wkKey = `W${nextWeek}`;
    const out = {};
    for (const ex of tracked || []) {
      let found = null;
      for (const block of activeProgram.blocks || []) {
        for (const day of block?.days || []) {
          for (const row of day?.rows || []) {
            if ((row?.exercise || "").toString().trim() !== ex) continue;
            const v = row?.week_values?.[wkKey];
            if (v != null && String(v).trim() !== "") { found = String(v); break; }
          }
          if (found) break;
        }
        if (found) break;
      }
      // Convert planned value for display
      if (found != null) {
        const n = Number(found);
        found = Number.isFinite(n) ? String(fmt(toDisplayUnit(n, unit))) : found;
      }
      out[ex] = found;
    }
    return out;
  }, [activeProgram, tracked, nextWeek, unit]);

  const top3 = (tracked || []).slice(0, 3);

  return (
    <div className="grid grid-3">
      {top3.map((ex) => {
        const weeklyLatest = latest?.metrics_by_exercise?.[ex]?.e1rm ?? null;
        const dailyLatest = dailyLatestByExercise[ex] ?? null;
        const dailyBest = dailyBestByExercise[ex] ?? null;
        const weeklyBest = (() => {
          const vals = (weekly || []).map((w) => Number(w?.metrics_by_exercise?.[ex]?.e1rm)).filter(Number.isFinite);
          return vals.length ? Math.max(...vals) : null;
        })();
        // Raw kg values — convert for display
        const latestKg = [weeklyLatest, dailyLatest].filter(Number.isFinite).reduce((a, b) => Math.max(a, b), -Infinity);
        const bestKg = [weeklyBest, dailyBest].filter(Number.isFinite).reduce((a, b) => Math.max(a, b), -Infinity);
        const latestVal = Number.isFinite(latestKg) ? toDisplayUnit(latestKg, unit) : null;
        const bestVal = Number.isFinite(bestKg) ? toDisplayUnit(bestKg, unit) : null;

        return (
          <div className="metric" key={ex}>
            <div className="k">{ex} e1RM</div>
<div className="v">{bestVal != null ? fmt(bestVal) : "—"} <span className="small">{unit}</span></div>
<div className="s">Latest: {latestVal != null ? `${fmt(latestVal)} ${unit}` : "—"}</div>
            <div className="s">Planned W{nextWeek}: {plannedByExercise?.[ex] ?? "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

export function Charts({ weekly, dailyOverview, unit, tracked, activeProgram }) {
  const safeTracked = Array.isArray(tracked) ? tracked.slice(0, 6) : [];

  const weekNumToDate = (weekNum) => {
    const start = activeProgram?.start_date;
    const trainingDays = activeProgram?.training_days;
    const daysPerWeek = Math.max(1, Number(activeProgram?.days_per_week || 4));
    if (!start || !Array.isArray(trainingDays) || !trainingDays.length) return `W${weekNum}`;
    const startD = new Date(String(start).slice(0, 10) + "T00:00:00Z");
    const tset = new Set(trainingDays.map(Number));
    let sessionCount = 0;
    for (let i = 0; i < 730; i++) {
      const d = new Date(startD);
      d.setUTCDate(startD.getUTCDate() + i);
      if (tset.has(d.getUTCDay())) {
        sessionCount++;
        if (Math.ceil(sessionCount / daysPerWeek) === weekNum) return formatDate(d.toISOString().slice(0, 10));
      }
    }
    return `W${weekNum}`;
  };

  const options = useMemo(() => ({
    ...CHART_OPTIONS_BASE,
    scales: {
      ...CHART_OPTIONS_BASE.scales,
      y: { ...CHART_OPTIONS_BASE.scales.y, title: { display: true, text: unit, color: "rgba(255,255,255,0.75)" } },
    },
  }), [unit]);

  return (
    <div className="grid grid-2">
      {safeTracked.map((ex) => {
        const norm = normalizeExerciseName(ex);

        const weeklyMap = new Map();
        (weekly || []).forEach((w) => {
          const val = Number(w?.metrics_by_exercise?.[ex]?.e1rm);
          if (Number.isFinite(val)) weeklyMap.set(w.week_number, toDisplayUnit(val, unit));
        });

        const dailyMap = new Map();
        (dailyOverview || []).forEach((day) => {
          const isoDate = String(day?.entry_date || "").slice(0, 10);
          if (!isoDate) return;
          (day?.entries || []).forEach((e) => {
            if (normalizeExerciseName(e?.exercise) !== norm) return;
            const val = e1rmFromTopReps(e?.actual?.top ?? e?.top, e?.actual?.reps ?? e?.reps);
            if (!Number.isFinite(val)) return;
            const displayVal = toDisplayUnit(val, unit);
            const cur = dailyMap.get(isoDate);
            if (!cur || displayVal > cur.val) dailyMap.set(isoDate, { val: displayVal, date: isoDate });
          });
        });

        const allWeekNums = Array.from(new Set((weekly || []).map((w) => w.week_number))).sort((a, b) => a - b);
        const dailyPoints = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        const weeklyWithDates = allWeekNums.map((w) => ({
          label: weekNumToDate(w), val: weeklyMap.get(w) ?? null,
          sortKey: weekNumToDate(w), isWeek: true, weekNum: w,
        }));
        const dailyWithDates = dailyPoints.map((p) => ({
          label: formatDate(p.date), val: p.val, sortKey: p.date, isWeek: false,
        }));
        const combined = [...weeklyWithDates, ...dailyWithDates].sort((a, b) => {
          const toSortable = (x) => {
            if (!x.isWeek) return x.sortKey;
            const parts = x.sortKey.split("/");
            if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
            return `W${String(x.weekNum).padStart(4, "0")}`;
          };
          return toSortable(a).localeCompare(toSortable(b));
        });

        const labels = combined.map((x) => x.label);
        const series = combined.map((x) => x.val);

        return (
          <div key={ex} className="card">
            <div style={{ fontWeight: 800 }}>{ex} trend</div>
            <div style={{ height: 260, position: "relative", overflow: "hidden", marginTop: 10 }}>
              {series.some(Number.isFinite) ? (
                <Line
                  data={{
                    labels,
                    datasets: [{
                      label: `${ex} e1RM (${unit})`,
                      data: series,
                      tension: 0.25, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6,
                      fill: true, borderColor: "rgba(239,68,68,1)", spanGaps: true,
                      backgroundColor: (ctx) => {
                        const { ctx: c, chartArea } = ctx.chart;
                        if (!chartArea) return "rgba(239,68,68,0.12)";
                        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        g.addColorStop(0, "rgba(239,68,68,0.28)");
                        g.addColorStop(1, "rgba(239,68,68,0.02)");
                        return g;
                      },
                    }],
                  }}
                  options={options}
                />
              ) : (
                <div className="small" style={{ paddingTop: 12 }}>No e1RM data yet for {ex}.</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
