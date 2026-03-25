import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";
import { formatPrettyDate } from "../utils/dates";
import { sumWeeks, draftKey, hasDraft } from "../utils/calcs";
import { Notice } from "../components/Auth";

function ProgramScheduleEditor({ program, busy, onSave, onBack }) {
  const [startDate, setStartDate] = useState(program?.start_date || "");
  const [trainingDays, setTrainingDays] = useState(
    Array.isArray(program?.training_days) && program.training_days.length
      ? program.training_days.map(Number) : [1, 3, 5, 6]
  );

  useEffect(() => {
    setStartDate(program?.start_date || "");
    setTrainingDays(Array.isArray(program?.training_days) && program.training_days.length
      ? program.training_days.map(Number) : [1, 3, 5, 6]);
  }, [program]);

  const DAY_LABELS = [
    { n: 0, label: "Sun" }, { n: 1, label: "Mon" }, { n: 2, label: "Tue" },
    { n: 3, label: "Wed" }, { n: 4, label: "Thu" }, { n: 5, label: "Fri" }, { n: 6, label: "Sat" },
  ];

  function toggleDay(n) {
    setTrainingDays((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b));
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button className="secondary" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back</button>
        <div>
          <h2 style={{ margin: 0 }}>{program.name}</h2>
          <div className="small">Set when your program starts and which days you train</div>
        </div>
      </div>
      <div className="grid grid-2" style={{ gap: 20, maxWidth: 640 }}>
        <div className="card" style={{ background: "var(--surface2)" }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>📅 Start date</div>
          <div className="field">
            <label>Program begins on</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} />
          </div>
          <div className="small" style={{ marginTop: 8 }}>Maps your program weeks onto real calendar dates for the Daily page.</div>
        </div>
        <div className="card" style={{ background: "var(--surface2)" }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>🗓 Training days</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DAY_LABELS.map((d) => (
              <button key={d.n} type="button" className={trainingDays.includes(d.n) ? "day-chip active" : "day-chip"} onClick={() => toggleDay(d.n)} disabled={busy}>{d.label}</button>
            ))}
          </div>
          <div className="small" style={{ marginTop: 10 }}>
            Selected: <b>{trainingDays.length ? DAY_LABELS.filter((d) => trainingDays.includes(d.n)).map((d) => d.label).join(", ") : "None"}</b>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <button onClick={() => onSave(program.id, { start_date: startDate || null, training_days: trainingDays })} disabled={busy || !trainingDays.length}>
          {busy ? "Saving…" : "Save schedule"}
        </button>
      </div>
    </div>
  );
}

