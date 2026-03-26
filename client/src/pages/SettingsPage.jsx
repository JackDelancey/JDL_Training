import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";

export default function SettingsPage() {
  const { me, token, unit, mergedLibrary, exerciseLibrary, tracked, dashboardExercises, onInvalidToken, setErr, refresh, setExerciseLibrary, setDashboardExercises } = useApp();
  const [customEx, setCustomEx] = useState("");
  const [libOpen, setLibOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [dbPick, setDbPick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (mergedLibrary?.length) { setPick(mergedLibrary[0]); setDbPick(mergedLibrary[0]); } }, [mergedLibrary]);

  async function saveUnit(val) {
    try {
      await apiFetch("/api/me/unit", { token, method: "PATCH", body: { unit_pref: val }, onInvalidToken });
      refresh();
    } catch (e) { setErr(e.message); }
  }

  async function saveRpe(val) {
    try {
      await apiFetch("/api/me/preferences", { token, method: "PATCH", body: { use_rpe: val === "on" }, onInvalidToken });
      refresh();
    } catch (e) { setErr(e.message); }
  }

  async function saveLibrary(next) {
    try {
      setBusy(true);
      const res = await apiFetch("/api/exercise-library", { token, method: "PUT", body: { exercises: next }, onInvalidToken });
      setExerciseLibrary(res.exercises || []);
      setCustomEx("");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function saveTracked(next) {
    try {
      setBusy(true);
      await apiFetch("/api/tracked-exercises", { token, method: "PUT", body: { tracked_exercises: next }, onInvalidToken });
      refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function saveDashboard(next) {
    try {
      setBusy(true);
      const res = await apiFetch("/api/dashboard-exercises", { token, method: "PUT", body: { dashboard_exercises: next }, onInvalidToken });
      setDashboardExercises(res.dashboard_exercises || next);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  function move(arr, name, dir) {
    const a = [...arr]; const i = a.indexOf(name); const j = i + dir;
    if (i < 0 || j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]]; return a;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800 }}>

      {/* Account */}
      <div className="card">
        <h2 style={{ margin: "0 0 14px" }}>Account</h2>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Weight unit</label>
            <select value={unit} onChange={(e) => saveUnit(e.target.value)}>
              <option value="kg">kg — Kilograms</option>
              <option value="lb">lb — Pounds</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>RPE input</label>
            <select value={me?.use_rpe === false ? "off" : "on"} onChange={(e) => saveRpe(e.target.value)}>
              <option value="on">Show RPE fields</option>
              <option value="off">Hide RPE fields</option>
            </select>
          </div>
        </div>
        <div className="small" style={{ marginTop: 12, opacity: 0.6 }}>Signed in as <b>{me?.name || me?.email}</b></div>
      </div>

      {/* Dashboard exercises */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Dashboard exercises</h2>
            <div className="small">Shown as headline metrics on the Overview page (max 6)</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={dbPick} onChange={(e) => setDbPick(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
            {mergedLibrary.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="secondary" style={{ fontSize: 12 }} disabled={busy || (dashboardExercises || []).length >= 6}
            onClick={() => saveDashboard(Array.from(new Set([...(dashboardExercises || []), dbPick])).slice(0, 6))}>
            Add
          </button>
        </div>
        {(dashboardExercises || []).length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dashboardExercises.map((x) => (
              <div key={x} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{x}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="secondary" style={{ fontSize: 11, padding: "2px 7px" }} disabled={busy} onClick={() => saveDashboard(move(dashboardExercises, x, -1))}>↑</button>
                  <button className="secondary" style={{ fontSize: 11, padding: "2px 7px" }} disabled={busy} onClick={() => saveDashboard(move(dashboardExercises, x, 1))}>↓</button>
                  <button className="secondary" style={{ fontSize: 11, padding: "2px 7px" }} disabled={busy} onClick={() => saveDashboard((dashboardExercises || []).filter((d) => d !== x))}>✕</button>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="small" style={{ opacity: 0.5 }}>No dashboard exercises yet</div>}
      </div>

      {/* Tracked exercises */}
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Tracked exercises</h2>
          <div className="small">Used in weekly logs and charts</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
            {mergedLibrary.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="secondary" style={{ fontSize: 12 }} disabled={busy}
            onClick={() => saveTracked(Array.from(new Set([...(tracked || []), pick])))}>
            Add
          </button>
        </div>
        {(tracked || []).length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tracked.map((x) => (
              <div key={x} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{x}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="secondary" style={{ fontSize: 11, padding: "2px 7px" }} disabled={busy} onClick={() => saveTracked(move(tracked, x, -1))}>↑</button>
                  <button className="secondary" style={{ fontSize: 11, padding: "2px 7px" }} disabled={busy} onClick={() => saveTracked(move(tracked, x, 1))}>↓</button>
                  <button className="secondary" style={{ fontSize: 11, padding: "2px 7px" }} disabled={busy} onClick={() => saveTracked((tracked || []).filter((t) => t !== x))}>✕</button>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="small" style={{ opacity: 0.5 }}>No tracked exercises yet</div>}
      </div>

      {/* Exercise library */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Exercise library</h2>
            <div className="small">Custom exercises added to all dropdowns</div>
          </div>
          <button className="secondary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setLibOpen(v => !v)}>
            {libOpen ? "Hide" : `Show (${(exerciseLibrary || []).length})`}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: libOpen ? 12 : 0 }}>
          <input value={customEx} onChange={(e) => setCustomEx(e.target.value)} placeholder="e.g. Tempo Pause Squat" style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter" && customEx.trim()) saveLibrary(Array.from(new Set([...(exerciseLibrary || []), customEx.trim()])).sort((a, b) => a.localeCompare(b))); }} />
          <button className="secondary" style={{ fontSize: 12 }} disabled={busy || !customEx.trim()}
            onClick={() => saveLibrary(Array.from(new Set([...(exerciseLibrary || []), customEx.trim()])).sort((a, b) => a.localeCompare(b)))}>
            Add
          </button>
        </div>
        {libOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(exerciseLibrary || []).length === 0
              ? <div className="small" style={{ opacity: 0.5 }}>No custom exercises yet</div>
              : exerciseLibrary.map((x) => (
                <div key={x} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{x}</div>
                  <button className="secondary" style={{ fontSize: 11, padding: "2px 7px" }} disabled={busy}
                    onClick={() => saveLibrary((exerciseLibrary || []).filter((c) => c !== x))}>✕</button>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
