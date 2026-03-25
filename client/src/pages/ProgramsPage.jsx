import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";
import { formatPrettyDate } from "../utils/dates";
import { sumWeeks, draftKey, hasDraft } from "../utils/calcs";
import { Notice } from "../components/Auth";

// ─── Schedule Editor ──────────────────────────────────────────────────

function ProgramScheduleEditor({ program, busy, onSave }) {
  const [startDate, setStartDate] = useState(program?.start_date || "");
  const [trainingDays, setTrainingDays] = useState(
    Array.isArray(program?.training_days) && program.training_days.length
      ? program.training_days.map(Number) : [1, 3, 5, 6]
  );

  useEffect(() => {
    setStartDate(program?.start_date || "");
    setTrainingDays(Array.isArray(program?.training_days) && program.training_days.length ? program.training_days.map(Number) : [1, 3, 5, 6]);
  }, [program]);

  const DAY_LABELS = [{ n: 0, label: "Sun" }, { n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" }, { n: 4, label: "Thu" }, { n: 5, label: "Fri" }, { n: 6, label: "Sat" }];

  function toggleDay(n) {
    setTrainingDays((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b));
  }

  return (
    <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontWeight: 900 }}>Program schedule</div>
      <div className="small" style={{ marginTop: 4 }}>Drives the Daily page and maps the plan onto calendar dates.</div>
      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Program start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>Training days</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {DAY_LABELS.map((d) => (
              <button key={d.n} type="button" className={trainingDays.includes(d.n) ? "day-chip active" : "day-chip"} onClick={() => toggleDay(d.n)} disabled={busy}>{d.label}</button>
            ))}
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            Selected: <b>{trainingDays.length ? DAY_LABELS.filter((d) => trainingDays.includes(d.n)).map((d) => d.label).join(", ") : "None"}</b>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => onSave(program.id, { start_date: startDate || null, training_days: trainingDays })} disabled={busy || !trainingDays.length}>
          {busy ? "Saving…" : "Save schedule settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Program Editor ───────────────────────────────────────────────────

function ProgramEditor({ program, library, unit, token, onSave, busy, onInvalidToken, onError }) {
  const [p, setP] = useState(program);
  const [draftNotice, setDraftNotice] = useState(false);
  const [openBlock, setOpenBlock] = useState(0);
  const [openDayByBlock, setOpenDayByBlock] = useState({ 0: 0 });
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(draftKey(program.id));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.id === program.id) { setP(parsed); setDraftNotice(true); setDraftHydrated(true); return; }
      } catch {}
    }
    setP(program); setDraftNotice(false); setDraftHydrated(true);
  }, [program]);

  useEffect(() => {
    if (!draftHydrated || !p?.id) return;
    try { localStorage.setItem(draftKey(p.id), JSON.stringify(p)); } catch {}
  }, [p, draftHydrated]);

  function discardDraft() { localStorage.removeItem(draftKey(p.id)); setP(program); setDraftNotice(false); }
  function update(field, value) { setP((prev) => ({ ...prev, [field]: value })); }

  function updateBlock(bi, patch) {
    setP((prev) => {
      const blocks = [...(prev.blocks || [])];
      blocks[bi] = { ...blocks[bi], ...patch };
      return { ...prev, blocks, total_weeks: sumWeeks(blocks) };
    });
  }

  function setDayRows(bi, di, rows) {
    setP((prev) => {
      const blocks = [...(prev.blocks || [])];
      const days = [...(blocks[bi]?.days || [])];
      days[di] = { ...days[di], rows };
      blocks[bi] = { ...blocks[bi], days };
      return { ...prev, blocks, total_weeks: sumWeeks(blocks) };
    });
  }

  function addRow(bi, di, weekKeys) {
    const row = {
      id: (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase(),
      exercise: library[0] || "Bench", sets_reps: "3x5", load_rpe: "RPE 7", notes: "",
      week_values: Object.fromEntries(weekKeys.map((k) => [k, ""])),
    };
    setDayRows(bi, di, [...(p.blocks[bi].days[di].rows || []), row]);
  }

  function updateRow(bi, di, rowId, patch) {
    const rows = (p.blocks[bi].days[di].rows || []).map((r) => r.id === rowId ? { ...r, ...patch } : r);
    setDayRows(bi, di, rows);
  }

  function updateWeekValue(bi, di, rowId, wk, value) {
    const rows = (p.blocks[bi].days[di].rows || []).map((r) => r.id !== rowId ? r : { ...r, week_values: { ...(r.week_values || {}), [wk]: value } });
    setDayRows(bi, di, rows);
  }

  function deleteRow(bi, di, rowId) {
    setDayRows(bi, di, (p.blocks[bi].days[di].rows || []).filter((r) => r.id !== rowId));
  }

  function addBlock() {
    setP((prev) => {
      const blocks = [...(prev.blocks || [])];
      const nextNum = blocks.length + 1;
      blocks.push({
        block_number: nextNum, title: `Block ${nextNum}`, intent: "", rpe_range: "", weeks: 4,
        days: Array.from({ length: prev.days_per_week || 4 }, (_, di) => ({ day_number: di + 1, title: `Day ${di + 1}`, rows: [] })),
      });
      return { ...prev, blocks, total_weeks: sumWeeks(blocks) };
    });
  }

  function removeBlock(bi) {
    if (!confirm("Remove this block?")) return;
    setP((prev) => {
      let blocks = prev.blocks.filter((_, i) => i !== bi).map((b, i) => ({ ...b, block_number: i + 1, title: b.title || `Block ${i + 1}` }));
      return { ...prev, blocks, total_weeks: sumWeeks(blocks) };
    });
  }

  return (
    <div>
      {draftNotice && (
        <Notice text='Draft restored — your edits are saved locally until you click "Save program".' onDismiss={() => setDraftNotice(false)}
          actions={<button className="secondary" onClick={discardDraft} disabled={busy}>Discard draft</button>} />
      )}
      <div className="grid grid-2">
        <div className="field"><label>Program name</label><input value={p.name} onChange={(e) => update("name", e.target.value)} /></div>
        <div className="field"><label>Days / week</label><input value={p.days_per_week || 4} onChange={(e) => update("days_per_week", Number(e.target.value || 4))} /></div>
      </div>
      <div className="small" style={{ marginTop: 8 }}>Total weeks: <b>{p.total_weeks || sumWeeks(p.blocks)}</b></div>
      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="secondary" onClick={addBlock} disabled={busy}>+ Add block</button>
      </div>
      <div style={{ height: 12 }} />

      {(p.blocks || []).map((block, bi) => {
        const weeksInBlock = Math.max(1, Number(block.weeks || 4));
        const offset = (p.blocks || []).slice(0, bi).reduce((a, b) => a + (Number(b.weeks) || 0), 0);
        const weekKeys = Array.from({ length: weeksInBlock }, (_, i) => `W${offset + i + 1}`);
        const blockLabel = `BLOCK ${bi + 1} — Weeks ${offset + 1}–${offset + weeksInBlock}`;
        const isOpen = openBlock === bi;

        return (
          <div key={bi} className="program-block">
            <div className="blockHeader" style={{ cursor: "pointer" }} onClick={() => setOpenBlock(isOpen ? null : bi)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>{isOpen ? "▼" : "▶"} {blockLabel}</div>
                <button className="secondary" onClick={(e) => { e.stopPropagation(); removeBlock(bi); }} disabled={busy || (p.blocks || []).length <= 1}>Remove block</button>
              </div>
              {isOpen && (
                <div className="grid grid-4" style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                  {[{ label: "Title", field: "title" }, { label: "Intent", field: "intent" }, { label: "RPE range", field: "rpe_range", placeholder: "e.g. 6.5–8" }].map(({ label, field, placeholder }) => (
                    <div className="field" key={field}><label>{label}</label><input value={block[field] || ""} placeholder={placeholder} onChange={(e) => updateBlock(bi, { [field]: e.target.value })} /></div>
                  ))}
                  <div className="field"><label>Weeks in block</label><input value={weeksInBlock} onChange={(e) => updateBlock(bi, { weeks: Number(e.target.value || 4) })} /></div>
                </div>
              )}
            </div>
            <div style={{ height: 12 }} />
            {isOpen && (block.days || []).map((day, di) => {
              const isDayOpen = openDayByBlock?.[bi] === di;
              return (
                <div key={day.day_number} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOpenDayByBlock((prev) => ({ ...prev, [bi]: isDayOpen ? null : di }))}>
                    <div style={{ fontWeight: 900 }}>{isDayOpen ? "▼" : "▶"} {day.title || `Day ${day.day_number}`}</div>
                    <button className="secondary" onClick={(e) => { e.stopPropagation(); addRow(bi, di, weekKeys); }} disabled={busy}>+ Add exercise</button>
                  </div>
                  {isDayOpen && (
                    <div className="sheet-wrapper">
                      <table className="sheetTable">
                        <thead>
                          <tr>
                            <th>Exercise</th><th>Sets x Reps</th><th>Load / RPE</th><th>Notes</th>
                            {weekKeys.map((wk) => <th key={wk} style={{ minWidth: 90 }}>{wk}</th>)}
                            <th style={{ minWidth: 90 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(day.rows || []).length ? day.rows.map((row) => (
                            <tr key={row.id}>
                              <td>
                                <select value={row.exercise} onChange={(e) => updateRow(bi, di, row.id, { exercise: e.target.value })}>
                                  {library.map((x) => <option key={x} value={x}>{x}</option>)}
                                  {!library.includes(row.exercise) && <option value={row.exercise}>{row.exercise}</option>}
                                </select>
                              </td>
                              <td><input value={row.sets_reps || ""} onChange={(e) => updateRow(bi, di, row.id, { sets_reps: e.target.value })} /></td>
                              <td><input value={row.load_rpe || ""} onChange={(e) => updateRow(bi, di, row.id, { load_rpe: e.target.value })} placeholder={`e.g. RPE 7, 75%, ${unit}`} /></td>
                              <td><input value={row.notes || ""} onChange={(e) => updateRow(bi, di, row.id, { notes: e.target.value })} /></td>
                              {weekKeys.map((wk) => (
                                <td key={wk}><input value={(row.week_values || {})[wk] ?? ""} onChange={(e) => updateWeekValue(bi, di, row.id, wk, e.target.value)} /></td>
                              ))}
                              <td><button className="secondary" onClick={() => deleteRow(bi, di, row.id)} disabled={busy}>Delete</button></td>
                            </tr>
                          )) : (
                            <tr><td colSpan={5 + weekKeys.length} className="small">No exercises yet — click "Add exercise".</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <button onClick={() => onSave(p)} disabled={busy}>{busy ? "Saving…" : "Save program"}</button>
      <div className="small" style={{ marginTop: 10 }}>Drafts auto-save while editing.</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function ProgramsPage() {
  const { token, unit, mergedLibrary: library, onInvalidToken, setErr } = useApp();
  const [programs, setPrograms] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editorFocus, setEditorFocus] = useState(false);
  const [programsOpen, setProgramsOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [incomingShares, setIncomingShares] = useState([]);
  const [connections, setConnections] = useState([]);
  const [shareToConnectionId, setShareToConnectionId] = useState("");

  const selected = useMemo(() => programs.find((p) => p.id === selectedId) || null, [programs, selectedId]);
  const active = useMemo(() => programs.find((p) => p.id === activeId) || null, [programs, activeId]);

  async function load() {
    try {
      setBusy(true);
      const [res, sharesRes, connRes] = await Promise.all([
        apiFetch("/api/programs", { token, onInvalidToken }),
        apiFetch("/api/program-shares/incoming", { token, onInvalidToken }).catch(() => ({ shares: [] })),
        apiFetch("/api/connections", { token, onInvalidToken }).catch(() => ({ accepted: [] })),
      ]);
      setPrograms(res.programs || []);
      setActiveId(res.active_program_id || null);
      setSelectedId((prev) => prev || res.active_program_id || res.programs?.[0]?.id || null);
      setIncomingShares(Array.isArray(sharesRes?.shares) ? sharesRes.shares : []);
      const accepted = Array.isArray(connRes?.accepted) ? connRes.accepted : [];
      setConnections(accepted);
      if (!shareToConnectionId && accepted[0]?.id) setShareToConnectionId(accepted[0].id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);

  async function createProgram() {
    try {
      const name = prompt("Program name?", "New program") || "New program";
      const blocks = Number(prompt("How many blocks? (1–8)", "3") || 3);
      const days = Number(prompt("Training days per week? (1–7)", "4") || 4);
      const weeks_per_block = [];
      for (let i = 0; i < blocks; i++) weeks_per_block.push(Number(prompt(`Weeks in Block ${i + 1}?`, "4") || 4));
      setBusy(true);
      const res = await apiFetch("/api/programs", { token, method: "POST", body: { name, blocks, days_per_week: days, weeks_per_block }, onInvalidToken });
      setPrograms((prev) => [res.program, ...prev]);
      setSelectedId(res.program.id);
      setEditorFocus(true);
      if (!activeId) setActiveId(res.program.id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function activate(id) {
    try {
      setBusy(true);
      await apiFetch(`/api/programs/${id}/activate`, { token, method: "POST", onInvalidToken });
      setActiveId(id); setSelectedId(id);
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function removeProgram(id) {
    if (!confirm("Delete this program?")) return;
    try {
      setBusy(true);
      const res = await apiFetch(`/api/programs/${id}`, { token, method: "DELETE", onInvalidToken });
      setPrograms((prev) => prev.filter((p) => p.id !== id));
      setActiveId(res.active_program_id || null);
      setSelectedId(res.active_program_id || null);
      localStorage.removeItem(draftKey(id));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function saveProgram(p) {
    try {
      setBusy(true);
      const res = await apiFetch(`/api/programs/${p.id}`, { token, method: "PUT", body: p, onInvalidToken });
      const saved = res.program || p;
      setPrograms((prev) => prev.map((x) => x.id === p.id ? saved : x));
      localStorage.removeItem(draftKey(p.id));
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function saveProgramSettings(programId, patch) {
    try {
      setBusy(true);
      const res = await apiFetch(`/api/programs/${programId}/settings`, { token, method: "PATCH", body: patch, onInvalidToken });
      setPrograms((prev) => prev.map((p) => p.id === programId ? { ...p, start_date: res.program?.start_date, training_days: res.program?.training_days } : p));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function shareProgramToConnection(programId) {
    try {
      if (!shareToConnectionId) throw new Error("Pick a connection first");
      await apiFetch(`/api/programs/${programId}/share-to-connection`, { token, method: "POST", body: { connection_id: shareToConnectionId, message: "" }, onInvalidToken });
      alert("Program shared");
    } catch (e) { setErr(e.message); }
  }

  async function copyIncomingShare(shareId) {
    try {
      await apiFetch(`/api/program-shares/${shareId}/copy`, { token, method: "POST", onInvalidToken });
      await load();
      alert("Program copied to your programs");
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="programs-shell">
      {editorFocus && (
        <div className="focus-toggles">
          <button className="secondary" onClick={() => setEditorFocus(false)}>Exit focus</button>
          <button className="secondary" onClick={() => { setEditorFocus(false); setProgramsOpen(true); }}>Show Programs</button>
          <button className="secondary" onClick={() => { setEditorFocus(false); setSummaryOpen(true); }}>Show Summary</button>
        </div>
      )}

      <div className={`programs-layout ${editorFocus ? "editor-focus" : ""}`}>
        {!editorFocus && programsOpen && (
          <div className="card programs-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setProgramsOpen(false)}>
              <div><h2 style={{ margin: 0 }}>Programs</h2><div className="small">Drafts auto-save locally.</div></div>
              <div style={{ fontWeight: 900 }}>▾</div>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={createProgram} disabled={busy}>{busy ? "…" : "New program"}</button>
              <button className="secondary" onClick={load} disabled={busy}>{busy ? "…" : "Refresh"}</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="field">
                <label>Share to connection</label>
                <select value={shareToConnectionId} onChange={(e) => setShareToConnectionId(e.target.value)}>
                  <option value="">Select connection…</option>
                  {connections.map((c) => <option key={c.id} value={c.id}>{(c.other_name || c.other_email)} • {c.relationship_type}</option>)}
                </select>
              </div>
            </div>
            <div style={{ height: 16 }} />
            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
              <h3 style={{ marginTop: 0 }}>Shared with me</h3>
              {incomingShares.length ? (
                <div className="list">
                  {incomingShares.map((s) => (
                    <div className="listRow" key={s.id} style={{ alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800 }}>{s.program_name || "Shared program"}</div>
                        <div className="small">From <b>{s.shared_by_name || s.shared_by_email || "—"}</b></div>
                        <div className="small">{s.total_weeks || 0} weeks • {s.days_per_week || 4} days/week</div>
                      </div>
                      <button className="secondary" onClick={() => copyIncomingShare(s.id)} disabled={busy || s.status === "copied"}>
                        {s.status === "copied" ? "Copied" : "Copy to my programs"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : <div className="small">No incoming shared programs.</div>}
            </div>
            <div style={{ height: 14 }} />
            <div className="list">
              {programs.length ? programs.map((p) => (
                <div className="program-card" key={p.id}>
                  <div className="program-card-top">
                    <div className="program-card-title">
                      <span>{p.name}</span>
                      {activeId === p.id && <span className="pill">Active</span>}
                      {hasDraft(p.id) && <span className="pill" style={{ borderColor: "#1f3a8a" }}>Draft</span>}
                    </div>
                    <div className="program-card-actions">
                      <button className="secondary" onClick={() => { setSelectedId(p.id); setEditorFocus(true); }} disabled={busy}>Edit</button>
                      <button className="secondary" onClick={() => activate(p.id)} disabled={busy || activeId === p.id}>Set active</button>
                      <button className="secondary" onClick={() => removeProgram(p.id)} disabled={busy}>Delete</button>
                      <button className="secondary" onClick={() => shareProgramToConnection(p.id)} disabled={busy || !shareToConnectionId}>Share</button>
                    </div>
                  </div>
                  <div className="small" style={{ marginTop: 10 }}>{p.total_weeks || sumWeeks(p.blocks)} weeks • {p.days_per_week || 4} days/week</div>
                  <div className="small" style={{ marginTop: 4 }}>Start: <b>{p.start_date ? formatPrettyDate(p.start_date) : "—"}</b></div>
                </div>
              )) : <div className="small">No programs yet — create one.</div>}
            </div>
          </div>
        )}

        {!editorFocus && !programsOpen && (
          <div className="card programs-panel programs-panel-collapsed">
            <button className="secondary" onClick={() => setProgramsOpen(true)}>Show Programs</button>
          </div>
        )}

        {!editorFocus && summaryOpen && (
          <div className="card summary-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setSummaryOpen(false)}>
              <div><h2 style={{ margin: 0 }}>Summary</h2><div className="small">Active program + quick stats.</div></div>
              <div style={{ fontWeight: 900 }}>▾</div>
            </div>
            <div style={{ height: 12 }} />
            {active ? (
              <>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{active.name}</div>
                <div className="small" style={{ marginTop: 6 }}>{active.total_weeks || sumWeeks(active.blocks)} weeks • {active.days_per_week || 4} days/week • {(active.blocks || []).length} blocks</div>
                <div className="small" style={{ marginTop: 4 }}>Start: <b>{active.start_date ? formatPrettyDate(active.start_date) : "—"}</b></div>
                <div style={{ height: 12 }} />
                <div className="list">
                  {(active.blocks || []).slice(0, 6).map((b, i) => (
                    <div className="listRow" key={i} style={{ alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{b.title || `Block ${i + 1}`}</div>
                        <div className="small">{Number(b.weeks || 0)} weeks • {(b.days || []).length} days</div>
                      </div>
                    </div>
                  ))}
                  {(active.blocks || []).length > 6 && <div className="small">…and {(active.blocks || []).length - 6} more blocks</div>}
                </div>
                <div style={{ height: 12 }} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="secondary" onClick={() => { setSelectedId(active.id); setEditorFocus(true); }} disabled={busy}>Edit active</button>
                  <button className="secondary" onClick={load} disabled={busy}>{busy ? "…" : "Refresh"}</button>
                </div>
              </>
            ) : <div className="small">No active program yet — create one, then set it active.</div>}
          </div>
        )}

        {!editorFocus && !summaryOpen && (
          <div className="card summary-panel summary-panel-collapsed">
            <button className="secondary" onClick={() => setSummaryOpen(true)}>Show Summary</button>
          </div>
        )}

        <div className="card editor-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Editor</h2>
            {!editorFocus && <button className="secondary" onClick={() => setEditorFocus(true)}>Focus editor</button>}
          </div>
          <div style={{ height: 12 }} />
          {!selected ? <div className="small">Pick a program to edit.</div> : (
            <>
              <ProgramScheduleEditor program={selected} busy={busy} onSave={saveProgramSettings} />
              <div style={{ height: 16 }} />
              <ProgramEditor program={selected} unit={unit} library={library} token={token} onSave={saveProgram} busy={busy} onInvalidToken={onInvalidToken} onError={setErr} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
