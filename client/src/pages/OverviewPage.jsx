import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { Dashboard, Charts } from "../components/Dashboard";
import { apiFetch } from "../utils/api";
import { isoLocalNDaysAgo, isoLocalToday, formatDate, formatPrettyDate, formatPrettyDateTime } from "../utils/dates";
import { fmt, e1rmFromTopReps, normalizeExerciseName } from "../utils/calcs";
import { CoachClientView } from "../components/CoachClientView";

function WeeksTable({ weekly, dailyOverview, unit, tracked }) {
  const cols = (tracked || []).slice(0, 6);
  if (!weekly.length && !dailyOverview.length) return <div className="small">No weekly logs yet.</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Week</th>
            {cols.map((ex) => <th key={ex}>{ex} e1RM</th>)}
          </tr>
        </thead>
        <tbody>
          {weekly.map((w, i) => (
            <tr key={w.id || i}>
              <td>{w.week_number}</td>
              {cols.map((ex) => {
                const n = Number(w?.metrics_by_exercise?.[ex]?.e1rm);
                return <td key={ex}>{Number.isFinite(n) ? `${fmt(n)} ${unit}` : "—"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small" style={{ marginTop: 8 }}>Showing first {cols.length} tracked exercises.</div>
    </div>
  );
}

function AdherenceMini({ token, onInvalidToken, onError }) {
  const [data, setData] = useState(null);
  const from = isoLocalNDaysAgo(13);
  const to = isoLocalToday();

  useEffect(() => {
    if (!token) return;
    apiFetch(`/api/adherence/program?from=${from}&to=${to}`, { token, onInvalidToken })
      .then(setData)
      .catch((e) => { onError(e.message); setData(null); });
  }, [token]);

  if (!data) return <div className="small">Adherence: loading…</div>;
  if (data.reason === "no_active_program") {
    return (
      <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div style={{ fontWeight: 900 }}>Adherence (last 14 days)</div>
        <div className="small" style={{ marginTop: 6 }}>No active program yet.</div>
      </div>
    );
  }

  const planned = Number(data.planned_sessions || 0);
  const completed = Number(data.completed_sessions || 0);
  const pctText = data.adherence_pct != null ? `${(Math.round(data.adherence_pct * 10) / 10).toFixed(1)}%` : "—";

  return (
    <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ fontWeight: 900 }}>Adherence (last 14 days)</div>
        {data.program_name && <div className="small">Program: <b>{data.program_name}</b></div>}
      </div>
      <div style={{ height: 10 }} />
      <div className="grid grid-3">
        <div className="metric"><div className="k">Planned</div><div className="v">{planned}</div></div>
        <div className="metric"><div className="k">Completed</div><div className="v">{completed}</div></div>
        <div className="metric"><div className="k">Adherence</div><div className="v">{pctText}</div></div>
      </div>
    </div>
  );
}

function ProgramProgressCard({ token, onInvalidToken, onError }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/programs/active/progress", { token, onInvalidToken })
      .then(setData)
      .catch((e) => { onError(e.message); setData(null); });
  }, [token]);

  if (!data) return <div className="card"><b>Program</b><div className="small">Loading…</div></div>;
  if (!data.has_program) return <div className="card"><b>Program</b><div className="small">No active program.</div></div>;

  const p = data.progress_pct != null ? Math.max(0, Math.min(100, data.progress_pct)) : null;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900 }}>{data.program_name || "Active program"}</div>
          <div className="small">
            {data.current_week ? <>Week <b>{data.current_week}</b> • Day <b>{data.current_day}</b></> : "Not on a scheduled session today"}
            {data.next_training_date && <> • Next: <b>{data.next_training_date}</b></>}
          </div>
        </div>
      </div>
      {p != null && (
        <>
          <div style={{ height: 8 }} />
          <div className="small">Progress: <b>{p.toFixed(0)}%</b></div>
          <div style={{ height: 8 }} />
          <div style={{ width: "100%", height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 999 }}>
            <div style={{ width: `${p}%`, height: 10, borderRadius: 999, background: "rgba(239,68,68,0.9)" }} />
          </div>
        </>
      )}
    </div>
  );
}

