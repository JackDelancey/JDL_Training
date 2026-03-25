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

const NAV = [
  { id: "overview",    label: "Overview",   icon: "⊞" },
  { id: "daily",       label: "Daily",       icon: "⊟" },
  { id: "programs",    label: "Programs",    icon: "⊠" },
  { id: "explorer",    label: "Explorer",    icon: "⊙" },
  { id: "connections", label: "Connections", icon: "⊕" },
  { id: "groups",      label: "Groups",      icon: "⊗" },
  { id: "settings",    label: "Settings",    icon: "⊖" },
];

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
              <div className="small">Track • Compete • Improve</div>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <Auth onAuthed={(t) => { localStorage.setItem("jdl_token", t); setToken(t); }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showWizard && (
        <OnboardingWizard
          token={token}
          onComplete={() => { setShowWizard(false); refresh(); }}
          onInvalidToken={() => hardLogout("Session expired — please log in again.")}
          onError={() => {}}
        />
      )}
      <div className="appShell">
        <aside className="sidebar">
          <div className="sidebarTop">
            <div className="brandRow">
              <img src="/brand/jdl-logo.png" alt="JDL logo" />
              <div>
                <div className="brandTitle">JDL Training</div>
                <div className="small" style={{ fontSize: 11 }}>Track • Compete • Improve</div>
              </div>
            </div>
            <nav className="nav">
              {NAV.map(({ id, label, icon }) => (
                <button key={id} className={page === id ? "navBtn active" : "navBtn"} onClick={() => setPage(id)}>
                  <span style={{ marginRight: 8, opacity: 0.7, fontSize: 13 }}>{icon}</span>
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebarBottom">
            <div className="small" style={{ marginBottom: 10 }}>
              Signed in as <b style={{ color: "rgba(255,255,255,0.85)" }}>{me?.name || me?.email}</b>
            </div>
            <button className="secondary" onClick={() => hardLogout("")} style={{ width: "100%", fontSize: 12 }}>
              Log out
            </button>
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