function ProgramEditor({ program, library, unit, onSave, busy, onBack }) {
  const [p, setP] = useState(program);
  const [draftNotice, setDraftNotice] = useState(false);
  const [openBlock, setOpenBlock] = useState(0);
  const [openDayByBlock, setOpenDayByBlock] = useState({ 0: 0 });
  const [draftHydrated, setDraftHydrated] = useState(false);
  const { me } = useApp();
  const showRpe = me?.use_rpe !== false;

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
    setDayRows(bi, di, (p.blocks[bi].days[di].rows || []).map((r) => r.id === rowId ? { ...r, ...patch } : r));
  }

  function updateWeekValue(bi, di, rowId, wk, value) {
    setDayRows(bi, di, (p.blocks[bi].days[di].rows || []).map((r) =>
      r.id !== rowId ? r : { ...r, week_values: { ...(r.week_values || {}), [wk]: value } }
    ));
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
      const blocks = prev.blocks.filter((_, i) => i !== bi).map((b, i) => ({ ...b, block_number: i + 1 }));
      return { ...prev, blocks, total_weeks: sumWeeks(blocks) };
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="secondary" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back</button>
          <div>
            <h2 style={{ margin: 0 }}>{p.name}</h2>
            <div className="small">{p.total_weeks || sumWeeks(p.blocks)}w • {p.days_per_week || 4} days/week</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={addBlock} disabled={busy}>+ Add block</button>
          <button onClick={() => onSave(p)} disabled={busy}>{busy ? "Saving…" : "Save program"}</button>
        </div>
      </div>

      {draftNotice && (
        <Notice text='Unsaved draft — click "Save program" to persist.' onDismiss={() => setDraftNotice(false)}
          actions={<button className="secondary" onClick={discardDraft} disabled={busy}>Discard</button>} />
      )}

      <div className="grid grid-2" style={{ marginBottom: 16, maxWidth: 400 }}>
        <div className="field"><label>Program name</label><input value={p.name} onChange={(e) => update("name", e.target.value)} /></div>
        <div className="field"><label>Days / week</label><input value={p.days_per_week || 4} onChange={(e) => update("days_per_week", Number(e.target.value || 4))} /></div>
      </div>

      {(p.blocks || []).map((block, bi) => {
        const weeksInBlock = Math.max(1, Number(block.weeks || 4));
        const offset = (p.blocks || []).slice(0, bi).reduce((a, b) => a + (Number(b.weeks) || 0), 0);
        const weekKeys = Array.from({ length: weeksInBlock }, (_, i) => `W${offset + i + 1}`);
        const isOpen = openBlock === bi;

        return (
          <div key={bi} className="program-block">
            <div style={{ cursor: "pointer" }} onClick={() => setOpenBlock(isOpen ? null : bi)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {isOpen ? "▼" : "▶"} {block.title || `Block ${bi + 1}`}
                  <span className="small" style={{ marginLeft: 8, fontWeight: 400 }}>
                    Weeks {offset + 1}–{offset + weeksInBlock} • {weeksInBlock}w
                    {block.intent ? ` • ${block.intent}` : ""}
                    {block.rpe_range ? ` • RPE ${block.rpe_range}` : ""}
                  </span>
                </div>
                <button className="secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={(e) => { e.stopPropagation(); removeBlock(bi); }}
                  disabled={busy || (p.blocks || []).length <= 1}>Remove</button>
              </div>

              {isOpen && (
                <div className="grid grid-4" style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                  {[{ label: "Title", field: "title" }, { label: "Intent", field: "intent" }, { label: "RPE range", field: "rpe_range", placeholder: "e.g. 6.5–8" }].map(({ label, field, placeholder }) => (
                    <div className="field" key={field}><label>{label}</label><input value={block[field] || ""} placeholder={placeholder} onChange={(e) => updateBlock(bi, { [field]: e.target.value })} /></div>
                  ))}
                  <div className="field"><label>Weeks</label><input value={weeksInBlock} onChange={(e) => updateBlock(bi, { weeks: Number(e.target.value || 4) })} /></div>
                </div>
              )}
            </div>

            {isOpen && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {(block.days || []).map((day, di) => (
                    <button key={di} className={openDayByBlock?.[bi] === di ? "" : "secondary"} style={{ fontSize: 12, padding: "6px 12px" }}
                      onClick={() => setOpenDayByBlock((prev) => ({ ...prev, [bi]: prev[bi] === di ? null : di }))}>
                      {day.title || `Day ${day.day_number}`}
                    </button>
                  ))}
                </div>

                {(block.days || []).map((day, di) => {
                  if (openDayByBlock?.[bi] !== di) return null;
                  return (
                    <div key={di}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{day.title || `Day ${day.day_number}`}</div>
                        <button className="secondary" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => addRow(bi, di, weekKeys)} disabled={busy}>+ Add exercise</button>
                      </div>
                      <div className="sheet-wrapper">
                        <table className="sheetTable">
                          <thead>
                            <tr>
                              <th style={{ minWidth: 140 }}>Exercise</th>
                              <th style={{ minWidth: 80 }}>Sets × Reps</th>
                              {showRpe && <th style={{ minWidth: 100 }}>Load / RPE</th>}
                              <th style={{ minWidth: 120 }}>Notes</th>
                              {weekKeys.map((wk) => <th key={wk} style={{ minWidth: 70 }}>{wk}</th>)}
                              <th style={{ minWidth: 50 }}>—</th>
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
                                {showRpe && <td><input value={row.load_rpe || ""} onChange={(e) => updateRow(bi, di, row.id, { load_rpe: e.target.value })} placeholder="RPE 7" /></td>}
                                <td><input value={row.notes || ""} onChange={(e) => updateRow(bi, di, row.id, { notes: e.target.value })} /></td>
                                {weekKeys.map((wk) => (
                                  <td key={wk}><input value={(row.week_values || {})[wk] ?? ""} onChange={(e) => updateWeekValue(bi, di, row.id, wk, e.target.value)} /></td>
                                ))}
                                <td>
                                  <button className="secondary" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => deleteRow(bi, di, row.id)} disabled={busy}>✕</button>
                                </td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={4 + (showRpe ? 1 : 0) + weekKeys.length + 1} className="small" style={{ textAlign: "center", padding: "16px", opacity: 0.5 }}>
                                  No exercises yet — click "+ Add exercise"
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
        <button onClick={() => onSave(p)} disabled={busy}>{busy ? "Saving…" : "Save program"}</button>
        <div className="small" style={{ alignSelf: "center" }}>Auto-saves as draft while editing</div>
      </div>
    </div>
  );
}

function ProgramList({ programs, activeId, busy, onNew, onEdit, onSchedule, onActivate, onDelete, onShare, connections, shareToConnectionId, setShareToConnectionId, incomingShares, onCopyShare }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Programs</h2>
          <div className="small">Build and manage your training programs</div>
        </div>
        <button onClick={onNew} disabled={busy}>+ New program</button>
      </div>

      {incomingShares.length > 0 && (
        <div className="card" style={{ background: "var(--surface2)", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>📥 Shared with you</div>
          {incomingShares.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.program_name || "Shared program"}</div>
                <div className="small">From <b>{s.shared_by_name || s.shared_by_email}</b> • {s.total_weeks || 0}w • {s.days_per_week || 4}d/week</div>
              </div>
              <button className="secondary" style={{ fontSize: 12 }} onClick={() => onCopyShare(s.id)} disabled={busy || s.status === "copied"}>
                {s.status === "copied" ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!programs.length ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px", background: "var(--surface2)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No programs yet</div>
          <div className="small" style={{ marginBottom: 16 }}>Create your first program to start tracking planned vs actual performance</div>
          <button onClick={onNew} disabled={busy}>Create my first program</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {programs.map((p) => (
            <div key={p.id} className="card" style={{ background: activeId === p.id ? "rgba(232,25,44,0.06)" : "var(--surface2)", borderColor: activeId === p.id ? "rgba(232,25,44,0.3)" : "var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                    {activeId === p.id && <span className="pill" style={{ borderColor: "rgba(232,25,44,0.4)", background: "rgba(232,25,44,0.1)", color: "rgba(232,25,44,0.9)" }}>Active</span>}
                    {hasDraft(p.id) && <span className="pill" style={{ borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.1)" }}>Draft</span>}
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>
                    {p.total_weeks || sumWeeks(p.blocks)}w • {p.days_per_week || 4} days/week • {(p.blocks || []).length} blocks
                    {p.start_date ? <> • Starts <b>{formatPrettyDate(p.start_date)}</b></> : <> • <span style={{ color: "rgba(245,158,11,0.9)" }}>⚠ No start date — set schedule to enable Daily</span></>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => onEdit(p.id)}>Edit</button>
                  <button className="secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => onSchedule(p.id)}>Schedule</button>
                  {activeId !== p.id && <button className="secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => onActivate(p.id)} disabled={busy}>Set active</button>}
                  <button className="secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => onDelete(p.id)} disabled={busy}>Delete</button>
                </div>
              </div>
              {connections.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                  <select value={shareToConnectionId} onChange={(e) => setShareToConnectionId(e.target.value)} style={{ flex: 1, maxWidth: 240, fontSize: 12 }}>
                    <option value="">Share with a connection…</option>
                    {connections.map((c) => <option key={c.id} value={c.id}>{c.other_name || c.other_email} • {c.relationship_type}</option>)}
                  </select>
                  <button className="secondary" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => onShare(p.id)} disabled={!shareToConnectionId || busy}>Share</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProgramsPage() {
  const { token, unit, mergedLibrary: library, onInvalidToken, setErr } = useApp();
  const [programs, setPrograms] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const [incomingShares, setIncomingShares] = useState([]);
  const [connections, setConnections] = useState([]);
  const [shareToConnectionId, setShareToConnectionId] = useState("");

  const selected = useMemo(() => programs.find((p) => p.id === selectedId) || null, [programs, selectedId]);

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
      const blocks = Number(prompt("How many blocks?", "3") || 3);
      const days = Number(prompt("Training days per week?", "4") || 4);
      const weeks_per_block = [];
      for (let i = 0; i < blocks; i++) weeks_per_block.push(Number(prompt(`Weeks in Block ${i + 1}?`, "4") || 4));
      setBusy(true);
      const res = await apiFetch("/api/programs", { token, method: "POST", body: { name, blocks, days_per_week: days, weeks_per_block }, onInvalidToken });
      setPrograms((prev) => [res.program, ...prev]);
      setSelectedId(res.program.id);
      setView("editor");
      if (!activeId) setActiveId(res.program.id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function activate(id) {
    try {
      setBusy(true);
      await apiFetch(`/api/programs/${id}/activate`, { token, method: "POST", onInvalidToken });
      setActiveId(id);
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
      localStorage.removeItem(draftKey(id));
      if (selectedId === id) { setSelectedId(null); setView("list"); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function saveProgram(p) {
    try {
      setBusy(true);
      const res = await apiFetch(`/api/programs/${p.id}`, { token, method: "PUT", body: p, onInvalidToken });
      setPrograms((prev) => prev.map((x) => x.id === p.id ? (res.program || p) : x));
      localStorage.removeItem(draftKey(p.id));
      setView("list");
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function saveProgramSettings(programId, patch) {
    try {
      setBusy(true);
      const res = await apiFetch(`/api/programs/${programId}/settings`, { token, method: "PATCH", body: patch, onInvalidToken });
      setPrograms((prev) => prev.map((p) => p.id === programId ? { ...p, start_date: res.program?.start_date, training_days: res.program?.training_days } : p));
      setView("list");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function shareProgram(programId) {
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
      alert("Program copied");
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="card" style={{ maxWidth: 1200 }}>
      {view === "list" && (
        <ProgramList programs={programs} activeId={activeId} busy={busy} onNew={createProgram}
          onEdit={(id) => { setSelectedId(id); setView("editor"); }}
          onSchedule={(id) => { setSelectedId(id); setView("schedule"); }}
          onActivate={activate} onDelete={removeProgram} onShare={shareProgram}
          connections={connections} shareToConnectionId={shareToConnectionId}
          setShareToConnectionId={setShareToConnectionId}
          incomingShares={incomingShares} onCopyShare={copyIncomingShare}
        />
      )}
      {view === "schedule" && selected && (
        <ProgramScheduleEditor program={selected} busy={busy} onSave={saveProgramSettings} onBack={() => setView("list")} />
      )}
      {view === "editor" && selected && (
        <ProgramEditor program={selected} unit={unit} library={library} onSave={saveProgram} busy={busy} onBack={() => setView("list")} />
      )}
    </div>
  );
}
