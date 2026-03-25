import { useState } from "react";
import { apiFetch } from "../utils/api";

const WIZARD_STEPS = [
  { id: "welcome",   title: "Welcome to JDL Training" },
  { id: "units",     title: "Set your units" },
  { id: "exercises", title: "Pick your main lifts" },
  { id: "program",   title: "Set up your program" },
  { id: "done",      title: "You're ready" },
];

const SUGGESTED_EXERCISES = [
  "Bench","Squat","Deadlift","Overhead Press","Paused Bench",
  "Incline Bench","RDL","Barbell Row","Pull-up / Pulldown","Hip Thrust","Leg Press",
];

export function OnboardingWizard({ token, onComplete, onInvalidToken, onError }) {
  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState("kg");
  const [tracked, setTracked] = useState(["Bench", "Squat", "Deadlift"]);
  const [hasProgram, setHasProgram] = useState(null);
  const [programName, setProgramName] = useState("My Program");
  const [programBlocks, setProgramBlocks] = useState(3);
  const [programWeeks, setProgramWeeks] = useState(4);
  const [programDays, setProgramDays] = useState(4);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const progress = (step / (WIZARD_STEPS.length - 1)) * 100;

  function toggleExercise(ex) {
    setTracked((prev) => prev.includes(ex) ? prev.filter((x) => x !== ex) : [...prev, ex]);
  }

  function next() {
    if (step === 2 && hasProgram === "no") { setStep(4); return; }
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  }

  function back() {
    if (step === 4 && hasProgram === "no") { setStep(2); return; }
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleFinish() {
    try {
      setBusy(true);
      setErr("");
      await apiFetch("/api/me/unit", { token, method: "PATCH", body: { unit_pref: unit }, onInvalidToken });
      await apiFetch("/api/tracked-exercises", { token, method: "PUT", body: { tracked_exercises: tracked }, onInvalidToken });

      if (hasProgram === "yes") {
        const weeks_per_block = Array.from({ length: programBlocks }, () => programWeeks);
        const res = await apiFetch("/api/programs", {
          token, method: "POST",
          body: { name: programName, blocks: programBlocks, days_per_week: programDays, weeks_per_block },
          onInvalidToken,
        });
        if (res?.program?.id) {
          await apiFetch(`/api/programs/${res.program.id}/activate`, { token, method: "POST", onInvalidToken });
        }
      }

      await apiFetch("/api/me/onboarding", { token, method: "PATCH", onInvalidToken });
      onComplete();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const overlay = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 18px" };
  const card = { width: "min(560px,100%)", background: "linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.04))", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: "28px 24px", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" };

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="small">{WIZARD_STEPS[step].title}</div>
            <div className="small">{step + 1} / {WIZARD_STEPS.length}</div>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 999 }}>
            <div style={{ height: 4, borderRadius: 999, background: "rgba(239,68,68,0.9)", width: `${progress}%`, transition: "width 0.3s ease" }} />
          </div>
        </div>

        {err && <div className="small" style={{ color: "#fca5a5", marginBottom: 16 }}>{err}</div>}

        {step === 0 && (
          <div>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👋</div>
            <h2 style={{ margin: "0 0 12px" }}>Welcome to JDL Training</h2>
            <p className="small" style={{ lineHeight: 1.7, marginBottom: 16 }}>We'll get you set up in about <b>60 seconds</b>.</p>
            {[{ icon: "⚖️", text: "Set your preferred weight unit (kg or lb)" }, { icon: "🏋️", text: "Pick the main lifts you want to track" }, { icon: "📋", text: "Create your first training program (optional)" }].map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span className="small">{text}</span>
              </div>
            ))}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 style={{ margin: "0 0 8px" }}>Weight units</h2>
            <p className="small" style={{ marginBottom: 20 }}>You can change this later in Settings.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {["kg", "lb"].map((u) => (
                <button key={u} onClick={() => setUnit(u)} style={{ padding: "20px 14px", borderRadius: 14, fontSize: 20, fontWeight: 900, border: unit === u ? "2px solid rgba(239,68,68,0.9)" : "1px solid rgba(255,255,255,0.12)", background: unit === u ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)" }}>
                  {u}
                  <div className="small" style={{ marginTop: 6, fontWeight: 400 }}>{u === "kg" ? "Kilograms" : "Pounds"}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ margin: "0 0 8px" }}>Your main lifts</h2>
            <p className="small" style={{ marginBottom: 16 }}>Pick 3–6 for best results.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {SUGGESTED_EXERCISES.map((ex) => {
                const active = tracked.includes(ex);
                return (
                  <button key={ex} onClick={() => toggleExercise(ex)} style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, border: active ? "1px solid rgba(239,68,68,0.9)" : "1px solid rgba(255,255,255,0.12)", background: active ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)", fontWeight: active ? 700 : 400 }}>
                    {active ? "✓ " : ""}{ex}
                  </button>
                );
              })}
            </div>
            <div className="small" style={{ marginBottom: 16 }}>Selected: <b>{tracked.length ? tracked.join(", ") : "none yet"}</b></div>
            <hr />
            <div style={{ marginTop: 16, fontWeight: 700, marginBottom: 10 }}>Do you have a training program ready?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[{ val: "yes", label: "Yes, let's create one", icon: "📋" }, { val: "no", label: "Not yet, I'll do it later", icon: "⏭️" }].map(({ val, label, icon }) => (
                <button key={val} onClick={() => setHasProgram(val)} style={{ padding: 14, borderRadius: 14, textAlign: "left", border: hasProgram === val ? "2px solid rgba(239,68,68,0.9)" : "1px solid rgba(255,255,255,0.12)", background: hasProgram === val ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                  <div className="small">{label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 style={{ margin: "0 0 8px" }}>Create your program</h2>
            <p className="small" style={{ marginBottom: 20 }}>You can edit all details in the Programs page after setup.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>Program name</label>
                <input value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="e.g. Off Season Block" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[{ label: "Blocks", val: programBlocks, set: setProgramBlocks, opts: [1,2,3,4,5,6] },
                  { label: "Weeks / block", val: programWeeks, set: setProgramWeeks, opts: [2,3,4,5,6,8] },
                  { label: "Days / week", val: programDays, set: setProgramDays, opts: [2,3,4,5,6] }].map(({ label, val, set, opts }) => (
                  <div className="field" key={label}>
                    <label>{label}</label>
                    <select value={val} onChange={(e) => set(Number(e.target.value))}>
                      {opts.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="small">
                  <b>{programName}</b> — {programBlocks} blocks × {programWeeks} weeks = <b>{programBlocks * programWeeks} weeks total</b>
                  <br />{programDays} days/week = <b>{programBlocks * programWeeks * programDays} total sessions</b>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h2 style={{ margin: "0 0 12px" }}>You're all set!</h2>
            {[{ icon: "📅", s: "Daily", desc: "Log each session. Your program auto-populates planned exercises." },
              { icon: "📊", s: "Overview", desc: "See your e1RM trends, adherence, and program progress at a glance." },
              { icon: "🔍", s: "Explorer", desc: "Deep-dive into any exercise — rep curves, PBs, 1RM trend." },
              { icon: "🏆", s: "Groups", desc: "Create or join a group to compete on leaderboards." }].map(({ icon, s, desc }) => (
              <div key={s} style={{ display: "flex", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, marginBottom: 10, textAlign: "left" }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <div><div style={{ fontWeight: 700, fontSize: 13 }}>{s}</div><div className="small">{desc}</div></div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, gap: 10 }}>
          <button className="secondary" onClick={back} disabled={step === 0 || busy} style={{ visibility: step === 0 ? "hidden" : "visible" }}>← Back</button>
          {step < WIZARD_STEPS.length - 1 ? (
            <button onClick={next} disabled={(step === 2 && (tracked.length === 0 || hasProgram === null)) || busy}>
              {step === 2 && hasProgram === "no" ? "Skip to finish →" : "Next →"}
            </button>
          ) : (
            <button onClick={handleFinish} disabled={busy}>{busy ? "Setting up…" : "Go to app →"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
