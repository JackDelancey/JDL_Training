"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth } = require("../middleware");
const {
  supabaseSignup,
  supabaseLogin,
  supabaseGetUser,
  upsertProfileFromUser,
} = require("../middleware");
const { toISODateLocal } = require("../utils");

// ─── Register ────────────────────────────────────────────────────────

async function handleRegister(req, res) {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    await supabaseSignup(email, password, name);
    const token = await supabaseLogin(email, password);
    const user = token?.access_token ? await supabaseGetUser(token.access_token) : null;
    const profile = user ? await upsertProfileFromUser(user, name || null) : null;

    return res.json({
      access_token: token?.access_token || null,
      refresh_token: token?.refresh_token || null,
      token_type: token?.token_type || "bearer",
      expires_in: token?.expires_in || null,
      profile,
    });
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }
}

// ─── Login ────────────────────────────────────────────────────────────

async function handleLogin(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    const token = await supabaseLogin(email, password);
    const user = token?.access_token ? await supabaseGetUser(token.access_token) : null;
    const profile = user ? await upsertProfileFromUser(user, null) : null;

    return res.json({
      access_token: token?.access_token || null,
      refresh_token: token?.refresh_token || null,
      token_type: token?.token_type || "bearer",
      expires_in: token?.expires_in || null,
      profile,
    });
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }
}

router.post("/register", handleRegister);
router.post("/login", handleLogin);
router.post("/auth/register", handleRegister);
router.post("/auth/login", handleLogin);

// ─── Get profile ──────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `select id, email, name,
              coalesce(unit_pref, units, 'kg') as unit_pref,
              coalesce(use_rpe, true) as use_rpe,
              coalesce(onboarding_complete, false) as onboarding_complete,
              exercise_library,
              tracked_exercises,
              dashboard_exercises,
              active_program_id,
              created_at
       from public.app_users
       where id = $1`,
      [req.user.id]
    );
    res.json({ user: q.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Update unit preference ───────────────────────────────────────────

router.patch("/me/unit", requireAuth, async (req, res) => {
  try {
    const unit = (req.body?.unit_pref || req.body?.unit || "kg").toString();
    if (!["kg", "lb"].includes(unit)) {
      return res.status(400).json({ error: "unit_pref must be kg or lb" });
    }
    const q = await pool.query(
      `update public.app_users
       set unit_pref = $2
       where id = $1
       returning id, email, name,
                 coalesce(unit_pref, units, 'kg') as unit_pref,
                 exercise_library, tracked_exercises, dashboard_exercises,
                 active_program_id, created_at`,
      [req.user.id, unit]
    );
    res.json({ user: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Update preferences (RPE toggle etc) ─────────────────────────────

router.patch("/me/preferences", requireAuth, async (req, res) => {
  try {
    const useRpe = req.body?.use_rpe !== false;
    await pool.query(
      `update public.app_users set use_rpe = $1 where id = $2`,
      [useRpe, req.user.id]
    );
    res.json({ ok: true, use_rpe: useRpe });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Mark onboarding complete ─────────────────────────────────────────

router.patch("/me/onboarding", requireAuth, async (req, res) => {
  try {
    await pool.query(
      `alter table public.app_users add column if not exists onboarding_complete boolean not null default false`
    );
    await pool.query(
      `update public.app_users set onboarding_complete = true where id = $1`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Exercise library ─────────────────────────────────────────────────

router.put("/exercise-library", requireAuth, async (req, res) => {
  try {
    const exercises = Array.isArray(req.body?.exercises) ? req.body.exercises : [];
    const cleaned = Array.from(
      new Set(exercises.map((x) => String(x || "").trim()).filter(Boolean))
    ).slice(0, 500);

    const q = await pool.query(
      `update public.app_users
       set exercise_library = $2::jsonb
       where id = $1
       returning exercise_library`,
      [req.user.id, JSON.stringify(cleaned)]
    );
    res.json({ exercises: q.rows?.[0]?.exercise_library || [] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Tracked exercises ────────────────────────────────────────────────

router.put("/tracked-exercises", requireAuth, async (req, res) => {
  try {
    const list = Array.isArray(req.body?.tracked_exercises) ? req.body.tracked_exercises : [];
    const cleaned = Array.from(
      new Set(list.map((x) => String(x || "").trim()).filter(Boolean))
    ).slice(0, 50);
    const fallback = ["Bench", "Squat", "Deadlift"];

    const q = await pool.query(
      `update public.app_users
       set tracked_exercises = $2::jsonb
       where id = $1
       returning tracked_exercises`,
      [req.user.id, JSON.stringify(cleaned.length ? cleaned : fallback)]
    );
    res.json({ tracked_exercises: q.rows?.[0]?.tracked_exercises || fallback });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Dashboard exercises ──────────────────────────────────────────────

router.put("/dashboard-exercises", requireAuth, async (req, res) => {
  try {
    const list = Array.isArray(req.body?.dashboard_exercises) ? req.body.dashboard_exercises : [];
    const cleaned = Array.from(
      new Set(list.map((x) => String(x || "").trim()).filter(Boolean))
    ).slice(0, 6);
    const fallback = ["Bench", "Squat", "Deadlift"];

    const q = await pool.query(
      `update public.app_users
       set dashboard_exercises = $2::jsonb
       where id = $1
       returning dashboard_exercises`,
      [req.user.id, JSON.stringify(cleaned.length ? cleaned : fallback)]
    );
    res.json({ dashboard_exercises: q.rows?.[0]?.dashboard_exercises || fallback });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
