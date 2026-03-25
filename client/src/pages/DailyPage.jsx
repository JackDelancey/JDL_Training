import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";
import { isoLocalToday, normalizeDateOnly, formatPrettyDate, formatPrettyDateTime } from "../utils/dates";
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
  const [activeProgram, setActiveProgram] = useState(null);
  const [selectedProgramSlot, setSelectedProgramSlot] = useState("");
  const [exerciseHistory, setExerciseHistory] = useState({});
  const [dailyDraftNotice, setDailyDraftNotice] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const plannedCt = (day?.entries || []).length;
  const doneCt = (day?.entries || []).filter((e) => e?.completed || String(e?.actual?.top || "").trim() !== "").length;

  const programSessionOptions = useMemo(() => {
    if (!activeProgram || !Array.isArray(activeProgram.blocks)) return [];
    const out = [];
    let absoluteWeek = 1;
    for (let bi = 0; bi < activeProgram.blocks.length; bi++) {
      const block = activeProgram.blocks[bi];
      const weeksInBlock = Math.max(1, Number(block?.weeks || 0));
      const days = Array.isArray(block?.days) ? block.days : [];
      for (let w = 1; w <= weeksInBlock; w++) {
        for (const dayObj of days) {
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
        const entries = buildEntriesFromPlanRows(p.rows);
        if (entries.length) {
          await apiFetch(`/api/daily/${nextDate}`, {
            token, method: "PUT",
            body: { unit, bodyweight: dayObj?.bodyweight ?? null, sleep_hours: dayObj?.sleep_hours ?? null, pec_pain_0_10: dayObj?.pec_pain_0_10 ?? null, zone2_mins: dayObj?.zone2_mins ?? null, notes: dayObj?.notes ?? null, entries },
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
          .catch(() => setExerciseHistory({}));
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
      await apiFetch(`/api/daily/${date}`, {
        token, method: "PUT",
        body: { unit, bodyweight: day?.bodyweight ?? null, sleep_hours: day?.sleep_hours ?? null, pec_pain_0_10: day?.pec_pain_0_10 ?? null, zone2_mins: day?.zone2_mins ?? null, notes: day?.notes ?? null, entries: buildEntriesFromPlanRows(rows), is_completed: day?.is_completed === true, completed_at: day?.completed_at ?? null },
        onInvalidToken,
      });
      await loadAll(date);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  function addManualRow() {
    const name = String(manualExercise || manualPick || "").trim();
    if (!name) return;
    const entries = [...(day?.entries || []), { exercise: name, source: "manual", planned: { sets_reps: "", load_rpe: "", notes: "", target: "" }, completed: false, notes: "", actual: { top: "", reps: 3, rpe: "" } }];
    setDay((prev) => ({ ...(prev || { entry_date: date, unit }), entries }));
    setManualExercise(""); setManualPick("");
  }

  function removeEntry(idx) {
    const entries = [...(day?.entries || [])];
    entries.splice(idx, 1);
    setDay((prev) => ({ ...(prev || { entry_date: date, unit }), entries }));
  }

  function setEntry(idx, patch) {
    const entries = [...(day?.entries || [])];
    entries[idx] = { ...entries[idx], ...patch };
    setDay((prev) => ({ ...(prev || { entry_date: date, unit }), entries }));
  }

  function setActual(idx, patch) {
    const entries = [...(day?.entries || [])];
    const cur = entries[idx] || {};
    entries[idx] = { ...cur, actual: { ...(cur.actual || {}), ...patch } };
    setDay((prev) => ({ ...(prev || { entry_date: date, unit }), entries }));
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
    <div className="grid grid-2">
      <div className="card">
        <h2>Daily</h2>
        <div className="small">Pick a date, see the planned session, log what you did.</div>
        <div className="small" style={{ marginTop: 6 }}>
          Adherence today: <b>{doneCt}</b>/<b>{plannedCt}</b>
          {plannedCt ? ` (${Math.round((doneCt / plannedCt) * 100)}%)` : ""}
        </div>
        <div style={{ height: 10 }} />
        <div className="field">
          <label>Date</label>
          <input type="date" value={normalizeDateOnly(date)} onChange={(e) => setDate(normalizeDateOnly(e.target.value))} />
        </div>
        <div style={{ height: 12 }} />
        <div className="field">
          <label>Program session override</label>
          <select value={selectedProgramSlot} onChange={(e) => setSelectedProgramSlot(e.target.value)}>
            <option value="">Use session for selected date</option>
            {programSessionOptions.map((opt) => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
          </select>
        </div>
        <div style={{ height: 12 }} />
        <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontWeight: 900 }}>Plan</div>
          {!displayPlan ? <div className="small">Loading…</div> : isTraining ? (
            <>
              <div className="small" style={{ marginTop: 6 }}>
                {displayPlan?.block_number ? <>Block <b>{displayPlan.block_number}</b> • Week <b>{displayPlan.block_week || displayPlan.week_number}</b> • Day <b>{displayPlan.day_number}</b> • {displayPlan.day_title}</> : <>Week <b>{displayPlan.week_number}</b> • Day <b>{displayPlan.day_number}</b> • {displayPlan.day_title}</>}
              </div>
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Exercise</th><th>Sets x Reps</th><th>Load / RPE</th><th>Target</th><th>Notes</th></tr></thead>
                  <tbody>
                    {(displayPlan.rows || []).map((r, i) => (
                      <tr key={i}><td>{r.exercise}</td><td>{r.sets_reps}</td><td>{r.load_rpe}</td><td>{r.week_target || "—"}</td><td>{r.notes}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={copySelectedSession} disabled={busy}>{busy ? "…" : "Copy selected session into today"}</button>
              </div>
            </>
          ) : <div className="small" style={{ marginTop: 6 }}>Not a training day {plan?.reason ? `(${plan.reason})` : ""}.</div>}
        </div>
      </div>

      <div>
        <div className="card" style={{ background: "rgba(255,255,255,0.03)", marginBottom: 12 }}>
          <div style={{ fontWeight: 900 }}>Add manual exercise</div>
          <div className="grid grid-2" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Pick from library</label>
              <select value={manualPick} onChange={(e) => setManualPick(e.target.value)}>
                <option value="">Select…</option>
                {(library || []).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Or type custom</label>
              <input value={manualExercise} onChange={(e) => setManualExercise(e.target.value)} placeholder="e.g. Larsen Press" />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="secondary" onClick={addManualRow}>+ Add manual row</button>
          </div>
        </div>

        <div className="card">
          <h2>Log</h2>
          {dailyDraftNotice && (
            <Notice
              text="Draft restored — auto-saving locally until you click Save day."
              onDismiss={() => setDailyDraftNotice(false)}
              actions={
                <button className="secondary" onClick={() => { localStorage.removeItem(dailyDraftKey(date)); setDailyDraftNotice(false); loadAll(date); }}>Discard draft</button>
              }
            />
          )}
          <div style={{ height: 10 }} />
          <div className="grid grid-2" style={{ marginBottom: 14 }}>
  <div className="field">
    <label>Bodyweight ({unit})</label>
    <input
      value={day?.bodyweight ?? ""}
      placeholder="e.g. 85"
      onChange={(ev) => setDay((prev) => ({ ...prev, bodyweight: ev.target.value || null }))}
    />
  </div>
  <div className="field">
    <label>Sleep (h)</label>
    <input
      value={day?.sleep_hours ?? ""}
      placeholder="e.g. 8"
      onChange={(ev) => setDay((prev) => ({ ...prev, sleep_hours: ev.target.value || null }))}
    />
  </div>
</div>
          {!day ? (
            <div className="small">No log saved yet. Copy the selected session or add manual rows.</div>
          ) : (
            <>
              <div className="list" style={{ marginTop: 10 }}>
                {(day.entries || []).length ? day.entries.map((e, idx) => {
                  const hx = exerciseHistory?.[e.exercise] || {};
                  const last = Array.isArray(hx.last_entries) ? hx.last_entries[0] : null;
                  const prev = Array.isArray(hx.last_entries) ? hx.last_entries[1] : null;
                  return (
                    <div className="listRow" key={idx} style={{ alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>{e.exercise}</div>
                            <div className="small" style={{ opacity: 0.8 }}>{e?.source === "manual" ? "Manual entry" : "Program entry"}</div>
                          </div>
                          <button className="secondary" onClick={() => removeEntry(idx)}>Remove</button>
                        </div>

                        {e?.source === "program" && (
                          <div className="small" style={{ marginTop: 4 }}>
                            Plan: <b>{e?.planned?.sets_reps || "—"}</b> • {e?.planned?.load_rpe || "—"}
                            {e?.planned?.target && <> • Target: <b>{e.planned.target}</b></>}
                            {e?.planned?.notes && <> • {e.planned.notes}</>}
                          </div>
                        )}

                        {(last || prev || hx.best_recent_e1rm || hx.best_all_time_e1rm) && (
                          <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
                            History:
                            {last && <> Last <b>{fmt(last.top)} x {last.reps}</b> ({formatPrettyDate(last.date)})</>}
                            {prev && <> • Prev <b>{fmt(prev.top)} x {prev.reps}</b> ({formatPrettyDate(prev.date)})</>}
                            {hx.best_recent_e1rm != null && <> • Best 8w <b>{fmt(hx.best_recent_e1rm)} {unit}</b></>}
                            {hx.best_all_time_e1rm != null && <> • Best all-time <b>{fmt(hx.best_all_time_e1rm)} {unit}</b></>}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input type="checkbox" checked={!!e.completed} onChange={(ev) => setEntry(idx, { completed: ev.target.checked })} />
                            Completed
                          </label>
                          <input style={{ flex: 1, minWidth: 220 }} placeholder="Notes (optional)…" value={e?.notes ?? ""} onChange={(ev) => setEntry(idx, { notes: ev.target.value })} />
                        </div>

                        <div className={showRpe ? "grid grid-3" : "grid grid-2"} style={{ marginTop: 10 }}>
                          <div className="field"><label>Top ({unit})</label><input value={e?.actual?.top ?? ""} onChange={(ev) => setActual(idx, { top: ev.target.value })} /></div>
                          <div className="field"><label>Reps</label><input value={e?.actual?.reps ?? 3} onChange={(ev) => setActual(idx, { reps: ev.target.value })} /></div>
                          {showRpe && <div className="field"><label>RPE</label><input value={e?.actual?.rpe ?? ""} onChange={(ev) => setActual(idx, { rpe: ev.target.value })} /></div>}
                        </div>
                      </div>
                    </div>
                  );
                }) : <div className="small">No entries yet.</div>}
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button className="secondary" disabled={busy} onClick={() => saveDay(dayPayload())}>{busy ? "…" : "Save day"}</button>
                <button disabled={busy || !day} onClick={() => saveDay({ ...dayPayload(), is_completed: true, completed_at: new Date().toISOString() })}>
                  {busy ? "…" : day?.is_completed ? "Session completed ✓" : "Mark session complete"}
                </button>
                {day?.is_completed && (
                  <button className="secondary" disabled={busy} onClick={() => saveDay({ ...dayPayload(), is_completed: false, completed_at: null })}>Undo complete</button>
                )}
              </div>
              {day?.is_completed && (
                <div className="small" style={{ marginTop: 8 }}>Completed at: <b>{day.completed_at ? new Date(day.completed_at).toLocaleString() : "—"}</b></div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
