"use strict";

const { pool } = require("./db");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// ─── Supabase auth calls ──────────────────────────────────────────────

async function supabaseGetUser(accessToken) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) return null;
  return json;
}

async function supabaseSignup(email, password, name) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, data: name ? { name } : {} }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.msg || json?.message || JSON.stringify(json);
    throw new Error(`Supabase signup failed: ${msg}`);
  }
  return json;
}

async function supabaseLogin(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error_description || json?.msg || json?.message || JSON.stringify(json);
    throw new Error(`Supabase login failed: ${msg}`);
  }
  return json;
}

// ─── Profile upsert ───────────────────────────────────────────────────

async function upsertProfileFromUser(user, nameFallback) {
  const userId = user?.id;
  const email = user?.email || null;
  const name = user?.user_metadata?.name || nameFallback || null;
  if (!userId) return null;

  const q = await pool.query(
    `insert into public.app_users (id, email, name, units, unit_pref)
     values ($1, $2, $3, 'kg', 'kg')
     on conflict (id) do update
       set email = coalesce(excluded.email, public.app_users.email),
           name  = coalesce(excluded.name, public.app_users.name)
     returning id, email, name,
               coalesce(unit_pref, units, 'kg') as unit_pref,
               exercise_library,
               tracked_exercises,
               dashboard_exercises,
               active_program_id,
               coalesce(onboarding_complete, false) as onboarding_complete,
               created_at`,
    [userId, email, name]
  );
  return q.rows[0];
}

// ─── Auth middleware ──────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "Missing bearer token" });

  const accessToken = m[1];
  try {
    const user = await supabaseGetUser(accessToken);
    if (!user?.id) return res.status(401).json({ error: "Invalid token" });

    req.user = {
      id: user.id,
      email: user.email || null,
      name: user.user_metadata?.name || null,
      token: accessToken,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ─── Coach access check ───────────────────────────────────────────────

async function requireCoachAccess(coachId, clientId) {
  const q = await pool.query(
    `select 1
     from public.user_connections
     where (requester_user_id = $1 or target_user_id = $1)
       and (requester_user_id = $2 or target_user_id = $2)
       and relationship_type = 'coach'
       and status = 'accepted'
     limit 1`,
    [coachId, clientId]
  );
  return q.rowCount > 0;
}

// ─── Group membership check ───────────────────────────────────────────

async function requireGroupMember(groupId, userId) {
  const q = await pool.query(
    `select gm.group_id, gm.user_id, gm.role
     from public.group_members gm
     where gm.group_id = $1 and gm.user_id = $2`,
    [groupId, userId]
  );
  return q.rows[0] || null;
}

module.exports = {
  supabaseGetUser,
  supabaseSignup,
  supabaseLogin,
  upsertProfileFromUser,
  requireAuth,
  requireCoachAccess,
  requireGroupMember,
};