function WeeklyEntry({ token, unit, tracked, onSaved, onInvalidToken, onError }) {
  const [week, setWeek] = useState(1);
  const [meta, setMeta] = useState({ bodyweight: "", sleep_hours: "", pec_pain_0_10: "", zone2_mins: "", notes: "" });
  const [entries, setEntries] = useState(() => (tracked || []).map((exercise) => ({ exercise, top: "", reps: 3, rpe: "" })));

  useEffect(() => {
    setEntries((prev) => {
      const map = new Map(prev.map((e) => [e.exercise, e]));
      return (tracked || []).map((ex) => map.get(ex) || { exercise: ex, top: "", reps: 3, rpe: "" });
    });
  }, [tracked]);

  function setEntry(exercise, patch) {
    setEntries((prev) => prev.map((e) => e.exercise === exercise ? { ...e, ...patch } : e));
  }

  async function save() {
    try {
      await apiFetch(`/api/weekly/${week}`, { token, method: "PUT", body: { unit, ...meta, entries }, onInvalidToken });
      onSaved();
    } catch (e) { onError(e.message); }
  }

  async function autofill() {
    try {
      const res = await apiFetch(`/api/weekly/from-daily/${week}`, { token, method: "POST", body: { unit }, onInvalidToken });
      if (Array.isArray(res.derived_entries)) {
        setEntries(res.derived_entries.map((e) => ({ exercise: e.exercise, top: e.top ?? "", reps: e.reps ?? 3, rpe: e.rpe ?? "" })));
      }
      onSaved();
    } catch (e) { onError(e.message); }
  }

  return (
    <>
      <h2>Weekly log</h2>
      <div className="weeklyGridTop">
        <div className="field"><label>Week</label><input value={week} onChange={(e) => setWeek(e.target.value)} /></div>
        <div className="field"><label>Bodyweight ({unit})</label><input value={meta.bodyweight} onChange={(e) => setMeta({ ...meta, bodyweight: e.target.value })} /></div>
        <div className="field"><label>Sleep (h)</label><input value={meta.sleep_hours} onChange={(e) => setMeta({ ...meta, sleep_hours: e.target.value })} /></div>
        <div className="field"><label>Pain/Niggles (0–10)</label><input value={meta.pec_pain_0_10} onChange={(e) => setMeta({ ...meta, pec_pain_0_10: e.target.value })} /></div>
      </div>
      <div style={{ height: 14 }} />
      <div className="liftsGrid">
        {(tracked || []).map((ex) => {
          const e = entries.find((x) => x.exercise === ex) || { exercise: ex, top: "", reps: 3, rpe: "" };
          return (
            <div className="liftCard" key={ex}>
              <div className="liftHeader">{ex}</div>
              <div className="field"><label>Top set ({unit})</label><input value={e.top} onChange={(ev) => setEntry(ex, { top: ev.target.value })} /></div>
              <div style={{ height: 10 }} />
              <div className="liftRow2">
                <div className="field"><label>Reps</label><input value={e.reps} onChange={(ev) => setEntry(ex, { reps: ev.target.value })} /></div>
                <div className="field"><label>RPE</label><input value={e.rpe} onChange={(ev) => setEntry(ex, { rpe: ev.target.value })} /></div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 14 }} />
      <div className="weeklyGridBottom">
        <div className="field"><label>Zone2 (mins)</label><input value={meta.zone2_mins} onChange={(e) => setMeta({ ...meta, zone2_mins: e.target.value })} /></div>
        <div className="field weeklyNotes"><label>Notes</label><input value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={save}>Save week</button>
        <button className="secondary" onClick={autofill}>Auto-fill from Daily</button>
      </div>
    </>
  );
}

function GroupsMini({ token, onInvalidToken, onError }) {
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/groups", { token, onInvalidToken })
      .then((res) => setGroups(Array.isArray(res?.groups) ? res.groups : []))
      .catch((e) => { onError(e.message); setGroups([]); });
  }, [token]);

  if (!groups.length) return <div className="small">No groups yet.</div>;

  return (
    <div className="list">
      {groups.slice(0, 5).map((g) => (
        <div className="listRow" key={g.id}>
          <div>
            <div style={{ fontWeight: 800 }}>{g.name}</div>
            <div className="small">Code <b>{g.code}</b> • Members <b>{g.members_count}</b></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const { me, token, unit, tracked, dashboardExercises, weekly, dailyOverview, activeProgram, onInvalidToken, setErr, refresh } = useApp();

  return (
    <>
    <CoachClientView token={token} unit={unit} onInvalidToken={onInvalidToken} onError={setErr} />
      <div className="grid grid-2">
        <div className="card">
          <h2>Profile</h2>
          <div className="small">Logged in as <b>{me?.name || me?.email}</b></div>
          <hr />
          <WeeklyEntry token={token} unit={unit} tracked={tracked} onSaved={refresh} onInvalidToken={onInvalidToken} onError={setErr} />
        </div>
        <div className="card">
          <h2>Dashboard</h2>
          <div className="small">Latest + best e1RM for tracked exercises.</div>
          <div style={{ height: 10 }} />
          <Dashboard weekly={weekly} dailyOverview={dailyOverview} unit={unit} tracked={dashboardExercises} activeProgram={activeProgram} />
          <div style={{ height: 14 }} />
          <AdherenceMini token={token} onInvalidToken={onInvalidToken} onError={setErr} />
          <div style={{ height: 14 }} />
          <ProgramProgressCard token={token} onInvalidToken={onInvalidToken} onError={setErr} />
          <div style={{ height: 14 }} />
          <Charts weekly={weekly} dailyOverview={dailyOverview} unit={unit} tracked={dashboardExercises} activeProgram={activeProgram} />
        </div>
      </div>
      <div style={{ height: 20 }} />
      <div className="grid grid-2">
        <div className="card">
          <h2>Groups</h2>
          <div className="small">Quick access to your groups.</div>
          <div style={{ height: 10 }} />
          <GroupsMini token={token} onInvalidToken={onInvalidToken} onError={setErr} />
        </div>
        <div className="card">
          <h2>Weeks</h2>
          <WeeksTable weekly={weekly} dailyOverview={dailyOverview} unit={unit} tracked={tracked} />
        </div>
      </div>
    </>
  );
}
