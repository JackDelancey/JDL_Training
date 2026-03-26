import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";
import { isoLocalToday, formatPrettyDate } from "../utils/dates";
import { fmt, e1rmFromTopReps } from "../utils/calcs";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, LineElement, PointElement, CategoryScale,
  LinearScale, Tooltip, Legend, Filler,
} from "chart.js";

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const CHART_OPTS = (yLabel) => ({
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: true, labels: { color: "rgba(255,255,255,0.75)", boxWidth: 10, font: { size: 11 } } },
    tooltip: { backgroundColor: "rgba(0,0,0,0.9)", titleColor: "#fff", bodyColor: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.1)", borderWidth: 1 },
  },
  scales: {
    x: { ticks: { color: "rgba(255,255,255,0.45)", font: { size: 10 }, maxRotation: 40 }, grid: { color: "rgba(255,255,255,0.04)" } },
    y: { ticks: { color: "rgba(255,255,255,0.45)", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" }, title: { display: !!yLabel, text: yLabel, color: "rgba(255,255,255,0.5)", font: { size: 10 } } },
  },
});

function interpolateSeries(values) {
  const v = [...(values || [])];
  let lastIdx = null;
  for (let i = 0; i < v.length; i++) { if (Number.isFinite(v[i])) { lastIdx = i; break; } }
  if (lastIdx == null) return v;
  for (let i = lastIdx + 1; i < v.length; i++) {
    if (!Number.isFinite(v[i])) continue;
    const gap = i - lastIdx;
    if (gap > 1) for (let k = 1; k < gap; k++) v[lastIdx + k] = v[lastIdx] + (v[i] - v[lastIdx]) * (k / gap);
    lastIdx = i;
  }
  return v;
}

