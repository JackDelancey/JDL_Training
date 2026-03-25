import { AppProvider, useApp } from "./context/AppContext";
import { Auth, Banner } from "./components/Auth";
import { OnboardingWizard } from "./components/OnboardingWizard";
import OverviewPage from "./pages/OverviewPage";
import DailyPage from "./pages/DailyPage";
import ProgramsPage from "./pages/ProgramsPage";
import ExplorerPage from "./pages/ExplorerPage";
import GroupsPage from "./pages/GroupsPage";
import ConnectionsPage from "./pages/ConnectionsPage";
import SettingsPage from "./pages/SettingsPage";

function Shell() {
  const { token, setToken, me, err, showWizard, setShowWizard, hardLogout, refresh, page, setPage } = useApp();

  if (!token) {
    return (
      <div className="authShell">
        {err ? <Banner text={err} /> : null}
        <div className="authCard">
          <div className="brandRow">
            <img src="/brand/jdl-logo.png" alt="JDL logo" />
            <div>
              <div className="brandTitle">JDL Training</div>
              <div className="small">Weekly logging • e1RM trends • group comparisons</div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Auth onAuthed={(t) => { localStorage.setItem("jdl_token", t); setToken(t); }} />
          </div>
        </div>
      </div>
    );
  }

  const NAV = [
    { id: "overview",     label: "Overview" },
    { id: "daily",        label: "Daily" },
    { id: "programs",     label: "Programs" },
    { id: "explorer",     label: "Explorer" },
    { id: "connections",  label: "Connections" },
    { id: "groups",       label: "Groups" },
    { id: "settings",     label: "Settings" },
  ];

  return (
    <>
      {showWizard && (
        <OnboardingWizard
          token={token}
          onComplete={() => { setShowWizard(false); refresh(); }}
          onInvalidToken={() => hardLogout("Session expired — please log in again.")}
          onError={(msg) => {}}
        />
      )}

      <div className="appShell">
        <aside className="sidebar">
          <div className="sidebarTop">
            <div className="brandRow">
              <img src="/brand/jdl-logo.png" alt="JDL logo" />
              <div>
                <div className="brandTitle">JDL Training</div>
                <div className="small">Weekly logging • e1RM trends • group comparisons</div>
              </div>
            </div>
            <div className="nav">
              {NAV.map(({ id, label }) => (
                <button key={id} className={page === id ? "navBtn active" : "navBtn"} onClick={() => setPage(id)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="sidebarBottom">
            <div className="small">Signed in as <b>{me?.name || me?.email}</b></div>
            <button className="secondary" onClick={() => hardLogout("")} style={{ marginTop: 10 }}>Log out</button>
          </div>
        </aside>

        <main className="main">
          {err ? <Banner text={err} /> : null}
          {page === "overview"    && <OverviewPage />}
          {page === "daily"       && <DailyPage />}
          {page === "programs"    && <ProgramsPage />}
          {page === "explorer"    && <ExplorerPage />}
          {page === "connections" && <ConnectionsPage />}
          {page === "groups"      && <GroupsPage />}
          {page === "settings"    && <SettingsPage />}
        </main>
      </div>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
