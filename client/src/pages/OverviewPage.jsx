import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { CoachClientView } from "../components/CoachClientView";
import { Dashboard, Charts } from "../components/Dashboard";
import { apiFetch } from "../utils/api";
import { isoLocalNDaysAgo, isoLocalToday, formatPrettyDate } from "../utils/dates";
import { fmt } from "../utils/calcs";

// ─── Today's session status ───────────────────────────────────────────

function TodayCard({ token, onInvalidToken, onError, onGoToDaily }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!token) return;
    const today = isoLocalToday();
    apiFetch(`/api/programs/active/plan?date=${today}`, { token, onInvalidToken })
      .then(setData).catch(() => setData(null));
  }, [token]);

  if (!data) return null;

  if (!data.is_training_day) {
    return (
      <div className="card" style={{ background: "var(--surface2)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Rest day</div>
          <div className="small">No session scheduled today</div>
        </div>
        <span style={{ fontSize: 24 }}>😴</span>
      </div>
    );
  }

  return (
    <div className="card" style={{ background: "rgba(232,25,44,0.07)", borderColor: "rgba(232,25,44,0.25)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontWeight: 700 }}>Today — Block {data.block_number} • Week {data.block_week} • Day {data.day_number}</div>
        <div className="small">{data.day_title} • {(data.rows || []).length} exercises planned</div>
      </div>
      <button onClick={onGoToDaily} style={{ fontSize: 13, padding: "8px 16px" }}>
        Open session →
      </button>
    </div>
  );
}

// ─── Adherence card ───────────────────────────────────────────────────

function AdherenceCard({ token, onInvalidToken, onError }) {
  const [data, setData] = useState(null);
  const from = isoLocalNDaysAgo(13);
  const to = isoLocalToday();

  useEffect(() => {
    if (!token) return;
    apiFetch(`/api/adherence/program?from=${from}&to=${to}`, { token, onInvalidToken })
      .then(setData).catch(() => setData(null));
  }, [token]);

  if (!data || data.reason === "no_active_program") return null;

  const planned = Number(data.planned_sessions || 0);
  const completed = Number(data.completed_sessions || 0);
  const pct = planned ? Math.round((completed / planned) * 100) : null;

  return (
    <div className="card" style={{ background: "var(--surface2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>Adherence</div>
        <div className="small">Last 14 days{data.program_name ? ` • ${data.program_name}` : ""}</div>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: 6, borderRadius: 999, width: `${pct ?? 0}%`, background: pct >= 80 ? "rgba(16,185,129,0.8)" : pct >= 50 ? "rgba(245,158,11,0.8)" : "rgba(232,25,44,0.8)", transition: "width 0.4s ease" }} />
          </div>
          <div className="small" style={{ marginTop: 6 }}>{completed} / {planned} sessions completed</div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>
          {pct != null ? `${pct}%` : "—"}
        </div>
      </div>
    </div>
  );
}

// ─── Program progress ─────────────────────────────────────────────────

function ProgramCard({ token, onInvalidToken, onError }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/programs/active/progress", { token, onInvalidToken })
      .then(setData).catch(() => setData(null));
  }, [token]);

  if (!data?.has_program) return null;

  const p = data.progress_pct != null ? Math.max(0, Math.min(100, data.progress_pct)) : null;

  return (
    <div className="card" style={{ background: "var(--surface2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontWeight: 700 }}>{data.program_name}</div>
        {p != null && <div className="small">{p.toFixed(0)}% complete</div>}
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ height: 6, borderRadius: 999, width: `${p ?? 0}%`, background: "linear-gradient(90deg, rgba(232,25,44,0.9), rgba(232,25,44,0.5))", transition: "width 0.4s ease" }} />
      </div>
      <div className="small">
        {data.current_week ? <>Week <b>{data.current_week}</b> of <b>{data.total_weeks}</b> • Day <b>{data.current_day}</b></> : "No session today"}
        {data.next_training_date && <> • Next: <b>{data.next_training_date}</b></>}
      </div>
    </div>
  );
}

// ─── Weekly log (collapsible) ─────────────────────────────────────────

function WeeklyLogSection({ token, unit, tracked, onSaved, onInvalidToken, onError }) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
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
    <div className="card">
      <button
        className="secondary"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 700, color: "rgba(255,255,255,0.93)" }}>Log a week</div>
          <div className="small">Record your top sets for the week</div>
        </div>
        <span style={{ opacity: 0.5, fontSize: 12 }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div className="field"><label>Week</label><input value={week} onChange={(e) => setWeek(e.target.value)} /></div>
            <div className="field"><label>Bodyweight ({unit})</label><input value={meta.bodyweight} onChange={(e) => setMeta({ ...meta, bodyweight: e.target.value })} /></div>
            <div className="field"><label>Sleep (h)</label><input value={meta.sleep_hours} onChange={(e) => setMeta({ ...meta, sleep_hours: e.target.value })} /></div>
            <div className="field"><label>Pain (0–10)</label><input value={meta.pec_pain_0_10} onChange={(e) => setMeta({ ...meta, pec_pain_0_10: e.target.value })} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
            {(tracked || []).map((ex) => {
              const e = entries.find((x) => x.exercise === ex) || { exercise: ex, top: "", reps: 3, rpe: "" };
              return (
                <div key={ex} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>{ex}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <div className="field"><label>Top ({unit})</label><input value={e.top} onChange={(ev) => setEntry(ex, { top: ev.target.value })} /></div>
                    <div className="field"><label>Reps</label><input value={e.reps} onChange={(ev) => setEntry(ex, { reps: ev.target.value })} /></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={save}>Save week</button>
            <button className="secondary" onClick={autofill}>Auto-fill from Daily</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Weeks table (collapsible) ────────────────────────────────────────

function WeeksSection({ weekly, unit, tracked }) {
  const [open, setOpen] = useState(false);
  const cols = (tracked || []).slice(0, 6);
  if (!weekly.length) return null;

  return (
    <div className="card">
      <button
        className="secondary"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 700, color: "rgba(255,255,255,0.93)" }}>Weekly history</div>
          <div className="small">{weekly.length} weeks logged</div>
        </div>
        <span style={{ opacity: 0.5, fontSize: 12 }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 14, overflowX: "auto" }}>
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
                  <td>W{w.week_number}</td>
                  {cols.map((ex) => {
                    const n = Number(w?.metrics_by_exercise?.[ex]?.e1rm);
                    return <td key={ex}>{Number.isFinite(n) ? `${fmt(n)} ${unit}` : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Groups mini ──────────────────────────────────────────────────────

function GroupsMini({ token, onInvalidToken, onError }) {
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/groups", { token, onInvalidToken })
      .then((res) => setGroups(Array.isArray(res?.groups) ? res.groups : []))
      .catch(() => setGroups([]));
  }, [token]);

  if (!groups.length) return null;

  return (
    <div className="card" style={{ background: "var(--surface2)" }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Groups</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {groups.slice(0, 3).map((g) => (
          <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
            <div className="small"><b>{g.members_count}</b> members</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { me, token, unit, tracked, dashboardExercises, weekly, dailyOverview, activeProgram, onInvalidToken, setErr, refresh, setPage } = useApp();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CoachClientView token={token} unit={unit} onInvalidToken={onInvalidToken} onError={setErr} />

      {/* Hero metrics */}
      <div>
        <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Overview</h2>
          <div className="small">{me?.name || me?.email}</div>
        </div>
        <Dashboard weekly={weekly} dailyOverview={dailyOverview} unit={unit} tracked={dashboardExercises} activeProgram={activeProgram} />
      </div>

      {/* Today + program row */}
      <div className="grid grid-2">
        <TodayCard token={token} onInvalidToken={onInvalidToken} onError={setErr} onGoToDaily={() => setPage("daily")} />
        <ProgramCard token={token} onInvalidToken={onInvalidToken} onError={setErr} />
      </div>

      {/* Adherence */}
      <AdherenceCard token={token} onInvalidToken={onInvalidToken} onError={setErr} />

      {/* Charts */}
      <Charts weekly={weekly} dailyOverview={dailyOverview} unit={unit} tracked={dashboardExercises} activeProgram={activeProgram} />

      {/* Secondary — collapsible */}
      <div className="grid grid-2">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <WeeklyLogSection token={token} unit={unit} tracked={tracked} onSaved={refresh} onInvalidToken={onInvalidToken} onError={setErr} />
          <GroupsMini token={token} onInvalidToken={onInvalidToken} onError={setErr} />
        </div>
        <WeeksSection weekly={weekly} unit={unit} tracked={tracked} />
      </div>
    </div>
  );
}
