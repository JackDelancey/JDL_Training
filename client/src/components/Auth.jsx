import { useState } from "react";
import { apiFetch } from "../utils/api";

export function Banner({ text }) {
  return (
    <div className="card" style={{ borderColor: "#7f1d1d", marginBottom: 14 }}>
      <b>Error:</b> {text}
    </div>
  );
}

export function Notice({ text, onDismiss, actions }) {
  return (
    <div className="card" style={{ borderColor: "#1f3a8a", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div><b>Note:</b> {text}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {actions}
          {onDismiss && <button className="secondary" onClick={onDismiss}>Dismiss</button>}
        </div>
      </div>
    </div>
  );
}

export function Auth({ onAuthed }) {
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
      const body = mode === "register"
        ? { email, name, password, unit_pref: "kg" }
        : { email, password };

      const res = await apiFetch(path, { method: "POST", body });
      const accessToken =
        (typeof res?.access_token === "string" && res.access_token.trim()) ||
        (typeof res?.token?.access_token === "string" && res.token.access_token.trim()) ||
        (typeof res?.token === "string" && res.token.trim()) || "";

      if (!accessToken) throw new Error("Login succeeded but no access token was returned.");
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
      {localErr && <div className="small" style={{ color: "#fecaca", marginBottom: 10 }}>{localErr}</div>}
      <div className="grid grid-2">
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
        </div>
        {mode === "register" && (
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
      </div>
      <div style={{ marginTop: 10 }} className="field">
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={submit} disabled={busy}>
          {busy ? "…" : mode === "register" ? "Register" : "Login"}
        </button>
        <button className="secondary" onClick={() => setMode(mode === "register" ? "login" : "register")} disabled={busy}>
          {mode === "register" ? "Have an account? Login" : "New here? Register"}
        </button>
      </div>
    </div>
  );
}
