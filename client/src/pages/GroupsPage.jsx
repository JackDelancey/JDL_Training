import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";
import { isoLocalToday, isoLocalNDaysAgo, formatPrettyDate, timeAgo } from "../utils/dates";
import { fmt } from "../utils/calcs";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

function eventSummaryText(event, unit) {
  const type = event?.event_type || "";
  const payload = event?.payload || {};
  const who = event?.user?.name || event?.name || "Someone";
  if (type === "pr_e1rm") return `🔥 ${who} hit a new ${payload.exercise || "lift"} PR — ${payload.top != null ? `${fmt(payload.top)} ${unit}` : "new best"}`;
  if (type === "session_completed") return `✅ ${who} completed a session${payload.date ? ` on ${payload.date}` : ""}`;
  if (type === "member_joined") return `👋 ${who} joined the group`;
  if (type === "program_published") return `📘 ${who} published${payload.title ? ` — ${payload.title}` : " a program"}`;
  if (type === "challenge_joined") return `🏁 ${who} joined ${payload.name || "a challenge"}`;
  return `• ${type}`;
}

function scoreLabel(type, exercise, unit) {
  if (type === "strength") return exercise ? `${exercise} e1RM (${unit})` : `Score (${unit})`;
  if (type === "improvement") return exercise ? `${exercise} gain` : "Gain";
  if (type === "relative_strength") return "Relative strength";
  if (type === "adherence") return "Adherence %";
  if (type === "volume") return "Volume";
  if (type === "streak") return "Streak";
  return "Score";
}

const CHART_OPTS = {
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: { legend: { display: true, labels: { color: "rgba(255,255,255,0.75)", boxWidth: 10, font: { size: 11 } } }, tooltip: { backgroundColor: "rgba(0,0,0,0.9)", titleColor: "#fff", bodyColor: "rgba(255,255,255,0.85)" } },
  scales: { x: { ticks: { color: "rgba(255,255,255,0.45)", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" } }, y: { ticks: { color: "rgba(255,255,255,0.45)", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" } } },
};

function FeedTab({ events, unit }) {
  if (!events.length) return <div className="small" style={{ opacity: 0.5, textAlign: "center", padding: "24px 0" }}>No activity yet</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {events.map((ev) => (
        <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{eventSummaryText(ev, unit)}</div>
          <div className="small" style={{ whiteSpace: "nowrap", marginLeft: 12 }}>{ev.created_at ? timeAgo(ev.created_at) : "—"}</div>
        </div>
      ))}
    </div>
  );
}

