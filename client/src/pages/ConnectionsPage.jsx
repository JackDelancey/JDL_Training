import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";

export default function ConnectionsPage() {
  const { token, onInvalidToken, setErr } = useApp();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [accepted, setAccepted] = useState([]);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await apiFetch("/api/connections", { token, onInvalidToken });
      setAccepted(Array.isArray(res?.accepted) ? res.accepted : []);
      setPending(Array.isArray(res?.pending) ? res.pending : []);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); }, [token]);

  async function search() {
    try {
      if (!q.trim()) { setResults([]); return; }
      const res = await apiFetch(`/api/connections/search?q=${encodeURIComponent(q.trim())}`, { token, onInvalidToken });
      setResults(Array.isArray(res?.users) ? res.users : []);
    } catch (e) { setErr(e.message); }
  }

  async function sendRequest(targetUserId, relationshipType) {
    try {
      setBusy(true);
      await apiFetch("/api/connections/request", { token, method: "POST", body: { target_user_id: targetUserId, relationship_type: relationshipType }, onInvalidToken });
      await load();
      await search();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function respond(id, action) {
    try {
      setBusy(true);
      await apiFetch(`/api/connections/${id}/${action}`, { token, method: "POST", onInvalidToken });
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Find people</h2>
        <div className="small">Search by email or name, then connect as friend or coach/client.</div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Search users</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type email or name" />
            <button className="secondary" onClick={search} disabled={busy}>Search</button>
          </div>
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          {results.length ? results.map((u) => (
            <div className="listRow" key={u.id} style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{u.name || u.email}</div>
                <div className="small">{u.email}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["friend", "coach", "client"].map((type) => (
                  <button key={type} className="secondary" onClick={() => sendRequest(u.id, type)} disabled={busy}>
                    {type === "friend" ? "Add friend" : type === "coach" ? "Invite as coach" : "Invite as client"}
                  </button>
                ))}
              </div>
            </div>
          )) : <div className="small">No results yet.</div>}
        </div>
      </div>

      <div className="card">
        <h2>Pending requests</h2>
        <div className="list" style={{ marginTop: 12 }}>
          {pending.length ? pending.map((p) => (
            <div className="listRow" key={p.id} style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{p.other_name || p.other_email}</div>
                <div className="small">{p.other_email} • {p.relationship_type} • {p.direction}</div>
              </div>
              {p.direction === "incoming" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="secondary" onClick={() => respond(p.id, "accept")} disabled={busy}>Accept</button>
                  <button className="secondary" onClick={() => respond(p.id, "decline")} disabled={busy}>Decline</button>
                </div>
              ) : <div className="small">Waiting</div>}
            </div>
          )) : <div className="small">No pending requests.</div>}
        </div>
        <hr />
        <h2>Accepted connections</h2>
        <div className="list" style={{ marginTop: 12 }}>
          {accepted.length ? accepted.map((c) => (
            <div className="listRow" key={c.id}>
              <div>
                <div style={{ fontWeight: 800 }}>{c.other_name || c.other_email}</div>
                <div className="small">{c.other_email} • {c.relationship_type}</div>
              </div>
            </div>
          )) : <div className="small">No accepted connections yet.</div>}
        </div>
      </div>
    </div>
  );
}