export default function ExplorerPage() {
  const { token, unit, mergedLibrary: library, onInvalidToken, setErr } = useApp();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(library?.[0] || "Bench");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [curveMetric, setCurveMetric] = useState("top");
  const [showSmooth, setShowSmooth] = useState(true);
  const [showPctDrop, setShowPctDrop] = useState(false);
  const [quickTop, setQuickTop] = useState("");
  const [quickReps, setQuickReps] = useState("5");
  const [quickRpe, setQuickRpe] = useState("");
  const [quickNotes, setQuickNotes] = useState("");
  const [quickDate, setQuickDate] = useState(isoLocalToday());
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickSuccess, setQuickSuccess] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? (library || []).filter((x) => x.toLowerCase().includes(s)) : library || [];
  }, [q, library]);

  useEffect(() => {
    if (!picked && library?.length) setPicked(library[0]);
  }, [library]);

  useEffect(() => {
    if (filtered.length && q.trim() && filtered[0] !== picked) setPicked(filtered[0]);
  }, [q, filtered]);

  async function load(name = picked) {
    if (!name) return;
    try {
      setBusy(true);
      const res = await apiFetch(`/api/exercises/explorer?exercise=${encodeURIComponent(name)}`, { token, onInvalidToken });
      setData(res);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  useEffect(() => { if (picked) load(picked); }, [picked]);

  async function addQuickEntry() {
    try {
      if (!picked?.trim()) throw new Error("Pick an exercise first.");
      if (!quickTop) throw new Error("Enter a top weight.");
      if (!quickDate) throw new Error("Pick a date.");
      setQuickBusy(true);
      await apiFetch(`/api/daily/${quickDate}/entries`, {
        token, method: "POST",
        body: { entry: { exercise: picked.trim(), source: "manual", planned: { sets_reps: "", load_rpe: "", notes: "", target: "" }, completed: true, notes: quickNotes, actual: { top: quickTop, reps: quickReps, rpe: quickRpe } } },
        onInvalidToken,
      });
      setQuickTop(""); setQuickReps("5"); setQuickRpe(""); setQuickNotes("");
      setQuickSuccess(true);
      setTimeout(() => setQuickSuccess(false), 2000);
      await load(picked);
    } catch (e) { setErr(e.message); } finally { setQuickBusy(false); }
  }

  const best1rm = useMemo(() => {
    const e = Number(data?.best_e1rm?.e1rm);
    if (Number.isFinite(e)) return e;
    const vals = (data?.best_by_rep_bucket || []).map((r) => Number(r?.e1rm)).filter(Number.isFinite);
    return vals.length ? Math.max(...vals) : null;
  }, [data]);

  const curve = useMemo(() => {
    if (!data) return null;
    const allRows = Array.isArray(data.best_by_rep_bucket) ? data.best_by_rep_bucket : [];
    const recentRows = Array.isArray(data.best_by_rep_bucket_recent) ? data.best_by_rep_bucket_recent : null;

    function repNum(bucket) {
      const s = String(bucket || "");
      return s.endsWith("+") ? Number(s.slice(0, -1)) || 13 : Number(s) || null;
    }
    function toPts(rows) {
      return (rows || []).map((r) => ({ bucket: r.bucket, reps: repNum(r.bucket), top: r?.top != null ? Number(r.top) : null, e1rm: r?.e1rm != null ? Number(r.e1rm) : null }))
        .filter((p) => p.reps != null && (Number.isFinite(p.top) || Number.isFinite(p.e1rm))).sort((a, b) => a.reps - b.reps);
    }

    const ptsAll = toPts(allRows);
    const labels = ptsAll.map((p) => `${p.bucket}r`);
    const recentMap = new Map((recentRows ? toPts(recentRows) : []).map((p) => [p.bucket, p]));
    const seriesAll = ptsAll.map((p) => curveMetric === "e1rm" ? p.e1rm : p.top);
    const seriesRecent = recentRows ? labels.map((_, i) => { const p = recentMap.get(ptsAll[i]?.bucket); if (!p) return null; return curveMetric === "e1rm" ? p.e1rm : p.top; }) : null;

    const pctAll = showPctDrop && Number.isFinite(best1rm) ? seriesAll.map((v) => Number.isFinite(v) ? (v / best1rm) * 100 : null) : null;
    const pctRecent = showPctDrop && Number.isFinite(best1rm) && seriesRecent ? seriesRecent.map((v) => Number.isFinite(v) ? (v / best1rm) * 100 : null) : null;

    return { labels, seriesAll, seriesRecent, hasRecent: !!recentRows, smoothAll: showSmooth ? interpolateSeries(showPctDrop ? pctAll : seriesAll) : null, smoothRecent: showSmooth && seriesRecent ? interpolateSeries(showPctDrop ? pctRecent : seriesRecent) : null, pctAll, pctRecent };
  }, [data, curveMetric, showSmooth, showPctDrop, best1rm]);

  const oneRmTrend = useMemo(() => {
    const rows = Array.isArray(data?.trend_history) ? data.trend_history : [];
    if (!rows.length) return null;
    return {
      labels: rows.map((r) => r.label || "—"),
      actualSeries: rows.map((r) => (r.source === "daily" || r.source === "weekly") && Number.isFinite(Number(r.e1rm)) ? Number(r.e1rm) : null),
      plannedSeries: rows.map((r) => r.source === "program" && Number.isFinite(Number(r.e1rm)) ? Number(r.e1rm) : null),
    };
  }, [data]);

  const repPbMatrix = useMemo(() => {
    const map = new Map((data?.best_by_rep_bucket || []).map((r) => [String(r.bucket), r]));
    return ["1","2","3","4","5","6","8","10","12","13+"].map((bucket) => {
      const r = map.get(bucket);
      return { bucket, top: r?.top != null ? Number(r.top) : null, e1rm: r?.e1rm != null ? Number(r.e1rm) : null, label: r?.submitted_at_label || r?.date || (r?.week != null ? `W${r.week}` : null) };
    });
  }, [data]);

  const hasData = data && (data.total_sets_found > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Search bar ── */}
      <div className="card" style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Search exercise</label>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && filtered.length) { setPicked(filtered[0]); load(filtered[0]); } }}
              placeholder="Type to filter…" />
          </div>
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            <label>Exercise</label>
            <select value={picked} onChange={(e) => setPicked(e.target.value)}>
              {filtered.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <button className="secondary" style={{ fontSize: 12, padding: "7px 14px" }} onClick={() => load(picked)} disabled={busy}>
            {busy ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {!data ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px", background: "var(--surface2)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 600 }}>Select an exercise to explore your history</div>
        </div>
      ) : (
        <>
          {/* ── Hero metrics ── */}
          <div className="grid grid-4">
            <div className="metric">
              <div className="k">Best e1RM</div>
              <div className="v">{data.best_e1rm?.e1rm != null ? fmt(data.best_e1rm.e1rm) : "—"} <span className="small">{unit}</span></div>
              <div className="s">{data.best_e1rm ? `${fmt(data.best_e1rm.top)} × ${data.best_e1rm.reps}` : "No data"}</div>
            </div>
            <div className="metric">
              <div className="k">Best top set</div>
              <div className="v">{data.best_load?.top != null ? fmt(data.best_load.top) : "—"} <span className="small">{unit}</span></div>
              <div className="s">{data.best_load ? `× ${data.best_load.reps} reps` : "No data"}</div>
            </div>
            <div className="metric">
              <div className="k">Total sets</div>
              <div className="v">{data.total_sets_found ?? 0}</div>
              <div className="s">logged across all time</div>
            </div>
            <div className="metric">
              <div className="k">Recent best e1RM</div>
              <div className="v">{data.best_by_rep_bucket_recent?.length ? fmt(Math.max(...data.best_by_rep_bucket_recent.map(r => Number(r.e1rm)).filter(Number.isFinite))) : "—"} <span className="small">{unit}</span></div>
              <div className="s">last 8 weeks</div>
            </div>
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-2">
            {/* Strength curve */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Rep strength curve</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { label: "Top set", active: curveMetric === "top", onClick: () => setCurveMetric("top") },
                    { label: "e1RM", active: curveMetric === "e1rm", onClick: () => setCurveMetric("e1rm") },
                    { label: showSmooth ? "Smooth ✓" : "Smooth", active: showSmooth, onClick: () => setShowSmooth(v => !v) },
                    { label: showPctDrop ? "% ✓" : "%", active: showPctDrop, onClick: () => setShowPctDrop(v => !v), disabled: !best1rm },
                  ].map(({ label, active, onClick, disabled }) => (
                    <button key={label} onClick={onClick} disabled={disabled}
                      style={{ fontSize: 11, padding: "4px 9px", background: active ? "rgba(232,25,44,0.2)" : "transparent", borderColor: active ? "rgba(232,25,44,0.5)" : "var(--border)", color: active ? "#fff" : "var(--text2)" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: 220, position: "relative" }}>
                {curve && (curve.seriesAll || []).some(Number.isFinite) ? (
                  <Line data={{
                    labels: curve.labels,
                    datasets: (() => {
                      const raw = showPctDrop ? curve.pctAll : curve.seriesAll;
                      const sets = [{ label: curve.hasRecent ? "All-time" : "Best", data: raw, tension: 0.3, borderWidth: 2, pointRadius: 3, fill: true, borderColor: "rgba(239,68,68,1)", backgroundColor: "rgba(239,68,68,0.08)", spanGaps: true }];
                      if (showSmooth && curve.smoothAll) sets.push({ label: "Smoothed", data: curve.smoothAll, tension: 0.3, borderWidth: 1.5, pointRadius: 0, fill: false, borderDash: [4, 4], borderColor: "rgba(239,68,68,0.4)", spanGaps: true });
                      if (curve.hasRecent) {
                        const rRaw = showPctDrop ? curve.pctRecent : curve.seriesRecent;
                        sets.push({ label: "Recent 8w", data: rRaw, tension: 0.3, borderWidth: 2, pointRadius: 3, fill: false, borderColor: "rgba(59,130,246,1)", spanGaps: true });
                        if (showSmooth && curve.smoothRecent) sets.push({ label: "Recent smooth", data: curve.smoothRecent, tension: 0.3, borderWidth: 1.5, pointRadius: 0, fill: false, borderDash: [4, 4], borderColor: "rgba(59,130,246,0.4)", spanGaps: true });
                      }
                      return sets;
                    })(),
                  }} options={CHART_OPTS(showPctDrop ? "% of best" : unit)} />
                ) : <div className="small" style={{ paddingTop: 80, textAlign: "center", opacity: 0.5 }}>Not enough data yet</div>}
              </div>
            </div>

            {/* 1RM trend */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>1RM trend over time</div>
              <div style={{ height: 220, position: "relative" }}>
                {oneRmTrend?.labels?.length ? (
                  <Line data={{
                    labels: oneRmTrend.labels,
                    datasets: [
                      { label: "Actual e1RM", data: oneRmTrend.actualSeries, tension: 0.25, borderWidth: 2, pointRadius: 3, fill: true, borderColor: "rgba(239,68,68,1)", backgroundColor: "rgba(239,68,68,0.08)", spanGaps: false },
                      { label: "Planned", data: oneRmTrend.plannedSeries, tension: 0.25, borderWidth: 2, pointRadius: 3, fill: false, borderDash: [5, 5], borderColor: "rgba(59,130,246,0.85)", spanGaps: false },
                    ],
                  }} options={CHART_OPTS(unit)} />
                ) : <div className="small" style={{ paddingTop: 80, textAlign: "center", opacity: 0.5 }}>Not enough history yet</div>}
              </div>
            </div>
          </div>

          {/* ── Rep PBs + Quick add ── */}
          <div className="grid grid-2">
            {/* Rep PBs */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Personal bests by rep range</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                {repPbMatrix.map((r) => (
                  <div key={r.bucket} style={{ background: r.top != null ? "rgba(232,25,44,0.07)" : "var(--surface2)", border: `1px solid ${r.top != null ? "rgba(232,25,44,0.2)" : "var(--border)"}`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{r.bucket}r</div>
                    <div style={{ fontWeight: 800, fontSize: 15, marginTop: 2 }}>{r.top != null ? fmt(r.top) : "—"}</div>
                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>{r.e1rm != null ? `~${fmt(r.e1rm)}` : ""}</div>
                    {r.label && <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 2 }}>{r.label}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick add */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Quick log a set</div>
              <div className="small" style={{ marginBottom: 12 }}>Add a manual entry for <b>{picked}</b></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px", gap: 8, marginBottom: 10 }}>
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>Top ({unit})</label>
                  <input value={quickTop} onChange={(e) => setQuickTop(e.target.value)} placeholder="—"
                    onKeyDown={(e) => { if (e.key === "Enter") addQuickEntry(); }} />
                </div>
                <div className="field">
                  <label>Reps</label>
                  <input value={quickReps} onChange={(e) => setQuickReps(e.target.value)} placeholder="—" />
                </div>
                <div className="field">
                  <label>RPE</label>
                  <input value={quickRpe} onChange={(e) => setQuickRpe(e.target.value)} placeholder="—" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={quickNotes} onChange={(e) => setQuickNotes(e.target.value)} placeholder="Notes (optional)" style={{ flex: 1, fontSize: 12 }} />
                <button onClick={addQuickEntry} disabled={quickBusy || !quickTop} style={{ fontSize: 12, padding: "7px 14px", whiteSpace: "nowrap" }}>
                  {quickSuccess ? "✓ Added" : quickBusy ? "…" : "Add to log"}
                </button>
              </div>
              {quickTop && quickReps && Number.isFinite(e1rmFromTopReps(quickTop, quickReps)) && (
                <div className="small" style={{ marginTop: 8, color: "rgba(232,25,44,0.8)", fontWeight: 700 }}>
                  Estimated e1RM: {fmt(e1rmFromTopReps(quickTop, quickReps))} {unit}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
