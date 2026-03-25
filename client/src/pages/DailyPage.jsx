import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";
import { isoLocalToday, normalizeDateOnly, formatPrettyDate } from "../utils/dates";
import { fmt, e1rmFromTopReps, buildEntriesFromPlanRows, dailyDraftKey } from "../utils/calcs";
import { Notice } from "../components/Auth";

export default function DailyPage() {
  const { me, token, unit, mergedLibrary: library, onInvalidToken, setErr } = useApp();
  const showRpe = me?.use_rpe !== false;

  const [date, setDate] = useState(isoLocalToday());
  const [plan, setPlan] = useState(null);
  const [day, setDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manualExercise, setManualExercise] = useState("");
  const [manualPick, setManualPick] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [activeProgram, setActiveProgram] = useState(null);
  const [selectedProgramSlot, setSelectedProgramSlot] = useState("");
  const [exerciseHistory, setExerciseHistory] = useState({});
  const [dailyDraftNotice, setDailyDraftNotice] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const entries = day?.entries || [];
  const plannedCt = entries.length;
  const doneCt = entries.filter((e) => e?.completed || String(e?.actual?.top || "").trim() !== "").length;
  const allDone = plannedCt > 0 && doneCt === plannedCt;

  const programSessionOptions = useMemo(() => {
    if (!activeProgram || !Array.isArray(activeProgram.blocks)) return [];
    const out = [];
    let absoluteWeek = 1;
    for (let bi = 0; bi < activeProgram.blocks.length; bi++) {
      const block = activeProgram.blocks[bi];
      const weeksInBlock = Math.max(1, Number(block?.weeks || 0));
      for (let w = 1; w <= weeksInBlock; w++) {
        for (const dayObj of Array.isArray(block?.days) ? block.days : []) {
          const wkKey = `W${absoluteWeek}`;
          out.push({
            key: `B${bi + 1}-W${w}-D${dayObj?.day_number}`,
            label: `Block ${bi + 1} • Week ${w} • Day ${dayObj?.day_number}`,
            rows: (Array.isArray(dayObj?.rows) ? dayObj.rows : []).map((r) => ({ ...r, week_target: r?.week_values?.[wkKey] ?? "", wk_key: wkKey })),
          });
        }
        absoluteWeek++;
      }
    }
    return out;
  }, [activeProgram]);

  const selectedSlotObj = useMemo(() => programSessionOptions.find((x) => x.key === selectedProgramSlot) || null, [selectedProgramSlot, programSessionOptions]);

  async function loadAll(nextDate = date) {
    try {
      setBusy(true);
      const [ap, p, d] = await Promise.all([
        apiFetch("/api/programs/active", { token, onInvalidToken }).catch(() => null),
        apiFetch(`/api/programs/active/plan?date=${encodeURIComponent(nextDate)}`, { token, onInvalidToken }).catch(() => null),
        apiFetch(`/api/daily/${nextDate}`, { token, onInvalidToken }).catch(() => ({ day: null })),
      ]);

      setActiveProgram(ap?.program || null);
      setPlan(p);

      let dayObj = d?.day || null;
      const isTrainingDay = !!p?.is_training_day;
      const hasEntries = Array.isArray(dayObj?.entries) && dayObj.entries.length > 0;

      if (isTrainingDay && !hasEntries && Array.isArray(p?.rows) && p.rows.length) {
        const ents = buildEntriesFromPlanRows(p.rows);
        if (ents.length) {
          await apiFetch(`/api/daily/${nextDate}`, {
            token, method: "PUT",
            body: { unit, bodyweight: dayObj?.bodyweight ?? null, sleep_hours: dayObj?.sleep_hours ?? null, pec_pain_0_10: dayObj?.pec_pain_0_10 ?? null, zone2_mins: dayObj?.zone2_mins ?? null, notes: dayObj?.notes ?? null, entries: ents },
            onInvalidToken,
          });
          const d2 = await apiFetch(`/api/daily/${nextDate}`, { token, onInvalidToken }).catch(() => ({ day: null }));
          dayObj = d2?.day || dayObj;
        }
      }

      setDay(dayObj);

      const historySource = Array.isArray(dayObj?.entries) && dayObj.entries.length ? dayObj.entries : Array.isArray(p?.rows) ? p.rows : [];
      const names = [...new Set(historySource.map((x) => String(x?.exercise || "").trim()).filter(Boolean))];
      if (names.length) {
        apiFetch("/api/exercises/history/batch", { token, method: "POST", body: { exercises: names }, onInvalidToken })
          .then((res) => setExerciseHistory(res?.history_by_exercise || {}))
          .catch(() => {});
      }

      if (!selectedProgramSlot && p?.block_number && p?.block_week && p?.day_number) {
        setSelectedProgramSlot(`B${p.block_number}-W${p.block_week}-D${p.day_number}`);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    async function loadWithDraft() {
      await loadAll(date);
      const raw = localStorage.getItem(dailyDraftKey(date));
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.entry_date === date) { setDay(parsed); setDailyDraftNotice(true); }
        } catch {}
      }
      setDraftHydrated(true);
    }
    loadWithDraft();
    setManualPick("");
    setShowManual(false);
  }, [date]);

  useEffect(() => {
    if (!draftHydrated || !day || !date) return;
    try { localStorage.setItem(dailyDraftKey(date), JSON.stringify({ ...day, entry_date: date })); } catch {}
  }, [day, date, draftHydrated]);

  async function saveDay(nextDay) {
    try {
      setBusy(true);
      await apiFetch(`/api/daily/${date}`, { token, method: "PUT", body: nextDay, onInvalidToken });
      localStorage.removeItem(dailyDraftKey(date));
      setDailyDraftNotice(false);
      await loadAll(date);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function copySelectedSession() {
    try {
      const rows = selectedSlotObj?.rows || plan?.rows || [];
      if (!rows.length) return;
      setBusy(true);
      const existingExercises = new Set((day?.entries || []).map((e) => e.exercise));
      const newEntries = buildEntriesFromPlanRows(rows).filter((e) => !existingExercises.has(e.exercise));
      const mergedEntries = [...(day?.entries || []), ...newEntries];
      await apiFetch(`/api/daily/${date}`, {
        token, method: "PUT",
        body: { unit, bodyweight: day?.bodyweight ?? null, sleep_hours: day?.sleep_hours ?? null, pec_pain_0_10: day?.pec_pain_0_10 ?? null, zone2_mins: day?.zone2_mins ?? null, notes: day?.notes ?? null, entries: mergedEntries, is_completed: day?.is_completed === true, completed_at: day?.completed_at ?? null },
        onInvalidToken,
      });
      await loadAll(date);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  function addManualRow() {
    const name = String(manualExercise || manualPick || "").trim();
    if (!name) return;
    const newEntry = { exercise: name, source: "manual", planned: { sets_reps: "", load_rpe: "", notes: "", target: "" }, completed: false, notes: "", actual: { top: "", reps: 3, rpe: "" } };
    setDay((prev) => ({ ...(prev || { entry_date: date, unit }), entries: [...(prev?.entries || []), newEntry] }));
    setManualExercise(""); setManualPick(""); setShowManual(false);
  }

  function removeEntry(idx) {
    const ents = [...(day?.entries || [])];
    ents.splice(idx, 1);
    setDay((prev) => ({ ...(prev || { entry_date: date, unit }), entries: ents }));
  }

  function setEntry(idx, patch) {
    const ents = [...(day?.entries || [])];
    ents[idx] = { ...ents[idx], ...patch };
    setDay((prev) => ({ ...(prev || { entry_date: date, unit }), entries: ents }));
  }

  function setActual(idx, patch) {
    const ents = [...(day?.entries || [])];
    const cur = ents[idx] || {};
    ents[idx] = { ...cur, actual: { ...(cur.actual || {}), ...patch } };
    setDay((prev) => ({ ...(prev || { entry_date: date, unit }), entries: ents }));
  }

  const dayPayload = () => ({
    unit: day?.unit || unit,
    bodyweight: day?.bodyweight ?? null,
    sleep_hours: day?.sleep_hours ?? null,
    pec_pain_0_10: day?.pec_pain_0_10 ?? null,
    zone2_mins: day?.zone2_mins ?? null,
    notes: day?.notes ?? null,
    entries: day?.entries || [],
    is_completed: day?.is_completed === true,
    completed_at: day?.completed_at || null,
  });

  const displayPlan = selectedSlotObj || plan;
  const isTraining = !!displayPlan?.rows?.length || !!plan?.is_training_day;

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>

      {/* ── Left: Date + Plan ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="card">
          {/* Date picker */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Date</label>
              <input type="date" value={normalizeDateOnly(date)} onChange={(e) => setDate(normalizeDateOnly(e.target.value))} />
            </div>
            {programSessionOptions.length > 0 && (
              <div className="field" style={{ flex: 2 }}>
                <label>Session override</label>
                <select value={selectedProgramSlot} onChange={(e) => setSelectedProgramSlot(e.target.value)}>
                  <option value="">Auto (from date)</option>
                  {programSessionOptions.map((opt) => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Plan */}
          {!displayPlan ? (
            <div className="small">Loading…</div>
          ) : isTraining ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {displayPlan?.block_number
                      ? `Block ${displayPlan.block_number} • W${displayPlan.block_week} • Day ${displayPlan.day_number}`
                      : `Week ${displayPlan.week_number} • Day ${displayPlan.day_number}`}
                    {displayPlan.day_title ? ` — ${displayPlan.day_title}` : ""}
                  </div>
                  <div className="small">{(displayPlan.rows || []).length} exercises planned</div>
                </div>
                <button className="secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={copySelectedSession} disabled={busy}>
                  Load session
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Sets × Reps</th>
                      <th>Load</th>
                      <th>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(displayPlan.rows || []).map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{r.exercise}</td>
                        <td>{r.sets_reps || "—"}</td>
                        <td>{r.load_rpe || "—"}</td>
                        <td>{r.week_target || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>😴</div>
              <div style={{ fontWeight: 600 }}>Rest day</div>
              <div className="small">No session scheduled{plan?.reason ? ` (${plan.reason})` : ""}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Log ── */}
      <div className="card">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Log</h2>
            <div className="small">
              {plannedCt > 0
                ? <>{doneCt}/{plannedCt} exercises done {allDone ? "✓" : ""}</>
                : "No entries yet"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setShowManual((v) => !v)}>
              {showManual ? "Cancel" : "+ Add exercise"}
            </button>
            {day && (
              <button
                style={{ fontSize: 12, padding: "6px 12px" }}
                disabled={busy}
                onClick={() => saveDay({ ...dayPayload(), is_completed: !day?.is_completed, completed_at: !day?.is_completed ? new Date().toISOString() : null })}
              >
                {day?.is_completed ? "✓ Done" : "Mark done"}
              </button>
            )}
          </div>
        </div>

        {dailyDraftNotice && (
          <Notice
            text="Draft restored."
            onDismiss={() => setDailyDraftNotice(false)}
            actions={<button className="secondary" style={{ fontSize: 12 }} onClick={() => { localStorage.removeItem(dailyDraftKey(date)); setDailyDraftNotice(false); loadAll(date); }}>Discard</button>}
          />
        )}

        {/* Bodyweight + sleep */}
        <div className="grid grid-2" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>Bodyweight ({unit})</label>
            <input value={day?.bodyweight ?? ""} placeholder="e.g. 85" onChange={(ev) => setDay((prev) => ({ ...(prev || { entry_date: date, unit }), bodyweight: ev.target.value || null }))} />
          </div>
          <div className="field">
            <label>Sleep (h)</label>
            <input value={day?.sleep_hours ?? ""} placeholder="e.g. 8" onChange={(ev) => setDay((prev) => ({ ...(prev || { entry_date: date, unit }), sleep_hours: ev.target.value || null }))} />
          </div>
        </div>

        {/* Add exercise inline */}
        {showManual && (
          <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div className="grid grid-2" style={{ gap: 8, marginBottom: 8 }}>
              <div className="field">
                <label>From library</label>
                <select value={manualPick} onChange={(e) => setManualPick(e.target.value)}>
                  <option value="">Select…</option>
                  {(library || []).map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Or type custom</label>
                <input value={manualExercise} onChange={(e) => setManualExercise(e.target.value)} placeholder="e.g. Larsen Press"
                  onKeyDown={(e) => { if (e.key === "Enter") addManualRow(); }} />
              </div>
            </div>
            <button className="secondary" style={{ fontSize: 12 }} onClick={addManualRow}>Add row</button>
          </div>
        )}

        {/* Entries */}
        {!day ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div className="small">No log for this date yet.</div>
            {isTraining && (
              <button style={{ marginTop: 12, fontSize: 13 }} onClick={copySelectedSession} disabled={busy}>Load today's session</button>
            )}
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div className="small">No exercises yet.</div>
            {isTraining && (
              <button style={{ marginTop: 12, fontSize: 13 }} onClick={copySelectedSession} disabled={busy}>Load planned session</button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {entries.map((e, idx) => {
              const hx = exerciseHistory?.[e.exercise] || {};
              const last = Array.isArray(hx.last_entries) ? hx.last_entries[0] : null;
              const e1rm = e?.actual?.top && e?.actual?.reps
                ? e1rmFromTopReps(e.actual.top, e.actual.reps) : null;

              return (
                <div key={idx} style={{
                  background: e.completed ? "rgba(16,185,129,0.06)" : "var(--surface2)",
                  border: `1px solid ${e.completed ? "rgba(16,185,129,0.2)" : "var(--border)"}`,
                  borderRadius: 12, padding: 14,
                  transition: "all 0.15s ease",
                }}>
                  {/* Exercise header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{e.exercise}</div>
                      {e?.source === "program" && e?.planned?.sets_reps && (
                        <div className="small">
                          {e.planned.sets_reps}
                          {e.planned.load_rpe ? ` @ ${e.planned.load_rpe}` : ""}
                          {e.planned.target ? ` — target: ${e.planned.target}` : ""}
                        </div>
                      )}
                      {last && (
                        <div className="small" style={{ color: "var(--text3)", marginTop: 2 }}>
                          Last: <b>{fmt(last.top)} × {last.reps}</b> ({formatPrettyDate(last.date)})
                          {hx.best_all_time_e1rm != null && <> • Best e1RM: <b>{fmt(hx.best_all_time_e1rm)} {unit}</b></>}
                        </div>
                      )}
                    </div>
                    <button className="secondary" style={{ fontSize: 11, padding: "3px 8px", flexShrink: 0 }} onClick={() => removeEntry(idx)}>✕</button>
                  </div>

                  {/* Inputs */}
                  <div style={{ display: "grid", gridTemplateColumns: showRpe ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div className="field">
                      <label>Top ({unit})</label>
                      <input value={e?.actual?.top ?? ""} onChange={(ev) => setActual(idx, { top: ev.target.value })} placeholder="—" />
                    </div>
                    <div className="field">
                      <label>Reps</label>
                      <input value={e?.actual?.reps ?? ""} onChange={(ev) => setActual(idx, { reps: ev.target.value })} placeholder="—" />
                    </div>
                    {showRpe && (
                      <div className="field">
                        <label>RPE</label>
                        <input value={e?.actual?.rpe ?? ""} onChange={(ev) => setActual(idx, { rpe: ev.target.value })} placeholder="—" />
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={!!e.completed} onChange={(ev) => setEntry(idx, { completed: ev.target.checked })} />
                      <span className="small">Done</span>
                    </label>
                    <input style={{ flex: 1, minWidth: 140, fontSize: 12, padding: "5px 8px" }} placeholder="Notes…" value={e?.notes ?? ""} onChange={(ev) => setEntry(idx, { notes: ev.target.value })} />
                    {e1rm && <div className="small" style={{ color: "rgba(232,25,44,0.8)", fontWeight: 700, whiteSpace: "nowrap" }}>e1RM {fmt(e1rm)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Save bar */}
        {day && (
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="secondary" disabled={busy} onClick={() => saveDay(dayPayload())}>{busy ? "…" : "Save"}</button>
            <button disabled={busy} onClick={() => saveDay({ ...dayPayload(), is_completed: true, completed_at: new Date().toISOString() })}>
              {day?.is_completed ? "✓ Session complete" : "Mark session complete"}
            </button>
            {day?.is_completed && (
              <button className="secondary" disabled={busy} onClick={() => saveDay({ ...dayPayload(), is_completed: false, completed_at: null })} style={{ fontSize: 12 }}>Undo</button>
            )}
            <div className="small" style={{ marginLeft: "auto" }}>Changes save when you click Save</div>
          </div>
        )}
      </div>
    </div>
  );
}
