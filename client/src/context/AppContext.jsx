import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { apiFetch } from "../utils/api";
import { isoLocalToday, isoLocalNDaysAgo } from "../utils/dates";

const DEFAULT_EXERCISE_LIBRARY = [
  "Bench","Squat","Deadlift","Overhead Press","Paused Bench","Spoto Press",
  "Incline Bench","Leg Press","Hack Squat","RDL","Barbell Row",
  "Chest-Supported Row","Pull-up / Pulldown","Lat Pulldown","DB Row",
  "Hip Thrust","Hamstring Curl","Triceps Pushdown","Lateral Raise",
];

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [token, setTokenState] = useState(localStorage.getItem("jdl_token") || "");
  const [me, setMe] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [weekly, setWeekly] = useState([]);
  const [dailyOverview, setDailyOverview] = useState([]);
  const [allPrograms, setAllPrograms] = useState([]);
  const [activeProgram, setActiveProgram] = useState(null);
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [dashboardExercises, setDashboardExercises] = useState([]);
  const [err, setErr] = useState("");
  const [page, setPage] = useState("overview");
  const unit = me?.unit_pref || "kg";
  const tracked = me?.tracked_exercises || ["Bench", "Squat", "Deadlift"];

  const mergedLibrary = useMemo(() => {
    const set = new Set();
    const add = (v) => { const s = String(v || "").trim(); if (s) set.add(s); };
    DEFAULT_EXERCISE_LIBRARY.forEach(add);
    exerciseLibrary.forEach(add);
    tracked.forEach(add);
    dashboardExercises.forEach(add);
    weekly.forEach((w) => (w?.entries || []).forEach((e) => add(e?.exercise)));
    dailyOverview.forEach((d) => (d?.entries || []).forEach((e) => add(e?.exercise)));
    allPrograms.forEach((p) => (p?.blocks || []).forEach((b) => (b?.days || []).forEach((d) => (d?.rows || []).forEach((r) => add(r?.exercise)))));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [exerciseLibrary, tracked, dashboardExercises, weekly, dailyOverview, allPrograms]);

  function setToken(t) {
    if (t) localStorage.setItem("jdl_token", t);
    else localStorage.removeItem("jdl_token");
    setTokenState(t);
  }

  function hardLogout(message = "") {
    setToken("");
    setMe(null);
    setShowWizard(false);
    setWeekly([]);
    setDailyOverview([]);
    setAllPrograms([]);
    setExerciseLibrary([]);
    setDashboardExercises([]);
    setActiveProgram(null);
    setErr(message);
  }

  const onInvalidToken = () => hardLogout("Session expired — please log in again.");

  async function refresh() {
    if (!token) return;
    try {
      setErr("");
      const meRes = await apiFetch("/api/me", { token, onInvalidToken });
      const meObj = meRes?.user || meRes || null;
      setMe(meObj);
      setExerciseLibrary(meObj?.exercise_library || []);
      setDashboardExercises(
        meObj?.dashboard_exercises ||
        (meObj?.tracked_exercises || ["Bench", "Squat", "Deadlift"]).slice(0, 3)
      );
      if (meObj?.onboarding_complete === false) setShowWizard(true);

      const [w, dailyRes, programsRes, ap] = await Promise.all([
        apiFetch("/api/weekly", { token, onInvalidToken }),
        apiFetch(`/api/daily?from=${isoLocalNDaysAgo(180)}&to=${isoLocalToday()}`, { token, onInvalidToken }).catch(() => []),
        apiFetch("/api/programs", { token, onInvalidToken }).catch(() => null),
        apiFetch("/api/programs/active", { token, onInvalidToken }).catch(() => null),
      ]);

      setWeekly(Array.isArray(w) ? w : []);
      setDailyOverview(Array.isArray(dailyRes) ? dailyRes : []);
      setAllPrograms(Array.isArray(programsRes?.programs) ? programsRes.programs : []);
      setActiveProgram(ap?.program || null);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { refresh(); }, [token]);

  const value = {
    token, setToken, me, unit, tracked,
    weekly, dailyOverview, allPrograms, activeProgram,
    exerciseLibrary, setExerciseLibrary,
    dashboardExercises, setDashboardExercises,
    mergedLibrary, err, setErr,
    showWizard, setShowWizard,
    hardLogout, onInvalidToken, refresh,page, setPage,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
