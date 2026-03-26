import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../utils/api";

const TYPE_COLORS = {
  friend: { border: "rgba(59,130,246,0.4)", bg: "rgba(59,130,246,0.1)", color: "rgba(147,197,253,1)" },
  coach:  { border: "rgba(232,25,44,0.4)",  bg: "rgba(232,25,44,0.1)",  color: "rgba(252,165,165,1)" },
  client: { border: "rgba(16,185,129,0.4)", bg: "rgba(16,185,129,0.1)", color: "rgba(110,231,183,1)" },
};

function RelPill({ type }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.friend;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, border: `1px solid ${c.border}`, background: c.bg, color: c.color, textTransform: "capitalize", letterSpacing: 0.3 }}>
      {type}
    </span>
  );
}

export default function ConnectionsPage() {
  const { token, onInvalidToken, setErr } = useApp();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [accepted, setAccepted] = useState([]);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

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
      if (!q.trim()) { setResults([]); setSearched(false); return; }
      const res = await apiFetch(`/api/connections/search?q=${encodeURIComponent(q.trim())}`, { token, onInvalidToken });
      setResults(Array.isArray(res?.users) ? res.users : []);
      setSearched(true);
    } catch (e) { setErr(e.message); }
  }

  async function sendRequest(targetUserId, relationshipType) {
    try {
      setBusy(true);
      await apiFetch("/api/connections/request", { token, method: "POST", body: { target_user_id: targetUserId, relationship_type: relationshipType }, onInvalidToken });
      await load();
      setResults([]);
      setQ("");
      setSearched(false);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function respond(id, action) {
    try {
      setBusy(true);
      await apiFetch(`/api/connections/${id}/${action}`, { token, method: "POST", onInvalidToken });
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const incoming = pending.filter((p) => p.direction === "incoming");
  const outgoing = pending.filter((p) => p.direction === "outgoing");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>

      {/* Search */}
      <div className="card">
        <h2 style={{ margin: "0 0 4px" }}>Find people</h2>
        <div className="small" style={{ marginBottom: 14 }}>Search by name or email to connect as friend, coach, or client</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email…" style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
          <button className="secondary" onClick={search} style={{ fontSize: 13 }}>Search</button>
        </div>

        {searched && (
          <div style={{ marginTop: 12 }}>
            {results.length === 0 ? (
              <div className="small" style={{ opacity: 0.6 }}>No users found for "{q}"</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {results.map((u) => (
                  <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{u.name || u.email}</div>
                      {u.name && <div className="small">{u.email}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["friend", "coach", "client"].map((type) => (
                        <button key={type} className="secondary" style={{ fontSize: 11, padding: "5px 10px" }}
                          onClick={() => sendRequest(u.id, type)} disabled={busy}>
                          + {type}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.04)" }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>📬 Pending requests ({incoming.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {incoming.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.other_name || p.other_email}</div>
                    <div className="small">{p.other_email}</div>
                  </div>
                  <RelPill type={p.relationship_type} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => respond(p.id, "accept")} disabled={busy}>Accept</button>
                  <button className="secondary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => respond(p.id, "decline")} disabled={busy}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted connections */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>
          Connections {accepted.length > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text2)", marginLeft: 6 }}>{accepted.length}</span>}
        </div>
        {accepted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🤝</div>
            <div className="small">No connections yet — search for people above</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {accepted.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.other_name || c.other_email}</div>
                  {c.other_name && <div className="small">{c.other_email}</div>}
                </div>
                <RelPill type={c.relationship_type} />
              </div>
            ))}
          </div>
        )}

        {/* Outgoing */}
        {outgoing.length > 0 && (
          <>
            <div style={{ fontWeight: 700, marginTop: 16, marginBottom: 10 }}>Sent requests</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {outgoing.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.other_name || p.other_email}</div>
                    <RelPill type={p.relationship_type} />
                  </div>
                  <div className="small" style={{ opacity: 0.5 }}>Awaiting response</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
