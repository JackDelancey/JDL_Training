import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";

function ExerciseLibraryManager({ token, current, merged, onInvalidToken, onError, onLibraryChanged }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function save(next) {
    try {
      setBusy(true);
      const res = await apiFetch("/api/exercise-library", { token, method: "PUT", body: { exercises: next }, onInvalidToken });
      onLibraryChanged(res.exercises || []);
      setCustom("");
    } catch (e) { onError(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Add exercise to dropdown list</label>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Tempo Pause Squat" disabled={busy} />
        </div>
        <button className="secondary" onClick={() => save(Array.from(new Set([...(current || []), custom.trim()])).sort((a, b) => a.localeCompare(b)))} disabled={busy || !custom.trim()}>
          {busy ? "…" : "Add"}
        </button>
      </div>
      <div className="small" style={{ marginTop: 8 }}>Custom list: <b>{(current || []).length}</b> items</div>
      <div style={{ marginTop: 10 }}>
        <button className="secondary" onClick={() => setOpen((v) => !v)}>{open ? "Hide list" : "Show list"}</button>
      </div>
      {open && (
        <div className="list" style={{ marginTop: 10 }}>
          {(current || []).length ? current.map((x) => (
            <div className="listRow" key={x}>
              <div style={{ fontWeight: 700 }}>{x}</div>
              <button className="secondary" onClick={() => save((current || []).filter((c) => c !== x))} disabled={busy}>Remove</button>
            </div>
          )) : <div className="small">No custom exercises yet.</div>}
        </div>
      )}
    </div>
  );
}

function DashboardExerciseManager({ token, dashboardExercises, library, onInvalidToken, onError, onChanged }) {
  const [pick, setPick] = useState(library?.[0] || "Bench");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPick(library?.[0] || "Bench"); }, [library]);

  async function save(next) {
    try {
      setBusy(true);
      const res = await apiFetch("/api/dashboard-exercises", { token, method: "PUT", body: { dashboard_exercises: next }, onInvalidToken });
      onChanged(res.dashboard_exercises || next);
    } catch (e) { onError(e.message); } finally { setBusy(false); }
  }

  function move(name, dir) {
    const arr = [...(dashboardExercises || [])];
    const i = arr.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    save(arr);
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 10px" }}>Dashboard exercises</h3>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Add to dashboard</label>
        <div style={{ display: "flex", gap: 10 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}>
            {library.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="secondary" onClick={() => save(Array.from(new Set([...(dashboardExercises || []), pick])).slice(0, 6))} disabled={busy}>{busy ? "…" : "Add"}</button>
        </div>
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        {(dashboardExercises || []).length ? dashboardExercises.map((x) => (
          <div className="listRow" key={x}>
            <div style={{ fontWeight: 700 }}>{x}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary" onClick={() => move(x, -1)} disabled={busy}>↑</button>
              <button className="secondary" onClick={() => move(x, 1)} disabled={busy}>↓</button>
              <button className="secondary" onClick={() => save((dashboardExercises || []).filter((d) => d !== x))} disabled={busy}>Remove</button>
            </div>
          </div>
        )) : <div className="small">No dashboard exercises yet.</div>}
      </div>
    </div>
  );
}

function ExerciseManager({ token, tracked, library, onChanged, onInvalidToken, onError }) {
  const [pick, setPick] = useState(library[0] || "Bench");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPick(library[0] || "Bench"); }, [library]);

  async function save(next) {
    try {
      setBusy(true);
      await apiFetch("/api/tracked-exercises", { token, method: "PUT", body: { tracked_exercises: next }, onInvalidToken });
      onChanged();
    } catch (e) { onError(e.message); } finally { setBusy(false); }
  }

  function move(name, dir) {
    const arr = [...(tracked || [])];
    const i = arr.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    save(arr);
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 10px" }}>Tracked exercises</h3>
      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Add from list</label>
          <div style={{ display: "flex", gap: 10 }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}>
              {library.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <button className="secondary" onClick={() => save(Array.from(new Set([...(tracked || []), pick])))} disabled={busy}>{busy ? "…" : "Add"}</button>
          </div>
        </div>
        <div className="field">
          <label>Add custom</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Safety Bar Squat" disabled={busy} />
            <button className="secondary" onClick={() => { save(Array.from(new Set([...(tracked || []), custom.trim()]))); setCustom(""); }} disabled={busy}>{busy ? "…" : "Add"}</button>
          </div>
        </div>
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        {(tracked || []).length ? tracked.map((x) => (
          <div className="listRow" key={x}>
            <div style={{ fontWeight: 700 }}>{x}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary" onClick={() => move(x, -1)} disabled={busy}>↑</button>
              <button className="secondary" onClick={() => move(x, 1)} disabled={busy}>↓</button>
              <button className="secondary" onClick={() => save((tracked || []).filter((t) => t !== x))} disabled={busy}>Remove</button>
            </div>
          </div>
        )) : <div className="small">No exercises yet.</div>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { me, token, unit, mergedLibrary, exerciseLibrary, tracked, dashboardExercises, onInvalidToken, setErr, refresh, setExerciseLibrary, setDashboardExercises } = useApp();

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Preferences</h2>
        <div className="small">Units + account preferences.</div>
        <div style={{ height: 10 }} />
        <div className="field">
          <label>Units</label>
          <select value={unit} onChange={async (e) => {
            try {
              await apiFetch("/api/me/unit", { token, method: "PATCH", body: { unit_pref: e.target.value }, onInvalidToken });
              refresh();
            } catch (ex) { setErr(ex.message); }
          }}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>RPE input</label>
          <select value={me?.use_rpe === false ? "off" : "on"} onChange={async (e) => {
            try {
              await apiFetch("/api/me/preferences", { token, method: "PATCH", body: { use_rpe: e.target.value === "on" }, onInvalidToken });
              refresh();
            } catch (ex) { setErr(ex.message); }
          }}>
            <option value="on">Show RPE</option>
            <option value="off">Hide RPE</option>
          </select>
        </div>
        <div style={{ height: 14 }} />
        <div className="small">Signed in as <b>{me?.name || me?.email}</b></div>
      </div>
      <div className="card">
        <h2>Exercises</h2>
        <div className="small">Manage the dropdown exercise list + tracked exercises.</div>
        <div style={{ height: 10 }} />
        <ExerciseLibraryManager token={token} current={exerciseLibrary} merged={mergedLibrary} onInvalidToken={onInvalidToken} onError={setErr} onLibraryChanged={setExerciseLibrary} />
        <hr />
        <DashboardExerciseManager token={token} dashboardExercises={dashboardExercises} library={mergedLibrary} onInvalidToken={onInvalidToken} onError={setErr} onChanged={(list) => { setDashboardExercises(list); refresh(); }} />
        <hr />
        <ExerciseManager token={token} tracked={tracked} library={mergedLibrary} onChanged={refresh} onInvalidToken={onInvalidToken} onError={setErr} />
      </div>
    </div>
  );
}
