import React, { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler
);

const API = "https://jdl-training.onrender.com";

async function apiFetch(path, { token, method = "GET", body, onInvalidToken } = {}) {
  const authToken =
    typeof token === "string"
      ? token.trim()
      : token && typeof token === "object"
        ? String(token.access_token || token.token || "").trim()
        : "";

  const headers = {
    Accept: "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
  };

  const r = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let j = {};
  try {
    j = await r.json();
  } catch {
    j = {};
  }

  if (
    r.status === 401 ||
    j?.error === "Invalid token" ||
    j?.error === "Missing bearer token"
  ) {
    if (typeof onInvalidToken === "function") onInvalidToken();
    throw new Error("Session expired — please log in again.");
  }

  if (!r.ok) {
    throw new Error(j?.error || `Request failed (${r.status})`);
  }

  return j;
}

const DEFAULT_EXERCISE_LIBRARY = [
  "Bench",
  "Squat",
  "Deadlift",
  "Overhead Press",
  "Paused Bench",
  "Spoto Press",
  "Incline Bench",
  "Leg Press",
  "Hack Squat",
  "RDL",
  "Barbell Row",
  "Chest-Supported Row",
  "Pull-up / Pulldown",
  "Lat Pulldown",
  "DB Row",
  "Hip Thrust",
  "Hamstring Curl",
  "Triceps Pushdown",
  "Lateral Raise",
];
function formatChartDate(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
}

function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n % 1 === 0 ? String(n.toFixed(0)) : String(n.toFixed(2));
}

function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 10) / 10).toFixed(1) + "%";
}

function isoLocal(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function formatPrettyDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPrettyDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);

  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function isoLocalToday() {
  return isoLocal(new Date());
}

function isoLocalNDaysAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return isoLocal(d);
}

function buildEntriesFromPlanRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows
    .map((r) => ({
      exercise: (r?.exercise || "").toString().trim(),
      source: "program",
      planned: {
        sets_reps: (r?.sets_reps || "").toString(),
        load_rpe: (r?.load_rpe || "").toString(),
        notes: (r?.notes || "").toString(),
        target: (r?.week_target || "").toString(),
      },
      completed: false,
      notes: "",
      actual: { top: "", reps: 3, rpe: "" },
    }))
    .filter((x) => x.exercise);
}

function normalizeExerciseName(x) {
  return String(x || "")
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");
}

function sumWeeks(blocks) {
  return (blocks || []).reduce((a, b) => a + (Number(b?.weeks) || 0), 0);
}

function draftKey(programId) {
  return `jdl_program_draft_${programId}`;
}

function hasDraft(programId) {
  return !!localStorage.getItem(draftKey(programId));
}
function dailyDraftKey(date) {
  return `jdl_daily_draft_${date}`;
}

function hasDailyDraft(date) {
  return !!localStorage.getItem(dailyDraftKey(date));
}
function timeAgo(date) {
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);

  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function e1rmFromTopReps(top, reps) {
  const t = Number(top);
  const r = Number(reps);
  if (!Number.isFinite(t) || !Number.isFinite(r) || t <= 0 || r <= 0) return null;
  return Math.round(t * (1 + r / 30) * 10) / 10;
}

function scoreLabel(type, exercise, unit) {
  switch (type) {
    case "strength":
      return exercise ? `${exercise} e1RM (${unit})` : `Score (${unit})`;
    case "improvement":
      return exercise ? `${exercise} gain (${unit})` : `Gain (${unit})`;
    case "relative_strength":
      return exercise ? `${exercise} / BW` : "Relative score";
    case "adherence":
      return "Adherence %";
    case "volume":
      return exercise ? `${exercise} volume` : "Volume";
    case "streak":
      return "Streak";
    default:
      return "Score";
  }
}