function LeaderboardTab({ unit, leaderboard, library, lbType, setLbType, lbExercise, setLbExercise, lbWindow, setLbWindow }) {
  const rows = Array.isArray(leaderboard?.rows) ? leaderboard.rows : [];
  const showBw = lbType === "strength" || lbType === "relative_strength";
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={lbType} onChange={(e) => setLbType(e.target.value)} style={{ flex: 1, minWidth: 130 }}>
          {["strength","improvement","adherence","relative_strength","volume","streak"].map((t) => (
            <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1).replace("_", " ")}</option>
          ))}
        </select>
        <select value={lbExercise} onChange={(e) => setLbExercise(e.target.value)} style={{ flex: 2, minWidth: 140 }}>
          {(library || []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={lbWindow} onChange={(e) => setLbWindow(e.target.value)} style={{ flex: 1, minWidth: 100 }}>
          {["14d","30d","60d","90d","all"].map((w) => <option key={w} value={w}>{w === "all" ? "All time" : w}</option>)}
        </select>
      </div>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Athlete</th>
              <th>{scoreLabel(lbType, lbExercise, unit)}</th>
              <th>Top set</th>
              {showBw && <th>BW ({unit})</th>}
              {lbType === "strength" && <th>Wilks</th>}
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.user_id || idx}>
                <td style={{ fontWeight: 700, color: idx === 0 ? "rgba(255,200,50,0.9)" : idx === 1 ? "rgba(200,200,200,0.8)" : idx === 2 ? "rgba(200,140,80,0.8)" : "var(--text2)" }}>
                  {r.rank ?? idx + 1}
                </td>
                <td style={{ fontWeight: 600 }}>{r.name || r.email || "—"}</td>
                <td>{Number.isFinite(Number(r.score)) ? fmt(r.score) : "—"}</td>
<td>{r.meta?.top != null ? `${fmt(r.meta.top)} × ${r.meta?.reps ?? "?"}` : "—"}</td>
{showBw && <td>{r.meta?.bodyweight != null ? fmt(r.meta.bodyweight) : "—"}</td>}
{lbType === "strength" && <td>{r.meta?.wilks != null ? fmt(r.meta.wilks) : "—"}</td>}
<td className="small">{r.meta?.date ? formatPrettyDate(r.meta.date) : r.meta?.week ? `W${r.meta.week}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="small" style={{ opacity: 0.5, textAlign: "center", padding: "24px 0" }}>No data yet for this combination</div>}
    </div>
  );
}

function MembersTab({ members, unit }) {
  if (!members.length) return <div className="small" style={{ opacity: 0.5 }}>No members</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {members.map((m) => (
        <div key={m.user_id || m.email} style={{ padding: "10px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{m.name || m.email}</div>
          <div className="small" style={{ marginTop: 3 }}>
            {m.role !== "member" && <span style={{ fontWeight: 600, marginRight: 6 }}>{m.role}</span>}
            Last session: <b>{formatPrettyDate(m.latest_session_date)}</b>
          </div>
          {m.metrics && Object.keys(m.metrics).length > 0 && (
            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(m.metrics).slice(0, 3).map(([k, v]) => (
                <span key={k} className="small">{k}: <b>{v != null ? `${fmt(v)}${unit}` : "—"}</b></span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ProgramsTab({ programs, token, groupId, onInvalidToken, onError }) {
  async function copyProgram(id) {
    try {
      await apiFetch(`/api/groups/${groupId}/programs/${id}/copy`, { token, method: "POST", onInvalidToken });
      alert("Program copied to your Programs page");
    } catch (e) { onError(e.message); }
  }
  if (!programs.length) return <div className="small" style={{ opacity: 0.5, textAlign: "center", padding: "24px 0" }}>No shared programs yet</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {programs.map((p) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{p.title || p.name}</div>
            <div className="small">By <b>{p.created_by_name || p.created_by_email}</b>{p.total_weeks ? ` • ${p.total_weeks}w` : ""}{p.days_per_week ? ` • ${p.days_per_week}d/wk` : ""}</div>
          </div>
          <button className="secondary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => copyProgram(p.id)}>Copy</button>
        </div>
      ))}
    </div>
  );
}

function ChallengesTab({ token, groupId, challenges, onInvalidToken, onError }) {
  const [selectedId, setSelectedId] = useState("");
  const [leaderboard, setLeaderboard] = useState(null);

  useEffect(() => { if (!selectedId && challenges?.[0]?.id) setSelectedId(challenges[0].id); }, [challenges]);
  useEffect(() => {
    if (!selectedId) return;
    apiFetch(`/api/groups/${groupId}/challenges/${selectedId}/leaderboard`, { token, onInvalidToken })
      .then(setLeaderboard).catch(() => setLeaderboard(null));
  }, [selectedId, groupId, token]);

  if (!challenges.length) return <div className="small" style={{ opacity: 0.5, textAlign: "center", padding: "24px 0" }}>No challenges yet</div>;
  return (
    <div>
      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ marginBottom: 14 }}>
        {challenges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {challenges.filter(c => c.id === selectedId).map((c) => (
        <div key={c.id} style={{ padding: "10px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontWeight: 700 }}>{c.name}</div>
          <div className="small">{c.description || "No description"} • <b>{c.metric_type}</b>{c.exercise ? ` • ${c.exercise}` : ""}</div>
          <div className="small">{formatPrettyDate(c.start_date)} → {formatPrettyDate(c.end_date)}</div>
        </div>
      ))}
      {leaderboard?.rows?.length ? (
        <table>
          <thead><tr><th>#</th><th>Athlete</th><th>Score</th></tr></thead>
          <tbody>
            {leaderboard.rows.map((r, i) => (
              <tr key={r.user_id || i}><td>{r.rank ?? i + 1}</td><td style={{ fontWeight: 600 }}>{r.name || r.email}</td><td>{Number.isFinite(Number(r.score)) ? fmt(r.score) : "—"}</td></tr>
            ))}
          </tbody>
        </table>
      ) : <div className="small" style={{ opacity: 0.5 }}>No results yet</div>}
    </div>
  );
}

function CompareTab({ unit, members, library, compareA, setCompareA, compareB, setCompareB, compareExercise, setCompareExercise, compareData, onRefresh }) {
  const labels = (compareData?.user_a?.history || []).map((x) => x.label || "—");
  const serA = (compareData?.user_a?.history || []).map((x) => Number.isFinite(Number(x.e1rm)) ? Number(x.e1rm) : null);
  const serB = (compareData?.user_b?.history || []).map((x) => Number.isFinite(Number(x.e1rm)) ? Number(x.e1rm) : null);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={compareA} onChange={(e) => setCompareA(e.target.value)} style={{ flex: 1 }}>
          <option value="">Athlete A…</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
        </select>
        <select value={compareB} onChange={(e) => setCompareB(e.target.value)} style={{ flex: 1 }}>
          <option value="">Athlete B…</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
        </select>
        <select value={compareExercise} onChange={(e) => setCompareExercise(e.target.value)} style={{ flex: 1 }}>
          {(library || []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <button className="secondary" style={{ fontSize: 12 }} onClick={onRefresh}>Compare</button>
      </div>
      {!compareData ? (
        <div className="small" style={{ opacity: 0.5, textAlign: "center", padding: "24px 0" }}>Select two athletes and an exercise</div>
      ) : (
        <>
          <div className="grid grid-2" style={{ marginBottom: 14 }}>
            {["user_a","user_b"].map((key, i) => (
              <div key={key} className="metric">
                <div className="k">{compareData?.[key]?.name || `Athlete ${i === 0 ? "A" : "B"}`}</div>
                <div className="v">{compareData?.[key]?.best_e1rm != null ? `${fmt(compareData[key].best_e1rm)} ${unit}` : "—"}</div>
                <div className="s">Best {compareExercise} e1RM</div>
              </div>
            ))}
          </div>
          {labels.length > 0 && (
            <div style={{ height: 240, position: "relative" }}>
              <Line data={{ labels, datasets: [
                { label: compareData?.user_a?.name || "Athlete A", data: serA, tension: 0.25, borderWidth: 2, pointRadius: 3, fill: false, borderColor: "rgba(239,68,68,1)" },
                { label: compareData?.user_b?.name || "Athlete B", data: serB, tension: 0.25, borderWidth: 2, pointRadius: 3, fill: false, borderColor: "rgba(59,130,246,1)" },
              ]}} options={CHART_OPTS} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function GroupsPage() {
  const { token, unit, me, mergedLibrary: library, onInvalidToken, setErr } = useApp();
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("feed");
  const [busy, setBusy] = useState(false);
  const [groupDetail, setGroupDetail] = useState(null);
  const [feed, setFeed] = useState([]);
  const [members, setMembers] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [lbType, setLbType] = useState("strength");
  const [lbExercise, setLbExercise] = useState(library?.[0] || "Bench");
  const [lbWindow, setLbWindow] = useState("30d");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareExercise, setCompareExercise] = useState(library?.[0] || "Bench");
  const [compareData, setCompareData] = useState(null);
  const [myPrograms, setMyPrograms] = useState([]);
  const [shareProgramId, setShareProgramId] = useState("");

  const selected = groups.find((g) => g.id === selectedId) || null;

  useEffect(() => {
    if (Array.isArray(library) && library.length) {
      if (!library.includes(lbExercise)) setLbExercise(library[0]);
      if (!library.includes(compareExercise)) setCompareExercise(library[0]);
    }
  }, [library]);

  async function loadGroups() {
    try {
      setBusy(true);
      const res = await apiFetch("/api/groups", { token, onInvalidToken });
      const next = Array.isArray(res?.groups) ? res.groups : [];
      setGroups(next);
      setSelectedId((prev) => (prev && next.some((g) => g.id === prev)) ? prev : next?.[0]?.id || null);
    } catch (e) { setErr(e.message); setGroups([]); } finally { setBusy(false); }
  }

  async function loadWorkspace(groupId = selectedId) {
    if (!token || !groupId) return;
    try {
      setBusy(true);
      const [detailRes, feedRes, membersRes, programsRes, challengesRes, lbRes] = await Promise.all([
        apiFetch(`/api/groups/${groupId}`, { token, onInvalidToken }).catch(() => null),
        apiFetch(`/api/groups/${groupId}/feed`, { token, onInvalidToken }).catch(() => ({ events: [] })),
        apiFetch(`/api/groups/${groupId}/members`, { token, onInvalidToken }).catch(() => ({ members: [] })),
        apiFetch(`/api/groups/${groupId}/programs`, { token, onInvalidToken }).catch(() => ({ programs: [] })),
        apiFetch(`/api/groups/${groupId}/challenges`, { token, onInvalidToken }).catch(() => ({ challenges: [] })),
        apiFetch(`/api/groups/${groupId}/leaderboard?type=${lbType}&exercise=${encodeURIComponent(lbExercise)}&window=${lbWindow}`, { token, onInvalidToken }).catch(() => null),
      ]);
      setGroupDetail(detailRes?.group || null);
      setFeed(Array.isArray(feedRes?.events) ? feedRes.events : []);
      const nextMembers = Array.isArray(membersRes?.members) ? membersRes.members : [];
      setMembers(nextMembers);
      setPrograms(Array.isArray(programsRes?.programs) ? programsRes.programs : []);
      setChallenges(Array.isArray(challengesRes?.challenges) ? challengesRes.challenges : []);
      setLeaderboard(lbRes || null);
      if (!compareA && nextMembers[0]?.user_id) setCompareA(nextMembers[0].user_id);
      if (!compareB && nextMembers[1]?.user_id) setCompareB(nextMembers[1].user_id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function loadLeaderboard(groupId = selectedId) {
    if (!token || !groupId) return;
    try {
      const res = await apiFetch(`/api/groups/${groupId}/leaderboard?type=${lbType}&exercise=${encodeURIComponent(lbExercise)}&window=${lbWindow}`, { token, onInvalidToken });
      setLeaderboard(res);
    } catch (e) { setErr(e.message); setLeaderboard(null); }
  }

  async function loadCompare(groupId = selectedId) {
    if (!token || !groupId || !compareA || !compareB || !compareExercise) { setCompareData(null); return; }
    try {
      const res = await apiFetch(`/api/groups/${groupId}/compare?user_a=${compareA}&user_b=${compareB}&exercise=${encodeURIComponent(compareExercise)}`, { token, onInvalidToken });
      setCompareData(res);
    } catch (e) { setErr(e.message); setCompareData(null); }
  }

  useEffect(() => {
    loadGroups();
    apiFetch("/api/programs", { token, onInvalidToken }).then((r) => { const list = r?.programs || []; setMyPrograms(list); if (!shareProgramId && list[0]?.id) setShareProgramId(list[0].id); }).catch(() => {});
  }, [token]);
  useEffect(() => { loadWorkspace(selectedId); }, [token, selectedId]);
  useEffect(() => { if (selectedId) loadLeaderboard(selectedId); }, [token, selectedId, lbType, lbExercise, lbWindow]);
  useEffect(() => { if (activeTab === "compare" && selectedId) loadCompare(selectedId); }, [token, selectedId, activeTab, compareA, compareB, compareExercise]);

  async function createGroup() {
    try {
      const name = (prompt("Group name?", "My group") || "").trim();
      if (!name) return;
      setBusy(true);
      const res = await apiFetch("/api/groups", { token, method: "POST", body: { name }, onInvalidToken });
      await loadGroups();
      setSelectedId(res?.group?.id || null);
      alert(`Group created! Share code: ${res?.group?.code || "—"}`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function joinGroup() {
    try {
      const code = (prompt("Enter group code") || "").trim();
      if (!code) return;
      setBusy(true);
      const res = await apiFetch("/api/groups/join", { token, method: "POST", body: { code }, onInvalidToken });
      await loadGroups();
      setSelectedId(res?.group?.id || null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function leaveOrDelete() {
    const isOwner = groupDetail?.my_role === "owner";
    if (!confirm(isOwner ? "Delete this group?" : "Leave this group?")) return;
    try {
      setBusy(true);
      await apiFetch(`/api/groups/${selectedId}${isOwner ? "" : "/leave"}`, { token, method: isOwner ? "DELETE" : "POST", onInvalidToken });
      setGroupDetail(null); setFeed([]); setMembers([]); setPrograms([]); setChallenges([]); setLeaderboard(null);
      await loadGroups();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function createChallenge() {
    if (!selectedId) return;
    try {
      const name = (prompt("Challenge name?", "Bench Battle") || "").trim();
      if (!name) return;
      const metric_type = prompt("Metric? (e1rm, adherence, volume, streak)", "e1rm") || "e1rm";
      const exercise = ["e1rm","relative_strength","volume"].includes(metric_type) ? prompt("Exercise?", "Bench") || "Bench" : null;
      const start_date = prompt("Start (YYYY-MM-DD)?", isoLocalToday()) || isoLocalToday();
      const end_date = prompt("End (YYYY-MM-DD)?", isoLocalNDaysAgo(-30)) || isoLocalNDaysAgo(-30);
      await apiFetch(`/api/groups/${selectedId}/challenges`, { token, method: "POST", body: { name, metric_type, exercise, scoring_type: metric_type === "adherence" ? "pct" : "max", start_date, end_date }, onInvalidToken });
      await loadWorkspace(selectedId);
      setActiveTab("challenges");
    } catch (e) { setErr(e.message); }
  }

  async function shareProgramToGroup() {
    if (!selectedId || !shareProgramId) return;
    try {
      await apiFetch(`/api/groups/${selectedId}/programs`, { token, method: "POST", body: { program_id: shareProgramId }, onInvalidToken });
      await loadWorkspace(selectedId);
      setActiveTab("programs");
    } catch (e) { setErr(e.message); }
  }

  const TABS = ["feed","leaderboard","members","programs","challenges","compare"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" }}>

      {/* ── Left: group list ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Groups</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ flex: 1, fontSize: 12, padding: "6px 10px" }} onClick={createGroup} disabled={busy}>Create</button>
            <button className="secondary" style={{ flex: 1, fontSize: 12, padding: "6px 10px" }} onClick={joinGroup} disabled={busy}>Join</button>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "24px 16px", background: "var(--surface2)" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏋️</div>
            <div className="small">Create or join a group to compete</div>
          </div>
        ) : groups.map((g) => (
          <button key={g.id} onClick={() => setSelectedId(g.id)}
            style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: selectedId === g.id ? "rgba(232,25,44,0.08)" : "var(--surface2)", border: `1px solid ${selectedId === g.id ? "rgba(232,25,44,0.35)" : "var(--border)"}`, borderRadius: 12, cursor: "pointer", transition: "all 0.15s" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</div>
            <div className="small">Code <b>{g.code}</b> • {g.members_count} members</div>
          </button>
        ))}
      </div>

      {/* ── Right: workspace ── */}
      {!selectedId ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px", background: "var(--surface2)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>👈</div>
          <div style={{ fontWeight: 600 }}>Select a group</div>
          <div className="small">or create one to get started</div>
        </div>
      ) : (
        <div className="card">
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: "0 0 2px" }}>{groupDetail?.name || selected?.name}</h2>
              <div className="small">Code <b>{selected?.code}</b> • {groupDetail?.members_count ?? selected?.members_count} members</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => loadWorkspace(selectedId)} disabled={busy}>Refresh</button>
              <button className="secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={createChallenge}>+ Challenge</button>
              <button className="secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={leaveOrDelete} disabled={busy}>
                {groupDetail?.my_role === "owner" ? "Delete" : "Leave"}
              </button>
            </div>
          </div>

          {/* Share program */}
          {myPrograms.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
              <select value={shareProgramId} onChange={(e) => setShareProgramId(e.target.value)} style={{ flex: 1, fontSize: 12 }}>
                <option value="">Share a program…</option>
                {myPrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={shareProgramToGroup} disabled={!shareProgramId}>Share</button>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
            {TABS.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ fontSize: 12, padding: "5px 12px", background: activeTab === tab ? "rgba(232,25,44,0.15)" : "transparent", borderColor: activeTab === tab ? "rgba(232,25,44,0.4)" : "var(--border)", color: activeTab === tab ? "#fff" : "var(--text2)", fontWeight: activeTab === tab ? 600 : 400 }}>
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "feed" && <FeedTab events={feed} unit={unit} />}
          {activeTab === "leaderboard" && <LeaderboardTab unit={unit} leaderboard={leaderboard} library={library} lbType={lbType} setLbType={setLbType} lbExercise={lbExercise} setLbExercise={setLbExercise} lbWindow={lbWindow} setLbWindow={setLbWindow} />}
          {activeTab === "members" && <MembersTab members={members} unit={unit} />}
          {activeTab === "programs" && <ProgramsTab programs={programs} token={token} groupId={selectedId} onInvalidToken={onInvalidToken} onError={setErr} />}
          {activeTab === "challenges" && <ChallengesTab token={token} groupId={selectedId} challenges={challenges} onInvalidToken={onInvalidToken} onError={setErr} />}
          {activeTab === "compare" && <CompareTab unit={unit} members={members} library={library} compareA={compareA} setCompareA={setCompareA} compareB={compareB} setCompareB={setCompareB} compareExercise={compareExercise} setCompareExercise={setCompareExercise} compareData={compareData} onRefresh={() => loadCompare(selectedId)} />}
        </div>
      )}
    </div>
  );
}
