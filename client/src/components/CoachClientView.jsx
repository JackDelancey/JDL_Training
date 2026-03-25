import { useState, useEffect } from "react";
import { apiFetch } from "../utils/api";
import { isoLocalToday, isoLocalNDaysAgo, formatPrettyDate, formatPrettyDateTime } from "../utils/dates";
import { fmt, e1rmFromTopReps, normalizeExerciseName } from "../utils/calcs";

export function CoachClientView({ token, unit, onInvalidToken, onError }) {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientData, setClientData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [browseDate, setBrowseDate] = useState(isoLocalToday());
  const [dailyEntry, setDailyEntry] = useState(null);

  const selectedClient = clients.find((c) => c.user_id === selectedClientId) || null;

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/coach/clients", { token, onInvalidToken })
      .then((res) => setClients(Array.isArray(res?.clients) ? res.clients : []))
      .catch((e) => onError(e.message));
  }, [token]);

  useEffect(() => {
    if (!selectedClientId) { setClientData(null); return; }
    loadClientData(selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) return;
    loadDailyEntry(selectedClientId, browseDate);
  }, [selectedClientId, browseDate]);

  async function loadClientData(clientId) {
    try {
      setBusy(true);
      const from = isoLocalNDaysAgo(180);
      const to = isoLocalToday();
      const adherenceFrom = isoLocalNDaysAgo(13);

      const [weekly, daily, adherence, progress] = await Promise.all([
        apiFetch(`/api/coach/clients/${clientId}/weekly`, { token, onInvalidToken }).catch(() => []),
        apiFetch(`/api/coach/clients/${clientId}/daily?from=${from}&to=${to}`, { token, onInvalidToken }).catch(() => []),
        apiFetch(`/api/coach/clients/${clientId}/adherence?from=${adherenceFrom}&to=${to}`, { token, onInvalidToken }).catch(() => null),
        apiFetch(`/api/coach/clients/${clientId}/progress`, { token, onInvalidToken }).catch(() => null),
      ]);

      setClientData({
        weekly: Array.isArray(weekly) ? weekly : [],
        daily: Array.isArray(daily) ? daily : [],
        adherence,
        progress,
      });
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadDailyEntry(clientId, date) {
    try {
      const res = await apiFetch(`/api/coach/clients/${clientId}/daily/${date}`, { token, onInvalidToken });
      setDailyEntry(res?.day || null);
    } catch {
      setDailyEntry(null);
    }
  }

  // Don't render anything if user has no coaching relationships
  if (!clients.length) return null;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, fontSize: 15 }}>👤 Coaching view</div>
        <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">— Select a client —</option>
          {clients.map((c) => <option key={c.user_id} value={c.user_id}>{c.name || c.email}</option>)}
        </select>
        {selectedClientId && (
          <>
            <button className="secondary" onClick={() => loadClientData(selectedClientId)} disabled={busy}>{busy ? "…" : "Refresh"}</button>
            <button className="secondary" onClick={() => { setSelectedClientId(""); setClientData(null); }}>Clear</button>
          </>
        )}
      </div>

      {selectedClient && clientData && (
        <>
          <hr />

          {/* Program progress */}
          {clientData.progress?.has_program && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 900 }}>{clientData.progress.program_name}</div>
              <div className="small">
                Week <b>{clientData.progress.current_week ?? "—"}</b> • Day <b>{clientData.progress.current_day ?? "—"}</b> • {clientData.progress.total_weeks} weeks total
              </div>
              {clientData.progress.progress_pct != null && (
                <>
                  <div className="small" style={{ marginTop: 6 }}>Progress: <b>{clientData.progress.progress_pct.toFixed(0)}%</b></div>
                  <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 999, marginTop: 6 }}>
                    <div style={{ width: `${Math.min(100, clientData.progress.progress_pct)}%`, height: 8, borderRadius: 999, background: "rgba(239,68,68,0.9)" }} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Adherence */}
          {clientData.adherence?.planned_sessions > 0 && (
            <div className="grid grid-3" style={{ marginBottom: 14 }}>
              <div className="metric"><div className="k">Planned (14d)</div><div className="v">{clientData.adherence.planned_sessions}</div></div>
              <div className="metric"><div className="k">Completed</div><div className="v">{clientData.adherence.completed_sessions}</div></div>
              <div className="metric"><div className="k">Adherence</div><div className="v">{clientData.adherence.adherence_pct != null ? `${clientData.adherence.adherence_pct.toFixed(1)}%` : "—"}</div></div>
            </div>
          )}

          {/* Best e1RMs */}
          <div className="grid grid-3" style={{ marginBottom: 14 }}>
            {["Bench", "Squat", "Deadlift"].map((ex) => {
              const norm = normalizeExerciseName(ex);
              const vals = [
                ...(clientData.weekly || []).map((w) => Number(w?.metrics_by_exercise?.[ex]?.e1rm)).filter(Number.isFinite),
                ...(clientData.daily || []).flatMap((d) =>
                  (d?.entries || [])
                    .filter((e) => normalizeExerciseName(e?.exercise) === norm)
                    .map((e) => e1rmFromTopReps(e?.actual?.top ?? e?.top, e?.actual?.reps ?? e?.reps))
                    .filter(Number.isFinite)
                ),
              ];
              const best = vals.length ? Math.max(...vals) : null;
              return (
                <div className="metric" key={ex}>
                  <div className="k">{ex} best e1RM</div>
                  <div className="v">{best != null ? `${fmt(best)} ${unit}` : "—"}</div>
                </div>
              );
            })}
          </div>

          {/* Weekly log table */}
          {clientData.weekly?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Weekly log</div>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr><th>Week</th><th>Bodyweight</th><th>Sleep</th><th>Zone2</th><th>Notes</th><th>Entries</th></tr>
                  </thead>
                  <tbody>
                    {clientData.weekly.map((w) => (
                      <tr key={w.week_number}>
                        <td>W{w.week_number}</td>
                        <td>{w.bodyweight ?? "—"}</td>
                        <td>{w.sleep_hours ?? "—"}</td>
                        <td>{w.zone2_mins ?? "—"}</td>
                        <td>{w.notes || "—"}</td>
                        <td>
                          {(w.entries || []).map((e, i) => (
                            <div key={i} className="small">{e.exercise}: <b>{fmt(e.top)} × {e.reps}</b>{e.rpe ? ` @ RPE ${e.rpe}` : ""}</div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Daily log browser */}
          <div>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Daily log browser</div>
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Browse date</label>
              <input type="date" value={browseDate} onChange={(e) => setBrowseDate(e.target.value)} />
            </div>

            {dailyEntry ? (
              <div style={{ marginTop: 12 }}>
                <div className="small" style={{ marginBottom: 8 }}>
                  {dailyEntry.is_completed
                    ? `✅ Session completed at ${formatPrettyDateTime(dailyEntry.completed_at)}`
                    : "Session not marked complete"}
                </div>
                <div className="grid grid-3" style={{ marginBottom: 10 }}>
                  {dailyEntry.bodyweight && <div className="metric"><div className="k">Bodyweight</div><div className="v">{dailyEntry.bodyweight} {unit}</div></div>}
                  {dailyEntry.sleep_hours && <div className="metric"><div className="k">Sleep</div><div className="v">{dailyEntry.sleep_hours}h</div></div>}
                  {dailyEntry.zone2_mins && <div className="metric"><div className="k">Zone2</div><div className="v">{dailyEntry.zone2_mins} mins</div></div>}
                </div>
                {dailyEntry.notes && <div className="small" style={{ marginBottom: 10 }}>Notes: {dailyEntry.notes}</div>}
                <div className="list">
                  {(dailyEntry.entries || []).map((e, i) => (
                    <div className="listRow" key={i} style={{ alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{e.exercise}</div>
                        {e?.planned?.sets_reps && (
                          <div className="small">Plan: <b>{e.planned.sets_reps}</b>{e.planned.load_rpe ? ` @ ${e.planned.load_rpe}` : ""}{e.planned.target ? ` — Target: ${e.planned.target}` : ""}</div>
                        )}
                        <div className="small" style={{ marginTop: 4 }}>
                          Actual: <b>{fmt(e?.actual?.top ?? e?.top) || "—"} × {e?.actual?.reps ?? e?.reps ?? "—"}</b>
                          {(e?.actual?.rpe ?? e?.rpe) ? ` @ RPE ${e?.actual?.rpe ?? e?.rpe}` : ""}
                        </div>
                        {e.notes && <div className="small" style={{ marginTop: 2 }}>Notes: {e.notes}</div>}
                        {(e?.actual?.top ?? e?.top) && (e?.actual?.reps ?? e?.reps) && (
                          <div className="small" style={{ marginTop: 2, color: "rgba(239,68,68,0.9)" }}>
                            e1RM: {fmt(e1rmFromTopReps(e?.actual?.top ?? e?.top, e?.actual?.reps ?? e?.reps))} {unit}
                          </div>
                        )}
                      </div>
                      <span className="pill" style={e.completed ? { borderColor: "rgba(16,185,129,0.5)", background: "rgba(16,185,129,0.12)" } : {}}>
                        {e.completed ? "✓" : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="small" style={{ marginTop: 10 }}>No log entry for {browseDate}.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
