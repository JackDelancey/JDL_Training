import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";
import { isoLocalToday, isoLocalNDaysAgo, formatPrettyDate, timeAgo } from "../utils/dates";
import { fmt, normalizeExerciseName } from "../utils/calcs";
import { Line } from "react-chartjs-2";
import { isoLocalToday, isoLocalNDaysAgo, formatPrettyDate, timeAgo } from "../utils/dates";

function eventSummaryText(event, unit) {
  const type = event?.event_type || "";
  const payload = event?.payload || {};
  const who = event?.user?.name || event?.name || "Someone";
  if (type === "pr_e1rm") return `🔥 ${who} hit a new ${payload.exercise || "lift"} PR — ${payload.top != null ? `${fmt(payload.top)} ${unit}` : "new best"}${payload.e1rm != null ? `\nEstimated 1RM: ${fmt(payload.e1rm)} ${unit}` : ""}`;
  if (type === "session_completed") return `✅ ${who} completed a session${payload.date ? ` on ${payload.date}` : ""}`;
  if (type === "member_joined") return `👋 ${who} joined the group`;
  if (type === "program_published") return `📘 ${who} published a program${payload.title ? ` — ${payload.title}` : ""}`;
  if (type === "challenge_joined") return `🏁 ${who} joined ${payload.name || "a challenge"}`;
  return `• ${type || "Group event"}`;
}

function scoreLabel(type, exercise, unit) {
  if (type === "strength") return exercise ? `${exercise} e1RM (${unit})` : `Score (${unit})`;
  if (type === "improvement") return exercise ? `${exercise} gain (${unit})` : `Gain (${unit})`;
  if (type === "relative_strength") return exercise ? `${exercise} / BW` : "Relative score";
  if (type === "adherence") return "Adherence %";
  if (type === "volume") return exercise ? `${exercise} volume` : "Volume";
  if (type === "streak") return "Streak";
  return "Score";
}

// ─── Tab components ───────────────────────────────────────────────────