function eventSummaryText(event, unit) {
  const type = event?.event_type || "";
  const payload = event?.payload || {};
  const who = event?.user?.name || event?.name || "Someone";

  if (type === "pr_e1rm") {
  return `🔥 ${who} hit a new ${payload.exercise || "lift"} PR — ${
    payload.top != null ? `${fmt(payload.top)} ${unit}` : "new best"
  }${
    payload.e1rm != null
      ? `\nEstimated 1RM: ${fmt(payload.e1rm)} ${unit}`
      : ""
  }`;
}

  if (type === "session_completed") {
    return `✅ ${who} completed a session${
      payload.date ? ` on ${payload.date}` : ""
    }`;
  }

  if (type === "member_joined") {
    return `👋 ${who} joined the group`;
  }

  if (type === "program_published") {
    return `📘 ${who} published a program${payload.title ? ` — ${payload.title}` : ""}`;
  }

  if (type === "program_followed") {
    return `📌 ${who} started following a shared program`;
  }

  if (type === "challenge_joined") {
    return `🏁 ${who} joined ${payload.name || "a challenge"}`;
  }

  if (type === "challenge_won") {
    return `🏆 ${who} won ${payload.name || "a challenge"}`;
  }

  if (type === "weekly_summary") {
    return `📊 Weekly group summary posted`;
  }

  return `• ${type || "Group event"}`;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("jdl_token") || "");
  const [me, setMe] = useState(null);
  const [weekly, setWeekly] = useState([]);
  const [dailyOverview, setDailyOverview] = useState([]);
  const [allPrograms, setAllPrograms] = useState([]);
  const [activeProgram, setActiveProgram] = useState(null);
  const [err, setErr] = useState("");
  const [page, setPage] = useState("overview");
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [dashboardExercises, setDashboardExercises] = useState([]);
  

  const unit = me?.unit_pref || "kg";
  const tracked = me?.tracked_exercises || ["Bench", "Squat", "Deadlift"];

  const mergedLibrary = useMemo(() => {
    const set = new Set();

    const addName = (v) => {
      const s = String(v || "").trim();
      if (s) set.add(s);
    };

    (DEFAULT_EXERCISE_LIBRARY || []).forEach(addName);
    (exerciseLibrary || []).forEach(addName);
    (tracked || []).forEach(addName);
    (dashboardExercises || []).forEach(addName);

    (weekly || []).forEach((w) => {
      (w?.entries || []).forEach((e) => addName(e?.exercise));
    });

    (dailyOverview || []).forEach((d) => {
      (d?.entries || []).forEach((e) => addName(e?.exercise));
    });

    (allPrograms || []).forEach((program) => {
      (program?.blocks || []).forEach((block) => {
        (block?.days || []).forEach((day) => {
          (day?.rows || []).forEach((row) => addName(row?.exercise));
        });
      });
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [exerciseLibrary, tracked, dashboardExercises, weekly, dailyOverview, allPrograms]);

  function hardLogout(message) {
    localStorage.removeItem("jdl_token");
    setToken("");
    setMe(null);
    setWeekly([]);
    setDailyOverview([]);
    setAllPrograms([]);
    setExerciseLibrary([]);
    setDashboardExercises([]);
    setActiveProgram(null);
    setErr(message || "");
    setPage("overview");
  }

  async function refresh() {
    if (!token) return;
    try {
      setErr("");

      const meRes = await apiFetch("/api/me", {
        token,
        onInvalidToken: () => hardLogout("Session expired — please log in again."),
      });

      const meObj = meRes?.user || meRes || null;
      setMe(meObj);
      setExerciseLibrary(meObj?.exercise_library || []);
      setDashboardExercises(
        meObj?.dashboard_exercises ||
          (meObj?.tracked_exercises || ["Bench", "Squat", "Deadlift"]).slice(0, 3)
      );

      const w = await apiFetch("/api/weekly", {
        token,
        onInvalidToken: () => hardLogout("Session expired — please log in again."),
      });
      setWeekly(Array.isArray(w) ? w : []);

      const from = isoLocalNDaysAgo(180);
      const to = isoLocalToday();

      const dailyRes = await apiFetch(
        `/api/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          token,
          onInvalidToken: () => hardLogout("Session expired — please log in again."),
        }
      ).catch(() => []);

      setDailyOverview(Array.isArray(dailyRes) ? dailyRes : []);

      const programsRes = await apiFetch("/api/programs", {
        token,
        onInvalidToken: () => hardLogout("Session expired — please log in again."),
      }).catch(() => null);

      setAllPrograms(Array.isArray(programsRes?.programs) ? programsRes.programs : []);

      const ap = await apiFetch("/api/programs/active", {
        token,
        onInvalidToken: () => hardLogout("Session expired — please log in again."),
      }).catch(() => null);

      setActiveProgram(ap?.program || null);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  if (!token) {
    return (
      <div className="authShell">
        {err ? <Banner text={err} /> : null}
        <div className="authCard">
          <div className="brandRow">
            <img src="/brand/jdl-logo.png" alt="JDL logo" />
            <div>
              <div className="brandTitle">JDL Training</div>
              <div className="small">
                Weekly logging • e1RM trends • group comparisons
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Auth
              onAuthed={(t) => {
                localStorage.setItem("jdl_token", t);
                setToken(t);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="sidebarTop">
          <div className="brandRow">
            <img src="/brand/jdl-logo.png" alt="JDL logo" />
            <div>
              <div className="brandTitle">JDL Training</div>
              <div className="small">
                Weekly logging • e1RM trends • group comparisons
              </div>
            </div>
          </div>

          <div className="nav">
            <button
              className={page === "overview" ? "navBtn active" : "navBtn"}
              onClick={() => setPage("overview")}
            >
              Overview
            </button>
            <button
              className={page === "daily" ? "navBtn active" : "navBtn"}
              onClick={() => setPage("daily")}
            >
              Daily
            </button>
            <button
              className={page === "programs" ? "navBtn active" : "navBtn"}
              onClick={() => setPage("programs")}
            >
              Programs
            </button>
            <button
              className={page === "explorer" ? "navBtn active" : "navBtn"}
              onClick={() => setPage("explorer")}
            >
              Explorer
            </button>
            <button
  className={page === "connections" ? "navBtn active" : "navBtn"}
  onClick={() => setPage("connections")}
>
  Connections
</button>
            <button
              className={page === "groups" ? "navBtn active" : "navBtn"}
              onClick={() => setPage("groups")}
            >
              Groups
            </button>
            <button
              className={page === "settings" ? "navBtn active" : "navBtn"}
              onClick={() => setPage("settings")}
            >
              Settings
            </button>
          </div>
        </div>

        <div className="sidebarBottom">
          <div className="small">
            Signed in as <b>{me?.name || me?.email}</b>
          </div>
          <button
            className="secondary"
            onClick={() => hardLogout("")}
            style={{ marginTop: 10 }}
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        {err ? <Banner text={err} /> : null}

        {page === "overview" ? (
          <Overview
            me={me}
            token={token}
            unit={unit}
            tracked={tracked}
            dashboardExercises={dashboardExercises}
            weekly={weekly}
            dailyOverview={dailyOverview}
            activeProgram={activeProgram}
            onLogout={() => hardLogout("")}
            onRefresh={refresh}
            onInvalidToken={() => hardLogout("Session expired — please log in again.")}
            onError={setErr}
          />
        ) : page === "daily" ? (
          <DailyPage
  me={me}
  token={token}
  unit={unit}
  library={mergedLibrary}
  onInvalidToken={() => hardLogout("Session expired — please log in again.")}
  onError={setErr}
/>
        ) : page === "explorer" ? (
          <ExplorerPage
            token={token}
            unit={unit}
            library={mergedLibrary}
            onInvalidToken={() => hardLogout("Session expired — please log in again.")}
            onError={setErr}
          />
        ) : page === "programs" ? (
          <ProgramsPage
            token={token}
            unit={unit}
            library={mergedLibrary}
            onInvalidToken={() => hardLogout("Session expired — please log in again.")}
            onError={setErr}
          />
          ) : page === "connections" ? (
  <ConnectionsPage
    token={token}
    onInvalidToken={() => hardLogout("Session expired — please log in again.")}
    onError={setErr}
  />
        ) : page === "groups" ? (
          <GroupsPage
  token={token}
  unit={unit}
  me={me}
  library={mergedLibrary}
  onInvalidToken={() => hardLogout("Session expired — please log in again.")}
  onError={setErr}
/>
        ) : (
          <SettingsPage
            me={me}
            token={token}
            unit={unit}
            library={mergedLibrary}
            exerciseLibrary={exerciseLibrary}
            tracked={tracked}
            dashboardExercises={dashboardExercises}
            onInvalidToken={() => hardLogout("Session expired — please log in again.")}
            onError={setErr}
            onRefresh={refresh}
            onLibraryChanged={(list) => setExerciseLibrary(list)}
            onDashboardChanged={(list) => setDashboardExercises(list)}
          />
        )}
      </main>
    </div>
  );
}

/* =====================
   UI Bits
===================== */
function Banner({ text }) {
  return (
    <div className="card" style={{ borderColor: "#7f1d1d", marginBottom: 14 }}>
      <b>Error:</b> {text}
    </div>
  );
}

function Notice({ text, onDismiss, actions }) {
  return (
    <div className="card" style={{ borderColor: "#1f3a8a", marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <b>Note:</b> {text}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {actions}
          {onDismiss ? (
            <button className="secondary" onClick={onDismiss}>
              Dismiss
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* =====================
   Overview
===================== */
function Overview({
  me,
  token,
  unit,
  tracked,
  dashboardExercises,
  weekly,
  dailyOverview,
  activeProgram,
  onLogout,
  onRefresh,
  onInvalidToken,
  onError,
}) {
  return (
    <>
      <div className="grid grid-2">
        <div className="card">
          <h2>Profile</h2>
          <div className="small">
            Logged in as <b>{me?.name || me?.email}</b>
          </div>

          <div style={{ marginTop: 10 }}>
            <button className="secondary" onClick={onLogout}>
              Log out
            </button>
          </div>

          <hr />
          <WeeklyEntry
            token={token}
            unit={unit}
            tracked={tracked}
            onSaved={onRefresh}
            onInvalidToken={onInvalidToken}
            onError={onError}
          />
        </div>

        <div className="card">
          <h2>Dashboard</h2>
          <div className="small">Latest + best e1RM for tracked exercises.</div>

          <div style={{ height: 10 }} />

          <Dashboard
            weekly={weekly}
            dailyOverview={dailyOverview}
            unit={unit}
            tracked={dashboardExercises}
            activeProgram={activeProgram}
          />

          <div style={{ height: 14 }} />

          <AdherenceMini
            token={token}
            onInvalidToken={onInvalidToken}
            onError={onError}
          />

          <div style={{ height: 14 }} />

          <ProgramProgressCard
            token={token}
            onInvalidToken={onInvalidToken}
            onError={onError}
          />

          <div style={{ height: 14 }} />

          <Charts
            weekly={weekly}
            dailyOverview={dailyOverview}
            unit={unit}
            tracked={dashboardExercises}
          />
        </div>
      </div>

      <div style={{ height: 20 }} />
      <div className="grid grid-2">
        <div className="card">
          <h2>Groups</h2>
          <div className="small">
            Quick access to your groups — the full workspace is now on the Groups page.
          </div>
          <div style={{ height: 10 }} />
          <GroupsMini
            token={token}
            onInvalidToken={onInvalidToken}
            onError={onError}
          />
        </div>

        <div className="card">
          <h2>Weeks</h2>
          <WeeksTable
            weekly={weekly}
            dailyOverview={dailyOverview}
            unit={unit}
            tracked={tracked}
          />
        </div>
      </div>
    </>
  );
}

/* =====================
   Groups Page
===================== */
function GroupsPage({ token, unit, me, library, onInvalidToken, onError }) {
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
  const [lbExercise, setLbExercise] = useState(Array.isArray(library) && library.length ? library[0] : "Bench");
  const [lbWindow, setLbWindow] = useState("30d");

  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareExercise, setCompareExercise] = useState(Array.isArray(library) && library.length ? library[0] : "Bench");
  const [compareData, setCompareData] = useState(null);

  const selected = groups.find((g) => g.id === selectedId) || null;
  const [myPrograms, setMyPrograms] = useState([]);
  const [shareProgramId, setShareProgramId] = useState("");
  useEffect(() => {
  if (Array.isArray(library) && library.length) {
    if (!library.includes(lbExercise)) {
      setLbExercise(library[0]);
    }
    if (!library.includes(compareExercise)) {
      setCompareExercise(library[0]);
    }
  }
}, [library, lbExercise, compareExercise]);
  async function loadGroups() {
    if (!token) return;
    try {
      setBusy(true);
      const res = await apiFetch("/api/groups", { token, onInvalidToken });
      const next = Array.isArray(res?.groups) ? res.groups : [];
      setGroups(next);
      setSelectedId((prev) => {
        if (prev && next.some((g) => g.id === prev)) return prev;
        return next?.[0]?.id || null;
      });
    } catch (e) {
      onError(e.message);
      setGroups([]);
      setSelectedId(null);
    } finally {
      setBusy(false);
    }
  }
  async function leaveGroup() {
  if (!selectedId) return;
  if (!confirm("Leave this group?")) return;

  try {
    setBusy(true);

    await apiFetch(`/api/groups/${selectedId}/leave`, {
      token,
      method: "POST",
      onInvalidToken,
    });

    setGroupDetail(null);
    setFeed([]);
    setMembers([]);
    setPrograms([]);
    setChallenges([]);
    setLeaderboard(null);
    setCompareData(null);

    await loadGroups();
  } catch (e) {
    onError(e.message);
  } finally {
    setBusy(false);
  }
}

async function deleteGroup() {
  if (!selectedId) return;
  if (!confirm("Delete this group permanently?")) return;

  try {
    setBusy(true);

    await apiFetch(`/api/groups/${selectedId}`, {
      token,
      method: "DELETE",
      onInvalidToken,
    });

    setGroupDetail(null);
    setFeed([]);
    setMembers([]);
    setPrograms([]);
    setChallenges([]);
    setLeaderboard(null);
    setCompareData(null);

    await loadGroups();
  } catch (e) {
    onError(e.message);
  } finally {
    setBusy(false);
  }
}
async function loadMyPrograms() {
  if (!token) return;
  try {
    const res = await apiFetch("/api/programs", { token, onInvalidToken });
    const list = Array.isArray(res?.programs) ? res.programs : [];
    setMyPrograms(list);
    if (!shareProgramId && list[0]?.id) {
      setShareProgramId(list[0].id);
    }
  } catch (e) {
    onError(e.message);
    setMyPrograms([]);
  }
}
useEffect(() => {
  loadMyPrograms();
}, [token]);

  async function loadGroupWorkspace(groupId = selectedId) {
    if (!token || !groupId) {
      setGroupDetail(null);
      setFeed([]);
      setMembers([]);
      setPrograms([]);
      setChallenges([]);
      setLeaderboard(null);
      setCompareData(null);
      return;
    }

    try {
      setBusy(true);

      const [detailRes, feedRes, membersRes, programsRes, challengesRes, leaderboardRes] =
        await Promise.all([
          apiFetch(`/api/groups/${groupId}`, { token, onInvalidToken }).catch(() => null),
          apiFetch(`/api/groups/${groupId}/feed`, { token, onInvalidToken }).catch(() => ({ events: [] })),
          apiFetch(`/api/groups/${groupId}/members`, { token, onInvalidToken }).catch(() => ({ members: [] })),
          apiFetch(`/api/groups/${groupId}/programs`, { token, onInvalidToken }).catch(() => ({ programs: [] })),
          apiFetch(`/api/groups/${groupId}/challenges`, { token, onInvalidToken }).catch(() => ({ challenges: [] })),
          apiFetch(
            `/api/groups/${groupId}/leaderboard?type=${encodeURIComponent(lbType)}&exercise=${encodeURIComponent(
              lbExercise
            )}&window=${encodeURIComponent(lbWindow)}`,
            { token, onInvalidToken }
          ).catch(() => null),
        ]);

      setGroupDetail(detailRes?.group || null);
      setFeed(Array.isArray(feedRes?.events) ? feedRes.events : []);
      setMembers(Array.isArray(membersRes?.members) ? membersRes.members : []);
      setPrograms(Array.isArray(programsRes?.programs) ? programsRes.programs : []);
      setChallenges(Array.isArray(challengesRes?.challenges) ? challengesRes.challenges : []);
      setLeaderboard(leaderboardRes || null);

      const nextMembers = Array.isArray(membersRes?.members) ? membersRes.members : [];
      if (!compareA && nextMembers[0]?.user_id) setCompareA(nextMembers[0].user_id);
      if (!compareB && nextMembers[1]?.user_id) setCompareB(nextMembers[1].user_id);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadLeaderboard(groupId = selectedId) {
    if (!token || !groupId) return;
    try {
      const res = await apiFetch(
        `/api/groups/${groupId}/leaderboard?type=${encodeURIComponent(lbType)}&exercise=${encodeURIComponent(
          lbExercise
        )}&window=${encodeURIComponent(lbWindow)}`,
        { token, onInvalidToken }
      );
      setLeaderboard(res);
    } catch (e) {
      onError(e.message);
      setLeaderboard(null);
    }
  }

  async function loadCompare(groupId = selectedId) {
    if (!token || !groupId || !compareA || !compareB || !compareExercise) {
      setCompareData(null);
      return;
    }

    try {
      const res = await apiFetch(
        `/api/groups/${groupId}/compare?user_a=${encodeURIComponent(compareA)}&user_b=${encodeURIComponent(
          compareB
        )}&exercise=${encodeURIComponent(compareExercise)}`,
        { token, onInvalidToken }
      );
      setCompareData(res);
    } catch (e) {
      onError(e.message);
      setCompareData(null);
    }
  }

  useEffect(() => {
    loadGroups();
  }, [token]);

  useEffect(() => {
    loadGroupWorkspace(selectedId);
  }, [token, selectedId]);

  useEffect(() => {
    if (selectedId) loadLeaderboard(selectedId);
  }, [token, selectedId, lbType, lbExercise, lbWindow]);

  useEffect(() => {
    if (activeTab === "compare" && selectedId) {
      loadCompare(selectedId);
    }
  }, [token, selectedId, activeTab, compareA, compareB, compareExercise]);

  async function createGroup() {
    try {
      const name = prompt("Group name?", "My group") || "My group";
      setBusy(true);
      const res = await apiFetch("/api/groups", {
        token,
        method: "POST",
        body: { name },
        onInvalidToken,
      });
      await loadGroups();
      setSelectedId(res?.group?.id || null);
      alert(`Group created.\nShare this code: ${res?.group?.code || "—"}`);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinGroup() {
    try {
      const code = (prompt("Enter group code") || "").trim();
      if (!code) return;
      setBusy(true);
      const res = await apiFetch("/api/groups/join", {
        token,
        method: "POST",
        body: { code },
        onInvalidToken,
      });
      await loadGroups();
      setSelectedId(res?.group?.id || null);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function createChallenge() {
    if (!selectedId) return;
    try {
      const name = (prompt("Challenge name?", "Bench Battle") || "").trim();
      if (!name) return;

      const metric_type = prompt(
        "Metric type? (e1rm, relative_strength, adherence, volume, streak)",
        "e1rm"
      ) || "e1rm";

      const exercise =
        metric_type === "e1rm" || metric_type === "relative_strength" || metric_type === "volume"
          ? prompt("Exercise?", "Bench") || "Bench"
          : null;

      const start_date = prompt("Start date? (YYYY-MM-DD)", isoLocalToday()) || isoLocalToday();
      const endDateDefault = isoLocalNDaysAgo(-30);
      const end_date = prompt("End date? (YYYY-MM-DD)", endDateDefault) || endDateDefault;

      await apiFetch(`/api/groups/${selectedId}/challenges`, {
        token,
        method: "POST",
        body: {
          name,
          metric_type,
          exercise,
          scoring_type: metric_type === "adherence" ? "pct" : "max",
          start_date,
          end_date,
        },
        onInvalidToken,
      });

      await loadGroupWorkspace(selectedId);
      setActiveTab("challenges");
    } catch (e) {
      onError(e.message);
    }
  }

  async function shareProgramToGroup() {
  if (!selectedId || !shareProgramId) return;
  try {
    await apiFetch(`/api/groups/${selectedId}/programs`, {
      token,
      method: "POST",
      body: { program_id: shareProgramId },
      onInvalidToken,
    });

    await loadGroupWorkspace(selectedId);
    setActiveTab("programs");
  } catch (e) {
    onError(e.message);
  }
}

  
  return (
    <div className="groups-shell">
      <div className="groups-layout" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <h2 style={{ margin: 0 }}>Groups</h2>
              <div className="small">Competition and collaboration workspace.</div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={createGroup} disabled={busy}>
              {busy ? "…" : "Create group"}
            </button>
            <button className="secondary" onClick={joinGroup} disabled={busy}>
              {busy ? "…" : "Join with code"}
            </button>
          </div>

          <div style={{ height: 12 }} />

          <div className="list">
            {groups.length ? (
              groups.map((g) => (
                <button
                  key={g.id}
                  className="listRow"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: selectedId === g.id ? "1px solid rgba(239,68,68,0.9)" : undefined,
                    background: selectedId === g.id ? "rgba(239,68,68,0.08)" : undefined,
                  }}
                  onClick={() => setSelectedId(g.id)}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>{g.name}</div>
                    <div className="small">
                      Code <b>{g.code}</b> • Members <b>{g.members_count}</b>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="small">No groups yet — create one or join with a code.</div>
            )}
          </div>

          {selected ? (
            <div className="card" style={{ background: "rgba(255,255,255,0.03)", marginTop: 12 }}>
              <div style={{ fontWeight: 900 }}>{selected.name}</div>
              <div className="small" style={{ marginTop: 6 }}>
                Share code: <b>{selected.code}</b>
              </div>
              <div className="small">Members: <b>{selected.members_count}</b></div>
            </div>
          ) : null}
        </div>

        <div className="card">
          {!selectedId ? (
            <div className="small">Pick a group to view its workspace.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{groupDetail?.name || selected?.name || "Group"}</h2>
                  <div className="small">
                    Signed in as <b>{me?.name || me?.email}</b>
                    {groupDetail?.members_count != null ? <> • Members <b>{groupDetail.members_count}</b></> : null}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="secondary" onClick={() => loadGroupWorkspace(selectedId)} disabled={busy}>
                    {busy ? "…" : "Refresh"}
                  </button>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
  <select
    value={shareProgramId}
    onChange={(e) => setShareProgramId(e.target.value)}
    style={{ minWidth: 220 }}
  >
    <option value="">Select program</option>
    {myPrograms.map((p) => (
      <option key={p.id} value={p.id}>
        {p.name}
      </option>
    ))}
  </select>

  <button
  className="secondary"
  onClick={shareProgramToGroup}
  disabled={!shareProgramId}
>
  Share
</button>
</div>
                  <button className="secondary" onClick={createChallenge}>
                    New challenge
                  </button>
                  {groupDetail?.my_role === "owner" ? (
    <button className="secondary" onClick={deleteGroup} disabled={!selectedId || busy}>
      Delete group
    </button>
  ) : (
    <button className="secondary" onClick={leaveGroup} disabled={!selectedId || busy}>
      Leave group
    </button> )}
                </div>
              </div>

              <div style={{ height: 14 }} />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["feed", "leaderboard", "members", "programs", "challenges", "compare"].map((tab) => (
                  <button
                    key={tab}
                    className={activeTab === tab ? "" : "secondary"}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab[0].toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div style={{ height: 16 }} />

              {activeTab === "feed" ? (
                <GroupFeedTab events={feed} unit={unit} />
              ) : activeTab === "leaderboard" ? (
                <GroupLeaderboardTab
  unit={unit}
  leaderboard={leaderboard}
  library={library}
  lbType={lbType}
  setLbType={setLbType}
  lbExercise={lbExercise}
  setLbExercise={setLbExercise}
  lbWindow={lbWindow}
  setLbWindow={setLbWindow}
/>
              ) : activeTab === "members" ? (
                <GroupMembersTab members={members} unit={unit} />
              ) : activeTab === "programs" ? (
                <GroupProgramsTab
  programs={programs}
  token={token}
  groupId={selectedId}
  onInvalidToken={onInvalidToken}
  onError={onError}
/>
              ) : activeTab === "challenges" ? (
                <GroupChallengesTab
                  token={token}
                  groupId={selectedId}
                  challenges={challenges}
                  onInvalidToken={onInvalidToken}
                  onError={onError}
                />
              ) : (
                <GroupCompareTab
  unit={unit}
  members={members}
  library={library}
  compareA={compareA}
  setCompareA={setCompareA}
  compareB={compareB}
  setCompareB={setCompareB}
  compareExercise={compareExercise}
  setCompareExercise={setCompareExercise}
  compareData={compareData}
  onRefresh={() => loadCompare(selectedId)}
/>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupsMini({ token, onInvalidToken, onError }) {
  const [groups, setGroups] = useState([]);

  async function load() {
    try {
      const res = await apiFetch("/api/groups", { token, onInvalidToken });
      setGroups(Array.isArray(res?.groups) ? res.groups : []);
    } catch (e) {
      onError(e.message);
      setGroups([]);
    }
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  if (!groups.length) {
    return <div className="small">No groups yet.</div>;
  }

  return (
    <div className="list">
      {groups.slice(0, 5).map((g) => (
        <div className="listRow" key={g.id}>
          <div>
            <div style={{ fontWeight: 800 }}>{g.name}</div>
            <div className="small">
              Code <b>{g.code}</b> • Members <b>{g.members_count}</b>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupFeedTab({ events, unit }) {
  if (!events.length) {
    return <div className="small">No group activity yet.</div>;
  }

  return (
    <div className="list">
      {events.map((ev) => (
        <div className="listRow" key={ev.id} style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800 }}>{eventSummaryText(ev, unit)}</div>
            <div className="small" style={{ marginTop: 4 }}>
              {ev.created_at ? timeAgo(ev.created_at) : "—"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupLeaderboardTab({
  unit,
  leaderboard,
  library,
  lbType,
  setLbType,
  lbExercise,
  setLbExercise,
  lbWindow,
  setLbWindow,
}) {
  const rows = Array.isArray(leaderboard?.rows) ? leaderboard.rows : [];
  const scoreHeading = scoreLabel(lbType, lbExercise, unit);

  return (
    <div>
      <div className="grid grid-3">
        <div className="field">
          <label>Leaderboard</label>
          <select value={lbType} onChange={(e) => setLbType(e.target.value)}>
            <option value="strength">Strength</option>
            <option value="improvement">Improvement</option>
            <option value="adherence">Adherence</option>
            <option value="relative_strength">Relative strength</option>
            <option value="volume">Volume</option>
            <option value="streak">Streak</option>
          </select>
        </div>

        <div className="field">
  <label>Exercise</label>
  <select value={lbExercise} onChange={(e) => setLbExercise(e.target.value)}>
    {(library || []).map((x) => (
      <option key={x} value={x}>
        {x}
      </option>
    ))}
  </select>
</div>

        <div className="field">
          <label>Window</label>
          <select value={lbWindow} onChange={(e) => setLbWindow(e.target.value)}>
            <option value="14d">14 days</option>
            <option value="30d">30 days</option>
            <option value="60d">60 days</option>
            <option value="90d">90 days</option>
            <option value="all">All time</option>
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
                <th>{scoreHeading}</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.user_id || idx}>
                  <td>{r.rank ?? idx + 1}</td>
                  <td>{r.name || r.email || "—"}</td>
                  <td>
                    {Number.isFinite(Number(r.score))
                      ? lbType === "adherence"
                        ? `${fmt(r.score)}%`
                        : fmt(r.score)
                      : "—"}
                  </td>
                  <td>
  {r.meta?.date
    ? formatPrettyDate(r.meta.date)
    : r.meta?.note
      ? r.meta.note
      : r.meta?.week
        ? `Week ${r.meta.week}`
        : "—"}
</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="small">No leaderboard data yet for this selection.</div>
      )}
    </div>
  );
}

function GroupMembersTab({ members, unit }) {
  if (!members.length) {
    return <div className="small">No members found.</div>;
  }

  return (
    <div className="grid grid-2">
      {members.map((m) => (
        <div key={m.user_id || m.email} className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontWeight: 900 }}>{m.name || m.email}</div>
          <div className="small" style={{ marginTop: 4 }}>
            Role: <b>{m.role || "member"}</b>
          </div>
          <div className="small">
  Joined: <b>{m.joined_at ? formatPrettyDate(m.joined_at) : "—"}</b>
</div>
<div className="small">
  Latest session: <b>{formatPrettyDate(m.latest_session_date)}</b>
</div>
          <div className="small">
            Latest week: <b>{m.latest_week ?? "—"}</b>
          </div>
          {m.metrics ? (
            <div style={{ marginTop: 10 }} className="small">
              {(Object.entries(m.metrics) || []).map(([k, v]) => (
                <div key={k}>
                  {k}: <b>{v != null ? `${fmt(v)} ${unit}` : "—"}</b>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function GroupProgramsTab({ programs, token, groupId, onInvalidToken, onError }) {  
  if (!programs.length) {
    return <div className="small">No shared programs yet.</div>;
  }
async function copySharedProgram(sharedProgramId) {
  try {
    await apiFetch(`/api/groups/${groupId}/programs/${sharedProgramId}/copy`, {
  token,
  method: "POST",
  onInvalidToken,
});
    alert("Program copied to your Programs page");
  } catch (e) {
    onError(e.message);
  }
}
  return (
    <div className="list">
      {programs.map((p) => (
        <div className="listRow" key={p.id} style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <button
  className="secondary"
  onClick={() => copySharedProgram(p.id)}
>
  Copy to my programs
</button>
            <div style={{ fontWeight: 800 }}>{p.title || p.name || "Shared program"}</div>
            <div className="small">
              Created by <b>{p.created_by_name || p.created_by_email || "—"}</b>
            </div>
            <div className="small">
              {p.days_per_week != null ? `${p.days_per_week} days/week` : ""}
              {p.total_weeks != null ? ` • ${p.total_weeks} weeks` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupChallengesTab({ token, groupId, challenges, onInvalidToken, onError }) {
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [leaderboard, setLeaderboard] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadChallengeLeaderboard(challengeId) {
    if (!token || !groupId || !challengeId) {
      setLeaderboard(null);
      return;
    }

    try {
      setBusy(true);
      const res = await apiFetch(
        `/api/groups/${groupId}/challenges/${challengeId}/leaderboard`,
        { token, onInvalidToken }
      );
      setLeaderboard(res);
    } catch (e) {
      onError(e.message);
      setLeaderboard(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedChallengeId && challenges?.[0]?.id) {
      setSelectedChallengeId(challenges[0].id);
    }
  }, [challenges, selectedChallengeId]);

  useEffect(() => {
    if (selectedChallengeId) loadChallengeLeaderboard(selectedChallengeId);
  }, [token, groupId, selectedChallengeId]);

  return (
    <div>
      {!challenges.length ? (
        <div className="small">No challenges yet.</div>
      ) : (
        <>
          <div className="field">
            <label>Challenge</label>
            <select
              value={selectedChallengeId}
              onChange={(e) => setSelectedChallengeId(e.target.value)}
            >
              {challenges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ height: 12 }} />

          <div className="grid grid-2">
            {challenges.map((c) => (
              <div key={c.id} className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div style={{ fontWeight: 900 }}>{c.name}</div>
                <div className="small">{c.description || "No description"}</div>
                <div className="small" style={{ marginTop: 4 }}>
                  Metric: <b>{c.metric_type}</b>
                  {c.exercise ? <> • Exercise: <b>{c.exercise}</b></> : null}
                </div>
                <div className="small">
                  {c.start_date} → {c.end_date}
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 12 }} />

          {leaderboard?.rows?.length ? (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Athlete</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.rows.map((r, i) => (
                    <tr key={r.user_id || i}>
                      <td>{r.rank ?? i + 1}</td>
                      <td>{r.name || r.email || "—"}</td>
                      <td>{Number.isFinite(Number(r.score)) ? fmt(r.score) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="small">{busy ? "Loading challenge leaderboard…" : "No challenge results yet."}</div>
          )}
        </>
      )}
    </div>
  );
}

function GroupCompareTab({
  unit,
  members,
  library,
  compareA,
  setCompareA,
  compareB,
  setCompareB,
  compareExercise,
  setCompareExercise,
  compareData,
  onRefresh,
}) {
  const labels = Array.isArray(compareData?.user_a?.history)
  ? compareData.user_a.history.map((x) => {
      const raw = x.label || x.date;
      if (!raw) return "—";
      const d = new Date(raw);
      if (!Number.isFinite(d.getTime())) return String(raw);
      return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
    })
  : [];

  const userASeries = Array.isArray(compareData?.user_a?.history)
    ? compareData.user_a.history.map((x) =>
        Number.isFinite(Number(x.e1rm)) ? Number(x.e1rm) : null
      )
    : [];

  const userBSeries = Array.isArray(compareData?.user_b?.history)
    ? compareData.user_b.history.map((x) =>
        Number.isFinite(Number(x.e1rm)) ? Number(x.e1rm) : null
      )
    : [];

  const compareOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: "rgba(255,255,255,0.85)", boxWidth: 12 },
        },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0,0,0,0.85)",
          titleColor: "rgba(255,255,255,0.95)",
          bodyColor: "rgba(255,255,255,0.9)",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" },
          title: {
            display: true,
            text: `e1RM (${unit})`,
            color: "rgba(255,255,255,0.75)",
          },
        },
      },
    }),
    [unit]
  );

  return (
    <div>
      <div className="grid grid-4">
        <div className="field">
          <label>Athlete A</label>
          <select value={compareA} onChange={(e) => setCompareA(e.target.value)}>
            <option value="">Select…</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name || m.email}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Athlete B</label>
          <select value={compareB} onChange={(e) => setCompareB(e.target.value)}>
            <option value="">Select…</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name || m.email}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
  <label>Exercise</label>
  <select
    value={compareExercise}
    onChange={(e) => setCompareExercise(e.target.value)}
  >
    {(library || []).map((x) => (
      <option key={x} value={x}>
        {x}
      </option>
    ))}
  </select>
</div>

        <div className="field" style={{ display: "flex", alignItems: "end" }}>
          <button className="secondary" onClick={onRefresh}>
            Refresh compare
          </button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {!compareData ? (
        <div className="small">Pick two members and an exercise to compare.</div>
      ) : (
        <>
          <div className="grid grid-2">
            <div className="metric">
              <div className="k">{compareData?.user_a?.name || "Athlete A"}</div>
              <div className="v">
                {compareData?.user_a?.best_e1rm != null
                  ? `${fmt(compareData.user_a.best_e1rm)} ${unit}`
                  : "—"}
              </div>
              <div className="s">Best {compareExercise}</div>
            </div>

            <div className="metric">
              <div className="k">{compareData?.user_b?.name || "Athlete B"}</div>
              <div className="v">
                {compareData?.user_b?.best_e1rm != null
                  ? `${fmt(compareData.user_b.best_e1rm)} ${unit}`
                  : "—"}
              </div>
              <div className="s">Best {compareExercise}</div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {labels.length ? (
            <div style={{ height: 280, position: "relative" }}>
              <Line
                data={{
                  labels,
                  datasets: [
                    {
                      label: compareData?.user_a?.name || "Athlete A",
                      data: userASeries,
                      tension: 0.25,
                      borderWidth: 3,
                      pointRadius: 4,
                      pointHoverRadius: 6,
                      fill: false,
                      borderColor: "rgba(239,68,68,1)",
                      backgroundColor: "rgba(239,68,68,0.12)",
                    },
                    {
                      label: compareData?.user_b?.name || "Athlete B",
                      data: userBSeries,
                      tension: 0.25,
                      borderWidth: 3,
                      pointRadius: 4,
                      pointHoverRadius: 6,
                      fill: false,
                      borderColor: "rgba(59,130,246,1)",
                      backgroundColor: "rgba(59,130,246,0.12)",
                    },
                  ],
                }}
                options={compareOptions}
              />
            </div>
          ) : (
            <div className="small">Not enough comparison history yet.</div>
          )}
        </>
      )}
    </div>
  );
}

/* =====================
   Explorer Page
===================== */
function ExplorerPage({ token, unit, library, onInvalidToken, onError }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(library?.[0] || "Bench");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const [curveMetric, setCurveMetric] = useState("top");
  const [showSmooth, setShowSmooth] = useState(true);
  const [showPctDrop, setShowPctDrop] = useState(false);

  const [quickTop, setQuickTop] = useState("");
  const [quickReps, setQuickReps] = useState("8");
  const [quickRpe, setQuickRpe] = useState("");
  const [quickNotes, setQuickNotes] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickDate, setQuickDate] = useState(isoLocalToday());
  useEffect(() => {
    if (!picked && library?.length) setPicked(library[0]);
    if (picked && library?.length && !library.includes(picked)) setPicked(library[0]);
  }, [library, picked]);

  async function load(exName = picked) {
    try {
      setBusy(true);
      const res = await apiFetch(
        `/api/exercises/explorer?exercise=${encodeURIComponent(exName)}`,
        { token, onInvalidToken }
      );
      setData(res);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (picked) load(picked);
  }, [picked]);

  async function addQuickEntryToLog() {
  try {
    const exerciseName = String(picked || "").trim();
    if (!exerciseName) throw new Error("Pick an exercise first.");

    const top = String(quickTop || "").trim();
    const reps = String(quickReps || "").trim();
    const rpe = String(quickRpe || "").trim();
    const notes = String(quickNotes || "").trim();
    const entryDate = String(quickDate || "").trim();

    if (!entryDate) throw new Error("Pick a date.");
    if (!top) throw new Error("Enter a top weight.");
    if (!reps) throw new Error("Enter reps.");

    setQuickBusy(true);

    const nextRow = {
      exercise: exerciseName,
      source: "manual",
      planned: {
        sets_reps: "",
        load_rpe: "",
        notes: "",
        target: "",
      },
      completed: true,
      notes,
      actual: {
        top,
        reps,
        rpe,
      },
    };

    await apiFetch(`/api/daily/${entryDate}/entries`, {
      token,
      method: "POST",
      body: { entry: nextRow },
      onInvalidToken,
    });

    setQuickTop("");
    setQuickReps("8");
    setQuickRpe("");
    setQuickNotes("");

    await load(picked);
  } catch (e) {
    onError(e.message);
  } finally {
    setQuickBusy(false);
  }
}

  const filtered = useMemo(() => {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return library || [];
    return (library || []).filter((x) => String(x).toLowerCase().includes(s));
  }, [q, library]);

  useEffect(() => {
    if (!filtered.length) return;
    if (!q.trim()) return;

    const first = filtered[0];
    if (first && first !== picked) {
      setPicked(first);
    }
  }, [q, filtered, picked]);

  function repBucketToNumber(bucket) {
    const s = String(bucket || "").trim();
    if (!s) return null;
    if (s.endsWith("+")) {
      const n = Number(s.slice(0, -1));
      return Number.isFinite(n) ? n : 13;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function interpolateSeries(values) {
    const v = Array.isArray(values) ? [...values] : [];

    let lastFiniteIdx = null;
    for (let i = 0; i < v.length; i++) {
      if (Number.isFinite(v[i])) {
        lastFiniteIdx = i;
        break;
      }
    }
    if (lastFiniteIdx == null) return v;

    for (let i = lastFiniteIdx + 1; i < v.length; i++) {
      if (!Number.isFinite(v[i])) continue;

      const aIdx = lastFiniteIdx;
      const bIdx = i;
      const a = v[aIdx];
      const b = v[bIdx];
      const gap = bIdx - aIdx;

      if (gap > 1) {
        for (let k = 1; k < gap; k++) {
          const t = k / gap;
          v[aIdx + k] = a + (b - a) * t;
        }
      }
      lastFiniteIdx = i;
    }

    return v;
  }

  const best1rm = useMemo(() => {
    const e = Number(data?.best_e1rm?.e1rm);
    if (Number.isFinite(e)) return e;

    const rows = Array.isArray(data?.best_by_rep_bucket) ? data.best_by_rep_bucket : [];
    const vals = rows.map((r) => Number(r?.e1rm)).filter(Number.isFinite);
    return vals.length ? Math.max(...vals) : null;
  }, [data]);

  const curve = useMemo(() => {
    const rowsAll = Array.isArray(data?.best_by_rep_bucket) ? data.best_by_rep_bucket : [];
    const rowsRecent = Array.isArray(data?.best_by_rep_bucket_recent)
      ? data.best_by_rep_bucket_recent
      : null;

    function toPts(rows) {
      return (rows || [])
        .map((r) => ({
          bucket: r.bucket,
          reps: repBucketToNumber(r.bucket),
          top: r?.top != null ? Number(r.top) : null,
          e1rm: r?.e1rm != null ? Number(r.e1rm) : null,
        }))
        .filter(
          (p) =>
            p.reps != null &&
            (Number.isFinite(p.top) || Number.isFinite(p.e1rm))
        )
        .sort((a, b) => a.reps - b.reps);
    }

    const ptsAll = toPts(rowsAll);
    const labels = ptsAll.map((p) => p.bucket);

    const recentMap = new Map(
      (rowsRecent ? toPts(rowsRecent) : []).map((p) => [p.bucket, p])
    );

    const seriesAll = ptsAll.map((p) => {
      if (curveMetric === "e1rm") return Number.isFinite(p.e1rm) ? p.e1rm : null;
      return Number.isFinite(p.top) ? p.top : null;
    });

    const seriesRecent = rowsRecent
      ? labels.map((bucket) => {
          const p = recentMap.get(bucket);
          if (!p) return null;
          if (curveMetric === "e1rm") return Number.isFinite(p.e1rm) ? p.e1rm : null;
          return Number.isFinite(p.top) ? p.top : null;
        })
      : null;

    const smoothAll = showSmooth ? interpolateSeries(seriesAll) : null;
    const smoothRecent = showSmooth && seriesRecent ? interpolateSeries(seriesRecent) : null;

    const pctAll =
      showPctDrop && Number.isFinite(best1rm)
        ? seriesAll.map((v) => (Number.isFinite(v) ? (v / best1rm) * 100 : null))
        : null;

    const pctRecent =
      showPctDrop && Number.isFinite(best1rm) && seriesRecent
        ? seriesRecent.map((v) => (Number.isFinite(v) ? (v / best1rm) * 100 : null))
        : null;

    const pctSmoothAll =
      showPctDrop && showSmooth && pctAll ? interpolateSeries(pctAll) : null;
    const pctSmoothRecent =
      showPctDrop && showSmooth && pctRecent ? interpolateSeries(pctRecent) : null;

    return {
      labels,
      seriesAll,
      seriesRecent,
      smoothAll,
      smoothRecent,
      pctAll,
      pctRecent,
      pctSmoothAll,
      pctSmoothRecent,
      hasRecent: !!rowsRecent,
    };
  }, [data, curveMetric, showSmooth, showPctDrop, best1rm]);

  const insights = useMemo(() => {
    if (!curve?.labels?.length) return null;

    const all = showPctDrop ? curve.pctAll : curve.seriesAll;
    const recent = curve.hasRecent ? (showPctDrop ? curve.pctRecent : curve.seriesRecent) : null;

    const nums = (arr) => (Array.isArray(arr) ? arr : []).map(Number).filter(Number.isFinite);
    const allNums = nums(all);
    if (!allNums.length) return null;

    const bestAll = Math.max(...allNums);
    const bestRecent = recent ? Math.max(...nums(recent)) : null;
    const suffix = showPctDrop ? "%" : ` ${unit}`;

    let bestRep = null;
    if (Array.isArray(all)) {
      const idx = all.findIndex((v) => Number(v) === bestAll);
      if (idx >= 0) bestRep = curve.labels?.[idx] ?? null;
    }

    const idx1 = (curve.labels || []).findIndex((x) => String(x) === "1");
    const idx5 = (curve.labels || []).findIndex((x) => String(x) === "5");
    const v1 = idx1 >= 0 ? Number(all?.[idx1]) : null;
    const v5 = idx5 >= 0 ? Number(all?.[idx5]) : null;
    const diff15 = Number.isFinite(v1) && Number.isFinite(v5) ? v5 - v1 : null;

    const lines = [];

    lines.push(
      `All-time peak: ${bestAll.toFixed(showPctDrop ? 1 : 0)}${suffix}${
        bestRep ? ` at ${bestRep} reps` : ""
      }.`
    );

    if (curve.hasRecent && Number.isFinite(bestRecent)) {
      const delta = bestRecent - bestAll;
      const deltaTxt = `${delta >= 0 ? "+" : ""}${delta.toFixed(showPctDrop ? 1 : 0)}`;
      lines.push(`Recent peak vs all-time: ${deltaTxt}${suffix}.`);
    } else if (!curve.hasRecent) {
      lines.push("No recent window yet — log more sessions to unlock the recent comparison.");
    }

    if (diff15 != null) {
      const dTxt = `${diff15 >= 0 ? "+" : ""}${diff15.toFixed(showPctDrop ? 1 : 0)}`;
      lines.push(`5-rep vs 1-rep difference: ${dTxt}${suffix}.`);
    }

    return { lines };
  }, [curve, unit, showPctDrop]);

  const repPbMatrix = useMemo(() => {
  const rows = Array.isArray(data?.best_by_rep_bucket) ? data.best_by_rep_bucket : [];
  const map = new Map(rows.map((r) => [String(r.bucket), r]));
  const wanted = ["1", "2", "3", "4", "5", "6", "8", "10", "12", "13+"];

  return wanted.map((bucket) => {
    const r = map.get(bucket);
    return {
      bucket,
      top: r?.top != null ? Number(r.top) : null,
      e1rm: r?.e1rm != null ? Number(r.e1rm) : null,
      submitted_at_label:
        r?.submitted_at_label ||
        r?.date ||
        (r?.week != null ? `Week ${r.week}` : null),
    };
  });
}, [data]);

  const oneRmTrend = useMemo(() => {
    const rows = Array.isArray(data?.trend_history) ? data.trend_history : [];
    if (!rows.length) return null;

    const labels = rows.map((r) => r.label || "—");

    const actualSeries = rows.map((r) =>
      r.source === "daily" || r.source === "weekly"
        ? Number.isFinite(Number(r.e1rm))
          ? Number(r.e1rm)
          : null
        : null
    );

    const plannedSeries = rows.map((r) =>
      r.source === "program"
        ? Number.isFinite(Number(r.e1rm))
          ? Number(r.e1rm)
          : null
        : null
    );

    const topSeries = rows.map((r) =>
      Number.isFinite(Number(r.top)) ? Number(r.top) : null
    );

    return {
      labels,
      actualSeries,
      plannedSeries,
      topSeries,
      rows,
    };
  }, [data]);
    const curveOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: "rgba(255,255,255,0.85)", boxWidth: 12 },
        },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0,0,0,0.85)",
          titleColor: "rgba(255,255,255,0.95)",
          bodyColor: "rgba(255,255,255,0.9)",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          title: {
            display: true,
            text: showPctDrop
              ? "Strength curve (% of best 1RM)"
              : `${curveMetric === "e1rm" ? "e1RM" : "Top set"} (${unit})`,
            color: "rgba(255,255,255,0.75)",
          },
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" },
          suggestedMin: showPctDrop ? 50 : undefined,
          suggestedMax: showPctDrop ? 110 : undefined,
        },
      },
    }),
    [unit, curveMetric, showPctDrop]
  );

  const trendOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: "rgba(255,255,255,0.85)", boxWidth: 12 },
        },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0,0,0,0.85)",
          titleColor: "rgba(255,255,255,0.95)",
          bodyColor: "rgba(255,255,255,0.9)",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          title: {
            display: true,
            text: `Estimated 1RM (${unit})`,
            color: "rgba(255,255,255,0.75)",
          },
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
      },
    }),
    [unit]
  );

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Exercise Explorer</h2>
        <div className="small">
          Search an exercise to see best sets by rep range (1–12 + 13+).
        </div>

        <div style={{ height: 12 }} />

        <div className="field">
          <label>Search</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length) {
                setPicked(filtered[0]);
                load(filtered[0]);
              }
            }}
            placeholder="Type e.g. Bench, Squat, Row..."
          />
        </div>

        <div style={{ height: 10 }} />

        <div className="field">
          <label>Exercise</label>
          <select value={picked} onChange={(e) => setPicked(e.target.value)}>
            {filtered.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>

        <div style={{ height: 12 }} />
        <button className="secondary" onClick={() => load(picked)} disabled={busy}>
          {busy ? "…" : "Refresh"}
        </button>
      </div>

      <div className="card">
        <h2>Results</h2>

        {!data ? (
          <div className="small">Pick an exercise to load results.</div>
        ) : (
          <>
            <div className="small">
              Sets found: <b>{data.total_sets_found ?? 0}</b>
            </div>

            <div style={{ height: 10 }} />

            <div className="grid grid-2">
              <div className="metric">
                <div className="k">Best e1RM</div>
                <div className="v">
                  {data.best_e1rm?.e1rm != null ? fmt(data.best_e1rm.e1rm) : "—"}{" "}
                  <span className="small">{unit}</span>
                </div>
                <div className="s">
                  {data.best_e1rm
                    ? `${fmt(data.best_e1rm.top)} x ${data.best_e1rm.reps}`
                    : "—"}
                </div>
              </div>

              <div className="metric">
                <div className="k">Best top set</div>
                <div className="v">
                  {data.best_load?.top != null ? fmt(data.best_load.top) : "—"}{" "}
                  <span className="small">{unit}</span>
                </div>
                <div className="s">
                  {data.best_load
                    ? `${fmt(data.best_load.top)} x ${data.best_load.reps}`
                    : "—"}
                </div>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
  <div style={{ fontWeight: 900 }}>Quick add to training log</div>
  <div className="small" style={{ marginTop: 4 }}>
    Save a manual set for <b>{picked || "selected exercise"}</b> into any date in
    your daily log.
  </div>

  <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    marginTop: 10,
  }}
>
    <div className="field">
      <label>Date</label>
      <input
        type="date"
        value={quickDate}
        onChange={(e) => setQuickDate(e.target.value)}
      />
    </div>

    <div className="field">
      <label>Top ({unit})</label>
      <input
        value={quickTop}
        onChange={(e) => setQuickTop(e.target.value)}
        placeholder="e.g. 80"
      />
    </div>

    <div className="field">
      <label>Reps</label>
      <input
        value={quickReps}
        onChange={(e) => setQuickReps(e.target.value)}
        placeholder="e.g. 8"
      />
    </div>

    <div className="field">
      <label>RPE</label>
      <input
        value={quickRpe}
        onChange={(e) => setQuickRpe(e.target.value)}
        placeholder="e.g. 8"
      />
    </div>

    <div className="field">
      <label>Notes</label>
      <input
        value={quickNotes}
        onChange={(e) => setQuickNotes(e.target.value)}
        placeholder="Optional"
      />
    </div>
  </div>

  <div style={{ marginTop: 10 }}>
    <button
      className="secondary"
      onClick={addQuickEntryToLog}
      disabled={quickBusy}
    >
      {quickBusy ? "…" : "Add to log"}
    </button>
  </div>
</div>

            <div style={{ height: 12 }} />

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 900 }}>Rep strength curve</div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className={curveMetric === "top" ? "" : "secondary"}
                  onClick={() => setCurveMetric("top")}
                >
                  Best top set
                </button>
                <button
                  className={curveMetric === "e1rm" ? "" : "secondary"}
                  onClick={() => setCurveMetric("e1rm")}
                >
                  Best e1RM
                </button>
                <button
                  className={showSmooth ? "" : "secondary"}
                  onClick={() => setShowSmooth((v) => !v)}
                >
                  {showSmooth ? "Smoothing: on" : "Smoothing: off"}
                </button>
                <button
                  className={showPctDrop ? "" : "secondary"}
                  onClick={() => setShowPctDrop((v) => !v)}
                  disabled={!best1rm}
                >
                  {showPctDrop ? "% mode: on" : "% mode: off"}
                </button>
              </div>
            </div>

            <div style={{ height: 10 }} />

            {(curve?.seriesAll || []).some((v) => Number.isFinite(v)) ? (
              <div
                style={{
                  height: "280px",
                  maxHeight: "280px",
                  width: "100%",
                  position: "relative",
                  overflow: "hidden",
                  marginTop: 4,
                }}
              >
                <Line
                  data={{
                    labels: curve.labels,
                    datasets: (() => {
                      const allRaw = showPctDrop ? curve.pctAll : curve.seriesAll;
                      const allSmooth = showPctDrop ? curve.pctSmoothAll : curve.smoothAll;
                      const recentRaw = showPctDrop ? curve.pctRecent : curve.seriesRecent;
                      const recentSmooth = showPctDrop
                        ? curve.pctSmoothRecent
                        : curve.smoothRecent;
                      const sets = [];

                      sets.push({
                        label: curve.hasRecent ? "All-time best" : "Best",
                        data: allRaw,
                        tension: 0.25,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        borderColor: "rgba(239,68,68,1)",
                        backgroundColor: "rgba(239,68,68,0.10)",
                      });

                      if (showSmooth && allSmooth) {
                        sets.push({
                          label: "All-time (smoothed)",
                          data: allSmooth,
                          tension: 0.25,
                          borderWidth: 2,
                          pointRadius: 0,
                          pointHoverRadius: 0,
                          fill: false,
                          borderDash: [6, 6],
                          borderColor: "rgba(239,68,68,0.55)",
                        });
                      }

                      if (curve.hasRecent) {
                        sets.push({
                          label: "Recent 8 weeks",
                          data: recentRaw,
                          tension: 0.25,
                          borderWidth: 3,
                          pointRadius: 4,
                          pointHoverRadius: 6,
                          fill: false,
                          borderColor: "rgba(59,130,246,1)",
                        });

                        if (showSmooth && recentSmooth) {
                          sets.push({
                            label: "Recent (smoothed)",
                            data: recentSmooth,
                            tension: 0.25,
                            borderWidth: 2,
                            pointRadius: 0,
                            pointHoverRadius: 0,
                            fill: false,
                            borderDash: [6, 6],
                            borderColor: "rgba(59,130,246,0.55)",
                          });
                        }
                      }

                      return sets;
                    })(),
                  }}
                  options={curveOptions}
                />
              </div>
            ) : (
              <div className="small" style={{ marginTop: 6 }}>
                Not enough data yet to build a curve for this exercise.
              </div>
            )}

            {insights?.lines?.length ? (
              <div
                className="card"
                style={{ background: "rgba(255,255,255,0.03)", marginTop: 12 }}
              >
                <div style={{ fontWeight: 900 }}>Quick summary</div>
                <ul style={{ margin: "8px 0 0 18px" }}>
                  {insights.lines.slice(0, 5).map((t, i) => (
                    <li key={i} className="small" style={{ marginBottom: 6 }}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div style={{ height: 12 }} />
            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontWeight: 900 }}>1RM trend</div>
              <div className="small" style={{ marginTop: 4 }}>
                Logged performance over time, with planned program points shown
                separately.
              </div>

              <div style={{ height: 10 }} />

              {oneRmTrend?.labels?.length ? (
                <div
                  style={{
                    height: "280px",
                    maxHeight: "280px",
                    width: "100%",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <Line
                    data={{
                      labels: oneRmTrend.labels,
                      datasets: [
                        {
                          label: "Actual e1RM",
                          data: oneRmTrend.actualSeries,
                          tension: 0.25,
                          borderWidth: 3,
                          pointRadius: 4,
                          pointHoverRadius: 6,
                          fill: false,
                          borderColor: "rgba(239,68,68,1)",
                          backgroundColor: "rgba(239,68,68,0.12)",
                        },
                        {
                          label: "Planned e1RM",
                          data: oneRmTrend.plannedSeries,
                          tension: 0.25,
                          borderWidth: 2,
                          pointRadius: 4,
                          pointHoverRadius: 6,
                          fill: false,
                          borderDash: [6, 6],
                          borderColor: "rgba(59,130,246,1)",
                          backgroundColor: "rgba(59,130,246,0.12)",
                        },
                      ],
                    }}
                    options={trendOptions}
                  />
                </div>
              ) : (
                <div className="small" style={{ marginTop: 6 }}>
                  Not enough history yet to build a 1RM trend.
                </div>
              )}
            </div>

            <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontWeight: 900 }}>Rep PBs</div>
              <div className="small" style={{ marginTop: 4 }}>
                Best recorded set by rep target.
              </div>

              <div className="grid grid-3" style={{ marginTop: 10 }}>
                {repPbMatrix.map((r) => (
                  <div key={r.bucket} className="metric">
                    <div className="k">{r.bucket} reps</div>
                    <div className="v">
                      {r.top != null ? fmt(r.top) : "—"}{" "}
                      <span className="small">{unit}</span>
                    </div>
                    <div className="s">
                      e1RM: {r.e1rm != null ? `${fmt(r.e1rm)} ${unit}` : "—"}
                    </div>
                    <div className="s">{r.submitted_at_label || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* =====================
   Adherence Mini
===================== */
function AdherenceMini({ token, onInvalidToken, onError }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const from = useMemo(() => isoLocalNDaysAgo(13), []);
  const to = useMemo(() => isoLocalNDaysAgo(0), []);

  async function load() {
    if (!token) return;
    try {
      setBusy(true);
      const res = await apiFetch(
        `/api/adherence/program?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { token, onInvalidToken }
      );
      setData(res);
    } catch (e) {
      onError(e.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [token, from, to]);

  if (busy && !data) return <div className="small">Adherence: loading…</div>;
  if (!data) return <div className="small">Adherence: —</div>;

  if (data.reason === "no_active_program") {
    return (
      <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div style={{ fontWeight: 900 }}>Adherence (last 14 days)</div>
        <div className="small" style={{ marginTop: 6 }}>
          No active program yet — set one active to track planned vs completed.
        </div>
      </div>
    );
  }

  const planned = Number(data.planned_sessions || 0);
  const completed = Number(data.completed_sessions || 0);
  const pctVal = data.adherence_pct;
  const pctText =
    pctVal != null ? `${(Math.round(pctVal * 10) / 10).toFixed(1)}%` : "—";

  return (
    <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "baseline",
        }}
      >
        <div style={{ fontWeight: 900 }}>Adherence (last 14 days)</div>
        <div className="small">
          {data.program_name ? (
            <span>
              Program: <b>{data.program_name}</b>
            </span>
          ) : null}
        </div>
      </div>

      <div style={{ height: 10 }} />

      <div className="grid grid-3">
        <div className="metric">
          <div className="k">Planned sessions</div>
          <div className="v">{planned}</div>
        </div>
        <div className="metric">
          <div className="k">Completed</div>
          <div className="v">{completed}</div>
        </div>
        <div className="metric">
          <div className="k">Adherence</div>
          <div className="v">{pctText}</div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {(data.by_week || []).length ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Planned</th>
                <th>Completed</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {(data.by_week || []).map((w) => {
                const p = Number(w.planned || 0);
                const c = Number(w.completed || 0);
                const pc = p ? (c / p) * 100 : null;
                return (
                  <tr key={w.week_number}>
                    <td>W{w.week_number}</td>
                    <td>{p}</td>
                    <td>{c}</td>
                    <td>
                      {pc != null
                        ? `${(Math.round(pc * 10) / 10).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="small" style={{ marginTop: 8 }}>
            “Completed” = at least one actual logged set on that planned day.
          </div>
        </div>
      ) : (
        <div className="small">No planned sessions in this window.</div>
      )}

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="secondary" onClick={load} disabled={busy}>
          {busy ? "…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}

/* =====================
   Program Progress Card
===================== */
function ProgramProgressCard({ token, onInvalidToken, onError }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!token) return;
    try {
      setBusy(true);
      const d = await apiFetch(`/api/programs/active/progress`, {
        token,
        onInvalidToken,
      });
      setData(d);
    } catch (e) {
      onError(e.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  if (!data) {
    return (
      <div className="card">
        <b>Program</b>
        <div className="small">Loading…</div>
      </div>
    );
  }

  if (!data.has_program) {
    return (
      <div className="card">
        <b>Program</b>
        <div className="small">No active program.</div>
      </div>
    );
  }

  const p =
    data.progress_pct != null
      ? Math.max(0, Math.min(100, data.progress_pct))
      : null;

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 900 }}>{data.program_name || "Active program"}</div>
          <div className="small">
            {data.current_week ? (
              <>
                Week <b>{data.current_week}</b> • Day <b>{data.current_day}</b>
              </>
            ) : (
              <>Not on a scheduled session today</>
            )}
            {data.next_training_date ? (
              <>
                {" "}
                • Next: <b>{data.next_training_date}</b>
              </>
            ) : null}
          </div>
        </div>
        <button className="secondary" onClick={load} disabled={busy}>
          {busy ? "…" : "Refresh"}
        </button>
      </div>

      <div style={{ height: 10 }} />

      {p == null ? (
        <div className="small">Progress: —</div>
      ) : (
        <>
          <div className="small">
            Progress: <b>{p.toFixed(0)}%</b>
          </div>
          <div style={{ height: 8 }} />
          <div
            style={{
              width: "100%",
              height: 10,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 999,
            }}
          >
            <div
              style={{
                width: `${p}%`,
                height: 10,
                borderRadius: 999,
                background: "rgba(239,68,68,0.9)",
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* =====================
   Settings Page
===================== */
function SettingsPage({
  me,
  token,
  unit,
  library,
  exerciseLibrary,
  tracked,
  dashboardExercises,
  onInvalidToken,
  onError,
  onRefresh,
  onLibraryChanged,
  onDashboardChanged,
}) {
  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Preferences</h2>
        <div className="small">Units + account preferences.</div>
        <div style={{ height: 10 }} />

        <div className="field">
          <label>Units</label>
          <select
            value={unit}
            onChange={async (e) => {
              try {
                await apiFetch("/api/me/unit", {
                  token,
                  method: "PATCH",
                  body: { unit_pref: e.target.value },
                  onInvalidToken,
                });
                onRefresh();
              } catch (ex) {
                onError(ex.message);
              }
            }}
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </div>
            <div className="field" style={{ marginTop: 12 }}>
  <label>RPE input</label>
  <select
    value={me?.use_rpe === false ? "off" : "on"}
    onChange={async (e) => {
      try {
        await apiFetch("/api/me/preferences", {
          token,
          method: "PATCH",
          body: { use_rpe: e.target.value === "on" },
          onInvalidToken,
        });
        onRefresh();
      } catch (ex) {
        onError(ex.message);
      }
    }}
  >
    <option value="on">Show RPE</option>
    <option value="off">Hide RPE</option>
  </select>
</div>
        <div style={{ height: 14 }} />
        <div className="small">
          Signed in as <b>{me?.name || me?.email}</b>
        </div>
      </div>

      <div className="card">
        <h2>Exercises</h2>
        <div className="small">Manage the dropdown exercise list + tracked exercises.</div>
        <div style={{ height: 10 }} />

        <ExerciseLibraryManager
          token={token}
          current={exerciseLibrary}
          merged={library}
          onInvalidToken={onInvalidToken}
          onError={onError}
          onLibraryChanged={onLibraryChanged}
        />

        <hr />

        <DashboardExerciseManager
          token={token}
          dashboardExercises={dashboardExercises}
          library={library}
          onInvalidToken={onInvalidToken}
          onError={onError}
          onChanged={(list) => {
            onDashboardChanged(list);
            onRefresh();
          }}
        />

        <hr />

        <ExerciseManager
          token={token}
          tracked={tracked}
          library={library}
          onChanged={onRefresh}
          onInvalidToken={onInvalidToken}
          onError={onError}
        />
      </div>
    </div>
  );
}

/* =====================
   Daily Page
===================== */
function DailyPage({ me, token, unit, library, onInvalidToken, onError }) {
  const [date, setDate] = useState(isoLocalToday());
  const [plan, setPlan] = useState(null);
  const [day, setDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manualExercise, setManualExercise] = useState("");
  const [manualPick, setManualPick] = useState("");
  const [activeProgram, setActiveProgram] = useState(null);
  const [selectedProgramSlot, setSelectedProgramSlot] = useState("");
  const [exerciseHistory, setExerciseHistory] = useState({});
  const plannedCt = (day?.entries || []).length;
  const showRpe = me?.use_rpe !== false;
  const doneCt = (day?.entries || []).filter(
    (e) => e?.completed || String(e?.actual?.top || "").trim() !== ""
  ).length;
  const [dailyDraftNotice, setDailyDraftNotice] = useState(false);
const [dailyDraftHydrated, setDailyDraftHydrated] = useState(false);
  function normalizeDateOnly(v) {
    return String(v || "").slice(0, 10);
  }

  const programSessionOptions = useMemo(() => {
    const program = activeProgram;
    if (!program || !Array.isArray(program.blocks)) return [];

    const out = [];
    let absoluteWeek = 1;

    for (let bi = 0; bi < program.blocks.length; bi++) {
      const block = program.blocks[bi];
      const weeksInBlock = Math.max(1, Number(block?.weeks || 0));
      const days = Array.isArray(block?.days) ? block.days : [];

      for (let w = 1; w <= weeksInBlock; w++) {
        for (const dayObj of days) {
          const rows = Array.isArray(dayObj?.rows) ? dayObj.rows : [];
          const wkKey = `W${absoluteWeek}`;
          const rowsWithTargets = rows.map((r) => ({
            ...r,
            week_target: r?.week_values?.[wkKey] ?? "",
            wk_key: wkKey,
          }));

          out.push({
            key: `B${bi + 1}-W${w}-D${dayObj?.day_number}`,
            block_number: bi + 1,
            block_week: w,
            absolute_week: absoluteWeek,
            day_number: Number(dayObj?.day_number || 1),
            rows: rowsWithTargets,
            label: `Block ${bi + 1} • Week ${w} • Day ${dayObj?.day_number}`,
          });
        }
        absoluteWeek += 1;
      }
    }

    return out;
  }, [activeProgram]);

  const selectedSlotObj = useMemo(() => {
    if (!selectedProgramSlot) return null;
    return programSessionOptions.find((x) => x.key === selectedProgramSlot) || null;
  }, [selectedProgramSlot, programSessionOptions]);

  async function loadAll(nextDate = date) {
    try {
      setBusy(true);

      const ap = await apiFetch(`/api/programs/active`, {
        token,
        onInvalidToken,
      }).catch(() => null);
      setActiveProgram(ap?.program || null);

      const p = await apiFetch(
        `/api/programs/active/plan?date=${encodeURIComponent(nextDate)}`,
        { token, onInvalidToken }
      );
      setPlan(p);

      const d = await apiFetch(`/api/daily/${nextDate}`, { token, onInvalidToken });
      let dayObj = d.day || null;

      const isTrainingDay = !!p?.is_training_day;
      const hasEntries = Array.isArray(dayObj?.entries) && dayObj.entries.length > 0;

      if (isTrainingDay && !hasEntries) {
        const entries = buildEntriesFromPlanRows(p.rows);
        if (entries.length) {
          const payload = {
            unit,
            bodyweight: dayObj?.bodyweight ?? null,
            sleep_hours: dayObj?.sleep_hours ?? null,
            pec_pain_0_10: dayObj?.pec_pain_0_10 ?? null,
            zone2_mins: dayObj?.zone2_mins ?? null,
            notes: dayObj?.notes ?? null,
            entries,
          };

          await apiFetch(`/api/daily/${nextDate}`, {
            token,
            method: "PUT",
            body: payload,
            onInvalidToken,
          });

          const d2 = await apiFetch(`/api/daily/${nextDate}`, {
            token,
            onInvalidToken,
          });
          dayObj = d2.day || dayObj;
        }
      }

      setDay(dayObj);

const historySource =
  Array.isArray(dayObj?.entries) && dayObj.entries.length
    ? dayObj.entries
    : Array.isArray(p?.rows)
      ? p.rows
      : [];

await loadExerciseHistory(historySource);

if (!selectedProgramSlot && p?.block_number && p?.block_week && p?.day_number) {
  setSelectedProgramSlot(`B${p.block_number}-W${p.block_week}-D${p.day_number}`);
}
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function loadExerciseHistory(entriesOrRows) {
  try {
    const names = Array.from(
      new Set(
        (entriesOrRows || [])
          .map((x) => String(x?.exercise || "").trim())
          .filter(Boolean)
      )
    );

    if (!names.length) {
      setExerciseHistory({});
      return;
    }

    const res = await apiFetch("/api/exercises/history/batch", {
      token,
      method: "POST",
      body: { exercises: names },
      onInvalidToken,
    });

    setExerciseHistory(res?.history_by_exercise || {});
  } catch (e) {
    onError(e.message);
    setExerciseHistory({});
  }
}
  useEffect(() => {
  async function loadWithDraft() {
    await loadAll(date);

    const raw = localStorage.getItem(dailyDraftKey(date));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.entry_date === date) {
          setDay(parsed);
          setDailyDraftNotice(true);
        }
      } catch {}
    }

    setDailyDraftHydrated(true);
  }

  loadWithDraft();
}, [date]);
useEffect(() => {
  if (!dailyDraftHydrated) return;
  if (!day || !date) return;

  try {
    localStorage.setItem(
      dailyDraftKey(date),
      JSON.stringify({
        ...day,
        entry_date: date,
      })
    );
  } catch {}
}, [day, date, dailyDraftHydrated]);
  useEffect(() => {
    setManualPick("");
  }, [date]);

  function addManualRow() {
    const pickedName = String(manualExercise || manualPick || "").trim();
    if (!pickedName) return;

    const nextRow = {
      exercise: pickedName,
      source: "manual",
      planned: {
        sets_reps: "",
        load_rpe: "",
        notes: "",
        target: "",
      },
      completed: false,
      notes: "",
      actual: { top: "", reps: 3, rpe: "" },
    };

    const entries = [...(day?.entries || []), nextRow];

    setDay((prev) => ({
      ...(prev || {
        entry_date: date,
        unit,
        bodyweight: null,
        sleep_hours: null,
        pec_pain_0_10: null,
        zone2_mins: null,
        notes: null,
        is_completed: false,
        completed_at: null,
      }),
      entries,
    }));

    setManualExercise("");
    setManualPick("");
  }

  function removeEntry(idx) {
    const entries = [...(day?.entries || [])];
    entries.splice(idx, 1);
    setDay((prev) => ({ ...(prev || { entry_date: date, unit }), entries }));
  }

  async function copySelectedProgramSessionToToday() {
    try {
      const slot = selectedSlotObj || null;
      const rows =
        Array.isArray(slot?.rows) && slot.rows.length ? slot.rows : plan?.rows || [];
      if (!rows.length) return;

      const entries = buildEntriesFromPlanRows(rows);

      setBusy(true);

      const payload = {
        unit,
        bodyweight: day?.bodyweight ?? null,
        sleep_hours: day?.sleep_hours ?? null,
        pec_pain_0_10: day?.pec_pain_0_10 ?? null,
        zone2_mins: day?.zone2_mins ?? null,
        notes: day?.notes ?? null,
        entries,
        is_completed: day?.is_completed === true,
        completed_at: day?.completed_at ?? null,
      };

      await apiFetch(`/api/daily/${date}`, {
        token,
        method: "PUT",
        body: payload,
        onInvalidToken,
      });

      await loadAll(date);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDay(nextDay) {
  try {
    setBusy(true);

    await apiFetch(`/api/daily/${date}`, {
      token,
      method: "PUT",
      body: nextDay,
      onInvalidToken,
    });

    localStorage.removeItem(dailyDraftKey(date));
    setDailyDraftNotice(false);

    await loadAll(date);
  } catch (e) {
    onError(e.message);
  } finally {
    setBusy(false);
  }
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
          <input
            type="date"
            value={normalizeDateOnly(date)}
            onChange={(e) => setDate(normalizeDateOnly(e.target.value))}
          />
        </div>

        <div style={{ height: 12 }} />

        <div className="field">
          <label>Program session override</label>
          <select
            value={selectedProgramSlot}
            onChange={(e) => setSelectedProgramSlot(e.target.value)}
          >
            <option value="">Use session for selected date</option>
            {programSessionOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ height: 12 }} />

        <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontWeight: 900 }}>Plan</div>

          {!displayPlan ? (
            <div className="small">Loading…</div>
          ) : isTraining ? (
            <>
              <div className="small" style={{ marginTop: 6 }}>
                {displayPlan?.block_number ? (
                  <>
                    Block <b>{displayPlan.block_number}</b>
                    {" • "}
                    Week <b>{displayPlan.block_week || displayPlan.week_number}</b>
                    {" • "}
                    Day <b>{displayPlan.day_number}</b>
                    {" • "}
                    {displayPlan.day_title}
                  </>
                ) : (
                  <>
                    Week <b>{displayPlan.week_number}</b>
                    {" • "}
                    Day <b>{displayPlan.day_number}</b>
                    {" • "}
                    {displayPlan.day_title}
                  </>
                )}
              </div>

              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Sets x Reps</th>
                      <th>Load / RPE</th>
                      <th>Target</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(displayPlan.rows || []).map((r, i) => (
                      <tr key={i}>
                        <td>{r.exercise}</td>
                        <td>{r.sets_reps}</td>
                        <td>{r.load_rpe}</td>
                        <td>{r.week_target || "—"}</td>
                        <td>{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 12 }}>
                <button onClick={copySelectedProgramSessionToToday} disabled={busy}>
                  {busy ? "…" : "Copy selected session into today"}
                </button>
              </div>
            </>
          ) : (
            <div className="small" style={{ marginTop: 6 }}>
              Not a training day {plan?.reason ? `(${plan.reason})` : ""}.
            </div>
          )}
        </div>
      </div>

      <div>
        <div
          className="card"
          style={{ background: "rgba(255,255,255,0.03)", marginBottom: 12 }}
        >
          <div style={{ fontWeight: 900 }}>Add manual exercise</div>
          <div className="small" style={{ marginTop: 4 }}>
            Use this for extra work not on the program, or for completely unprogrammed
            sessions.
          </div>

          <div className="grid grid-2" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Pick from library</label>
              <select value={manualPick} onChange={(e) => setManualPick(e.target.value)}>
                <option value="">Select…</option>
                {(library || []).map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Or type custom</label>
              <input
                value={manualExercise}
                onChange={(e) => setManualExercise(e.target.value)}
                placeholder="e.g. Larsen Press"
              />
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <button className="secondary" onClick={addManualRow}>
              + Add manual row
            </button>
          </div>
        </div>
          
        <div className="card">
          <h2>Log</h2>
          <div className="small">Today’s entries (planned + actual).</div>
                {dailyDraftNotice ? (
  <Notice
    text="Draft restored — your day log is being auto-saved locally until you click Save day."
    onDismiss={() => setDailyDraftNotice(false)}
    actions={
      <button
        className="secondary"
        onClick={() => {
          localStorage.removeItem(dailyDraftKey(date));
          setDailyDraftNotice(false);
          loadAll(date);
        }}
      >
        Discard draft
      </button>
    }
  />
) : null}
          <div style={{ height: 10 }} />

          {!day ? (
            <div className="small">
              No log saved for this date yet. Copy the selected session or add manual
              rows.
            </div>
          ) : (
            <>
              <div className="list" style={{ marginTop: 10 }}>
                {(day.entries || []).length ? (
                  (day.entries || []).map((e, idx) => (
                    <div className="listRow" key={idx} style={{ alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 900 }}>{e.exercise}</div>
                            <div className="small" style={{ opacity: 0.8 }}>
                              {e?.source === "manual" ? "Manual entry" : "Program entry"}
                            </div>
                          </div>

                          <button className="secondary" onClick={() => removeEntry(idx)}>
                            Remove
                          </button>
                        </div>

                        <div className="small" style={{ marginTop: 4 }}>
                          {e?.source === "program" ? (
                            <>
                              Plan: <b>{e?.planned?.sets_reps || "—"}</b>
                              {" • "}
                              {e?.planned?.load_rpe || "—"}
                              {e?.planned?.target ? (
                                <>
                                  {" • "}Target: <b>{e.planned.target}</b>
                                </>
                              ) : null}
                              {e?.planned?.notes ? (
                                <>
                                  {" • "}
                                  {e.planned.notes}
                                </>
                              ) : null}
                            </>
                          ) : (
                            <>Manual row — no linked program target.</>
                          )}
                        </div>
                          {(() => {
  const hx = exerciseHistory?.[e.exercise] || {};
  const last = Array.isArray(hx.last_entries) ? hx.last_entries[0] : null;
  const prev = Array.isArray(hx.last_entries) ? hx.last_entries[1] : null;

  if (!last && !prev && !hx.best_recent_e1rm && !hx.best_all_time_e1rm) {
    return null;
  }

  return (
    <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
      History:
      {last ? (
        <>
          {" "}Last <b>{fmt(last.top)} x {last.reps}</b> ({formatPrettyDate(last.date)})
        </>
      ) : null}
      {prev ? (
        <>
          {" • "}Prev <b>{fmt(prev.top)} x {prev.reps}</b> ({formatPrettyDate(prev.date)})
        </>
      ) : null}
      {hx.best_recent_e1rm != null ? (
        <>
          {" • "}Best 8w <b>{fmt(hx.best_recent_e1rm)} {unit}</b>
        </>
      ) : null}
      {hx.best_all_time_e1rm != null ? (
        <>
          {" • "}Best all-time <b>{fmt(hx.best_all_time_e1rm)} {unit}</b>
        </>
      ) : null}
    </div>
  );
})()}
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            marginTop: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <label
                            className="small"
                            style={{ display: "flex", gap: 8, alignItems: "center" }}
                          >
                            <input
                              type="checkbox"
                              checked={!!e.completed}
                              onChange={(ev) =>
                                setEntry(idx, { completed: ev.target.checked })
                              }
                            />
                            Completed
                          </label>

                          <input
                            style={{ flex: 1, minWidth: 220 }}
                            placeholder="Notes (optional)…"
                            value={e?.notes ?? ""}
                            onChange={(ev) => setEntry(idx, { notes: ev.target.value })}
                          />
                        </div>

                        <div className={showRpe ? "grid grid-3" : "grid grid-2"} style={{ marginTop: 10 }}>
                          <div className="field">
                            <label>Top ({unit})</label>
                            <input
                              value={e?.actual?.top ?? ""}
                              onChange={(ev) => setActual(idx, { top: ev.target.value })}
                            />
                          </div>
                          <div className="field">
                            <label>Reps</label>
                            <input
                              value={e?.actual?.reps ?? 3}
                              onChange={(ev) => setActual(idx, { reps: ev.target.value })}
                            />
                          </div>
                          {showRpe ? (
  <div className="field">
    <label>RPE</label>
    <input
      value={e?.actual?.rpe ?? ""}
      onChange={(ev) => setActual(idx, { rpe: ev.target.value })}
    />
  </div>
) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="small">No entries yet.</div>
                )}
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    saveDay({
                      unit: day.unit || unit,
                      bodyweight: day.bodyweight ?? null,
                      sleep_hours: day.sleep_hours ?? null,
                      pec_pain_0_10: day.pec_pain_0_10 ?? null,
                      zone2_mins: day.zone2_mins ?? null,
                      notes: day.notes ?? null,
                      entries: day.entries || [],
                      is_completed: day.is_completed === true,
                      completed_at: day.completed_at || null,
                    })
                  }
                >
                  {busy ? "…" : "Save day"}
                </button>

                <button
                  disabled={busy || !day}
                  onClick={() =>
                    saveDay({
                      unit: day.unit || unit,
                      bodyweight: day.bodyweight ?? null,
                      sleep_hours: day.sleep_hours ?? null,
                      pec_pain_0_10: day.pec_pain_0_10 ?? null,
                      zone2_mins: day.zone2_mins ?? null,
                      notes: day.notes ?? null,
                      entries: day.entries || [],
                      is_completed: true,
                      completed_at: new Date().toISOString(),
                    })
                  }
                >
                  {busy ? "…" : day?.is_completed ? "Session completed ✓" : "Mark session complete"}
                </button>

                {day?.is_completed ? (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      saveDay({
                        unit: day.unit || unit,
                        bodyweight: day.bodyweight ?? null,
                        sleep_hours: day.sleep_hours ?? null,
                        pec_pain_0_10: day.pec_pain_0_10 ?? null,
                        zone2_mins: day.zone2_mins ?? null,
                        notes: day.notes ?? null,
                        entries: day.entries || [],
                        is_completed: false,
                        completed_at: null,
                      })
                    }
                  >
                    Undo complete
                  </button>
                ) : null}
              </div>

              {day?.is_completed ? (
                <div className="small" style={{ marginTop: 8 }}>
                  Completed at:{" "}
                  <b>
                    {day.completed_at
                      ? new Date(day.completed_at).toLocaleString()
                      : "—"}
                  </b>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* =====================
   Exercise Library Manager
===================== */
function ExerciseLibraryManager({
  token,
  current,
  merged,
  onInvalidToken,
  onError,
  onLibraryChanged,
}) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function save(next) {
    try {
      setBusy(true);
      const res = await apiFetch("/api/exercise-library", {
        token,
        method: "PUT",
        body: { exercises: next },
        onInvalidToken,
      });
      onLibraryChanged(res.exercises || []);
      setCustom("");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const n = String(custom || "").trim();
    if (!n) return;
    save(
      Array.from(new Set([...(current || []), n])).sort((a, b) =>
        a.localeCompare(b)
      )
    );
  }

  function remove(name) {
    save((current || []).filter((x) => x !== name));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Add exercise to dropdown list</label>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Tempo Pause Squat"
            disabled={busy}
          />
        </div>
        <button className="secondary" onClick={add} disabled={busy}>
          {busy ? "…" : "Add"}
        </button>
      </div>

      <div className="small" style={{ marginTop: 8 }}>
        Your custom list (adds to defaults): <b>{(current || []).length}</b> items.
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide custom exercise list" : "Show custom exercise list"}
        </button>
      </div>

      {open ? (
        <div className="list" style={{ marginTop: 10 }}>
          {(current || []).length ? (
            current.map((x) => (
              <div className="listRow" key={x}>
                <div style={{ fontWeight: 700 }}>{x}</div>
                <button className="secondary" onClick={() => remove(x)} disabled={busy}>
                  Remove
                </button>
              </div>
            ))
          ) : (
            <div className="small">No custom exercises yet — add one above.</div>
          )}
        </div>
      ) : null}

      <div className="small" style={{ marginTop: 10 }}>
        Available in dropdowns (merged): <b>{(merged || []).length}</b> exercises.
      </div>
    </div>
  );
}

function DashboardExerciseManager({
  token,
  dashboardExercises,
  library,
  onInvalidToken,
  onError,
  onChanged,
}) {
  const [pick, setPick] = useState(library?.[0] || "Bench");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPick(library?.[0] || "Bench");
  }, [library]);

  async function save(next) {
    try {
      setBusy(true);
      const res = await apiFetch("/api/dashboard-exercises", {
        token,
        method: "PUT",
        body: { dashboard_exercises: next },
        onInvalidToken,
      });
      onChanged(res.dashboard_exercises || next);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function addName(name) {
    const n = String(name || "").trim();
    if (!n) return;
    const next = Array.from(new Set([...(dashboardExercises || []), n])).slice(0, 6);
    save(next);
  }

  function removeName(name) {
    save((dashboardExercises || []).filter((x) => x !== name));
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
      <div className="small">These appear on Overview cards and charts.</div>

      <div className="field" style={{ marginTop: 10 }}>
        <label>Add to dashboard</label>
        <div style={{ display: "flex", gap: 10 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}>
            {library.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={() => addName(pick)} disabled={busy}>
            {busy ? "…" : "Add"}
          </button>
        </div>
      </div>

      <div className="list" style={{ marginTop: 12 }}>
        {(dashboardExercises || []).length ? (
          dashboardExercises.map((x) => (
            <div className="listRow" key={x}>
              <div style={{ fontWeight: 700 }}>{x}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="secondary" onClick={() => move(x, -1)} disabled={busy}>
                  ↑
                </button>
                <button className="secondary" onClick={() => move(x, 1)} disabled={busy}>
                  ↓
                </button>
                <button className="secondary" onClick={() => removeName(x)} disabled={busy}>
                  Remove
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="small">No dashboard exercises yet.</div>
        )}
      </div>
    </div>
  );
}

/* =====================
   Programs Page + Editor
===================== */
function ProgramsPage({ token, unit, library, onInvalidToken, onError }) {
  const [programs, setPrograms] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [programsOpen, setProgramsOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [editorFocus, setEditorFocus] = useState(false);
  const [incomingShares, setIncomingShares] = useState([]);
const [connections, setConnections] = useState([]);
const [shareToConnectionId, setShareToConnectionId] = useState("");
  async function loadConnections() {
  try {
    const res = await apiFetch("/api/connections", { token, onInvalidToken });
    const list = Array.isArray(res?.accepted) ? res.accepted : [];
    setConnections(list);
    if (!shareToConnectionId && list[0]?.id) {
      setShareToConnectionId(list[0].id);
    }
  } catch (e) {
    onError(e.message);
  }
}

async function loadIncomingShares() {
  try {
    const res = await apiFetch("/api/program-shares/incoming", { token, onInvalidToken });
    setIncomingShares(Array.isArray(res?.shares) ? res.shares : []);
  } catch (e) {
    onError(e.message);
  }
}
  async function load() {
    try {
      setBusy(true);
      const res = await apiFetch("/api/programs", { token, onInvalidToken });
      setPrograms(res.programs || []);
      setActiveId(res.active_program_id || null);
      setSelectedId((prev) => prev || res.active_program_id || res.programs?.[0]?.id || null);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
async function shareProgramToConnection(programId) {
  try {
    if (!shareToConnectionId) {
      throw new Error("Pick a connection first");
    }

    await apiFetch(`/api/programs/${programId}/share-to-connection`, {
      token,
      method: "POST",
      body: {
        connection_id: shareToConnectionId,
        message: "",
      },
      onInvalidToken,
    });

    alert("Program shared");
    await loadIncomingShares();
  } catch (e) {
    onError(e.message);
  }
}
async function copyIncomingShare(shareId) {
  try {
    await apiFetch(`/api/program-shares/${shareId}/copy`, {
      token,
      method: "POST",
      onInvalidToken,
    });

    await load();
    await loadIncomingShares();
    alert("Program copied to your programs");
  } catch (e) {
    onError(e.message);
  }
}
  useEffect(() => {
  load();
  loadConnections();
  loadIncomingShares();
}, []);

  const selected = useMemo(
    () => programs.find((p) => p.id === selectedId) || null,
    [programs, selectedId]
  );

  const active = useMemo(
    () => programs.find((p) => p.id === activeId) || null,
    [programs, activeId]
  );

  async function createProgram() {
    try {
      const name = prompt("Program name?", "New program") || "New program";
      const blocks = Number(prompt("How many blocks? (1–8)", "3") || 3);
      const days = Number(prompt("Training days per week? (1–7)", "4") || 4);

      const weeks_per_block = [];
      for (let i = 0; i < blocks; i++) {
        const wi = Number(prompt(`Weeks in Block ${i + 1}?`, "4") || 4);
        weeks_per_block.push(wi);
      }

      setBusy(true);
      const res = await apiFetch("/api/programs", {
        token,
        method: "POST",
        body: { name, blocks, days_per_week: days, weeks_per_block },
        onInvalidToken,
      });

      const p = res.program;
      setPrograms((prev) => [p, ...prev]);
      setSelectedId(p.id);
      setEditorFocus(true);
      if (!activeId) setActiveId(p.id);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function activate(id) {
    try {
      setBusy(true);
      await apiFetch(`/api/programs/${id}/activate`, {
        token,
        method: "POST",
        onInvalidToken,
      });
      setActiveId(id);
      setSelectedId(id);
      await load();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeProgram(id) {
    if (!confirm("Delete this program?")) return;

    try {
      setBusy(true);
      const res = await apiFetch(`/api/programs/${id}`, {
        token,
        method: "DELETE",
        onInvalidToken,
      });

      setPrograms((prev) => prev.filter((p) => p.id !== id));
      setActiveId(res.active_program_id || null);
      setSelectedId(res.active_program_id || null);
      localStorage.removeItem(draftKey(id));
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProgram(p) {
    try {
      setBusy(true);
      const res = await apiFetch(`/api/programs/${p.id}`, {
        token,
        method: "PUT",
        body: p,
        onInvalidToken,
      });

      const saved = res.program || p;
      setPrograms((prev) => prev.map((x) => (x.id === p.id ? saved : x)));
      localStorage.removeItem(draftKey(p.id));
      await load();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProgramSettings(programId, settingsPatch) {
    try {
      setBusy(true);
      const res = await apiFetch(`/api/programs/${programId}/settings`, {
        token,
        method: "PATCH",
        body: settingsPatch,
        onInvalidToken,
      });

      const updated = res.program || {};
      setPrograms((prev) =>
        prev.map((p) =>
          p.id === programId
            ? {
                ...p,
                start_date: updated.start_date,
                training_days: updated.training_days,
              }
            : p
        )
      );
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="programs-shell">
      {editorFocus ? (
        <div className="focus-toggles">
          <button className="secondary" type="button" onClick={() => setEditorFocus(false)}>
            Exit focus
          </button>

          <button
            className="secondary"
            type="button"
            onClick={() => {
              setEditorFocus(false);
              setProgramsOpen(true);
            }}
          >
            Show Programs
          </button>

          <button
            className="secondary"
            type="button"
            onClick={() => {
              setEditorFocus(false);
              setSummaryOpen(true);
            }}
          >
            Show Summary
          </button>
        </div>
      ) : null}

      <div className={`programs-layout ${editorFocus ? "editor-focus" : ""}`}>
        {!editorFocus && programsOpen ? (
          <div className="card programs-panel">
            <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
  }}
  onClick={() => setProgramsOpen(false)}
>
  <div>
    <h2 style={{ margin: 0 }}>Programs</h2>
    <div className="small">
      Build blocks like your spreadsheet. Drafts auto-save locally.
    </div>
  </div>
  <div style={{ fontWeight: 900 }}>▾</div>
</div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={createProgram} disabled={busy}>
                {busy ? "…" : "New program"}
              </button>
              <button className="secondary" onClick={load} disabled={busy}>
                {busy ? "…" : "Refresh"}
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
  <div className="field">
    <label>Share to connection</label>
    <select
      value={shareToConnectionId}
      onChange={(e) => setShareToConnectionId(e.target.value)}
    >
      <option value="">Select connection…</option>
      {connections.map((c) => (
        <option key={c.id} value={c.id}>
          {(c.other_name || c.other_email) + " • " + c.relationship_type}
        </option>
      ))}
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
            <div className="small">
              From <b>{s.shared_by_name || s.shared_by_email || "—"}</b>
            </div>
            <div className="small">
              {s.total_weeks || 0} weeks • {s.days_per_week || 4} days/week
            </div>
            <div className="small">Status: <b>{s.status}</b></div>
          </div>

          <button
            className="secondary"
            onClick={() => copyIncomingShare(s.id)}
            disabled={busy || s.status === "copied"}
          >
            {s.status === "copied" ? "Copied" : "Copy to my programs"}
          </button>
        </div>
      ))}
    </div>
  ) : (
    <div className="small">No incoming shared programs.</div>
  )}
</div>
            <div style={{ height: 14 }} />

            <div className="list">
              {(programs || []).length ? (
                programs.map((p) => (
                  <div className="program-card" key={p.id}>
  <div className="program-card-top">
    <div className="program-card-title">
      <span>{p.name}</span>
      {activeId === p.id ? <span className="pill">Active</span> : null}
      {hasDraft(p.id) ? (
        <span className="pill" style={{ borderColor: "#1f3a8a" }}>
          Draft
        </span>
      ) : null}
    </div>

    <div className="program-card-actions">
      <button
        className="secondary"
        onClick={() => {
          setSelectedId(p.id);
          setEditorFocus(true);
        }}
        disabled={busy}
      >
        Edit
      </button>

      <button
        className="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(p.id);
            alert("Program ID copied");
          } catch {
            alert(`Program ID: ${p.id}`);
          }
        }}
        disabled={busy}
      >
        Copy ID
      </button>

      <button
        className="secondary"
        onClick={() => activate(p.id)}
        disabled={busy || activeId === p.id}
      >
        Set active
      </button>

      <button
        className="secondary"
        onClick={() => removeProgram(p.id)}
        disabled={busy}
      >
        Delete
      </button>
      <button
  className="secondary"
  onClick={() => shareProgramToConnection(p.id)}
  disabled={busy || !shareToConnectionId}
>
  Share
</button>
    </div>
  </div>

  <div className="small" style={{ marginTop: 10 }}>
    {p.total_weeks || sumWeeks(p.blocks)} weeks • {p.days_per_week || 4} days/week
  </div>

  <div className="small" style={{ marginTop: 4, opacity: 0.85 }}>
    Start: <b>{p.start_date ? formatPrettyDate(p.start_date) : "—"}</b>
  </div>

  <div className="small" style={{ marginTop: 4, opacity: 0.85, wordBreak: "break-all" }}>
    Program ID: <b>{p.id}</b>
  </div>
</div>
                ))
              ) : (
                <div className="small">No programs yet — create one.</div>
              )}
            </div>
          </div>
        ) : null}

        {!editorFocus && !programsOpen ? (
          <div className="card programs-panel programs-panel-collapsed">
            <button className="secondary" onClick={() => setProgramsOpen(true)}>
              Show Programs
            </button>
          </div>
        ) : null}

        {!editorFocus && summaryOpen ? (
          <div className="card summary-panel">
            <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
  }}
  onClick={() => setSummaryOpen(false)}
>
  
  <div>
    <h2 style={{ margin: 0 }}>Summary</h2>
    <div className="small">Active program + quick stats.</div>
  </div>
  <div style={{ fontWeight: 900 }}>▾</div>
</div>

            <div style={{ height: 12 }} />

            {active ? (
              <>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{active.name}</div>
                <div className="small" style={{ marginTop: 6 }}>
                  {active.total_weeks || sumWeeks(active.blocks)} weeks • {active.days_per_week || 4} days/week •{" "}
                  {(active.blocks || []).length} blocks
                </div>
                <div className="small" style={{ marginTop: 4 }}>
  Start date: <b>{active.start_date ? formatPrettyDate(active.start_date) : "—"}</b>
</div>
                <div className="small" style={{ marginTop: 4 }}>
  Program ID: <b>{active.id}</b>
</div>
                <div style={{ height: 12 }} />

                <div className="list">
                  {(active.blocks || []).slice(0, 6).map((b, i) => (
                    <div className="listRow" key={i} style={{ alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800 }}>{b.title || `Block ${i + 1}`}</div>
                        <div className="small">
                          {Number(b.weeks || 0) || 0} weeks • {(b.days || []).length} days
                        </div>
                      </div>
                    </div>
                  ))}
                  {(active.blocks || []).length > 6 ? (
                    <div className="small">
                      …and {(active.blocks || []).length - 6} more blocks
                    </div>
                  ) : null}
                </div>

                <div style={{ height: 12 }} />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (active) {
                        setSelectedId(active.id);
                        setEditorFocus(true);
                      }
                    }}
                    disabled={busy}
                  >
                    Edit active
                  </button>

                  {selected && activeId !== selected.id ? (
                    <button
                      className="secondary"
                      onClick={() => activate(selected.id)}
                      disabled={busy}
                    >
                      Set selected active
                    </button>
                  ) : null}

                  <button className="secondary" onClick={load} disabled={busy}>
                    {busy ? "…" : "Refresh"}
                  </button>
                </div>
              </>
            ) : (
              <div className="small">
                No active program yet — create one, then set it active.
              </div>
            )}
          </div>
        ) : null}

        {!editorFocus && !summaryOpen ? (
          <div className="card summary-panel summary-panel-collapsed">
            <button className="secondary" onClick={() => setSummaryOpen(true)}>
              Show Summary
            </button>
          </div>
        ) : null}
        <div className="card editor-panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ margin: 0 }}>Editor</h2>

            {!editorFocus ? (
              <button className="secondary" onClick={() => setEditorFocus(true)}>
                Focus editor
              </button>
            ) : null}
          </div>

          <div style={{ height: 12 }} />

          {!selected ? (
            <div className="small">Pick a program to edit.</div>
          ) : (
            <>
              <ProgramScheduleEditor
                program={selected}
                busy={busy}
                onSave={saveProgramSettings}
              />

              <div style={{ height: 16 }} />

              <ProgramEditor
                program={selected}
                unit={unit}
                library={library}
                token={token}
                onSave={saveProgram}
                busy={busy}
                onInvalidToken={onInvalidToken}
                onError={onError}
              />
            </>
          )}
        </div>
        </div>
      </div>
  );
}

function ProgramScheduleEditor({ program, busy, onSave }) {
  const [startDate, setStartDate] = useState(program?.start_date || "");
  const [trainingDays, setTrainingDays] = useState(
    Array.isArray(program?.training_days) && program.training_days.length
      ? program.training_days.map(Number)
      : [1, 3, 5, 6]
  );

  useEffect(() => {
    setStartDate(program?.start_date || "");
    setTrainingDays(
      Array.isArray(program?.training_days) && program.training_days.length
        ? program.training_days.map(Number)
        : [1, 3, 5, 6]
    );
  }, [program]);

  const dayLabels = [
    { n: 0, label: "Sun" },
    { n: 1, label: "Mon" },
    { n: 2, label: "Tue" },
    { n: 3, label: "Wed" },
    { n: 4, label: "Thu" },
    { n: 5, label: "Fri" },
    { n: 6, label: "Sat" },
  ];

  function toggleDay(n) {
    setTrainingDays((prev) => {
      const has = prev.includes(n);
      const next = has ? prev.filter((x) => x !== n) : [...prev, n];
      return next.sort((a, b) => a - b);
    });
  }

  async function saveSettings() {
    await onSave(program.id, {
      start_date: startDate || null,
      training_days: trainingDays,
    });
  }

  return (
    <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontWeight: 900 }}>Program schedule</div>
      <div className="small" style={{ marginTop: 4 }}>
        This drives the Daily page and maps the plan onto calendar dates.
      </div>

      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Program start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="field">
          <label>Training days</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {dayLabels.map((d) => {
              const active = trainingDays.includes(d.n);
              return (
                <button
  key={d.n}
  type="button"
  className={active ? "day-chip active" : "day-chip"}
  onClick={() => toggleDay(d.n)}
  disabled={busy}
>
  {d.label}
</button>

              );
            })}
            <div className="small" style={{ marginTop: 8, opacity: 0.85 }}>
  Selected:{!trainingDays.length ? (
  <div className="small" style={{ marginTop: 6, color: "#fca5a5" }}>
    Pick at least one training day before saving.
  </div>
) : null}
  <b>
    {trainingDays.length
      ? dayLabels
          .filter((d) => trainingDays.includes(d.n))
          .map((d) => d.label)
          .join(", ")
      : "None"}
  </b>
</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={saveSettings} disabled={busy || !trainingDays.length}>
          {busy ? "Saving…" : "Save schedule settings"}
        </button>
      </div>
    </div>
  );
}

function ProgramEditor({
  program,
  library,
  unit,
  token,
  onSave,
  busy,
  onInvalidToken,
  onError,
}) {
  const [p, setP] = useState(program);
  const [draftNotice, setDraftNotice] = useState(false);
  const [openBlock, setOpenBlock] = useState(0);
  const [openDayByBlock, setOpenDayByBlock] = useState({ 0: 0 });
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    const k = draftKey(program.id);
    const raw = localStorage.getItem(k);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id === program.id) {
          setP(parsed);
          setDraftNotice(true);
          setDraftHydrated(true);
          return;
        }
      } catch {}
    }

    setP(program);
    setDraftNotice(false);
    setDraftHydrated(true);
  }, [program]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (!p?.id) return;

    try {
      localStorage.setItem(draftKey(p.id), JSON.stringify(p));
    } catch {}
  }, [p, draftHydrated]);

  function discardDraft() {
    localStorage.removeItem(draftKey(p.id));
    setP(program);
    setDraftNotice(false);
  }

  function toggleBlock(i) {
    setOpenBlock((prev) => (prev === i ? null : i));
    setOpenDayByBlock((prev) => ({ ...prev, [i]: prev[i] ?? 0 }));
  }

  function toggleDay(blockIdx, dayIdx) {
    setOpenDayByBlock((prev) => ({
      ...prev,
      [blockIdx]: prev[blockIdx] === dayIdx ? null : dayIdx,
    }));
  }

  function update(field, value) {
    setP((prev) => ({ ...prev, [field]: value }));
  }

  function updateBlock(blockIdx, patch) {
    setP((prev) => {
      const blocks = [...(prev.blocks || [])];
      blocks[blockIdx] = { ...blocks[blockIdx], ...patch };
      return { ...prev, blocks, total_weeks: sumWeeks(blocks) };
    });
  }

  function setDayRows(blockIdx, dayIdx, rows) {
    setP((prev) => {
      const blocks = [...(prev.blocks || [])];
      const days = [...(blocks[blockIdx]?.days || [])];
      days[dayIdx] = { ...days[dayIdx], rows };
      blocks[blockIdx] = { ...blocks[blockIdx], days };
      return { ...prev, blocks, total_weeks: sumWeeks(blocks) };
    });
  }

  function addRow(blockIdx, dayIdx, weekKeys) {
    const row = {
      id: (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase(),
      exercise: library[0] || "Bench",
      sets_reps: "3x5",
      load_rpe: "RPE 7",
      notes: "",
      week_values: Object.fromEntries(weekKeys.map((k) => [k, ""])),
    };

    const day = p.blocks[blockIdx].days[dayIdx];
    setDayRows(blockIdx, dayIdx, [...(day.rows || []), row]);
  }

  function updateRow(blockIdx, dayIdx, rowId, patch) {
    const day = p.blocks[blockIdx].days[dayIdx];
    const rows = (day.rows || []).map((r) => (r.id === rowId ? { ...r, ...patch } : r));
    setDayRows(blockIdx, dayIdx, rows);
  }

  function updateWeekValue(blockIdx, dayIdx, rowId, wk, value) {
    const day = p.blocks[blockIdx].days[dayIdx];
    const rows = (day.rows || []).map((r) => {
      if (r.id !== rowId) return r;
      return { ...r, week_values: { ...(r.week_values || {}), [wk]: value } };
    });
    setDayRows(blockIdx, dayIdx, rows);
  }

  function deleteRow(blockIdx, dayIdx, rowId) {
    const day = p.blocks[blockIdx].days[dayIdx];
    setDayRows(
      blockIdx,
      dayIdx,
      (day.rows || []).filter((r) => r.id !== rowId)
    );
  }

  function addBlock() {
    setP((prev) => {
      const blocks = [...(prev.blocks || [])];
      const nextNum = blocks.length + 1;
      const daysPerWeek = prev.days_per_week || 4;

      const days = Array.from({ length: daysPerWeek }, (_, di) => ({
        day_number: di + 1,
        title: `Day ${di + 1}`,
        rows: [],
      }));

      blocks.push({
        block_number: nextNum,
        title: `Block ${nextNum}`,
        intent: "",
        rpe_range: "",
        weeks: 4,
        days,
      });

      return { ...prev, blocks, total_weeks: sumWeeks(blocks) };
    });
  }

  function removeBlock(blockIdx) {
    if (!confirm("Remove this block?")) return;

    setP((prev) => {
      let blocks = [...(prev.blocks || [])].filter((_, i) => i !== blockIdx);
      blocks = blocks.map((b, i) => ({
        ...b,
        block_number: i + 1,
        title: b.title || `Block ${i + 1}`,
      }));
      return { ...prev, blocks, total_weeks: sumWeeks(blocks) };
    });
  }

  return (
    <div>
      {draftNotice ? (
        <Notice
          text="Draft restored — your edits are saved locally until you click “Save program”."
          onDismiss={() => setDraftNotice(false)}
          actions={
            <button className="secondary" onClick={discardDraft} disabled={busy}>
              Discard draft
            </button>
          }
        />
      ) : null}

      <div className="grid grid-2">
        <div className="field">
          <label>Program name</label>
          <input value={p.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div className="field">
          <label>Days / week</label>
          <input
            value={p.days_per_week || 4}
            onChange={(e) => update("days_per_week", Number(e.target.value || 4))}
          />
        </div>
      </div>

      <div className="small" style={{ marginTop: 8 }}>
        Total weeks: <b>{p.total_weeks || sumWeeks(p.blocks)}</b>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="secondary" onClick={addBlock} disabled={busy}>
          + Add block
        </button>
      </div>

      <div style={{ height: 12 }} />

      {(p.blocks || []).map((block, blockIdx) => {
        const weeksInBlock = Math.max(1, Number(block.weeks || 4));
        const offset = (p.blocks || [])
          .slice(0, blockIdx)
          .reduce((a, b) => a + (Number(b.weeks) || 0), 0);

        const weekKeys = Array.from(
          { length: weeksInBlock },
          (_, i) => `W${offset + i + 1}`
        );

        const blockLabel = `BLOCK ${blockIdx + 1} — Weeks ${offset + 1}–${
          offset + weeksInBlock
        }`;
        const isBlockOpen = openBlock === blockIdx;

        return (
  <div key={blockIdx} className="program-block">
            <div
              className="blockHeader"
              style={{ cursor: "pointer" }}
              onClick={() => toggleBlock(blockIdx)}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontWeight: 900 }}>
                  {isBlockOpen ? "▼" : "▶"} {blockLabel}
                </div>
                <button
                  className="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBlock(blockIdx);
                  }}
                  disabled={busy || (p.blocks || []).length <= 1}
                >
                  Remove block
                </button>
              </div>

              {isBlockOpen ? (
                <div
                  className="grid grid-4"
                  style={{ marginTop: 10 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="field">
                    <label>Title</label>
                    <input
                      value={block.title || ""}
                      onChange={(e) => updateBlock(blockIdx, { title: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Intent</label>
                    <input
                      value={block.intent || ""}
                      onChange={(e) => updateBlock(blockIdx, { intent: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>RPE range</label>
                    <input
                      value={block.rpe_range || ""}
                      onChange={(e) =>
                        updateBlock(blockIdx, { rpe_range: e.target.value })
                      }
                      placeholder="e.g. 6.5–8"
                    />
                  </div>
                  <div className="field">
                    <label>Weeks in block</label>
                    <input
                      value={weeksInBlock}
                      onChange={(e) =>
                        updateBlock(blockIdx, { weeks: Number(e.target.value || 4) })
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ height: 12 }} />

            {isBlockOpen
              ? (block.days || []).map((day, dayIdx) => {
                  const isDayOpen = openDayByBlock?.[blockIdx] === dayIdx;

                  return (
                    <div key={day.day_number} style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                          cursor: "pointer",
                        }}
                        onClick={() => toggleDay(blockIdx, dayIdx)}
                      >
                        <div style={{ fontWeight: 900 }}>
                          {isDayOpen ? "▼" : "▶"} {day.title || `Day ${day.day_number}`}
                        </div>
                        <button
                          className="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            addRow(blockIdx, dayIdx, weekKeys);
                          }}
                          disabled={busy}
                        >
                          + Add exercise
                        </button>
                      </div>

                      {isDayOpen ? (
                        <div className="sheet-wrapper">
  <table className="sheetTable">
                            <thead>
                              <tr>
                                <th>Exercise</th>
<th>Sets x Reps</th>
<th>Load / RPE</th>
<th>Notes</th>
                                {weekKeys.map((wk) => (
                                  <th key={wk} style={{ minWidth: 90 }}>
                                    {wk}
                                  </th>
                                ))}
                                <th style={{ minWidth: 90 }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(day.rows || []).length ? (
                                day.rows.map((row) => (
                                  <tr key={row.id}>
                                    <td>
                                      <select
                                        value={row.exercise}
                                        onChange={(e) =>
                                          updateRow(blockIdx, dayIdx, row.id, {
                                            exercise: e.target.value,
                                          })
                                        }
                                      >
                                        {library.map((x) => (
                                          <option key={x} value={x}>
                                            {x}
                                          </option>
                                        ))}
                                        {!library.includes(row.exercise) ? (
                                          <option value={row.exercise}>
                                            {row.exercise}
                                          </option>
                                        ) : null}
                                      </select>
                                    </td>
                                    <td>
                                      <input
                                        value={row.sets_reps || ""}
                                        onChange={(e) =>
                                          updateRow(blockIdx, dayIdx, row.id, {
                                            sets_reps: e.target.value,
                                          })
                                        }
                                      />
                                    </td>
                                    <td>
                                      <input
                                        value={row.load_rpe || ""}
                                        onChange={(e) =>
                                          updateRow(blockIdx, dayIdx, row.id, {
                                            load_rpe: e.target.value,
                                          })
                                        }
                                        placeholder={`e.g. RPE 7, 75%, ${unit}`}
                                      />
                                    </td>
                                    <td>
                                      <input
                                        value={row.notes || ""}
                                        onChange={(e) =>
                                          updateRow(blockIdx, dayIdx, row.id, {
                                            notes: e.target.value,
                                          })
                                        }
                                      />
                                    </td>
                                    {weekKeys.map((wk) => (
                                      <td key={wk}>
                                        <input
                                          value={(row.week_values || {})[wk] ?? ""}
                                          onChange={(e) =>
                                            updateWeekValue(
                                              blockIdx,
                                              dayIdx,
                                              row.id,
                                              wk,
                                              e.target.value
                                            )
                                          }
                                        />
                                      </td>
                                    ))}
                                    <td>
                                      <button
                                        className="secondary"
                                        onClick={() =>
                                          deleteRow(blockIdx, dayIdx, row.id)
                                        }
                                        disabled={busy}
                                      >
                                        Delete
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5 + weekKeys.length} className="small">
                                    No exercises yet — click “Add exercise”.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              : null}
          </div>
        );
      })}

      <button onClick={() => onSave(p)} disabled={busy}>
        {busy ? "Saving…" : "Save program"}
      </button>

      <div className="small" style={{ marginTop: 10 }}>
        Drafts auto-save while editing — you can switch pages without losing work.
      </div>
    </div>
  );
}

/* =====================
   Auth
===================== */
function Auth({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("Jack");
  const [password, setPassword] = useState("");
  const [localErr, setLocalErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    try {
      setBusy(true);
      setLocalErr("");

      const path = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body =
        mode === "register"
          ? { email, name, password, unit_pref: "kg" }
          : { email, password };

      const res = await apiFetch(path, { method: "POST", body });

      const accessToken =
        (typeof res?.access_token === "string" && res.access_token.trim()) ||
        (typeof res?.token?.access_token === "string" &&
          res.token.access_token.trim()) ||
        (typeof res?.token === "string" && res.token.trim()) ||
        "";

      if (!accessToken) {
        throw new Error("Login succeeded but no access token was returned.");
      }

      onAuthed(accessToken);
    } catch (e) {
      setLocalErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{mode === "register" ? "Create account" : "Login"}</h2>
      {localErr ? (
        <div className="small" style={{ color: "#fecaca", marginBottom: 10 }}>
          {localErr}
        </div>
      ) : null}

      <div className="grid grid-2">
        <div className="field">
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
          />
        </div>

        {mode === "register" ? (
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 10 }} className="field">
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={submit} disabled={busy}>
          {busy ? "…" : mode === "register" ? "Register" : "Login"}
        </button>
        <button
          className="secondary"
          onClick={() => setMode(mode === "register" ? "login" : "register")}
          disabled={busy}
        >
          {mode === "register" ? "Have an account? Login" : "New here? Register"}
        </button>
      </div>
    </div>
  );
}

/* =====================
   Tracked Exercises
===================== */
function ExerciseManager({
  token,
  tracked,
  library,
  onChanged,
  onInvalidToken,
  onError,
}) {
  const [pick, setPick] = useState(library[0] || "Bench");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPick(library[0] || "Bench");
  }, [library]);

  async function save(next) {
    try {
      setBusy(true);
      await apiFetch("/api/tracked-exercises", {
        token,
        method: "PUT",
        body: { tracked_exercises: next },
        onInvalidToken,
      });
      onChanged();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function addName(name) {
    const n = String(name || "").trim();
    if (!n) return;
    const next = Array.from(new Set([...(tracked || []), n]));
    save(next);
  }

  function removeName(name) {
    save((tracked || []).filter((x) => x !== name));
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
      <div className="small">These drive weekly log, trends, and group comparisons.</div>

      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Add from list</label>
          <div style={{ display: "flex", gap: 10 }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}>
              {library.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <button
              className="secondary"
              onClick={() => addName(pick)}
              disabled={busy}
            >
              {busy ? "…" : "Add"}
            </button>
          </div>
        </div>

        <div className="field">
          <label>Add custom</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. Safety Bar Squat"
              disabled={busy}
            />
            <button
              className="secondary"
              onClick={() => {
                addName(custom);
                setCustom("");
              }}
              disabled={busy}
            >
              {busy ? "…" : "Add"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="list">
        {(tracked || []).length ? (
          tracked.map((x) => (
            <div className="listRow" key={x}>
              <div style={{ fontWeight: 700 }}>{x}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="secondary" onClick={() => move(x, -1)} disabled={busy}>
                  ↑
                </button>
                <button className="secondary" onClick={() => move(x, 1)} disabled={busy}>
                  ↓
                </button>
                <button
                  className="secondary"
                  onClick={() => removeName(x)}
                  disabled={busy}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="small">No exercises yet — add some above.</div>
        )}
      </div>
    </div>
  );
}

/* =====================
   Weekly Entry
===================== */
function WeeklyEntry({ token, unit, tracked, onSaved, onInvalidToken, onError }) {
  const [week, setWeek] = useState(1);
  const [meta, setMeta] = useState({
    bodyweight: "",
    sleep_hours: "",
    pec_pain_0_10: "",
    zone2_mins: "",
    notes: "",
  });
  const [entries, setEntries] = useState(() =>
    (tracked || []).map((exercise) => ({
      exercise,
      top: "",
      reps: 3,
      rpe: "",
    }))
  );

  useEffect(() => {
    setEntries((prev) => {
      const map = new Map(prev.map((e) => [e.exercise, e]));
      return (tracked || []).map(
        (ex) => map.get(ex) || { exercise: ex, top: "", reps: 3, rpe: "" }
      );
    });
  }, [tracked]);

  function setEntry(exercise, patch) {
    setEntries((prev) =>
      prev.map((e) => (e.exercise === exercise ? { ...e, ...patch } : e))
    );
  }

  async function save() {
    try {
      const payload = { unit, ...meta, entries };
      await apiFetch(`/api/weekly/${week}`, {
        token,
        method: "PUT",
        body: payload,
        onInvalidToken,
      });
      onSaved();
    } catch (e) {
      onError(e.message);
    }
  }

  async function autofillFromDaily() {
    try {
      const res = await apiFetch(`/api/weekly/from-daily/${week}`, {
        token,
        method: "POST",
        body: { unit },
        onInvalidToken,
      });

      if (Array.isArray(res.derived_entries)) {
        setEntries(
          res.derived_entries.map((e) => ({
            exercise: e.exercise,
            top: e.top ?? "",
            reps: e.reps ?? 3,
            rpe: e.rpe ?? "",
          }))
        );
      }

      onSaved();
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <>
      <h2>Weekly log</h2>
      <div className="weeklyGridTop">
        <div className="field">
          <label>Week</label>
          <input value={week} onChange={(e) => setWeek(e.target.value)} />
        </div>
        <div className="field">
          <label>Bodyweight ({unit})</label>
          <input
            value={meta.bodyweight}
            onChange={(e) => setMeta({ ...meta, bodyweight: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Sleep (h)</label>
          <input
            value={meta.sleep_hours}
            onChange={(e) => setMeta({ ...meta, sleep_hours: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Pain/Niggles (0–10)</label>
          <input
            value={meta.pec_pain_0_10}
            onChange={(e) => setMeta({ ...meta, pec_pain_0_10: e.target.value })}
          />
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div className="liftsGrid">
        {(tracked || []).map((ex) => {
          const e =
            entries.find((x) => x.exercise === ex) || {
              exercise: ex,
              top: "",
              reps: 3,
              rpe: "",
            };

          return (
            <div className="liftCard" key={ex}>
              <div className="liftHeader">{ex}</div>
              <div className="field">
                <label>Top set ({unit})</label>
                <input
                  value={e.top}
                  onChange={(ev) => setEntry(ex, { top: ev.target.value })}
                />
              </div>
              <div style={{ height: 10 }} />
              <div className="liftRow2">
                <div className="field">
                  <label>Reps</label>
                  <input
                    value={e.reps}
                    onChange={(ev) => setEntry(ex, { reps: ev.target.value })}
                  />
                </div>
                <div className="field">
                  <label>RPE</label>
                  <input
                    value={e.rpe}
                    onChange={(ev) => setEntry(ex, { rpe: ev.target.value })}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 14 }} />

      <div className="weeklyGridBottom">
        <div className="field">
          <label>Zone2 (mins)</label>
          <input
            value={meta.zone2_mins}
            onChange={(e) => setMeta({ ...meta, zone2_mins: e.target.value })}
          />
        </div>
        <div className="field weeklyNotes">
          <label>Notes</label>
          <input
            value={meta.notes}
            onChange={(e) => setMeta({ ...meta, notes: e.target.value })}
          />
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={save}>Save week</button>
        <button className="secondary" onClick={autofillFromDaily}>
          Auto-fill from Daily
        </button>
      </div>
    </>
  );
}

/* =====================
   Dashboard + Charts + Weeks Table
===================== */
function Dashboard({ weekly, dailyOverview, unit, tracked, activeProgram }) {
  const latest = useMemo(
    () => (weekly?.length ? weekly[weekly.length - 1] : null),
    [weekly]
  );

  const dailyBestByExercise = useMemo(() => {
    const out = {};
    for (const ex of tracked || []) {
      const norm = normalizeExerciseName(ex);

      for (const day of dailyOverview || []) {
        const entries = Array.isArray(day?.entries) ? day.entries : [];
        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== norm) continue;

          const val = e1rmFromTopReps(
            e?.actual?.top ?? e?.top,
            e?.actual?.reps ?? e?.reps
          );

          if (!Number.isFinite(val)) continue;
          if (!Number.isFinite(out[ex]) || val > out[ex]) out[ex] = val;
        }
      }
    }
    return out;
  }, [dailyOverview, tracked]);

  const dailyLatestByExercise = useMemo(() => {
  const out = {};
  const sorted = [...(dailyOverview || [])].sort((a, b) => {
    // Normalise before comparing
    const aDate = String(a.entry_date || '').slice(0, 10);
    const bDate = String(b.entry_date || '').slice(0, 10);
    return aDate.localeCompare(bDate);
  });

  for (const ex of tracked || []) {
    const norm = normalizeExerciseName(ex);
    let latestVal = null;

    for (const day of sorted) {
      const entries = Array.isArray(day?.entries) ? day.entries : [];
      for (const e of entries) {
        if (normalizeExerciseName(e?.exercise) !== norm) continue;
        const val = e1rmFromTopReps(
          e?.actual?.top ?? e?.top,
          e?.actual?.reps ?? e?.reps
        );
        if (Number.isFinite(val)) latestVal = val;
      }
    }
    out[ex] = latestVal;
  }
  return out;
}, [dailyOverview, tracked]);

  const nextWeek = useMemo(() => {
    const last = weekly?.length ? Number(weekly[weekly.length - 1]?.week_number) : null;
    return Number.isFinite(last) && last > 0 ? last + 1 : 1;
  }, [weekly]);

  const plannedByExercise = useMemo(() => {
    if (!activeProgram) return {};
    const wkKey = `W${nextWeek}`;
    const blocks = Array.isArray(activeProgram.blocks) ? activeProgram.blocks : [];

    const findInProgram = (exerciseName) => {
      for (const block of blocks) {
        const days = Array.isArray(block?.days) ? block.days : [];
        for (const day of days) {
          const rows = Array.isArray(day?.rows) ? day.rows : [];
          for (const row of rows) {
            if ((row?.exercise || "").toString().trim() !== exerciseName) continue;
            const v = row?.week_values?.[wkKey];
            if (v != null && String(v).trim() !== "") return String(v);
          }
        }
      }
      return null;
    };

    const out = {};
    for (const ex of tracked || []) out[ex] = findInProgram(ex);
    return out;
  }, [activeProgram, tracked, nextWeek]);

  const bestMap = useMemo(() => {
    const out = {};
    for (const ex of tracked || []) {
      const weeklyVals = (weekly || [])
        .map((w) => Number(w.metrics_by_exercise?.[ex]?.e1rm))
        .filter(Number.isFinite);

      out[ex] = weeklyVals.length ? Math.max(...weeklyVals) : dailyBestByExercise[ex] ?? null;
    }
    return out;
  }, [weekly, tracked, dailyBestByExercise]);

  const top3 = (tracked || []).slice(0, 3);

  return (
    <div className="grid grid-3">
      {top3.map((ex) => {
        const weeklyLatest = latest?.metrics_by_exercise?.[ex]?.e1rm ?? null;
const dailyLatest = dailyLatestByExercise[ex] ?? null;
const latestVal = (weeklyLatest != null && dailyLatest != null)
  ? Math.max(weeklyLatest, dailyLatest)
  : weeklyLatest ?? dailyLatest;
        const planned = plannedByExercise?.[ex];

        return (
          <div className="metric" key={ex}>
            <div className="k">{ex} e1RM (latest)</div>
            <div className="v">
              {latestVal != null ? fmt(latestVal) : "—"}{" "}
              <span className="small">{unit}</span>
            </div>
            <div className="s">
              Best: {bestMap[ex] != null ? `${fmt(bestMap[ex])} ${unit}` : "—"}
            </div>
            <div className="s">Planned W{nextWeek}: {planned != null ? planned : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}
function ConnectionsPage({ token, onInvalidToken, onError }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [accepted, setAccepted] = useState([]);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);

  async function loadConnections() {
    try {
      const res = await apiFetch("/api/connections", { token, onInvalidToken });
      setAccepted(Array.isArray(res?.accepted) ? res.accepted : []);
      setPending(Array.isArray(res?.pending) ? res.pending : []);
    } catch (e) {
      onError(e.message);
    }
  }

  async function searchUsers() {
    try {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      const res = await apiFetch(
        `/api/connections/search?q=${encodeURIComponent(q.trim())}`,
        { token, onInvalidToken }
      );
      setResults(Array.isArray(res?.users) ? res.users : []);
    } catch (e) {
      onError(e.message);
    }
  }

  useEffect(() => {
    loadConnections();
  }, [token]);

  async function sendRequest(targetUserId, relationshipType) {
    try {
      setBusy(true);
      await apiFetch("/api/connections/request", {
        token,
        method: "POST",
        body: {
          target_user_id: targetUserId,
          relationship_type: relationshipType,
        },
        onInvalidToken,
      });
      await loadConnections();
      await searchUsers();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function acceptRequest(id) {
    try {
      setBusy(true);
      await apiFetch(`/api/connections/${id}/accept`, {
        token,
        method: "POST",
        onInvalidToken,
      });
      await loadConnections();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function declineRequest(id) {
    try {
      setBusy(true);
      await apiFetch(`/api/connections/${id}/decline`, {
        token,
        method: "POST",
        onInvalidToken,
      });
      await loadConnections();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Find people</h2>
        <div className="small">Search by email or name, then connect as friend or coach/client.</div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Search users</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type email or name"
            />
            <button className="secondary" onClick={searchUsers} disabled={busy}>
              Search
            </button>
          </div>
        </div>

        <div className="list" style={{ marginTop: 12 }}>
          {results.length ? (
            results.map((u) => (
              <div className="listRow" key={u.id} style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{u.name || u.email}</div>
                  <div className="small">{u.email}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="secondary"
                    onClick={() => sendRequest(u.id, "friend")}
                    disabled={busy}
                  >
                    Add friend
                  </button>
                  <button
                    className="secondary"
                    onClick={() => sendRequest(u.id, "coach")}
                    disabled={busy}
                  >
                    Invite as coach
                  </button>
                  <button
                    className="secondary"
                    onClick={() => sendRequest(u.id, "client")}
                    disabled={busy}
                  >
                    Invite as client
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="small">No results yet.</div>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Pending requests</h2>
        <div className="list" style={{ marginTop: 12 }}>
          {pending.length ? (
            pending.map((p) => (
              <div className="listRow" key={p.id} style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>
                    {p.other_name || p.other_email}
                  </div>
                  <div className="small">
                    {p.other_email} • {p.relationship_type} • {p.direction}
                  </div>
                </div>

                {p.direction === "incoming" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="secondary" onClick={() => acceptRequest(p.id)} disabled={busy}>
                      Accept
                    </button>
                    <button className="secondary" onClick={() => declineRequest(p.id)} disabled={busy}>
                      Decline
                    </button>
                  </div>
                ) : (
                  <div className="small">Waiting</div>
                )}
              </div>
            ))
          ) : (
            <div className="small">No pending requests.</div>
          )}
        </div>

        <hr />

        <h2>Accepted connections</h2>
        <div className="list" style={{ marginTop: 12 }}>
          {accepted.length ? (
            accepted.map((c) => (
              <div className="listRow" key={c.id}>
                <div>
                  <div style={{ fontWeight: 800 }}>{c.other_name || c.other_email}</div>
                  <div className="small">
                    {c.other_email} • {c.relationship_type}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="small">No accepted connections yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function WeeksTable({ weekly, dailyOverview, unit, tracked }) {
  const cols = (tracked || []).slice(0, 6);

  function formatMetric(v) {
    const n = Number(v);
    return Number.isFinite(n) ? `${fmt(n)} ${unit}` : "—";
  }

  const fallbackWeeks = useMemo(() => {
    const byWeek = new Map();

    for (const day of dailyOverview || []) {
      const date = String(day?.entry_date || "");
      if (!date) continue;

      const d = new Date(date);
      if (!Number.isFinite(d.getTime())) continue;

      const start = new Date(d);
      start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const weekKey = isoLocal(start);

      if (!byWeek.has(weekKey)) {
        byWeek.set(weekKey, {
          week_number: byWeek.size + 1,
          metrics_by_exercise: {},
        });
      }

      const bucket = byWeek.get(weekKey);
      const entries = Array.isArray(day?.entries) ? day.entries : [];

      for (const e of entries) {
        const ex = String(e?.exercise || "").trim();
        if (!ex) continue;

        const val = e1rmFromTopReps(
          e?.actual?.top ?? e?.top,
          e?.actual?.reps ?? e?.reps
        );
        if (!Number.isFinite(val)) continue;

        const prev = Number(bucket.metrics_by_exercise?.[ex]?.e1rm);
        if (!Number.isFinite(prev) || val > prev) {
          bucket.metrics_by_exercise[ex] = { e1rm: val };
        }
      }
    }

    return Array.from(byWeek.values());
  }, [dailyOverview]);

  const rows = Array.isArray(weekly) && weekly.length ? weekly : fallbackWeeks;

  if (!rows.length) {
    return <div className="small">No weekly logs yet.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Week</th>
            {cols.map((ex) => (
              <th key={ex}>{ex} e1RM</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => (
            <tr key={w.id || `${w.week_number}_${i}`}>
              <td>{w.week_number}</td>
              {cols.map((ex) => (
                <td key={ex}>{formatMetric(w?.metrics_by_exercise?.[ex]?.e1rm)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small" style={{ marginTop: 8 }}>
        Showing first {cols.length} tracked exercises.
      </div>
    </div>
  );
}

/* =====================
   Charts
===================== */

function Charts({ weekly, dailyOverview, unit, tracked }) {
  const safeTracked = Array.isArray(tracked) ? tracked.slice(0, 6) : [];

  function weeklySeries(ex) {
    return (weekly || []).map((w) => {
      const val = Number(w?.metrics_by_exercise?.[ex]?.e1rm);
      return Number.isFinite(val) ? val : null;
    });
  }

  function dailySeries(ex) {
    const norm = normalizeExerciseName(ex);
    const bucketMap = new Map();

    for (const day of dailyOverview || []) {
      const date = String(day?.entry_date || "");
      if (!date) continue;

      const d = new Date(date);
      if (!Number.isFinite(d.getTime())) continue;

      const start = new Date(d);
      start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const weekKey = isoLocal(start);

      const entries = Array.isArray(day?.entries) ? day.entries : [];
      for (const e of entries) {
        if (normalizeExerciseName(e?.exercise) !== norm) continue;

        const val = e1rmFromTopReps(
          e?.actual?.top ?? e?.top,
          e?.actual?.reps ?? e?.reps
        );
        if (!Number.isFinite(val)) continue;

        const prev = bucketMap.get(weekKey);
        if (!Number.isFinite(prev) || val > prev) bucketMap.set(weekKey, val);
      }
    }

    const weeks = Array.from(bucketMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    return {
      labels: weeks.map((_, i) => `W${i + 1}`),
      values: weeks.map((x) => x[1]),
    };
  }

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: "rgba(255,255,255,0.85)", boxWidth: 12 },
        },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0,0,0,0.85)",
          titleColor: "rgba(255,255,255,0.95)",
          bodyColor: "rgba(255,255,255,0.9)",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          beginAtZero: false,
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" },
          title: {
            display: true,
            text: unit,
            color: "rgba(255,255,255,0.75)",
          },
        },
      },
    }),
    [unit]
  );

  return (
    <div className="grid grid-2">
      {safeTracked.map((ex) => {
        const wLabels = (weekly || []).map((w) => `W${w.week_number}`);
        const wSeries = weeklySeries(ex);
        const hasWeekly = wSeries.some((v) => Number.isFinite(v));

        const dSeriesObj = dailySeries(ex);
        const labels = hasWeekly ? wLabels : dSeriesObj.labels;
        const series = hasWeekly ? wSeries : dSeriesObj.values;

        return (
  <div key={ex} className="card">
    <div style={{ fontWeight: 800 }}>{ex} trend</div>
    <div style={{ height: "260px", maxWidth: "100%", position: "relative", overflow: "hidden", marginTop: 10 }}>
      {(() => {
        // Build a map of week_number → best e1rm from weekly entries
        const weeklyMap = new Map();
        (weekly || []).forEach((w) => {
          const val = Number(w?.metrics_by_exercise?.[ex]?.e1rm);
          if (Number.isFinite(val)) weeklyMap.set(w.week_number, val);
        });

        // Build a map of week_number → best e1rm from daily entries
        const norm = normalizeExerciseName(ex);
        const dailyMap = new Map();
        (dailyOverview || []).forEach((day) => {
          const d = new Date(day?.entry_date);
          if (!Number.isFinite(d.getTime())) return;
          // Derive week number relative to program or just use ISO week bucket
          (day?.entries || []).forEach((e) => {
            if (normalizeExerciseName(e?.exercise) !== norm) return;
            const val = e1rmFromTopReps(e?.actual?.top ?? e?.top, e?.actual?.reps ?? e?.reps);
            if (!Number.isFinite(val)) return;
            // Use entry_date to bucket into a week key (ISO week-of-year)
            const weekKey = `daily_${day.entry_date}`;
            const cur = dailyMap.get(weekKey);
            if (!cur || val > cur.val) dailyMap.set(weekKey, { val, date: day.entry_date });
          });
        });

        // Merge: weekly entries by week number, then append daily entries not covered
        const allWeekNums = Array.from(new Set([
          ...(weekly || []).map((w) => w.week_number)
        ])).sort((a, b) => a - b);

        // Also collect daily points that fall after the last weekly entry
        const lastWeekNum = allWeekNums.length ? Math.max(...allWeekNums) : 0;
        const dailyPoints = Array.from(dailyMap.values())
          .sort((a, b) => a.date.localeCompare(b.date));

        const labels = [
  ...allWeekNums.map((w) => `W${w}`),
  ...dailyPoints.map((p) => {
    const d = new Date(p.date);
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }),
];

        const series = [
          ...allWeekNums.map((w) => weeklyMap.get(w) ?? null),
          ...dailyPoints.map((p) => p.val),
        ];

        if (!series.some((v) => Number.isFinite(v))) {
          return <div className="small" style={{ paddingTop: 12 }}>No e1RM data yet for {ex}.</div>;
        }

        return (
          <Line
            data={{
              labels,
              datasets: [{
                label: `${ex} e1RM (${unit})`,
                data: series,
                tension: 0.25,
                borderWidth: 3,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                borderColor: "rgba(239,68,68,1)",
                backgroundColor: (ctx) => {
                  const { ctx: c, chartArea } = ctx.chart;
                  if (!chartArea) return "rgba(239,68,68,0.12)";
                  const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                  g.addColorStop(0, "rgba(239,68,68,0.28)");
                  g.addColorStop(1, "rgba(239,68,68,0.02)");
                  return g;
                },
                spanGaps: true,
              }],
            }}
            options={options}
          />
        );
      })()}
    </div>
  </div>
);
      })}
    </div>
  );
}

function ExerciseChart({ exercise, weekly, dailyOverview, unit }) {
  const trend = useMemo(() => {
    const points = [];

    (weekly || []).forEach((w) => {
      (w.entries || []).forEach((e) => {
        if (
          normalizeExerciseName(e.exercise) ===
          normalizeExerciseName(exercise)
        ) {
          const v = e1rmFromTopReps(e.actual?.top, e.actual?.reps);
          if (Number.isFinite(v)) {
            points.push({
              label: `W${w.week}`,
              val: v,
            });
          }
        }
      });
    });

    (dailyOverview || []).forEach((d) => {
      (d.entries || []).forEach((e) => {
        if (
          normalizeExerciseName(e.exercise) ===
          normalizeExerciseName(exercise)
        ) {
          const v = e1rmFromTopReps(e.actual?.top, e.actual?.reps);
          if (Number.isFinite(v)) {
            points.push({
              label: d.entry_date,
              val: v,
            });
          }
        }
      });
    });

    points.sort((a, b) => String(a.label).localeCompare(String(b.label)));

    return points;
  }, [exercise, weekly, dailyOverview]);

  if (!trend.length) {
    return (
      <div className="card">
        <h3>{exercise}</h3>
        <div className="small">No data yet.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>{exercise}</h3>

      <div style={{ height: 220 }}>
        <Line
          data={{
            labels: trend.map((p) => p.label),
            datasets: [
              {
                label: `${exercise} e1RM`,
                data: trend.map((p) => p.val),
                borderWidth: 3,
                tension: 0.25,
                pointRadius: 4,
                pointHoverRadius: 6,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                title: {
                  display: true,
                  text: `e1RM (${unit})`,
                },
              },
            },
          }}
        />
      </div>
    </div>
  );
};