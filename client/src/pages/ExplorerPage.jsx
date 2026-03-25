import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";
import { isoLocalToday, formatDate } from "../utils/dates";
import { fmt, e1rmFromTopReps } from "../utils/calcs";
import { Line } from "react-chartjs-2";

const CHART_OPTS = (unit, yLabel) => ({
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: true, labels: { color: "rgba(255,255,255,0.85)", boxWidth: 12 } },
    tooltip: { enabled: true, backgroundColor: "rgba(0,0,0,0.85)", titleColor: "rgba(255,255,255,0.95)", bodyColor: "rgba(255,255,255,0.9)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1 },
  },
  scales: {
    x: { ticks: { color: "rgba(255,255,255,0.65)" }, grid: { color: "rgba(255,255,255,0.06)" } },
    y: { ticks: { color: "rgba(255,255,255,0.65)" }, grid: { color: "rgba(255,255,255,0.06)" }, title: { display: true, text: yLabel, color: "rgba(255,255,255,0.75)" } },
  },
});

function interpolateSeries(values) {
  const v = Array.isArray(values) ? [...values] : [];
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
  const [quickReps, setQuickReps] = useState("8");
  const [quickRpe, setQuickRpe] = useState("");
  const [quickNotes, setQuickNotes] = useState("");
  const [quickDate, setQuickDate] = useState(isoLocalToday());
  const [quickBusy, setQuickBusy] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? (library || []).filter((x) => x.toLowerCase().includes(s)) : library || [];
  }, [q, library]);

  useEffect(() => {
    if (!picked && library?.length) setPicked(library[0]);
    if (picked && library?.length && !library.includes(picked)) setPicked(library[0]);
  }, [library]);

  useEffect(() => {
    if (!filtered.length || !q.trim()) return;
    if (filtered[0] && filtered[0] !== picked) setPicked(filtered[0]);
  }, [q, filtered]);

  async function load(name = picked) {
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
      if (!quickReps) throw new Error("Enter reps.");
      if (!quickDate) throw new Error("Pick a date.");
      setQuickBusy(true);
      await apiFetch(`/api/daily/${quickDate}/entries`, {
        token, method: "POST",
        body: { entry: { exercise: picked.trim(), source: "manual", planned: { sets_reps: "", load_rpe: "", notes: "", target: "" }, completed: true, notes: quickNotes, actual: { top: quickTop, reps: quickReps, rpe: quickRpe } } },
        onInvalidToken,
      });
      setQuickTop(""); setQuickReps("8"); setQuickRpe(""); setQuickNotes("");
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
    const bucketOrder = ["1","2","3","4","5","6","8","10","12","13+"];
    const allRows = Array.isArray(data.best_by_rep_bucket) ? data.best_by_rep_bucket : [];
    const recentRows = Array.isArray(data.best_by_rep_bucket_recent) ? data.best_by_rep_bucket_recent : null;

    function repNum(bucket) {
      const s = String(bucket || "");
      if (s.endsWith("+")) return Number(s.slice(0, -1)) || 13;
      return Number(s) || null;
    }

    function toPts(rows) {
      return (rows || []).map((r) => ({ bucket: r.bucket, reps: repNum(r.bucket), top: r?.top != null ? Number(r.top) : null, e1rm: r?.e1rm != null ? Number(r.e1rm) : null })).filter((p) => p.reps != null && (Number.isFinite(p.top) || Number.isFinite(p.e1rm))).sort((a, b) => a.reps - b.reps);
    }

    const ptsAll = toPts(allRows);
    const labels = ptsAll.map((p) => p.bucket);
    const recentMap = new Map((recentRows ? toPts(recentRows) : []).map((p) => [p.bucket, p]));

    const seriesAll = ptsAll.map((p) => (curveMetric === "e1rm" ? p.e1rm : p.top));
    const seriesRecent = recentRows ? labels.map((b) => { const p = recentMap.get(b); if (!p) return null; return curveMetric === "e1rm" ? p.e1rm : p.top; }) : null;

    const pctAll = showPctDrop && Number.isFinite(best1rm) ? seriesAll.map((v) => Number.isFinite(v) ? (v / best1rm) * 100 : null) : null;
    const pctRecent = showPctDrop && Number.isFinite(best1rm) && seriesRecent ? seriesRecent.map((v) => Number.isFinite(v) ? (v / best1rm) * 100 : null) : null;

    return {
      labels, seriesAll, seriesRecent, hasRecent: !!recentRows,
      smoothAll: showSmooth ? interpolateSeries(showPctDrop ? pctAll : seriesAll) : null,
      smoothRecent: showSmooth && seriesRecent ? interpolateSeries(showPctDrop ? pctRecent : seriesRecent) : null,
      pctAll, pctRecent,
    };
  }, [data, curveMetric, showSmooth, showPctDrop, best1rm]);

  const repPbMatrix = useMemo(() => {
    const map = new Map((data?.best_by_rep_bucket || []).map((r) => [String(r.bucket), r]));
    return ["1","2","3","4","5","6","8","10","12","13+"].map((bucket) => {
      const r = map.get(bucket);
      return { bucket, top: r?.top != null ? Number(r.top) : null, e1rm: r?.e1rm != null ? Number(r.e1rm) : null, label: r?.submitted_at_label || r?.date || (r?.week != null ? `Week ${r.week}` : null) };
    });
  }, [data]);

  const oneRmTrend = useMemo(() => {
  const rows = Array.isArray(data?.trend_history) ? data.trend_history : [];
  if (!rows.length) return null;

  // Separate actual and planned
  const actual = rows.filter((r) => r.source === "daily" || r.source === "weekly");
  const planned = rows.filter((r) => r.source === "program");

  // Use a unified label set — dates for actual, week labels for planned
  // Merge onto same timeline by using all labels in order
  const allLabels = rows.map((r) => r.label || "—");

  return {
    labels: allLabels,
    actualSeries: rows.map((r) =>
      (r.source === "daily" || r.source === "weekly") && Number.isFinite(Number(r.e1rm))
        ? Number(r.e1rm) : null
    ),
    plannedSeries: rows.map((r) =>
      r.source === "program" && Number.isFinite(Number(r.e1rm))
        ? Number(r.e1rm) : null
    ),
  };
}, [data]);

  const curveOpts = useMemo(() => CHART_OPTS(unit, showPctDrop ? "Strength curve (% of best 1RM)" : `${curveMetric === "e1rm" ? "e1RM" : "Top set"} (${unit})`), [unit, curveMetric, showPctDrop]);
  const trendOpts = useMemo(() => CHART_OPTS(unit, `Estimated 1RM (${unit})`), [unit]);

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Exercise Explorer</h2>
        <div className="small">Search an exercise to see best sets by rep range.</div>
        <div style={{ height: 12 }} />
        <div className="field">
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && filtered.length) { setPicked(filtered[0]); load(filtered[0]); } }} placeholder="Type e.g. Bench, Squat, Row..." />
        </div>
        <div style={{ height: 10 }} />
        <div className="field">
          <label>Exercise</label>
          <select value={picked} onChange={(e) => setPicked(e.target.value)}>
            {filtered.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div style={{ height: 12 }} />
        <button className="secondary" onClick={() => load(picked)} disabled={busy}>{busy ? "…" : "Refresh"}</button>
      </div>

      <div className="card">
        <h2>Results</h2>
        {!data ? <div className="small">Pick an exercise to load results.</div> : (
          <>
            <div className="small">Sets found: <b>{data.total_sets_found ?? 0}</b></div>
            <div style={{ height: 10 }} />
            <div className="grid grid-2">
              <div className="metric">
                <div className="k">Best e1RM</div>
                <div className="v">{data.best_e1rm?.e1rm != null ? fmt(data.best_e1rm.e1rm) : "—"} <span className="small">{unit}</span></div>
                <div className="s">{data.best_e1rm ? `${fmt(data.best_e1rm.top)} x ${data.best_e1rm.reps}` : "—"}</div>
              </div>
              <div className="metric">
                <div className="k">Best top set</div>
                <div className="v">{data.best_load?.top != null ? fmt(data.best_load.top) : "—"} <span className="small">{unit}</span></div>
                <div className="s">{data.best_load ? `${fmt(data.best_load.top)} x ${data.best_load.reps}` : "—"}</div>
              </div>
            </div>

            <div style={{ height: 12 }} />
            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontWeight: 900 }}>Quick add to training log</div>
              <div className="small" style={{ marginTop: 4 }}>Save a manual set for <b>{picked}</b>.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
                {[{ label: "Date", type: "date", val: quickDate, set: setQuickDate }, { label: `Top (${unit})`, val: quickTop, set: setQuickTop, ph: "e.g. 80" }, { label: "Reps", val: quickReps, set: setQuickReps, ph: "e.g. 8" }, { label: "RPE", val: quickRpe, set: setQuickRpe, ph: "e.g. 8" }, { label: "Notes", val: quickNotes, set: setQuickNotes, ph: "Optional" }].map(({ label, type, val, set, ph }) => (
                  <div className="field" key={label}>
                    <label>{label}</label>
                    <input type={type || "text"} value={val} onChange={(e) => set(e.target.value)} placeholder={ph} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <button className="secondary" onClick={addQuickEntry} disabled={quickBusy}>{quickBusy ? "…" : "Add to log"}</button>
              </div>
            </div>

            <div style={{ height: 12 }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Rep strength curve</div>
              {[{ label: "Best top set", active: curveMetric === "top", onClick: () => setCurveMetric("top") }, { label: "Best e1RM", active: curveMetric === "e1rm", onClick: () => setCurveMetric("e1rm") }, { label: showSmooth ? "Smoothing: on" : "Smoothing: off", active: showSmooth, onClick: () => setShowSmooth((v) => !v) }, { label: showPctDrop ? "% mode: on" : "% mode: off", active: showPctDrop, onClick: () => setShowPctDrop((v) => !v), disabled: !best1rm }].map(({ label, active, onClick, disabled }) => (
                <button key={label} className={active ? "" : "secondary"} onClick={onClick} disabled={disabled}>{label}</button>
              ))}
            </div>
            <div style={{ height: 10 }} />
            {curve && (curve.seriesAll || []).some(Number.isFinite) ? (
              <div style={{ height: 280, position: "relative", overflow: "hidden" }}>
                <Line data={{
                  labels: curve.labels,
                  datasets: (() => {
                    const raw = showPctDrop ? curve.pctAll : curve.seriesAll;
                    const sets = [{ label: curve.hasRecent ? "All-time best" : "Best", data: raw, tension: 0.25, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, fill: true, borderColor: "rgba(239,68,68,1)", backgroundColor: "rgba(239,68,68,0.10)" }];
                    if (showSmooth && curve.smoothAll) sets.push({ label: "All-time (smoothed)", data: curve.smoothAll, tension: 0.25, borderWidth: 2, pointRadius: 0, fill: false, borderDash: [6, 6], borderColor: "rgba(239,68,68,0.55)" });
                    if (curve.hasRecent) {
                      const rRaw = showPctDrop ? curve.pctRecent : curve.seriesRecent;
                      sets.push({ label: "Recent 8 weeks", data: rRaw, tension: 0.25, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, fill: false, borderColor: "rgba(59,130,246,1)" });
                      if (showSmooth && curve.smoothRecent) sets.push({ label: "Recent (smoothed)", data: curve.smoothRecent, tension: 0.25, borderWidth: 2, pointRadius: 0, fill: false, borderDash: [6, 6], borderColor: "rgba(59,130,246,0.55)" });
                    }
                    return sets;
                  })(),
                }} options={curveOpts} />
              </div>
            ) : <div className="small">Not enough data yet.</div>}

            <div style={{ height: 12 }} />
            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontWeight: 900 }}>1RM trend</div>
              <div style={{ height: 10 }} />
              {oneRmTrend?.labels?.length ? (
                <div style={{ height: 280, position: "relative", overflow: "hidden" }}>
                  <Line data={{
                    labels: oneRmTrend.labels,
                    datasets: [
  { label: "Actual e1RM", data: oneRmTrend.actualSeries, tension: 0.25, borderWidth: 3, pointRadius: 4, fill: false, borderColor: "rgba(239,68,68,1)", spanGaps: false },
  { label: "Planned e1RM", data: oneRmTrend.plannedSeries, tension: 0.25, borderWidth: 2, pointRadius: 4, fill: false, borderDash: [6, 6], borderColor: "rgba(59,130,246,1)", spanGaps: false },
],
                  }} options={trendOpts} />
                </div>
              ) : <div className="small">Not enough history yet.</div>}
            </div>

            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontWeight: 900 }}>Rep PBs</div>
              <div className="grid grid-3" style={{ marginTop: 10 }}>
                {repPbMatrix.map((r) => (
                  <div key={r.bucket} className="metric">
                    <div className="k">{r.bucket} reps</div>
                    <div className="v">{r.top != null ? fmt(r.top) : "—"} <span className="small">{unit}</span></div>
                    <div className="s">e1RM: {r.e1rm != null ? `${fmt(r.e1rm)} ${unit}` : "—"}</div>
                    <div className="s">{r.label || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