function FeedTab({ events, unit }) {
  if (!events.length) return <div className="small">No group activity yet.</div>;
  return (
    <div className="list">
      {events.map((ev) => (
        <div className="listRow" key={ev.id} style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800 }}>{eventSummaryText(ev, unit)}</div>
            <div className="small" style={{ marginTop: 4 }}>{ev.created_at ? timeAgo(ev.created_at) : "—"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LeaderboardTab({ unit, leaderboard, library, lbType, setLbType, lbExercise, setLbExercise, lbWindow, setLbWindow }) {
  const rows = Array.isArray(leaderboard?.rows) ? leaderboard.rows : [];
  const showBodyweight = lbType === "strength" || lbType === "relative_strength";

  return (
    <div>
      <div className="grid grid-3">
        <div className="field">
          <label>Leaderboard</label>
          <select value={lbType} onChange={(e) => setLbType(e.target.value)}>
            {["strength","improvement","adherence","relative_strength","volume","streak"].map((t) => (
              <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1).replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Exercise</label>
          <select value={lbExercise} onChange={(e) => setLbExercise(e.target.value)}>
            {(library || []).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Window</label>
          <select value={lbWindow} onChange={(e) => setLbWindow(e.target.value)}>
            {["14d","30d","60d","90d","all"].map((w) => (
              <option key={w} value={w}>{w === "all" ? "All time" : w}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ height: 12 }} />
      {rows.length ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Athlete</th>
                <th>{scoreLabel(lbType, lbExercise, unit)}</th>
                {showBodyweight && <th>Bodyweight ({unit})</th>}
                {lbType === "strength" && <th>Wilks</th>}
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.user_id || idx}>
                  <td>{r.rank ?? idx + 1}</td>
                  <td>{r.name || r.email || "—"}</td>
                  <td>{Number.isFinite(Number(r.score)) ? (lbType === "adherence" ? `${fmt(r.score)}%` : fmt(r.score)) : "—"}</td>
                  {showBodyweight && <td>{r.meta?.bodyweight != null ? `${fmt(r.meta.bodyweight)} ${unit}` : "—"}</td>}
                  {lbType === "strength" && <td>{r.meta?.wilks != null ? fmt(r.meta.wilks) : "—"}</td>}
                  <td>{r.meta?.date ? formatPrettyDate(r.meta.date) : r.meta?.week ? `Week ${r.meta.week}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="small">No leaderboard data yet.</div>}
    </div>
  );
}

function MembersTab({ members, unit }) {
  if (!members.length) return <div className="small">No members found.</div>;
  return (
    <div className="grid grid-2">
      {members.map((m) => (
        <div key={m.user_id || m.email} className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontWeight: 900 }}>{m.name || m.email}</div>
          <div className="small" style={{ marginTop: 4 }}>Role: <b>{m.role || "member"}</b></div>
          <div className="small">Latest session: <b>{formatPrettyDate(m.latest_session_date)}</b></div>
          <div className="small">Latest week: <b>{m.latest_week ?? "—"}</b></div>
          {m.metrics && Object.entries(m.metrics).length > 0 && (
            <div style={{ marginTop: 10 }} className="small">
              {Object.entries(m.metrics).map(([k, v]) => <div key={k}>{k}: <b>{v != null ? `${fmt(v)} ${unit}` : "—"}</b></div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ProgramsTab({ programs, token, groupId, onInvalidToken, onError }) {
  async function copyProgram(sharedProgramId) {
    try {
      await apiFetch(`/api/groups/${groupId}/programs/${sharedProgramId}/copy`, { token, method: "POST", onInvalidToken });
      alert("Program copied to your Programs page");
    } catch (e) { onError(e.message); }
  }
  if (!programs.length) return <div className="small">No shared programs yet.</div>;
  return (
    <div className="list">
      {programs.map((p) => (
        <div className="listRow" key={p.id} style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800 }}>{p.title || p.name || "Shared program"}</div>
            <div className="small">Created by <b>{p.created_by_name || p.created_by_email || "—"}</b></div>
            <div className="small">{p.days_per_week != null ? `${p.days_per_week} days/week` : ""}{p.total_weeks != null ? ` • ${p.total_weeks} weeks` : ""}</div>
          </div>
          <button className="secondary" onClick={() => copyProgram(p.id)}>Copy to my programs</button>
        </div>
      ))}
    </div>
  );
}

function ChallengesTab({ token, groupId, challenges, onInvalidToken, onError }) {
  const [selectedId, setSelectedId] = useState("");
  const [leaderboard, setLeaderboard] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!selectedId && challenges?.[0]?.id) setSelectedId(challenges[0].id); }, [challenges]);
  useEffect(() => {
    if (!selectedId) return;
    setBusy(true);
    apiFetch(`/api/groups/${groupId}/challenges/${selectedId}/leaderboard`, { token, onInvalidToken })
      .then(setLeaderboard).catch((e) => { onError(e.message); setLeaderboard(null); }).finally(() => setBusy(false));
  }, [selectedId, groupId, token]);

  if (!challenges.length) return <div className="small">No challenges yet.</div>;
  return (
    <div>
      <div className="field">
        <label>Challenge</label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {challenges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div style={{ height: 12 }} />
      <div className="grid grid-2">
        {challenges.map((c) => (
          <div key={c.id} className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div style={{ fontWeight: 900 }}>{c.name}</div>
            <div className="small">{c.description || "No description"}</div>
            <div className="small" style={{ marginTop: 4 }}>Metric: <b>{c.metric_type}</b>{c.exercise ? <> • Exercise: <b>{c.exercise}</b></> : null}</div>
            <div className="small">{c.start_date} → {c.end_date}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 12 }} />
      {leaderboard?.rows?.length ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Rank</th><th>Athlete</th><th>Score</th></tr></thead>
            <tbody>
              {leaderboard.rows.map((r, i) => (
                <tr key={r.user_id || i}><td>{r.rank ?? i + 1}</td><td>{r.name || r.email || "—"}</td><td>{Number.isFinite(Number(r.score)) ? fmt(r.score) : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="small">{busy ? "Loading…" : "No challenge results yet."}</div>}
    </div>
  );
}

function CompareTab({ unit, members, library, compareA, setCompareA, compareB, setCompareB, compareExercise, setCompareExercise, compareData, onRefresh }) {
  const labels = Array.isArray(compareData?.user_a?.history)
    ? compareData.user_a.history.map((x) => formatPrettyDate(x.label || x.date) || "—")
    : [];
  const userASeries = (compareData?.user_a?.history || []).map((x) => Number.isFinite(Number(x.e1rm)) ? Number(x.e1rm) : null);
  const userBSeries = (compareData?.user_b?.history || []).map((x) => Number.isFinite(Number(x.e1rm)) ? Number(x.e1rm) : null);

  const opts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: true, labels: { color: "rgba(255,255,255,0.85)", boxWidth: 12 } }, tooltip: { enabled: true, backgroundColor: "rgba(0,0,0,0.85)", titleColor: "rgba(255,255,255,0.95)", bodyColor: "rgba(255,255,255,0.9)" } },
    scales: { x: { ticks: { color: "rgba(255,255,255,0.65)" }, grid: { color: "rgba(255,255,255,0.06)" } }, y: { ticks: { color: "rgba(255,255,255,0.65)" }, grid: { color: "rgba(255,255,255,0.06)" }, title: { display: true, text: `e1RM (${unit})`, color: "rgba(255,255,255,0.75)" } } },
  };

  return (
    <div>
      <div className="grid grid-4">
        <div className="field"><label>Athlete A</label><select value={compareA} onChange={(e) => setCompareA(e.target.value)}><option value="">Select…</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}</select></div>
        <div className="field"><label>Athlete B</label><select value={compareB} onChange={(e) => setCompareB(e.target.value)}><option value="">Select…</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}</select></div>
        <div className="field"><label>Exercise</label><select value={compareExercise} onChange={(e) => setCompareExercise(e.target.value)}>{(library || []).map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
        <div className="field" style={{ display: "flex", alignItems: "end" }}><button className="secondary" onClick={onRefresh}>Refresh compare</button></div>
      </div>
      <div style={{ height: 12 }} />
      {!compareData ? <div className="small">Pick two members and an exercise to compare.</div> : (
        <>
          <div className="grid grid-2">
            {["user_a", "user_b"].map((key) => (
              <div key={key} className="metric">
                <div className="k">{compareData?.[key]?.name || key === "user_a" ? "Athlete A" : "Athlete B"}</div>
                <div className="v">{compareData?.[key]?.best_e1rm != null ? `${fmt(compareData[key].best_e1rm)} ${unit}` : "—"}</div>
                <div className="s">Best {compareExercise}</div>
              </div>
            ))}
          </div>
          {labels.length ? (
            <div style={{ height: 280, position: "relative", marginTop: 12 }}>
              <Line data={{ labels, datasets: [
                { label: compareData?.user_a?.name || "Athlete A", data: userASeries, tension: 0.25, borderWidth: 3, pointRadius: 4, fill: false, borderColor: "rgba(239,68,68,1)" },
                { label: compareData?.user_b?.name || "Athlete B", data: userBSeries, tension: 0.25, borderWidth: 3, pointRadius: 4, fill: false, borderColor: "rgba(59,130,246,1)" },
              ]}} options={opts} />
            </div>
          ) : <div className="small" style={{ marginTop: 12 }}>Not enough comparison history yet.</div>}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

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
    } catch (e) { setErr(e.message); setGroups([]); setSelectedId(null); } finally { setBusy(false); }
  }

  async function loadWorkspace(groupId = selectedId) {
    if (!token || !groupId) { setGroupDetail(null); setFeed([]); setMembers([]); setPrograms([]); setChallenges([]); setLeaderboard(null); setCompareData(null); return; }
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

  useEffect(() => { loadGroups(); apiFetch("/api/programs", { token, onInvalidToken }).then((r) => { const list = r?.programs || []; setMyPrograms(list); if (!shareProgramId && list[0]?.id) setShareProgramId(list[0].id); }).catch(() => {}); }, [token]);
  useEffect(() => { loadWorkspace(selectedId); }, [token, selectedId]);
  useEffect(() => { if (selectedId) loadLeaderboard(selectedId); }, [token, selectedId, lbType, lbExercise, lbWindow]);
  useEffect(() => { if (activeTab === "compare" && selectedId) loadCompare(selectedId); }, [token, selectedId, activeTab, compareA, compareB, compareExercise]);

  async function createGroup() {
    try {
      const name = prompt("Group name?", "My group") || "My group";
      setBusy(true);
      const res = await apiFetch("/api/groups", { token, method: "POST", body: { name }, onInvalidToken });
      await loadGroups();
      setSelectedId(res?.group?.id || null);
      alert(`Group created.\nShare this code: ${res?.group?.code || "—"}`);
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
    if (!confirm(isOwner ? "Delete this group permanently?" : "Leave this group?")) return;
    try {
      setBusy(true);
      await apiFetch(`/api/groups/${selectedId}${isOwner ? "" : "/leave"}`, { token, method: isOwner ? "DELETE" : "POST", onInvalidToken });
      setGroupDetail(null); setFeed([]); setMembers([]); setPrograms([]); setChallenges([]); setLeaderboard(null); setCompareData(null);
      await loadGroups();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function createChallenge() {
    if (!selectedId) return;
    try {
      const name = (prompt("Challenge name?", "Bench Battle") || "").trim();
      if (!name) return;
      const metric_type = prompt("Metric type? (e1rm, relative_strength, adherence, volume, streak)", "e1rm") || "e1rm";
      const exercise = ["e1rm","relative_strength","volume"].includes(metric_type) ? prompt("Exercise?", "Bench") || "Bench" : null;
      const start_date = prompt("Start date? (YYYY-MM-DD)", isoLocalToday()) || isoLocalToday();
      const end_date = prompt("End date? (YYYY-MM-DD)", isoLocalNDaysAgo(-30)) || isoLocalNDaysAgo(-30);
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

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div><h2 style={{ margin: 0 }}>Groups</h2><div className="small">Competition and collaboration workspace.</div></div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={createGroup} disabled={busy}>{busy ? "…" : "Create group"}</button>
          <button className="secondary" onClick={joinGroup} disabled={busy}>{busy ? "…" : "Join with code"}</button>
        </div>
        <div style={{ height: 12 }} />
        <div className="list">
          {groups.length ? groups.map((g) => (
            <button key={g.id} className="listRow" style={{ width: "100%", textAlign: "left", border: selectedId === g.id ? "1px solid rgba(239,68,68,0.9)" : undefined, background: selectedId === g.id ? "rgba(239,68,68,0.08)" : undefined }} onClick={() => setSelectedId(g.id)}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{g.name}</div>
                <div className="small">Code <b>{g.code}</b> • Members <b>{g.members_count}</b></div>
              </div>
            </button>
          )) : <div className="small">No groups yet — create one or join with a code.</div>}
        </div>
        {selected && (
          <div className="card" style={{ background: "rgba(255,255,255,0.03)", marginTop: 12 }}>
            <div style={{ fontWeight: 900 }}>{selected.name}</div>
            <div className="small" style={{ marginTop: 6 }}>Share code: <b>{selected.code}</b></div>
            <div className="small">Members: <b>{selected.members_count}</b></div>
          </div>
        )}
      </div>

      <div className="card">
        {!selectedId ? <div className="small">Pick a group to view its workspace.</div> : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>{groupDetail?.name || selected?.name || "Group"}</h2>
                <div className="small">Signed in as <b>{me?.name || me?.email}</b>{groupDetail?.members_count != null ? <> • Members <b>{groupDetail.members_count}</b></> : null}</div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="secondary" onClick={() => loadWorkspace(selectedId)} disabled={busy}>{busy ? "…" : "Refresh"}</button>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select value={shareProgramId} onChange={(e) => setShareProgramId(e.target.value)} style={{ minWidth: 200 }}>
                    <option value="">Select program</option>
                    {myPrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button className="secondary" onClick={shareProgramToGroup} disabled={!shareProgramId}>Share</button>
                </div>
                <button className="secondary" onClick={createChallenge}>New challenge</button>
                <button className="secondary" onClick={leaveOrDelete} disabled={!selectedId || busy}>
                  {groupDetail?.my_role === "owner" ? "Delete group" : "Leave group"}
                </button>
              </div>
            </div>
            <div style={{ height: 14 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["feed","leaderboard","members","programs","challenges","compare"].map((tab) => (
                <button key={tab} className={activeTab === tab ? "" : "secondary"} onClick={() => setActiveTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>
              ))}
            </div>
            <div style={{ height: 16 }} />
            {activeTab === "feed" && <FeedTab events={feed} unit={unit} />}
            {activeTab === "leaderboard" && <LeaderboardTab unit={unit} leaderboard={leaderboard} library={library} lbType={lbType} setLbType={setLbType} lbExercise={lbExercise} setLbExercise={setLbExercise} lbWindow={lbWindow} setLbWindow={setLbWindow} />}
            {activeTab === "members" && <MembersTab members={members} unit={unit} />}
            {activeTab === "programs" && <ProgramsTab programs={programs} token={token} groupId={selectedId} onInvalidToken={onInvalidToken} onError={setErr} />}
            {activeTab === "challenges" && <ChallengesTab token={token} groupId={selectedId} challenges={challenges} onInvalidToken={onInvalidToken} onError={setErr} />}
            {activeTab === "compare" && <CompareTab unit={unit} members={members} library={library} compareA={compareA} setCompareA={setCompareA} compareB={compareB} setCompareB={setCompareB} compareExercise={compareExercise} setCompareExercise={setCompareExercise} compareData={compareData} onRefresh={() => loadCompare(selectedId)} />}
          </>
        )}
      </div>
    </div>
  );
}
