/**
 * JDL Training API — Supabase Auth + Weekly + Programs + Groups + Exercise Library
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

/* =====================
   Supabase helpers
===================== */
async function supabaseGetUser(accessToken) {
  const url = `${SUPABASE_URL}/auth/v1/user`;
  const r = await fetch(url, {
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
function calcE1RM(weight, reps) {
  if (!weight || !reps) return null;
  return Math.round(weight * (1 + reps / 30));
}
async function supabaseSignup(email, password, name) {
  const url = `${SUPABASE_URL}/auth/v1/signup`;
  const r = await fetch(url, {
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
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const r = await fetch(url, {
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
    const msg =
      json?.error_description ||
      json?.msg ||
      json?.message ||
      JSON.stringify(json);
    throw new Error(`Supabase login failed: ${msg}`);
  }
  return json;
}

/* =====================
   Generic helpers
===================== */
function clampInt(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const xi = Math.trunc(x);
  if (xi < lo || xi > hi) return null;
  return xi;
}
function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n % 1 === 0 ? String(n.toFixed(0)) : String(n.toFixed(2));
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseTrainingLoad(value, bodyweight) {
  const raw = String(value || "").trim().toUpperCase();
  const bw = Number(bodyweight);

  if (!raw) return null;

  if (/^BW\s*\+\s*-?\d+(\.\d+)?$/.test(raw)) {
    const extra = Number(raw.replace(/^BW\s*\+\s*/, ""));
    if (!Number.isFinite(bw)) return null;
    return bw + extra;
  }

  if (/^-?\d+(\.\d+)?\s*\+\s*-?\d+(\.\d+)?$/.test(raw)) {
    const [a, b] = raw.split("+").map((x) => Number(x.trim()));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a + b;
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function parseLoadNumber(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/(-?\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function e1rmEpley(load, reps) {
  const l = Number(load);
  const r = Number(reps);

  if (!Number.isFinite(l) || !Number.isFinite(r) || l <= 0 || r <= 0) {
    return null;
  }

  return Math.round(l * (1 + r / 30) * 10) / 10;
}

function isNonEmpty(x) {
  return x != null && String(x).trim() !== "";
}

function makeJoinCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function sumProgramWeeks(blocks) {
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((a, b) => a + (Number(b?.weeks) || 0), 0);
}

function sumWeeks(blocks) {
  return sumProgramWeeks(blocks);
}

/* =====================
   UTC date helpers
===================== */
function parseISODate(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isFinite(d.getTime()) ? d : null;
}

function toISODateUTC(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysUTC(isoDateStr, days) {
  const d = parseISODate(isoDateStr);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return toISODateUTC(d);
}

function addDaysISO(iso, n) {
  const d = parseISODate(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return toISODateUTC(d);
}

function daysBetweenUTC(aISO, bISO) {
  const a = parseISODate(aISO);
  const b = parseISODate(bISO);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

function weekdayUTC(isoDateStr) {
  const d = parseISODate(isoDateStr);
  if (!d) return null;
  return d.getUTCDay();
}

function eachDateUTC(fromISO, toISO) {
  const fromD = parseISODate(fromISO);
  const toD = parseISODate(toISO);
  if (!fromD || !toD) return [];
  const diff = daysBetweenUTC(fromISO, toISO);
  if (diff == null || diff < 0) return [];
  const out = [];
  for (let i = 0; i <= diff; i++) {
    const d = new Date(fromD.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    out.push(toISODateUTC(d));
  }
  return out;
}

function buildTrainingDatesBetween(startISO, endISO, trainingDays) {
  const s = parseISODate(startISO);
  const e = parseISODate(endISO);
  if (!s || !e) return [];
  const tset = new Set((trainingDays || []).map(Number));
  const out = [];
  const cur = new Date(s.getTime());
  while (cur.getTime() <= e.getTime()) {
    if (tset.has(cur.getUTCDay())) out.push(toISODateUTC(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function trainingDatesForProgramWeek(startISO, weekNumber, daysPerWeek, trainingDays) {
  const wk = Number(weekNumber);
  if (!Number.isFinite(wk) || wk <= 0) return [];

  const dpw = Math.max(1, Number(daysPerWeek || 4));
  const sessionStartIdx = (wk - 1) * dpw;
  const sessionEndIdx = wk * dpw - 1;

  const tset = new Set((trainingDays || []).map(Number));
  const dates = [];

  let idx = -1;
  let cursor = parseISODate(startISO);
  if (!cursor) return [];

  for (let day = 0; day < 730; day++) {
    const iso = toISODateUTC(cursor);
    if (tset.has(cursor.getUTCDay())) {
      idx++;
      if (idx >= sessionStartIdx && idx <= sessionEndIdx) dates.push(iso);
      if (idx > sessionEndIdx) break;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function trainingSessionIndex(startISO, targetISO, trainingDays) {
  const diff = daysBetweenUTC(startISO, targetISO);
  if (diff == null || diff < 0) return null;

  const tset = new Set((trainingDays || []).map(Number));
  let count = 0;

  for (let i = 0; i <= diff; i++) {
    const d = parseISODate(startISO);
    d.setUTCDate(d.getUTCDate() + i);
    const wd = d.getUTCDay();
    if (tset.has(wd)) count++;
  }

  return count - 1;
}

/* =====================
   Local date helpers
===================== */
function parseISODateLocal(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);

  const d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toISODateLocal(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function weekdayLocal(isoDateStr) {
  const d = parseISODateLocal(isoDateStr);
  if (!d) return null;
  return d.getDay();
}

function daysBetweenLocal(aISO, bISO) {
  const a = parseISODateLocal(aISO);
  const b = parseISODateLocal(bISO);
  if (!a || !b) return null;

  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 0, 0, 0, 0);
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 0, 0, 0, 0);

  const ms = b0.getTime() - a0.getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

function trainingSessionIndexLocal(startISO, targetISO, trainingDays) {
  const diff = daysBetweenLocal(startISO, targetISO);
  if (diff == null || diff < 0) return null;

  const tset = new Set((trainingDays || []).map(Number));
  let count = 0;

  const start = parseISODateLocal(startISO);
  for (let i = 0; i <= diff; i++) {
    const d = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
      0, 0, 0, 0
    );
    const wd = d.getDay();
    if (tset.has(wd)) count++;
  }

  return count - 1;
}

/* =====================
   Program helpers
===================== */
function findBlockForWeek(blocks, weekNumber) {
  let offset = 0;
  for (let i = 0; i < (blocks || []).length; i++) {
    const w = Number(blocks[i]?.weeks || 0);
    const start = offset + 1;
    const end = offset + w;
    if (weekNumber >= start && weekNumber <= end) {
      return {
        block: blocks[i],
        block_number: i + 1,
        block_week: weekNumber - offset,
      };
    }
    offset += w;
  }
  return null;
}

function plannedSessionForWeekAndDay(blocks, week_number, day_number) {
  const blockInfo = findBlockForWeek(blocks, week_number);
  if (!blockInfo) {
    return {
      rows: [],
      block_number: null,
      block_week: null,
      day_title: `Day ${day_number}`,
    };
  }

  const day =
    (blockInfo.block?.days || []).find(
      (d) => Number(d?.day_number) === Number(day_number)
    ) || null;

  return {
    rows: Array.isArray(day?.rows) ? day.rows : [],
    block_number: blockInfo.block_number,
    block_week: blockInfo.block_week,
    day_title: day?.title || `Day ${day_number}`,
  };
}

function isDayCompleted(dayRow) {
  const entries = Array.isArray(dayRow?.entries) ? dayRow.entries : [];
  for (const e of entries) {
    const a = e?.actual || {};
    const top = Number(a?.top);
    const reps = Number(a?.reps);
    const rpe = a?.rpe;

    if (Number.isFinite(top) && top > 0) return true;
    if (Number.isFinite(reps) && reps > 0) return true;
    if (rpe != null && String(rpe).trim() !== "") return true;

    const topLegacy = Number(e?.top);
    const repsLegacy = Number(e?.reps);
    const rpeLegacy = e?.rpe;

    if (Number.isFinite(topLegacy) && topLegacy > 0) return true;
    if (Number.isFinite(repsLegacy) && repsLegacy > 0) return true;
    if (rpeLegacy != null && String(rpeLegacy).trim() !== "") return true;
  }
  return false;
}

/* =====================
   Explorer helpers
===================== */
function parseSetsRepsTargetReps(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  if (!s) return null;

  if (/[x×]/.test(s)) {
    const afterX = s.split(/[x×]/).pop();
    if (!afterX) return null;

    let m = afterX.match(/^(\d+)-(\d+)$/);
    if (m) return Number(m[2]);

    m = afterX.match(/^(\d+)$/);
    if (m) return Number(m[1]);
  }

  let m = s.match(/^(\d+)-(\d+)$/);
  if (m) return Number(m[2]);

  m = s.match(/^(\d+)reps?$/);
  if (m) return Number(m[1]);

  m = s.match(/^(\d+)$/);
  if (m) return Number(m[1]);

  return null;
}

function normalizeExerciseName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
}

function formatDateWithWeeksAgo(dateStr) {
  if (!dateStr) return null;

  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return null;

  const now = new Date();
  const ms = now.getTime() - d.getTime();
  const weeks = Math.floor(ms / (1000 * 60 * 60 * 24 * 7));

  const pretty = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (weeks <= 0) return `${pretty} • this week`;
  if (weeks === 1) return `${pretty} • 1 week ago`;
  return `${pretty} • ${weeks} weeks ago`;
}

function bucketForReps(reps) {
  const r = Math.trunc(Number(reps));
  if (!Number.isFinite(r) || r <= 0) return null;
  if (r >= 13) return "13+";
  return String(r);
}

function metricValue(x) {
  return Number.isFinite(x?.e1rm) ? x.e1rm : -Infinity;
}

function buildEntriesFromPlanRowsServer(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows
    .map((r) => ({
      exercise: String(r?.exercise || "").trim(),
      source: "program",
      planned: {
        sets_reps: String(r?.sets_reps || ""),
        load_rpe: String(r?.load_rpe || ""),
        notes: String(r?.notes || ""),
        target: String(r?.week_target || ""),
      },
      completed: false,
      notes: "",
      actual: { top: "", reps: 3, rpe: "" },
    }))
    .filter((x) => x.exercise);
}

/* =====================
   Schema
===================== */
async function ensureSchema() {
  await pool.query(`create extension if not exists pgcrypto;`);

  await pool.query(`
    create table if not exists public.app_users (
      id uuid primary key,
      email text,
      name text,
      units text default 'kg',
      created_at timestamptz default now()
    );
  `);

  await pool.query(`alter table public.app_users add column if not exists unit_pref text;`);
  await pool.query(`alter table public.app_users add column if not exists exercise_library jsonb not null default '[]'::jsonb;`);
  await pool.query(`alter table public.app_users add column if not exists tracked_exercises jsonb not null default '["Bench","Squat","Deadlift"]'::jsonb;`);
  await pool.query(`alter table public.app_users add column if not exists dashboard_exercises jsonb not null default '["Bench","Squat","Deadlift"]'::jsonb;`);
  await pool.query(`alter table public.app_users add column if not exists active_program_id uuid;`);

  await pool.query(`create index if not exists app_users_email_idx on public.app_users (email);`);

  await pool.query(`
    create table if not exists public.weekly_entries_app (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.app_users(id) on delete cascade,
      week_number int not null,
      unit text not null default 'kg',
      bodyweight numeric,
      sleep_hours numeric,
      pec_pain_0_10 int,
      zone2_mins int,
      notes text,
      entries jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, week_number)
    );
  `);

  await pool.query(`
    create table if not exists public.programs_app (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.app_users(id) on delete cascade,
      name text not null,
      days_per_week int not null default 4,
      blocks jsonb not null default '[]'::jsonb,
      total_weeks int not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create table if not exists public.daily_entries_app (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.app_users(id) on delete cascade,
      entry_date date not null,
      unit text not null default 'kg',
      bodyweight numeric,
      sleep_hours numeric,
      pec_pain_0_10 int,
      zone2_mins int,
      notes text,
      entries jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(user_id, entry_date)
    );
  `);

  await pool.query(`
    alter table public.daily_entries_app
      add column if not exists is_completed boolean not null default false,
      add column if not exists completed_at timestamptz;
  `);

  await pool.query(`
    alter table public.programs_app
      add column if not exists start_date date,
      add column if not exists training_days int[] not null default '{1,3,5,6}';
  `);

  await pool.query(`create index if not exists ix_daily_entries_user_date on public.daily_entries_app(user_id, entry_date);`);
  await pool.query(`create index if not exists ix_weekly_entries_app_user on public.weekly_entries_app(user_id);`);
  await pool.query(`create index if not exists ix_weekly_entries_app_week on public.weekly_entries_app(week_number);`);
  await pool.query(`create index if not exists ix_programs_app_user on public.programs_app(user_id);`);

  await pool.query(`
    create table if not exists public.groups (
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid not null references public.app_users(id) on delete cascade,
      name text not null,
      join_code text not null unique,
      is_private boolean not null default true,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists public.group_members (
      group_id uuid not null references public.groups(id) on delete cascade,
      user_id uuid not null references public.app_users(id) on delete cascade,
      role text not null default 'member',
      joined_at timestamptz default now(),
      primary key (group_id, user_id)
    );
  `);

  await pool.query(`create index if not exists ix_group_members_user on public.group_members(user_id);`);
  await pool.query(`create index if not exists ix_group_members_group on public.group_members(group_id);`);
    await pool.query(`
    create table if not exists public.group_events (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.groups(id) on delete cascade,
      user_id uuid references public.app_users(id) on delete set null,
      event_type text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create table if not exists public.group_shared_programs (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.groups(id) on delete cascade,
      program_id uuid not null references public.programs_app(id) on delete cascade,
      shared_by_user_id uuid not null references public.app_users(id) on delete cascade,
      title text,
      notes text,
      created_at timestamptz not null default now(),
      unique(group_id, program_id)
    );
  `);

  await pool.query(`
    create table if not exists public.group_challenges (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.groups(id) on delete cascade,
      created_by_user_id uuid not null references public.app_users(id) on delete cascade,
      name text not null,
      description text,
      metric_type text not null,
      exercise text,
      scoring_type text not null default 'max',
      start_date date not null,
      end_date date not null,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`create index if not exists ix_group_events_group_created on public.group_events(group_id, created_at desc);`);
  await pool.query(`create index if not exists ix_group_shared_programs_group on public.group_shared_programs(group_id, created_at desc);`);
  await pool.query(`create index if not exists ix_group_challenges_group on public.group_challenges(group_id, created_at desc);`);
}

/* =====================
   Auth middleware
===================== */
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
               created_at`,
    [userId, email, name]
  );
  return q.rows[0];
}

/* =====================
   Health
===================== */
app.get("/api/health", async (req, res) => {
  try {
    const r = await pool.query("select 1 as ok");
    res.json({ ok: true, db: r.rows?.[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

/* =====================
   Auth routes
===================== */
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

app.post("/api/register", handleRegister);
app.post("/api/login", handleLogin);
app.post("/api/auth/register", handleRegister);
app.post("/api/auth/login", handleLogin);

/* =====================
   Profile
===================== */
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `select id, email, name,
              coalesce(unit_pref, units, 'kg') as unit_pref,
              coalesce(use_rpe, true) as use_rpe,
              exercise_library,
              tracked_exercises,
              dashboard_exercises,
              active_program_id,
              created_at
       from public.app_users
       where id=$1`,
      [req.user.id]
    );
    res.json({ user: q.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.patch("/api/me/preferences", requireAuth, async (req, res) => {
  try {
    const useRpe = req.body?.use_rpe !== false;

    await pool.query(
      `update public.app_users
       set use_rpe = $1
       where id = $2`,
      [useRpe, req.user.id]
    );

    res.json({ ok: true, use_rpe: useRpe });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.patch("/api/me/unit", requireAuth, async (req, res) => {
  try {
    const unit = (req.body?.unit_pref || req.body?.unit || "kg").toString();
    if (!["kg", "lb"].includes(unit)) {
      return res.status(400).json({ error: "unit_pref must be kg or lb" });
    }

    const q = await pool.query(
      `update public.app_users
       set unit_pref=$2
       where id=$1
       returning id, email, name,
                 coalesce(unit_pref, units, 'kg') as unit_pref,
                 exercise_library,
                 tracked_exercises,
                 dashboard_exercises,
                 active_program_id,
                 created_at`,
      [req.user.id, unit]
    );

    res.json({ user: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =====================
   Mobile Today
===================== */
app.get("/api/mobile/today", requireAuth, async (req, res) => {
  try {
    const date = String(req.query?.date || toISODateLocal(new Date()));
    if (!parseISODateLocal(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    const u = await pool.query(
      `select active_program_id
       from public.app_users
       where id=$1`,
      [req.user.id]
    );

    const pid = u.rows?.[0]?.active_program_id || null;
    if (!pid) {
      return res.json({
        date,
        has_program: false,
        reason: "no_active_program",
      });
    }

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days
       from public.programs_app
       where id=$1 and user_id=$2`,
      [pid, req.user.id]
    );

    if (p.rowCount === 0) {
      return res.json({
        date,
        has_program: false,
        reason: "program_missing",
      });
    }

    const prog = p.rows[0];
    const startISO = prog.start_date ? toISODateLocal(new Date(prog.start_date)) : null;

    if (!startISO || !parseISODateLocal(startISO)) {
      return res.json({
        date,
        has_program: true,
        program_id: prog.id,
        program_name: prog.name,
        reason: "program_missing_start_date",
      });
    }

    const trainingDays = Array.isArray(prog.training_days)
      ? prog.training_days.map(Number)
      : [];

    if (!trainingDays.length) {
      return res.json({
        date,
        has_program: true,
        program_id: prog.id,
        program_name: prog.name,
        reason: "program_missing_training_days",
      });
    }

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const totalWeeks = Math.max(0, Number(prog.total_weeks || sumProgramWeeks(prog.blocks)));
    const totalSessions = totalWeeks * daysPerWeek;
    const blocks = Array.isArray(prog.blocks) ? prog.blocks : [];

    const wd = weekdayLocal(date);
    const isTrainingDay = trainingDays.includes(wd);

    const dailyQ = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes,
              entries, is_completed, completed_at, created_at, updated_at
       from public.daily_entries_app
       where user_id=$1 and entry_date=$2::date`,
      [req.user.id, date]
    );

    const existingDay = dailyQ.rows?.[0] || null;

    if (!isTrainingDay) {
      return res.json({
        date,
        has_program: true,
        program_id: prog.id,
        program_name: prog.name,
        is_training_day: false,
        day: existingDay,
        entries: Array.isArray(existingDay?.entries) ? existingDay.entries : [],
      });
    }

    const idx = trainingSessionIndexLocal(startISO, date, trainingDays);
    if (idx == null || idx < 0 || idx >= totalSessions) {
      return res.json({
        date,
        has_program: true,
        program_id: prog.id,
        program_name: prog.name,
        is_training_day: false,
        reason: "session_out_of_range",
        day: existingDay,
        entries: Array.isArray(existingDay?.entries) ? existingDay.entries : [],
      });
    }

    const week_number = Math.floor(idx / daysPerWeek) + 1;
    const day_number = (idx % daysPerWeek) + 1;

    const blockInfo = findBlockForWeek(blocks, week_number);
    const dayDef =
      (blockInfo?.block?.days || []).find(
        (d) => Number(d?.day_number) === Number(day_number)
      ) || null;

    const wkKey = `W${week_number}`;
    const plannedRows = (Array.isArray(dayDef?.rows) ? dayDef.rows : []).map((r) => ({
      ...r,
      week_target: r?.week_values?.[wkKey] ?? "",
      wk_key: wkKey,
    }));

    const existingEntries = Array.isArray(existingDay?.entries) ? existingDay.entries : [];
    const entries = existingEntries.length ? existingEntries : buildEntriesFromPlanRowsServer(plannedRows);

    return res.json({
      date,
      has_program: true,
      program_id: prog.id,
      program_name: prog.name,
      is_training_day: true,
      is_completed: existingDay?.is_completed === true,
      week_number,
      day_number,
      block_number: blockInfo?.block_number || null,
      block_week: blockInfo?.block_week || null,
      day_title: dayDef?.title || `Day ${day_number}`,
      planned_rows: plannedRows,
      day: existingDay,
      entries,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =====================
   Exercise library / tracked / dashboard
===================== */
app.put("/api/exercise-library", requireAuth, async (req, res) => {
  try {
    const exercises = Array.isArray(req.body?.exercises) ? req.body.exercises : [];
    const cleaned = Array.from(
      new Set(exercises.map((x) => String(x || "").trim()).filter(Boolean))
    ).slice(0, 500);

    const q = await pool.query(
      `update public.app_users
       set exercise_library=$2::jsonb
       where id=$1
       returning exercise_library`,
      [req.user.id, JSON.stringify(cleaned)]
    );

    res.json({ exercises: q.rows?.[0]?.exercise_library || [] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/tracked-exercises", requireAuth, async (req, res) => {
  try {
    const list = Array.isArray(req.body?.tracked_exercises) ? req.body.tracked_exercises : [];
    const cleaned = Array.from(
      new Set(list.map((x) => String(x || "").trim()).filter(Boolean))
    ).slice(0, 50);

    const fallback = ["Bench", "Squat", "Deadlift"];

    const q = await pool.query(
      `update public.app_users
       set tracked_exercises=$2::jsonb
       where id=$1
       returning tracked_exercises`,
      [req.user.id, JSON.stringify(cleaned.length ? cleaned : fallback)]
    );

    res.json({ tracked_exercises: q.rows?.[0]?.tracked_exercises || fallback });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/dashboard-exercises", requireAuth, async (req, res) => {
  try {
    const list = Array.isArray(req.body?.dashboard_exercises)
      ? req.body.dashboard_exercises
      : [];
    const cleaned = Array.from(
      new Set(list.map((x) => String(x || "").trim()).filter(Boolean))
    ).slice(0, 6);

    const fallback = ["Bench", "Squat", "Deadlift"];

    const q = await pool.query(
      `update public.app_users
       set dashboard_exercises=$2::jsonb
       where id=$1
       returning dashboard_exercises`,
      [req.user.id, JSON.stringify(cleaned.length ? cleaned : fallback)]
    );

    res.json({
      dashboard_exercises: q.rows?.[0]?.dashboard_exercises || fallback,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =====================
   Weekly
===================== */
app.get("/api/weekly", requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `select id, week_number, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, entries, created_at, updated_at
       from public.weekly_entries_app
       where user_id=$1
       order by week_number asc`,
      [req.user.id]
    );

    const out = q.rows.map((row) => {
      const entries = Array.isArray(row.entries) ? row.entries : [];
      const metrics_by_exercise = {};

      for (const e of entries) {
        const ex = String(e?.exercise || "").trim();
        if (!ex) continue;
        const val = e1rmEpley(e?.top, e?.reps);
        if (val == null) continue;

        const prev = metrics_by_exercise[ex]?.e1rm;
        if (prev == null || val > prev) {
          metrics_by_exercise[ex] = { e1rm: val, progress_pct: null };
        }
      }

      return {
        id: row.id,
        week_number: row.week_number,
        week: row.week_number,
        unit: row.unit,
        bodyweight: row.bodyweight,
        sleep_hours: row.sleep_hours,
        pec_pain_0_10: row.pec_pain_0_10,
        zone2_mins: row.zone2_mins,
        notes: row.notes,
        entries,
        metrics_by_exercise,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/weekly/:week", requireAuth, async (req, res) => {
  try {
    const week = Number(req.params.week);
    if (!Number.isInteger(week) || week <= 0) {
      return res.status(400).json({ error: "Invalid week number" });
    }

    const payload = req.body || {};
    const unit = (payload.unit || "kg").toString();
    const bodyweight = toNum(payload.bodyweight);
    const sleep_hours = toNum(payload.sleep_hours);
    const pec_pain_0_10 =
      payload.pec_pain_0_10 != null ? Number(payload.pec_pain_0_10) : null;
    const zone2_mins =
      payload.zone2_mins != null ? Number(payload.zone2_mins) : null;
    const notes = payload.notes != null ? String(payload.notes) : null;
    const entries = Array.isArray(payload.entries) ? payload.entries : [];

    const q = await pool.query(
      `insert into public.weekly_entries_app
        (user_id, week_number, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, entries, updated_at)
       values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
       on conflict (user_id, week_number) do update set
         unit = excluded.unit,
         bodyweight = excluded.bodyweight,
         sleep_hours = excluded.sleep_hours,
         pec_pain_0_10 = excluded.pec_pain_0_10,
         zone2_mins = excluded.zone2_mins,
         notes = excluded.notes,
         entries = excluded.entries,
         updated_at = now()
       returning week_number`,
      [
        req.user.id,
        week,
        unit,
        bodyweight,
        sleep_hours,
        pec_pain_0_10,
        zone2_mins,
        notes,
        JSON.stringify(entries),
      ]
    );

    res.json({ ok: true, week_number: q.rows[0]?.week_number });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/weekly/from-daily/:week", requireAuth, async (req, res) => {
  try {
    const week = Number(req.params.week);
    if (!Number.isInteger(week) || week <= 0) {
      return res.status(400).json({ error: "Invalid week number" });
    }

    const u = await pool.query(
      `select active_program_id, tracked_exercises from public.app_users where id=$1`,
      [req.user.id]
    );
    const activeId = u.rows?.[0]?.active_program_id || null;
    const tracked = Array.isArray(u.rows?.[0]?.tracked_exercises)
      ? u.rows[0].tracked_exercises
      : ["Bench", "Squat", "Deadlift"];

    if (!activeId) return res.status(400).json({ error: "No active program" });

    const p = await pool.query(
      `select id, start_date, training_days, days_per_week
       from public.programs_app
       where id=$1 and user_id=$2`,
      [activeId, req.user.id]
    );
    if (p.rowCount === 0) {
      return res.status(400).json({ error: "Active program missing" });
    }

    const prog = p.rows[0];
    const startISO = prog.start_date ? toISODateUTC(new Date(prog.start_date)) : null;
    if (!startISO) {
      return res.status(400).json({ error: "Active program missing start_date" });
    }

    const trainingDays = Array.isArray(prog.training_days) ? prog.training_days : [];
    const dates = trainingDatesForProgramWeek(
      startISO,
      week,
      prog.days_per_week,
      trainingDays
    );

    if (!dates.length) {
      return res.json({
        ok: true,
        week_number: week,
        date_range: null,
        derived_entries: [],
        note: "No training dates found for that week.",
      });
    }

    const from = dates[0];
    const to = dates[dates.length - 1];

    const dq = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, entries
       from public.daily_entries_app
       where user_id=$1 and entry_date between $2::date and $3::date
       order by entry_date asc`,
      [req.user.id, from, to]
    );

    const dailyRows = dq.rows || [];

    const bestByEx = new Map();
    for (const d of dailyRows) {
      const entries = Array.isArray(d.entries) ? d.entries : [];
      const iso = toISODateUTC(new Date(d.entry_date));

      for (const e of entries) {
        const ex = String(e?.exercise || "").trim();
        if (!ex) continue;
        if (!tracked.includes(ex)) continue;

        const top = parseLoadNumber(e?.actual?.top ?? e?.top);
        const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
        const rpe = e?.actual?.rpe ?? e?.rpe ?? null;

        const val = e1rmEpley(top, reps);
        if (val == null) continue;

        const cur = bestByEx.get(ex);
        if (!cur || val > cur.e1rm) {
          bestByEx.set(ex, { e1rm: val, top, reps, rpe, date: iso });
        }
      }
    }

    const derivedEntries = tracked.map((ex) => {
      const b = bestByEx.get(ex);
      return {
        exercise: ex,
        top: b?.top ?? "",
        reps: b?.reps ?? 3,
        rpe: b?.rpe ?? "",
        derived_from: b?.date ?? null,
      };
    });

    const latest = dailyRows.length ? dailyRows[dailyRows.length - 1] : null;

    const unit = (req.body?.unit || latest?.unit || "kg").toString();
    const bodyweight = latest?.bodyweight ?? null;
    const sleep_hours = latest?.sleep_hours ?? null;
    const pec_pain_0_10 = latest?.pec_pain_0_10 ?? null;
    const zone2_mins = latest?.zone2_mins ?? null;

    const notes =
      `Auto-filled from daily logs (${from} → ${to})` +
      (latest?.notes ? `\n\nLatest day notes:\n${String(latest.notes)}` : "");

    const up = await pool.query(
      `insert into public.weekly_entries_app
        (user_id, week_number, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, entries, updated_at)
       values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
       on conflict (user_id, week_number) do update set
         unit = excluded.unit,
         bodyweight = excluded.bodyweight,
         sleep_hours = excluded.sleep_hours,
         pec_pain_0_10 = excluded.pec_pain_0_10,
         zone2_mins = excluded.zone2_mins,
         notes = excluded.notes,
         entries = excluded.entries,
         updated_at = now()
       returning week_number`,
      [
        req.user.id,
        week,
        unit,
        bodyweight,
        sleep_hours,
        pec_pain_0_10,
        zone2_mins,
        notes,
        JSON.stringify(derivedEntries),
      ]
    );

    res.json({
      ok: true,
      week_number: up.rows?.[0]?.week_number ?? week,
      date_range: { from, to },
      derived_entries: derivedEntries,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
/* =====================
   Programs
===================== */
app.get("/api/programs", requireAuth, async (req, res) => {
  try {
    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days, created_at, updated_at
       from public.programs_app
       where user_id=$1
       order by created_at desc`,
      [req.user.id]
    );

    const u = await pool.query(
      `select active_program_id from public.app_users where id=$1`,
      [req.user.id]
    );

    res.json({
      programs: p.rows.map((r) => ({
        ...r,
        blocks: Array.isArray(r.blocks) ? r.blocks : [],
      })),
      active_program_id: u.rows?.[0]?.active_program_id || null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/programs", requireAuth, async (req, res) => {
  try {
    const name = (req.body?.name || "New program").toString().slice(0, 80);
    const days = Number(req.body?.days_per_week || 4);

    let blocks = req.body?.blocks;
    if (!Array.isArray(blocks)) {
      const count = Math.max(1, Number(req.body?.blocks || 3));
      const weeksPer = Array.isArray(req.body?.weeks_per_block)
        ? req.body.weeks_per_block
        : [];

      blocks = Array.from({ length: count }, (_, i) => {
        const weeks = Number(weeksPer[i] || 4);
        const dayCount = Math.max(1, days);
        const daysArr = Array.from({ length: dayCount }, (_, di) => ({
          day_number: di + 1,
          title: `Day ${di + 1}`,
          rows: [],
        }));

        return {
          block_number: i + 1,
          title: `Block ${i + 1}`,
          intent: "",
          rpe_range: "",
          weeks,
          days: daysArr,
        };
      });
    }

    const totalWeeks = sumProgramWeeks(blocks);

    const ins = await pool.query(
      `insert into public.programs_app (user_id, name, days_per_week, blocks, total_weeks, updated_at)
       values ($1,$2,$3,$4::jsonb,$5,now())
       returning id, name, days_per_week, blocks, total_weeks, start_date, training_days, created_at, updated_at`,
      [req.user.id, name, days, JSON.stringify(blocks), totalWeeks]
    );

    const u = await pool.query(
      `select active_program_id from public.app_users where id=$1`,
      [req.user.id]
    );
    if (!u.rows?.[0]?.active_program_id) {
      await pool.query(
        `update public.app_users set active_program_id=$2 where id=$1`,
        [req.user.id, ins.rows[0].id]
      );
    }

    res.json({ program: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/programs/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const name = (req.body?.name || "Program").toString().slice(0, 80);
    const days = Number(req.body?.days_per_week || 4);
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const totalWeeks = Number(req.body?.total_weeks || sumProgramWeeks(blocks));

    const up = await pool.query(
      `update public.programs_app
       set name=$1, days_per_week=$2, blocks=$3::jsonb, total_weeks=$4, updated_at=now()
       where id=$5 and user_id=$6
       returning id, name, days_per_week, blocks, total_weeks, start_date, training_days, created_at, updated_at`,
      [name, days, JSON.stringify(blocks), totalWeeks, id, req.user.id]
    );

    if (up.rowCount === 0) {
      return res.status(404).json({ error: "Program not found" });
    }

    res.json({ program: up.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.patch("/api/programs/:id/settings", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const start_date = req.body?.start_date ? String(req.body.start_date) : null;
    const training_days = Array.isArray(req.body?.training_days)
      ? req.body.training_days.map(Number)
      : null;

    if (start_date && !parseISODateLocal(start_date)) {
      return res.status(400).json({ error: "Invalid start_date (YYYY-MM-DD)" });
    }

    if (training_days) {
      const ok = training_days.every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 6
      );
      if (!ok) {
        return res.status(400).json({ error: "training_days must be int[] in range 0..6" });
      }
      if (training_days.length === 0) {
        return res.status(400).json({ error: "training_days cannot be empty" });
      }
    }

    const exists = await pool.query(
      `select 1 from public.programs_app where id=$1 and user_id=$2`,
      [id, req.user.id]
    );
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: "Program not found" });
    }

    const q = await pool.query(
      `update public.programs_app
       set start_date = coalesce($1, start_date),
           training_days = coalesce($2, training_days),
           updated_at = now()
       where id=$3 and user_id=$4
       returning id, start_date, training_days`,
      [start_date, training_days, id, req.user.id]
    );

    res.json({ ok: true, program: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/programs/active", requireAuth, async (req, res) => {
  try {
    const u = await pool.query(
      `select active_program_id from public.app_users where id=$1`,
      [req.user.id]
    );
    const activeId = u.rows?.[0]?.active_program_id || null;
    if (!activeId) return res.json({ program: null });

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, created_at, updated_at, start_date, training_days
       from public.programs_app
       where id=$1 and user_id=$2`,
      [activeId, req.user.id]
    );

    res.json({
      program: p.rows?.[0]
        ? {
            ...p.rows[0],
            blocks: Array.isArray(p.rows[0].blocks) ? p.rows[0].blocks : [],
          }
        : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/programs/:id/activate", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;

    const p = await pool.query(
      `select 1 from public.programs_app where id=$1 and user_id=$2`,
      [id, req.user.id]
    );
    if (p.rowCount === 0) {
      return res.status(404).json({ error: "Program not found" });
    }

    await pool.query(
      `update public.app_users set active_program_id=$2 where id=$1`,
      [req.user.id, id]
    );

    res.json({ ok: true, active_program_id: id });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/programs/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;

    const del = await pool.query(
      `delete from public.programs_app where id=$1 and user_id=$2`,
      [id, req.user.id]
    );
    if (del.rowCount === 0) {
      return res.status(404).json({ error: "Program not found" });
    }

    const u = await pool.query(
      `select active_program_id from public.app_users where id=$1`,
      [req.user.id]
    );
    let active = u.rows?.[0]?.active_program_id || null;

    if (active === id) {
      const latest = await pool.query(
        `select id from public.programs_app where user_id=$1 order by created_at desc limit 1`,
        [req.user.id]
      );
      active = latest.rows?.[0]?.id || null;
      await pool.query(
        `update public.app_users set active_program_id=$2 where id=$1`,
        [req.user.id, active]
      );
    }

    res.json({ ok: true, active_program_id: active });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/programs/active/plan", requireAuth, async (req, res) => {
  try {
    const date = String(req.query?.date || "");
    if (!parseISODateLocal(date)) {
      return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });
    }

    const u = await pool.query(
      `select active_program_id from public.app_users where id=$1`,
      [req.user.id]
    );
    const pid = u.rows?.[0]?.active_program_id;
    if (!pid) {
      return res.json({ date, is_training_day: false, reason: "no_active_program" });
    }

    const p = await pool.query(
      `select id, name, days_per_week, blocks, start_date, training_days
       from public.programs_app
       where id=$1 and user_id=$2`,
      [pid, req.user.id]
    );
    if (p.rowCount === 0) {
      return res.json({ date, is_training_day: false, reason: "program_missing" });
    }

    const prog = p.rows[0];
    const start = prog.start_date ? toISODateLocal(new Date(prog.start_date)) : null;
    if (!start) {
      return res.json({
        date,
        is_training_day: false,
        reason: "program_missing_start_date",
        program_id: prog.id,
      });
    }

    const trainingDays = Array.isArray(prog.training_days)
      ? prog.training_days.map(Number)
      : [];
    const todayWd = weekdayLocal(date);

    const isTrainingDay = trainingDays.includes(todayWd);
    if (!isTrainingDay) {
      return res.json({ date, is_training_day: false, program_id: prog.id });
    }

    const idx = trainingSessionIndexLocal(start, date, trainingDays);
    if (idx == null || idx < 0) {
      return res.json({ date, is_training_day: false, program_id: prog.id });
    }

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const week_number = Math.floor(idx / daysPerWeek) + 1;
    const day_number = (idx % daysPerWeek) + 1;

    const blocks = Array.isArray(prog.blocks) ? prog.blocks : [];
    const blockInfo = findBlockForWeek(blocks, week_number);
    if (!blockInfo) {
      return res.json({
        date,
        is_training_day: true,
        program_id: prog.id,
        week_number,
        day_number,
        rows: [],
        reason: "week_out_of_range",
      });
    }

    const day =
      (blockInfo.block?.days || []).find(
        (d) => Number(d?.day_number) === day_number
      ) || null;

    const wkKey = `W${week_number}`;
    const rowsRaw = Array.isArray(day?.rows) ? day.rows : [];
    const rows = rowsRaw.map((r) => {
      const week_target = r?.week_values?.[wkKey] ?? "";
      return { ...r, week_target, wk_key: wkKey };
    });

    res.json({
      date,
      is_training_day: true,
      program_id: prog.id,
      week_number,
      day_number,
      block_number: blockInfo.block_number,
      block_week: blockInfo.block_week,
      day_title: day?.title || `Day ${day_number}`,
      wk_key: wkKey,
      rows,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/programs/active/progress", requireAuth, async (req, res) => {
  try {
    const today = String(req.query?.date || toISODateLocal(new Date()));
    if (!parseISODateLocal(today)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    const u = await pool.query(
      `select active_program_id from public.app_users where id=$1`,
      [req.user.id]
    );
    const pid = u.rows?.[0]?.active_program_id || null;
    if (!pid) return res.json({ has_program: false });

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days
       from public.programs_app
       where id=$1 and user_id=$2`,
      [pid, req.user.id]
    );
    if (p.rowCount === 0) return res.json({ has_program: false });

    const prog = p.rows[0];
    const startISO = prog.start_date ? toISODateLocal(new Date(prog.start_date)) : null;
    if (!startISO) {
      return res.json({
        has_program: true,
        program_id: prog.id,
        reason: "missing_start_date",
      });
    }

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const totalWeeks = Math.max(0, Number(prog.total_weeks || 0));
    const totalSessions = totalWeeks * daysPerWeek;

    const trainingDays = Array.isArray(prog.training_days)
      ? prog.training_days.map(Number)
      : [];
    const idx = trainingSessionIndexLocal(startISO, today, trainingDays);

    let current_week = null;
    let current_day = null;
    let progress_pct = null;

    if (idx != null && idx >= 0 && totalSessions > 0 && idx < totalSessions) {
      current_week = Math.floor(idx / daysPerWeek) + 1;
      current_day = (idx % daysPerWeek) + 1;
      progress_pct = ((idx + 1) / totalSessions) * 100;
    }

    const lookAhead = 28;
    const dates = [];
    const startD = parseISODateLocal(today);
    for (let i = 0; i <= lookAhead; i++) {
      const d = new Date(
        startD.getFullYear(),
        startD.getMonth(),
        startD.getDate() + i,
        0, 0, 0, 0
      );
      const iso = toISODateLocal(d);
      const wd = d.getDay();
      if (trainingDays.includes(wd)) dates.push(iso);
    }
    const next_training_date = dates[0] || null;

    res.json({
      has_program: true,
      program_id: prog.id,
      program_name: prog.name,
      start_date: startISO,
      total_weeks: totalWeeks,
      days_per_week: daysPerWeek,
      training_days: trainingDays,
      current_week,
      current_day,
      progress_pct,
      next_training_date,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =====================
   Daily
===================== */
app.get("/api/daily", requireAuth, async (req, res) => {
  try {
    const from = String(req.query?.from || "");
    const to = String(req.query?.to || "");
    if (!parseISODateLocal(from) || !parseISODateLocal(to)) {
      return res.status(400).json({ error: "from/to required (YYYY-MM-DD)" });
    }

    const q = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, entries, is_completed, completed_at, created_at, updated_at
       from public.daily_entries_app
       where user_id=$1 and entry_date between $2::date and $3::date
       order by entry_date asc`,
      [req.user.id, from, to]
    );

    res.json(q.rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/daily/:date", requireAuth, async (req, res) => {
  try {
    const date = String(req.params.date || "");
    if (!parseISODate(date)) {
      return res.status(400).json({ error: "Invalid date (YYYY-MM-DD)" });
    }

    const q = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes,
              entries, is_completed, completed_at, created_at, updated_at
       from public.daily_entries_app
       where user_id=$1 and entry_date=$2::date`,
      [req.user.id, date]
    );

    res.json({ day: q.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/daily/:date", requireAuth, async (req, res) => {
  try {
    const date = String(req.params.date || "");
    if (!parseISODate(date)) {
      return res.status(400).json({ error: "Invalid date (YYYY-MM-DD)" });
    }

    const payload = req.body || {};
    const unit = (payload.unit || "kg").toString();
    const bodyweight = toNum(payload.bodyweight);
    const sleep_hours = toNum(payload.sleep_hours);
    const pec_pain_0_10 =
      payload.pec_pain_0_10 != null ? Number(payload.pec_pain_0_10) : null;
    const zone2_mins =
      payload.zone2_mins != null ? Number(payload.zone2_mins) : null;
    const notes = payload.notes != null ? String(payload.notes) : null;
    const entries = Array.isArray(payload.entries) ? payload.entries : [];

    const is_completed = payload.is_completed === true;
    const completed_at = payload.completed_at ? new Date(payload.completed_at) : null;
    const completedAtSafe =
      completed_at && Number.isFinite(completed_at.getTime())
        ? completed_at.toISOString()
        : null;

    const q = await pool.query(
      `insert into public.daily_entries_app
        (user_id, entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes,
         entries, is_completed, completed_at, updated_at)
       values
        ($1,$2::date,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,now())
       on conflict (user_id, entry_date) do update set
         unit = excluded.unit,
         bodyweight = excluded.bodyweight,
         sleep_hours = excluded.sleep_hours,
         pec_pain_0_10 = excluded.pec_pain_0_10,
         zone2_mins = excluded.zone2_mins,
         notes = excluded.notes,
         entries = excluded.entries,
         is_completed = excluded.is_completed,
         completed_at = case
           when excluded.is_completed = true then coalesce(excluded.completed_at, public.daily_entries_app.completed_at, now())
           else null
         end,
         updated_at = now()
       returning entry_date, is_completed, completed_at`,
      [
        req.user.id,
        date,
        unit,
        bodyweight,
        sleep_hours,
        pec_pain_0_10,
        zone2_mins,
        notes,
        JSON.stringify(entries),
        is_completed,
        completedAtSafe,
      ]
    );
        const prCandidates = [];

    for (const e of entries) {
      const exercise = String(e?.exercise || "").trim();
      if (!exercise) continue;

      const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
      const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
      const e1rm = e1rmEpley(top, reps);

      if (e1rm == null) continue;

      prCandidates.push({
        exercise,
        top,
        reps,
        e1rm,
      });
    }

   // ✅ Step 1: keep only BEST set per exercise
const bestByExercise = {};

for (const c of prCandidates) {
  if (!bestByExercise[c.exercise] || c.top > bestByExercise[c.exercise].top) {
    bestByExercise[c.exercise] = c;
  }
}

// ✅ Step 2: run PR logic once per exercise
for (const c of Object.values(bestByExercise)) {
  const prev = await db.query(`
    select max(weight) as best
    from daily_entries_app
    where user_id = $1
      and exercise = $2
  `, [req.user.id, c.exercise]);

  const prevBestWeight = prev.rows[0]?.best || 0;

  if (c.top > prevBestWeight) {
    await createPrEventsForGroups({
      userId: req.user.id,
      exercise: c.exercise,
      e1rm: c.e1rm,
      top: c.top,
      reps: c.reps,
      date,
    });
  }
}
    res.json({
      ok: true,
      entry_date: q.rows[0]?.entry_date,
      is_completed: q.rows[0]?.is_completed,
      completed_at: q.rows[0]?.completed_at,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/daily/:date/entries", requireAuth, async (req, res) => {
  try {
    const date = String(req.params.date || "");
    if (!parseISODate(date)) {
      return res.status(400).json({ error: "Invalid date (YYYY-MM-DD)" });
    }

    const entry = req.body?.entry;
    if (!entry || typeof entry !== "object") {
      return res.status(400).json({ error: "entry object is required" });
    }

    const q = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes,
              entries, is_completed, completed_at
       from public.daily_entries_app
       where user_id=$1 and entry_date=$2::date`,
      [req.user.id, date]
    );

    const existing = q.rows[0] || null;
    const entries = Array.isArray(existing?.entries) ? existing.entries : [];
    const nextEntries = [...entries, entry];

    const up = await pool.query(
      `insert into public.daily_entries_app
        (user_id, entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes,
         entries, is_completed, completed_at, updated_at)
       values
        ($1,$2::date,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,now())
       on conflict (user_id, entry_date) do update set
         unit = excluded.unit,
         bodyweight = excluded.bodyweight,
         sleep_hours = excluded.sleep_hours,
         pec_pain_0_10 = excluded.pec_pain_0_10,
         zone2_mins = excluded.zone2_mins,
         notes = excluded.notes,
         entries = excluded.entries,
         is_completed = excluded.is_completed,
         completed_at = excluded.completed_at,
         updated_at = now()
       returning entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes,
                 entries, is_completed, completed_at, created_at, updated_at`,
      [
        req.user.id,
        date,
        existing?.unit || "kg",
        existing?.bodyweight ?? null,
        existing?.sleep_hours ?? null,
        existing?.pec_pain_0_10 ?? null,
        existing?.zone2_mins ?? null,
        existing?.notes ?? null,
        JSON.stringify(nextEntries),
        existing?.is_completed === true,
        existing?.completed_at ?? null,
      ]
    );

    res.json({ ok: true, day: up.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =====================
   Adherence
===================== */
app.get("/api/adherence/program", requireAuth, async (req, res) => {
  try {
    const from = String(req.query?.from || "");
    const to = String(req.query?.to || "");
    if (!parseISODate(from) || !parseISODate(to)) {
      return res.status(400).json({ error: "from/to required (YYYY-MM-DD)" });
    }

    const span = daysBetweenUTC(from, to);
    if (span == null || span < 0) {
      return res.status(400).json({ error: "to must be >= from" });
    }
    if (span > 365) {
      return res.status(400).json({ error: "Range too large (max 365 days)" });
    }

    const u = await pool.query(
      `select active_program_id from public.app_users where id=$1`,
      [req.user.id]
    );
    const pid = u.rows?.[0]?.active_program_id || null;
    if (!pid) {
      return res.json({
        from,
        to,
        program_id: null,
        planned_sessions: 0,
        completed_sessions: 0,
        adherence_pct: null,
        by_week: [],
        reason: "no_active_program",
      });
    }

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days
       from public.programs_app
       where id=$1 and user_id=$2`,
      [pid, req.user.id]
    );
    if (p.rowCount === 0) {
      return res.json({
        from,
        to,
        program_id: pid,
        planned_sessions: 0,
        completed_sessions: 0,
        adherence_pct: null,
        by_week: [],
        reason: "program_missing",
      });
    }

    const prog = p.rows[0];
    const startISO = prog.start_date ? String(prog.start_date) : null;
    if (!parseISODate(startISO || "")) {
      return res.json({
        from,
        to,
        program_id: prog.id,
        planned_sessions: 0,
        completed_sessions: 0,
        adherence_pct: null,
        by_week: [],
        reason: "program_missing_start_date",
      });
    }

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const totalWeeks = Math.max(0, Number(prog.total_weeks || 0));
    const totalSessions = totalWeeks * daysPerWeek;
    const trainingDays = Array.isArray(prog.training_days)
      ? prog.training_days.map(Number)
      : [];
    const trainingSet = new Set(trainingDays);

    const dQ = await pool.query(
      `select entry_date, entries
       from public.daily_entries_app
       where user_id=$1 and entry_date between $2::date and $3::date`,
      [req.user.id, from, to]
    );

    const dailyByDate = new Map(dQ.rows.map((r) => [String(r.entry_date), r]));
    const dates = eachDateUTC(from, to);

    let planned = 0;
    let completed = 0;
    const byWeekMap = new Map();

    for (const iso of dates) {
      const wd = weekdayUTC(iso);
      const isTrainingDay = trainingSet.has(wd);

      let isPlanned = false;
      let week_number = null;
      let day_number = null;
      let block_number = null;
      let block_week = null;

      if (isTrainingDay) {
        const idx = trainingSessionIndex(startISO, iso, trainingDays);
        if (idx != null && idx >= 0 && idx < totalSessions) {
          isPlanned = true;
          week_number = Math.floor(idx / daysPerWeek) + 1;
          day_number = (idx % daysPerWeek) + 1;

          const blocks = Array.isArray(prog.blocks) ? prog.blocks : [];
          const b = findBlockForWeek(blocks, week_number);
          if (b) {
            block_number = b.block_number;
            block_week = b.block_week;
          }
        }
      }

      const dayRow = dailyByDate.get(iso);
      const isCompleted = isPlanned && dayRow ? isDayCompleted(dayRow) : false;

      if (isPlanned) planned++;
      if (isCompleted) completed++;

      if (isPlanned) {
        if (!byWeekMap.has(week_number)) {
          byWeekMap.set(week_number, {
            week_number,
            planned: 0,
            completed: 0,
            dates: [],
          });
        }
        const bucket = byWeekMap.get(week_number);
        bucket.planned += 1;
        bucket.completed += isCompleted ? 1 : 0;
        bucket.dates.push({
          date: iso,
          week_number,
          day_number,
          block_number,
          block_week,
          completed: isCompleted,
        });
      }
    }

    const by_week = Array.from(byWeekMap.values()).sort(
      (a, b) => a.week_number - b.week_number
    );

    res.json({
      from,
      to,
      program_id: prog.id,
      program_name: prog.name,
      start_date: startISO,
      training_days: trainingDays,
      days_per_week: daysPerWeek,
      total_weeks: totalWeeks,
      planned_sessions: planned,
      completed_sessions: completed,
      adherence_pct: planned ? (completed / planned) * 100 : null,
      by_week,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/adherence", requireAuth, async (req, res) => {
  try {
    const from = String(req.query?.from || "");
    const to = String(req.query?.to || "");
    if (!parseISODate(from) || !parseISODate(to)) {
      return res.status(400).json({ error: "from/to required (YYYY-MM-DD)" });
    }

    const u = await pool.query(
      `select active_program_id from public.app_users where id=$1`,
      [req.user.id]
    );
    const pid = u.rows?.[0]?.active_program_id;
    if (!pid) {
      return res.json({
        from,
        to,
        has_program: false,
        sessions_planned: 0,
        sessions_logged: 0,
        sessions_completed: 0,
        exercise_hits: 0,
        exercise_misses: 0,
        top_missed: [],
        days: [],
      });
    }

    const p = await pool.query(
      `select id, name, days_per_week, blocks, start_date, training_days
       from public.programs_app
       where id=$1 and user_id=$2`,
      [pid, req.user.id]
    );
    if (p.rowCount === 0) {
      return res.json({
        from,
        to,
        has_program: false,
        sessions_planned: 0,
        sessions_logged: 0,
        sessions_completed: 0,
        exercise_hits: 0,
        exercise_misses: 0,
        top_missed: [],
        days: [],
      });
    }

    const prog = p.rows[0];
    const start = prog.start_date ? toISODateUTC(new Date(prog.start_date)) : null;
    const trainingDays = Array.isArray(prog.training_days)
      ? prog.training_days.map(Number)
      : [];
    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const blocks = Array.isArray(prog.blocks) ? prog.blocks : [];

    if (!start || trainingDays.length === 0) {
      return res.json({
        from,
        to,
        has_program: true,
        program_id: prog.id,
        reason: !start ? "missing_start_date" : "missing_training_days",
        sessions_planned: 0,
        sessions_logged: 0,
        sessions_completed: 0,
        exercise_hits: 0,
        exercise_misses: 0,
        top_missed: [],
        days: [],
      });
    }

    const logsQ = await pool.query(
      `select entry_date, entries, is_completed, completed_at
       from public.daily_entries_app
       where user_id=$1 and entry_date between $2::date and $3::date
       order by entry_date asc`,
      [req.user.id, from, to]
    );

    const logsByDate = new Map(
      logsQ.rows.map((r) => [toISODateUTC(new Date(r.entry_date)), r])
    );

    const daysOut = [];
    const missedCounts = new Map();

    let sessions_planned = 0;
    let sessions_logged = 0;
    let sessions_completed = 0;
    let exercise_hits = 0;
    let exercise_misses = 0;

    for (let cur = from; cur <= to; cur = addDaysISO(cur, 1)) {
      const wd = weekdayUTC(cur);
      const isTrainingDay = trainingDays.includes(Number(wd));
      if (!isTrainingDay) {
        daysOut.push({ date: cur, is_training_day: false });
        continue;
      }

      sessions_planned++;

      const idx = trainingSessionIndex(start, cur, trainingDays);
      if (idx == null || idx < 0) {
        daysOut.push({
          date: cur,
          is_training_day: true,
          planned_rows: 0,
          logged_rows: 0,
          completed: false,
          reason: "before_program_start",
        });
        continue;
      }

      const week_number = Math.floor(idx / daysPerWeek) + 1;
      const day_number = (idx % daysPerWeek) + 1;

      const plan = plannedSessionForWeekAndDay(blocks, week_number, day_number);
      const plannedRows = (plan.rows || []).filter((r) => isNonEmpty(r?.exercise));

      const log = logsByDate.get(cur) || null;
      const loggedEntries = Array.isArray(log?.entries) ? log.entries : [];

      const completed =
        log?.is_completed === true ||
        loggedEntries.some((e) => e?.completed === true) ||
        (loggedEntries.length > 0 &&
          loggedEntries.every((e) => {
            const top = e?.actual?.top ?? e?.top;
            const reps = e?.actual?.reps ?? e?.reps;
            return isNonEmpty(top) || isNonEmpty(reps);
          }));

      if (log) sessions_logged++;
      if (completed) sessions_completed++;

      for (const pr of plannedRows) {
        const ex = String(pr.exercise || "").trim();
        if (!ex) continue;

        const match = loggedEntries.find(
          (e) => String(e?.exercise || "").trim() === ex
        );

        const actualTop = match?.actual?.top ?? match?.top;
        const actualReps = match?.actual?.reps ?? match?.reps;

        const didAnyWork =
          isNonEmpty(actualTop) ||
          isNonEmpty(actualReps) ||
          match?.completed === true;

        if (didAnyWork) {
          exercise_hits++;
        } else {
          exercise_misses++;
          missedCounts.set(ex, (missedCounts.get(ex) || 0) + 1);
        }
      }

      daysOut.push({
        date: cur,
        is_training_day: true,
        week_number,
        day_number,
        block_number: plan.block_number,
        block_week: plan.block_week,
        planned_rows: plannedRows.length,
        logged_rows: loggedEntries.length,
        completed,
      });
    }

    const top_missed = Array.from(missedCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([exercise, misses]) => ({ exercise, misses }));

    res.json({
      from,
      to,
      has_program: true,
      program_id: prog.id,
      sessions_planned,
      sessions_logged,
      sessions_completed,
      exercise_hits,
      exercise_misses,
      top_missed,
      days: daysOut,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =====================
   Mobile / Next Session
===================== */
app.get("/api/daily/next-session", requireAuth, async (req, res) => {
  try {
    const fromDate = String(req.query?.from || toISODateLocal(new Date()));
    if (!parseISODateLocal(fromDate)) {
      return res.status(400).json({ error: "from must be YYYY-MM-DD" });
    }

    const u = await pool.query(
      `select active_program_id
       from public.app_users
       where id=$1`,
      [req.user.id]
    );

    const pid = u.rows?.[0]?.active_program_id || null;
    if (!pid) {
      return res.json({
        has_program: false,
        reason: "no_active_program",
      });
    }

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days
       from public.programs_app
       where id=$1 and user_id=$2`,
      [pid, req.user.id]
    );

    if (p.rowCount === 0) {
      return res.json({
        has_program: false,
        reason: "program_missing",
      });
    }

    const prog = p.rows[0];
    const startISO = prog.start_date ? toISODateLocal(new Date(prog.start_date)) : null;

    if (!startISO || !parseISODateLocal(startISO)) {
      return res.json({
        has_program: true,
        program_id: prog.id,
        reason: "program_missing_start_date",
      });
    }

    const trainingDays = Array.isArray(prog.training_days)
      ? prog.training_days.map(Number)
      : [];

    if (!trainingDays.length) {
      return res.json({
        has_program: true,
        program_id: prog.id,
        reason: "program_missing_training_days",
      });
    }

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const totalWeeks = Math.max(0, Number(prog.total_weeks || sumProgramWeeks(prog.blocks)));
    const totalSessions = totalWeeks * daysPerWeek;
    const blocks = Array.isArray(prog.blocks) ? prog.blocks : [];

    const dQ = await pool.query(
      `select entry_date, unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes,
              entries, is_completed, completed_at, created_at, updated_at
       from public.daily_entries_app
       where user_id=$1
       order by entry_date asc`,
      [req.user.id]
    );

    const dailyByDate = new Map(
      (dQ.rows || []).map((r) => [String(r.entry_date), r])
    );

    const scanStart = parseISODateLocal(fromDate);
    const maxLookAheadDays = 365;

    for (let i = 0; i < maxLookAheadDays; i++) {
      const d = new Date(
        scanStart.getFullYear(),
        scanStart.getMonth(),
        scanStart.getDate() + i,
        0, 0, 0, 0
      );

      const iso = toISODateLocal(d);
      const wd = d.getDay();

      if (!trainingDays.includes(wd)) continue;

      const idx = trainingSessionIndexLocal(startISO, iso, trainingDays);
      if (idx == null || idx < 0) continue;
      if (idx >= totalSessions) break;

      const week_number = Math.floor(idx / daysPerWeek) + 1;
      const day_number = (idx % daysPerWeek) + 1;

      const blockInfo = findBlockForWeek(blocks, week_number);
      const day = (blockInfo?.block?.days || []).find(
        (x) => Number(x?.day_number) === Number(day_number)
      ) || null;

      const wkKey = `W${week_number}`;
      const rowsRaw = Array.isArray(day?.rows) ? day.rows : [];
      const plannedRows = rowsRaw.map((r) => ({
        ...r,
        week_target: r?.week_values?.[wkKey] ?? "",
        wk_key: wkKey,
      }));

      const existing = dailyByDate.get(iso) || null;
      const existingEntries = Array.isArray(existing?.entries) ? existing.entries : [];

      const hasAnyLoggedWork =
        existing?.is_completed === true ||
        existingEntries.some((e) =>
          e?.completed === true ||
          (e?.actual?.top != null && String(e.actual.top).trim() !== "") ||
          (e?.actual?.reps != null && String(e.actual.reps).trim() !== "") ||
          (e?.actual?.rpe != null && String(e.actual.rpe).trim() !== "") ||
          (e?.top != null && String(e.top).trim() !== "") ||
          (e?.reps != null && String(e.reps).trim() !== "") ||
          (e?.rpe != null && String(e.rpe).trim() !== "")
        );

      if (!hasAnyLoggedWork) {
        return res.json({
          has_program: true,
          program_id: prog.id,
          program_name: prog.name,
          date: iso,
          week_number,
          day_number,
          block_number: blockInfo?.block_number || null,
          block_week: blockInfo?.block_week || null,
          day_title: day?.title || `Day ${day_number}`,
          is_training_day: true,
          is_logged: false,
          rows: plannedRows,
          day: existing,
        });
      }
    }
        for (let i = 0; i < maxLookAheadDays; i++) {
      const d = new Date(
        scanStart.getFullYear(),
        scanStart.getMonth(),
        scanStart.getDate() + i,
        0, 0, 0, 0
      );

      const iso = toISODateLocal(d);
      const wd = d.getDay();

      if (!trainingDays.includes(wd)) continue;

      const idx = trainingSessionIndexLocal(startISO, iso, trainingDays);
      if (idx == null || idx < 0) continue;
      if (idx >= totalSessions) break;

      const week_number = Math.floor(idx / daysPerWeek) + 1;
      const day_number = (idx % daysPerWeek) + 1;

      const blockInfo = findBlockForWeek(blocks, week_number);
      const day = (blockInfo?.block?.days || []).find(
        (x) => Number(x?.day_number) === Number(day_number)
      ) || null;

      const wkKey = `W${week_number}`;
      const rowsRaw = Array.isArray(day?.rows) ? day.rows : [];
      const plannedRows = rowsRaw.map((r) => ({
        ...r,
        week_target: r?.week_values?.[wkKey] ?? "",
        wk_key: wkKey,
      }));

      const existing = dailyByDate.get(iso) || null;

      return res.json({
        has_program: true,
        program_id: prog.id,
        program_name: prog.name,
        date: iso,
        week_number,
        day_number,
        block_number: blockInfo?.block_number || null,
        block_week: blockInfo?.block_week || null,
        day_title: day?.title || `Day ${day_number}`,
        is_training_day: true,
        is_logged: !!existing,
        rows: plannedRows,
        day: existing,
      });
    }

    return res.json({
      has_program: true,
      program_id: prog.id,
      program_name: prog.name,
      reason: "no_future_sessions_found",
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =====================
   Exercise explorer
===================== */
app.get("/api/exercises/explorer", requireAuth, async (req, res) => {
  try {
    const exercise = String(req.query?.exercise || "").trim();
    if (!exercise) {
      return res.status(400).json({ error: "exercise is required" });
    }

    const target = normalizeExerciseName(exercise);

    const dailyQ = await pool.query(
      `select entry_date, unit, entries
       from public.daily_entries_app
       where user_id=$1
       order by entry_date asc`,
      [req.user.id]
    );

    const weeklyQ = await pool.query(
      `select week_number, unit, entries
       from public.weekly_entries_app
       where user_id=$1
       order by week_number asc`,
      [req.user.id]
    );

    const programQ = await pool.query(
      `select id, name, blocks
       from public.programs_app
       where user_id=$1
       order by created_at desc`,
      [req.user.id]
    );

    const hits = [];

    function matchesExerciseName(rawName) {
      const ex = normalizeExerciseName(rawName);
      if (!ex) return false;
      return ex === target;
    }

    for (const row of dailyQ.rows || []) {
      const entries = Array.isArray(row.entries) ? row.entries : [];

      for (const e of entries) {
        if (!matchesExerciseName(e?.exercise)) continue;

        const top = parseLoadNumber(e?.actual?.top ?? e?.top);
        const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
        const rpe = e?.actual?.rpe ?? e?.rpe ?? null;

        if (!Number.isFinite(top) || !Number.isFinite(reps) || top <= 0 || reps <= 0) {
          continue;
        }

        const dateStr = row.entry_date ? String(row.entry_date) : null;

        hits.push({
          source: "daily",
          priority: 3,
          week: null,
          date: dateStr,
          top,
          reps,
          rpe,
          e1rm: e1rmEpley(top, reps),
          submitted_at_label: formatDateWithWeeksAgo(dateStr),
        });
      }
    }

    for (const row of weeklyQ.rows || []) {
      const entries = Array.isArray(row.entries) ? row.entries : [];

      for (const e of entries) {
        if (!matchesExerciseName(e?.exercise)) continue;

        const top = parseLoadNumber(e?.actual?.top ?? e?.top);
        const reps = parseLoadNumber(e?.reps ?? e?.actual?.reps);
        const rpe = e?.rpe ?? e?.actual?.rpe ?? null;

        if (!Number.isFinite(top) || !Number.isFinite(reps) || top <= 0 || reps <= 0) {
          continue;
        }

        hits.push({
          source: "weekly",
          priority: 2,
          week: row.week_number,
          date: null,
          top,
          reps,
          rpe,
          e1rm: e1rmEpley(top, reps),
          submitted_at_label: row.week_number != null ? `Week ${row.week_number}` : null,
        });
      }
    }

    for (const program of programQ.rows || []) {
      const blocks = Array.isArray(program.blocks) ? program.blocks : [];

      for (const block of blocks) {
        const days = Array.isArray(block?.days) ? block.days : [];

        for (const day of days) {
          const rows = Array.isArray(day?.rows) ? day.rows : [];

          for (const row of rows) {
            if (!matchesExerciseName(row?.exercise)) continue;

            const targetReps = parseSetsRepsTargetReps(row?.sets_reps);
            if (!Number.isFinite(targetReps) || targetReps <= 0) continue;

            const weekValues =
              row?.week_values && typeof row.week_values === "object"
                ? row.week_values
                : {};

            for (const [wkKey, wkValue] of Object.entries(weekValues)) {
              const m = String(wkKey).match(/^W(\d+)$/i);
              if (!m) continue;

              const absoluteWeek = Number(m[1]);
              const top = parseLoadNumber(wkValue);
              if (!Number.isFinite(top) || top <= 0) continue;

              hits.push({
                source: "program",
                priority: 1,
                top,
                reps: targetReps,
                e1rm: e1rmEpley(top, targetReps),
                date: null,
                week: absoluteWeek,
                rpe: row?.load_rpe ?? null,
                submitted_at_label: `Program week ${absoluteWeek}`,
              });
            }
          }
        }
      }
    }

    const sortBest = (a, b) => {
      const e1 = (Number(b?.e1rm) || -Infinity) - (Number(a?.e1rm) || -Infinity);
      if (e1 !== 0) return e1;

      const topDiff = (Number(b?.top) || -Infinity) - (Number(a?.top) || -Infinity);
      if (topDiff !== 0) return topDiff;

      const prio = (Number(b?.priority) || 0) - (Number(a?.priority) || 0);
      if (prio !== 0) return prio;

      const bd = b?.date ? new Date(b.date).getTime() : 0;
      const ad = a?.date ? new Date(a.date).getTime() : 0;
      if (bd !== ad) return bd - ad;

      return (Number(b?.week) || 0) - (Number(a?.week) || 0);
    };

    const bucketOrder = ["1", "2", "3", "4", "5", "6", "8", "10", "12", "13+"];

    const best_by_rep_bucket = bucketOrder.map((bucket) => {
      const bucketRows = hits
        .filter((h) => bucketForReps(h.reps) === bucket)
        .sort(sortBest);

      const best = bucketRows[0] || null;

      return {
        bucket,
        top: best?.top ?? null,
        reps: best?.reps ?? null,
        e1rm: best?.e1rm ?? null,
        date: best?.date ?? null,
        week: best?.week ?? null,
        submitted_at_label: best?.submitted_at_label ?? null,
        source: best?.source ?? null,
      };
    });

    const dailyRecentCutoff = new Date();
    dailyRecentCutoff.setDate(dailyRecentCutoff.getDate() - 56);

    const recentHits = hits.filter((h) => {
      if (!h.date) return false;
      const d = new Date(h.date);
      return Number.isFinite(d.getTime()) && d >= dailyRecentCutoff;
    });

    const best_by_rep_bucket_recent = bucketOrder.map((bucket) => {
      const bucketRows = recentHits
        .filter((h) => bucketForReps(h.reps) === bucket)
        .sort(sortBest);

      const best = bucketRows[0] || null;

      return {
        bucket,
        top: best?.top ?? null,
        reps: best?.reps ?? null,
        e1rm: best?.e1rm ?? null,
        date: best?.date ?? null,
        week: best?.week ?? null,
        submitted_at_label: best?.submitted_at_label ?? null,
        source: best?.source ?? null,
      };
    });

    const validHits = hits.filter(
      (h) => Number.isFinite(h.top) && Number.isFinite(h.reps) && h.top > 0 && h.reps > 0
    );

    const bestE1 = [...validHits].sort(sortBest)[0] || null;

    const bestLoad =
      [...validHits].sort((a, b) => {
        const td = (Number(b?.top) || -Infinity) - (Number(a?.top) || -Infinity);
        if (td !== 0) return td;
        return sortBest(a, b);
      })[0] || null;

    const actualTrendHits = validHits
      .filter((h) => h.source === "daily" || h.source === "weekly")
      .sort((a, b) => {
        const aHasDate = !!a?.date;
        const bHasDate = !!b?.date;

        if (aHasDate && bHasDate) {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        }

        if (!aHasDate && !bHasDate) {
          return (Number(a?.week) || 0) - (Number(b?.week) || 0);
        }

        if (aHasDate && !bHasDate) return -1;
        if (!aHasDate && bHasDate) return 1;

        return 0;
      });

    const plannedBestByWeek = new Map();
    for (const h of validHits.filter((x) => x.source === "program" && Number.isFinite(x?.week))) {
      const wk = Number(h.week);
      const cur = plannedBestByWeek.get(wk);
      if (!cur || Number(h.e1rm) > Number(cur.e1rm)) {
        plannedBestByWeek.set(wk, h);
      }
    }

    const plannedTrendHits = Array.from(plannedBestByWeek.values()).sort(
      (a, b) => Number(a.week) - Number(b.week)
    );

    const trendHistory = [
      ...actualTrendHits.map((h, idx) => ({
        idx: idx + 1,
        label: h?.date
          ? new Date(h.date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            })
          : h?.week != null
            ? `W${h.week}`
            : `Point ${idx + 1}`,
        source: h?.source || null,
        top: h?.top ?? null,
        reps: h?.reps ?? null,
        e1rm: h?.e1rm ?? null,
        date: h?.date ?? null,
        week: h?.week ?? null,
        submitted_at_label: h?.submitted_at_label ?? null,
      })),
      ...plannedTrendHits.map((h, idx) => ({
        idx: actualTrendHits.length + idx + 1,
        label: h?.week != null ? `W${h.week}` : `Plan ${idx + 1}`,
        source: "program",
        top: h?.top ?? null,
        reps: h?.reps ?? null,
        e1rm: h?.e1rm ?? null,
        date: null,
        week: h?.week ?? null,
        submitted_at_label: h?.submitted_at_label ?? null,
      })),
    ];

    return res.json({
      exercise,
      total_sets_found: validHits.length,
      best_by_rep_bucket,
      best_by_rep_bucket_recent,
      trend_history: trendHistory,
      best_e1rm: bestE1
        ? {
            top: bestE1.top,
            reps: bestE1.reps,
            e1rm: bestE1.e1rm,
            date: bestE1.date,
            week: bestE1.week,
            submitted_at_label: bestE1.submitted_at_label,
            source: bestE1.source,
          }
        : null,
      best_load: bestLoad
        ? {
            top: bestLoad.top,
            reps: bestLoad.reps,
            e1rm: bestLoad.e1rm,
            date: bestLoad.date,
            week: bestLoad.week,
            submitted_at_label: bestLoad.submitted_at_label,
            source: bestLoad.source,
          }
        : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/exercises/stats", requireAuth, async (req, res) => {
  try {
    const name = String(req.query?.name || "").trim();
    if (!name) return res.status(400).json({ error: "name required" });

    const from = req.query?.from ? String(req.query.from) : null;
    const to = req.query?.to ? String(req.query.to) : null;

    if (from && !parseISODate(from)) {
      return res.status(400).json({ error: "from must be YYYY-MM-DD" });
    }
    if (to && !parseISODate(to)) {
      return res.status(400).json({ error: "to must be YYYY-MM-DD" });
    }

    let q;
    if (from && to) {
      q = await pool.query(
        `select entry_date, entries
         from public.daily_entries_app
         where user_id=$1 and entry_date between $2::date and $3::date
         order by entry_date asc`,
        [req.user.id, from, to]
      );
    } else {
      q = await pool.query(
        `select entry_date, entries
         from public.daily_entries_app
         where user_id=$1
         order by entry_date asc`,
        [req.user.id]
      );
    }

    const bestByReps = new Map();
    const history = [];

    for (const row of q.rows) {
      const iso = String(row.entry_date);
      const entries = Array.isArray(row.entries) ? row.entries : [];

      for (const e of entries) {
        const ex = String(e?.exercise || "").trim();
        if (ex.toLowerCase() !== name.toLowerCase()) continue;

        const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
        const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
        const rpe = e?.actual?.rpe ?? e?.rpe ?? null;

        if (top == null || reps == null) continue;

        const repsInt = Math.max(1, Math.trunc(reps));
        const bucket = repsInt >= 13 ? "13+" : String(repsInt);
        const e1rm = e1rmEpley(top, repsInt);

        const rec = { date: iso, top, reps: repsInt, rpe, e1rm };
        const cur = bestByReps.get(bucket);

        if (
          !cur ||
          (rec.e1rm != null && cur.e1rm != null && rec.e1rm > cur.e1rm) ||
          (rec.e1rm === cur.e1rm && rec.top > cur.top)
        ) {
          bestByReps.set(bucket, rec);
        }

        history.push(rec);
      }
    }

    const buckets = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13+"];

    res.json({
      exercise: name,
      best_by_reps: buckets.map((b) => ({
        reps_bucket: b,
        best: bestByReps.get(b) || null,
      })),
      history,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.post("/api/exercises/history/batch", requireAuth, async (req, res) => {
  try {
    const names = Array.isArray(req.body?.exercises)
      ? req.body.exercises.map((x) => String(x || "").trim()).filter(Boolean)
      : [];

    if (!names.length) {
      return res.json({ history_by_exercise: {} });
    }

    const uniqueNames = Array.from(new Set(names)).slice(0, 50);

    const q = await pool.query(
      `select entry_date, entries
       from public.daily_entries_app
       where user_id=$1
       order by entry_date desc`,
      [req.user.id]
    );

    const historyByExercise = {};

    for (const name of uniqueNames) {
      const target = normalizeExerciseName(name);
      const hits = [];

      for (const row of q.rows) {
        const iso = String(row.entry_date);
        const entries = Array.isArray(row.entries) ? row.entries : [];

        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== target) continue;

          const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
          const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
          const rpe = e?.actual?.rpe ?? e?.rpe ?? null;
          const e1rm = e1rmEpley(top, reps);

          if (top == null || reps == null) continue;

          hits.push({
            date: iso,
            top,
            reps,
            rpe,
            e1rm,
          });
        }
      }

      const bestAllTime = hits
        .filter((x) => Number.isFinite(Number(x.e1rm)))
        .sort((a, b) => Number(b.e1rm) - Number(a.e1rm))[0] || null;

      const recentCutoff = new Date();
      recentCutoff.setDate(recentCutoff.getDate() - 56);

      const bestRecent = hits
        .filter((x) => {
          const d = new Date(x.date);
          return Number.isFinite(d.getTime()) && d >= recentCutoff;
        })
        .filter((x) => Number.isFinite(Number(x.e1rm)))
        .sort((a, b) => Number(b.e1rm) - Number(a.e1rm))[0] || null;

      historyByExercise[name] = {
        last_entries: hits.slice(0, 3),
        best_recent_e1rm: bestRecent?.e1rm ?? null,
        best_all_time_e1rm: bestAllTime?.e1rm ?? null,
      };
    }

    return res.json({ history_by_exercise: historyByExercise });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/programs/active/next-session", requireAuth, async (req, res) => {
  try {
    const u = await pool.query(
      `select active_program_id
       from public.app_users
       where id=$1`,
      [req.user.id]
    );

    const pid = u.rows?.[0]?.active_program_id || null;
    if (!pid) {
      return res.json({ has_program: false, reason: "no_active_program" });
    }

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days
       from public.programs_app
       where id=$1 and user_id=$2`,
      [pid, req.user.id]
    );

    if (p.rowCount === 0) {
      return res.json({ has_program: false, reason: "program_missing" });
    }

    const prog = p.rows[0];
    const startISO = prog.start_date ? String(prog.start_date) : null;

    if (!startISO || !parseISODateLocal(startISO)) {
      return res.json({
        has_program: true,
        program_id: prog.id,
        reason: "program_missing_start_date",
      });
    }

    const trainingDays = Array.isArray(prog.training_days)
      ? prog.training_days.map(Number)
      : [];

    if (!trainingDays.length) {
      return res.json({
        has_program: true,
        program_id: prog.id,
        reason: "program_missing_training_days",
      });
    }

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const totalWeeks = Math.max(0, Number(prog.total_weeks || 0));
    const totalSessions = totalWeeks * daysPerWeek;
    const blocks = Array.isArray(prog.blocks) ? prog.blocks : [];

    if (totalSessions <= 0) {
      return res.json({
        has_program: true,
        program_id: prog.id,
        reason: "program_empty",
      });
    }

    const dQ = await pool.query(
      `select entry_date, entries, is_completed, completed_at
       from public.daily_entries_app
       where user_id=$1
       order by entry_date asc`,
      [req.user.id]
    );

    const dailyByDate = new Map(
      dQ.rows.map((r) => [String(r.entry_date), r])
    );

    function sessionHasLoggedWork(dayRow) {
      if (!dayRow) return false;
      if (dayRow.is_completed === true) return true;

      const entries = Array.isArray(dayRow.entries) ? dayRow.entries : [];
      return entries.some((e) => {
        const top = e?.actual?.top ?? e?.top;
        const reps = e?.actual?.reps ?? e?.reps;
        const rpe = e?.actual?.rpe ?? e?.rpe;
        return isNonEmpty(top) || isNonEmpty(reps) || isNonEmpty(rpe) || e?.completed === true;
      });
    }

    const scheduledDates = [];
    const cursor = parseISODateLocal(startISO);

    for (let day = 0; day < 730 && scheduledDates.length < totalSessions; day++) {
      const d = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + day,
        0, 0, 0, 0
      );
      const iso = toISODateLocal(d);
      if (trainingDays.includes(d.getDay())) {
        scheduledDates.push(iso);
      }
    }

    let pickedDate = null;
    let pickedIndex = -1;

    for (let i = 0; i < scheduledDates.length; i++) {
      const iso = scheduledDates[i];
      const existing = dailyByDate.get(iso);
      if (!sessionHasLoggedWork(existing)) {
        pickedDate = iso;
        pickedIndex = i;
        break;
      }
    }

    if (!pickedDate) {
      pickedDate = scheduledDates[scheduledDates.length - 1];
      pickedIndex = scheduledDates.length - 1;
    }

    const week_number = Math.floor(pickedIndex / daysPerWeek) + 1;
    const day_number = (pickedIndex % daysPerWeek) + 1;

    const blockInfo = findBlockForWeek(blocks, week_number);
    const dayDef = (blockInfo?.block?.days || []).find(
      (d) => Number(d?.day_number) === Number(day_number)
    ) || null;

    const existing = dailyByDate.get(pickedDate) || null;
    const is_logged = sessionHasLoggedWork(existing);

    return res.json({
      has_program: true,
      program_id: prog.id,
      program_name: prog.name,
      date: pickedDate,
      is_logged,
      all_sessions_logged: scheduledDates.every((dt) => sessionHasLoggedWork(dailyByDate.get(dt))),
      week_number,
      day_number,
      block_number: blockInfo?.block_number || null,
      block_week: blockInfo?.block_week || null,
      day_title: dayDef?.title || `Day ${day_number}`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
/* =====================
   Group extras
===================== */
async function createPrEventsForGroups({
  userId,
  exercise,
  e1rm,
  top,
  reps,
  date,
}) {
  const groupIds = await getUserGroupIds(userId);
  if (!groupIds.length) return;

  for (const groupId of groupIds) {
    const exists = await pool.query(
      `select 1
         from public.group_events
        where group_id=$1
          and user_id=$2
          and event_type='pr_e1rm'
          and payload->>'exercise' = $3
          and payload->>'date' = $4
        limit 1`,
      [groupId, userId, exercise, String(date)]
    );

    if (exists.rowCount > 0) continue;

    await pool.query(
      `insert into public.group_events
         (group_id, user_id, event_type, payload, created_at)
       values
         ($1, $2, 'pr_e1rm', $3::jsonb, now())`,
      [
        groupId,
        userId,
        JSON.stringify({
          exercise,
          e1rm,
          top,
          reps,
          date,
        }),
      ]
    );
  }
}
async function createPrEventsForGroups({
  userId,
  exercise,
  e1rm,
  top,
  reps,
  date,
}) {
  const groupIds = await getUserGroupIds(userId);
  if (!groupIds.length) return;

  for (const groupId of groupIds) {
    await pool.query(
      `insert into public.group_events
         (group_id, user_id, event_type, payload, created_at)
       values
         ($1, $2, 'pr_e1rm', $3::jsonb, now())`,
      [
        groupId,
        userId,
        JSON.stringify({
          exercise,
          e1rm,
          top,
          reps,
          date,
        }),
      ]
    );
  }
}

async function getPreviousBestE1rm(userId, exercise, excludeDate = null) {
  const norm = normalizeExerciseName(exercise);
  let best = null;

  const dailyQ = await pool.query(
    excludeDate
      ? `select entry_date, entries
           from public.daily_entries_app
          where user_id=$1
            and entry_date <> $2::date`
      : `select entry_date, entries
           from public.daily_entries_app
          where user_id=$1`,
    excludeDate ? [userId, excludeDate] : [userId]
  );

  for (const row of dailyQ.rows) {
    const entries = Array.isArray(row.entries) ? row.entries : [];
    for (const e of entries) {
      if (normalizeExerciseName(e?.exercise) !== norm) continue;

      const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
      const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
      const val = e1rmEpley(top, reps);

      if (val == null) continue;
      if (best == null || val > best) best = val;
    }
  }

  const weeklyQ = await pool.query(
    `select entries
       from public.weekly_entries_app
      where user_id=$1`,
    [userId]
  );

  for (const row of weeklyQ.rows) {
    const entries = Array.isArray(row.entries) ? row.entries : [];
    for (const e of entries) {
      if (normalizeExerciseName(e?.exercise) !== norm) continue;

      const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
      const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
      const val = e1rmEpley(top, reps);

      if (val == null) continue;
      if (best == null || val > best) best = val;
    }
  }

  return best;
}

async function getUserGroupIds(userId) {
  const q = await pool.query(
    `select group_id
       from public.group_members
      where user_id=$1`,
    [userId]
  );
  return q.rows.map((r) => r.group_id);
}

function formatGroupEvent(event_type, payload = {}) {
  return {
    event_type,
    payload,
  };
}

async function ensureGroupEventsSchema() {
  await pool.query(`
    create table if not exists public.group_events (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.groups(id) on delete cascade,
      user_id uuid references public.app_users(id) on delete set null,
      event_type text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create index if not exists ix_group_events_group_created
      on public.group_events(group_id, created_at desc);
  `);

  await pool.query(`
    create table if not exists public.group_shared_programs (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.groups(id) on delete cascade,
      program_id uuid not null references public.programs_app(id) on delete cascade,
      shared_by_user_id uuid not null references public.app_users(id) on delete cascade,
      created_at timestamptz not null default now(),
      unique(group_id, program_id)
    );
  `);

  await pool.query(`
    create index if not exists ix_group_shared_programs_group
      on public.group_shared_programs(group_id, created_at desc);
  `);

  await pool.query(`
    create table if not exists public.group_challenges (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.groups(id) on delete cascade,
      created_by_user_id uuid not null references public.app_users(id) on delete cascade,
      name text not null,
      description text,
      metric_type text not null default 'e1rm',
      exercise text,
      scoring_type text not null default 'max',
      start_date date not null,
      end_date date not null,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create index if not exists ix_group_challenges_group
      on public.group_challenges(group_id, created_at desc);
  `);
}

async function requireGroupMembership(groupId, userId) {
  const q = await pool.query(
    `select gm.group_id, gm.user_id, gm.role, g.owner_user_id, g.name, g.join_code, g.is_private, g.created_at
     from public.group_members gm
     join public.groups g
       on g.id = gm.group_id
     where gm.group_id=$1 and gm.user_id=$2`,
    [groupId, userId]
  );
  return q.rows[0] || null;
}

function safeDateLabel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function scoreWindowStart(window) {
  const now = new Date();
  const out = new Date(now);

  if (window === "14d") out.setDate(out.getDate() - 14);
  else if (window === "30d") out.setDate(out.getDate() - 30);
  else if (window === "60d") out.setDate(out.getDate() - 60);
  else if (window === "90d") out.setDate(out.getDate() - 90);
  else return null;

  return toISODateLocal(out);
}

async function getGroupMemberIds(groupId) {
  const q = await pool.query(
    `select user_id
     from public.group_members
     where group_id=$1`,
    [groupId]
  );
  return q.rows.map((r) => r.user_id);
}

function computeE1rmFromEntry(e) {
  const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
  const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
  return e1rmEpley(top, reps);
}

function sumVolumeFromEntry(e) {
  const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
  const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
  if (!Number.isFinite(top) || !Number.isFinite(reps)) return null;
  return top * reps;
}

/* owner delete group */
app.delete("/api/groups/:id", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;

    const q = await pool.query(
      `select id, owner_user_id
       from public.groups
       where id=$1`,
      [groupId]
    );

    if (q.rowCount === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    const group = q.rows[0];
    if (String(group.owner_user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: "Only the group owner can delete this group" });
    }

    await pool.query(
      `delete from public.groups
       where id=$1`,
      [groupId]
    );

    return res.json({ ok: true, deleted_group_id: groupId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* leave group */
app.post("/api/groups/:id/leave", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;

    const q = await pool.query(
      `select id, owner_user_id
       from public.groups
       where id=$1`,
      [groupId]
    );

    if (q.rowCount === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    const group = q.rows[0];

    if (String(group.owner_user_id) === String(req.user.id)) {
      return res.status(400).json({
        error: "Group owner cannot leave their own group. Delete the group instead.",
      });
    }

    const del = await pool.query(
      `delete from public.group_members
       where group_id=$1 and user_id=$2`,
      [groupId, req.user.id]
    );

    if (del.rowCount === 0) {
      return res.status(404).json({ error: "You are not a member of this group" });
    }

    await pool.query(
      `insert into public.group_events (group_id, user_id, event_type, payload)
       values ($1, $2, 'member_left', $3::jsonb)`,
      [groupId, req.user.id, JSON.stringify({})]
    );

    return res.json({ ok: true, left_group_id: groupId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* group detail */
app.get("/api/groups/:id", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMembership(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const membersCountQ = await pool.query(
      `select count(*)::int as members_count
       from public.group_members
       where group_id=$1`,
      [groupId]
    );

    res.json({
      group: {
        id: membership.group_id,
        name: membership.name,
        code: membership.join_code,
        is_private: membership.is_private,
        owner_user_id: membership.owner_user_id,
        my_role: membership.role,
        created_at: membership.created_at,
        members_count: membersCountQ.rows?.[0]?.members_count ?? 0,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* members */
app.get("/api/groups/:id/members", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMembership(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const q = await pool.query(
      `select au.id as user_id,
              au.email,
              au.name,
              gm.role,
              gm.joined_at
       from public.group_members gm
       join public.app_users au
         on au.id = gm.user_id
       where gm.group_id=$1
       order by coalesce(au.name, au.email) asc`,
      [groupId]
    );

    const userIds = q.rows.map((r) => r.user_id);

    let latestWeekMap = new Map();
    let latestSessionMap = new Map();
    let latestWeeklyMetricsMap = new Map();

    if (userIds.length) {
      const weeklyQ = await pool.query(
        `select distinct on (user_id)
                user_id, week_number, entries
         from public.weekly_entries_app
         where user_id = any($1)
         order by user_id, week_number desc`,
        [userIds]
      );

      latestWeekMap = new Map(
        weeklyQ.rows.map((r) => [String(r.user_id), r.week_number])
      );

      latestWeeklyMetricsMap = new Map(
        weeklyQ.rows.map((r) => {
          const entries = Array.isArray(r.entries) ? r.entries : [];
          const metrics = {};

          for (const ex of ["Bench", "Squat", "Deadlift"]) {
            let best = null;
            for (const e of entries) {
              if (String(e?.exercise || "").trim() !== ex) continue;
              const val = e1rmEpley(e?.top, e?.reps);
              if (Number.isFinite(val) && (!Number.isFinite(best) || val > best)) {
                best = val;
              }
            }
            if (Number.isFinite(best)) metrics[ex] = best;
          }

          return [String(r.user_id), metrics];
        })
      );

      const dailyQ = await pool.query(
        `select distinct on (user_id)
                user_id, entry_date
         from public.daily_entries_app
         where user_id = any($1)
         order by user_id, entry_date desc`,
        [userIds]
      );

      latestSessionMap = new Map(
        dailyQ.rows.map((r) => [String(r.user_id), safeDateLabel(r.entry_date)])
      );
    }

    res.json({
      members: q.rows.map((r) => ({
        user_id: r.user_id,
        email: r.email,
        name: r.name || r.email,
        role: r.role,
        joined_at: r.joined_at,
        latest_week: latestWeekMap.get(String(r.user_id)) ?? null,
        latest_session_date: latestSessionMap.get(String(r.user_id)) ?? null,
        metrics: latestWeeklyMetricsMap.get(String(r.user_id)) || {},
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* feed */
app.get("/api/groups/:id/feed", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMembership(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const q = await pool.query(
      `select ge.id,
              ge.group_id,
              ge.user_id,
              ge.event_type,
              ge.payload,
              ge.created_at,
              au.name,
              au.email
       from public.group_events ge
       left join public.app_users au
         on au.id = ge.user_id
       where ge.group_id=$1
       order by ge.created_at desc
       limit 100`,
      [groupId]
    );

    res.json({
      events: q.rows.map((r) => ({
        id: r.id,
        group_id: r.group_id,
        user_id: r.user_id,
        event_type: r.event_type,
        payload: r.payload || {},
        created_at: r.created_at,
        user: {
          name: r.name || r.email || "Member",
          email: r.email || null,
        },
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* share program */
app.post("/api/groups/:id/programs", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const programId = String(req.body?.program_id || "").trim();

    if (!programId) {
      return res.status(400).json({ error: "program_id required" });
    }

    const membership = await requireGroupMembership(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const p = await pool.query(
      `select id, name, days_per_week, total_weeks
       from public.programs_app
       where id=$1 and user_id=$2`,
      [programId, req.user.id]
    );

    if (p.rowCount === 0) {
      return res.status(404).json({ error: "Program not found" });
    }

    await pool.query(
      `insert into public.group_shared_programs (group_id, program_id, shared_by_user_id)
       values ($1,$2,$3)
       on conflict (group_id, program_id) do nothing`,
      [groupId, programId, req.user.id]
    );

    await pool.query(
      `insert into public.group_events (group_id, user_id, event_type, payload)
       values ($1, $2, 'program_published', $3::jsonb)`,
      [
        groupId,
        req.user.id,
        JSON.stringify({
          title: p.rows[0].name,
          days_per_week: p.rows[0].days_per_week,
          total_weeks: p.rows[0].total_weeks,
          program_id: p.rows[0].id,
        }),
      ]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/groups/:id/programs", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMembership(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const q = await pool.query(
      `select gsp.id,
              gsp.created_at,
              pa.id as program_id,
              pa.name,
              pa.days_per_week,
              pa.total_weeks,
              au.name as created_by_name,
              au.email as created_by_email
       from public.group_shared_programs gsp
       join public.programs_app pa
         on pa.id = gsp.program_id
       join public.app_users au
         on au.id = gsp.shared_by_user_id
       where gsp.group_id=$1
       order by gsp.created_at desc`,
      [groupId]
    );

    res.json({
      programs: q.rows.map((r) => ({
        id: r.id,
        program_id: r.program_id,
        title: r.name,
        name: r.name,
        days_per_week: r.days_per_week,
        total_weeks: r.total_weeks,
        created_at: r.created_at,
        created_by_name: r.created_by_name,
        created_by_email: r.created_by_email,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* challenges */
app.post("/api/groups/:id/challenges", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMembership(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const name = String(req.body?.name || "").trim();
    const description = req.body?.description != null ? String(req.body.description) : null;
    const metric_type = String(req.body?.metric_type || "e1rm").trim();
    const exercise = req.body?.exercise ? String(req.body.exercise).trim() : null;
    const scoring_type = String(req.body?.scoring_type || "max").trim();
    const start_date = String(req.body?.start_date || "").trim();
    const end_date = String(req.body?.end_date || "").trim();

    if (!name) return res.status(400).json({ error: "name required" });
    if (!parseISODate(start_date) || !parseISODate(end_date)) {
      return res.status(400).json({ error: "start_date and end_date must be YYYY-MM-DD" });
    }

    const q = await pool.query(
      `insert into public.group_challenges
        (group_id, created_by_user_id, name, description, metric_type, exercise, scoring_type, start_date, end_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date)
       returning id, group_id, created_by_user_id, name, description, metric_type, exercise, scoring_type, start_date, end_date, created_at`,
      [
        groupId,
        req.user.id,
        name,
        description,
        metric_type,
        exercise,
        scoring_type,
        start_date,
        end_date,
      ]
    );

    await pool.query(
      `insert into public.group_events (group_id, user_id, event_type, payload)
       values ($1, $2, 'challenge_joined', $3::jsonb)`,
      [groupId, req.user.id, JSON.stringify({ name })]
    );

    res.json({ challenge: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/groups/:id/challenges", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMembership(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const q = await pool.query(
      `select gc.*,
              au.name as created_by_name,
              au.email as created_by_email
       from public.group_challenges gc
       join public.app_users au
         on au.id = gc.created_by_user_id
       where gc.group_id=$1
       order by gc.created_at desc`,
      [groupId]
    );

    res.json({
      challenges: q.rows.map((r) => ({
        ...r,
        created_by_name: r.created_by_name,
        created_by_email: r.created_by_email,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/groups/:id/challenges/:challengeId/leaderboard", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const challengeId = req.params.challengeId;

    const membership = await requireGroupMembership(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const cq = await pool.query(
      `select *
       from public.group_challenges
       where id=$1 and group_id=$2`,
      [challengeId, groupId]
    );

    if (cq.rowCount === 0) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    const challenge = cq.rows[0];
    const memberIds = await getGroupMemberIds(groupId);

    if (!memberIds.length) {
      return res.json({ challenge, rows: [] });
    }

    const dailyQ = await pool.query(
      `select user_id, entry_date, bodyweight, entries
       from public.daily_entries_app
       where user_id = any($1)
         and entry_date between $2::date and $3::date
       order by entry_date asc`,
      [memberIds, challenge.start_date, challenge.end_date]
    );

    const exNorm = normalizeExerciseName(challenge.exercise || "");

    function challengeScoreForUser(userId) {
      const rows = dailyQ.rows.filter((r) => String(r.user_id) === String(userId));
      let best = null;

      if (challenge.metric_type === "e1rm") {
        for (const row of rows) {
          const entries = Array.isArray(row.entries) ? row.entries : [];
          for (const e of entries) {
            if (challenge.exercise && normalizeExerciseName(e?.exercise) !== exNorm) continue;
            const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
            const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
            const score = e1rmEpley(top, reps);
            if (!Number.isFinite(score)) continue;
            if (!best || score > best.score) {
              best = { score, meta: { date: safeDateLabel(row.entry_date) } };
            }
          }
        }
      } else if (challenge.metric_type === "volume") {
        let total = 0;
        for (const row of rows) {
          const entries = Array.isArray(row.entries) ? row.entries : [];
          for (const e of entries) {
            if (challenge.exercise && normalizeExerciseName(e?.exercise) !== exNorm) continue;
            const vol = sumVolumeFromEntry(e);
            if (Number.isFinite(vol)) total += vol;
          }
        }
        if (total > 0) best = { score: total, meta: {} };
      }

      return best;
    }

    const membersQ = await pool.query(
      `select au.id as user_id, au.name, au.email
       from public.group_members gm
       join public.app_users au on au.id = gm.user_id
       where gm.group_id=$1`,
      [groupId]
    );

    const rows = membersQ.rows
      .map((m) => {
        const result = challengeScoreForUser(m.user_id);
        return {
          user_id: m.user_id,
          name: m.name || m.email,
          email: m.email,
          score: result?.score ?? null,
          meta: result?.meta ?? {},
        };
      })
      .filter((r) => Number.isFinite(Number(r.score)))
      .sort((a, b) => Number(b.score) - Number(a.score))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    res.json({ challenge, rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* compare */
app.get("/api/groups/:id/compare", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userA = String(req.query?.user_a || "").trim();
    const userB = String(req.query?.user_b || "").trim();
    const exercise = String(req.query?.exercise || "Bench").trim();

    const membership = await requireGroupMembership(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    if (!userA || !userB) {
      return res.status(400).json({ error: "user_a and user_b are required" });
    }

    const memberIds = await getGroupMemberIds(groupId);
    const memberSet = new Set(memberIds.map(String));

    if (!memberSet.has(String(userA)) || !memberSet.has(String(userB))) {
      return res.status(400).json({ error: "Both users must be members of the group" });
    }

    const usersQ = await pool.query(
      `select id, name, email
       from public.app_users
       where id = any($1)`,
      [[userA, userB]]
    );

    const userMap = new Map(usersQ.rows.map((r) => [String(r.id), r]));
    const exNorm = normalizeExerciseName(exercise);

    const dailyQ = await pool.query(
      `select user_id, entry_date, entries
       from public.daily_entries_app
       where user_id = any($1)
       order by entry_date asc`,
      [[userA, userB]]
    );

    function historyForUser(userId) {
      const history = [];

      for (const row of dailyQ.rows) {
        if (String(row.user_id) !== String(userId)) continue;
        const entries = Array.isArray(row.entries) ? row.entries : [];

        let bestForDay = null;
        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== exNorm) continue;
          const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
          const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
          const e1rm = e1rmEpley(top, reps);
          if (!Number.isFinite(e1rm)) continue;
          if (!bestForDay || e1rm > bestForDay.e1rm) {
            bestForDay = {
              label: safeDateLabel(row.entry_date),
              date: safeDateLabel(row.entry_date),
              top,
              reps,
              e1rm,
            };
          }
        }

        if (bestForDay) history.push(bestForDay);
      }

      history.sort((a, b) => String(a.date).localeCompare(String(b.date)));

      const best_e1rm = history.length
        ? Math.max(...history.map((x) => Number(x.e1rm)).filter(Number.isFinite))
        : null;

      const u = userMap.get(String(userId));
      return {
        user_id: userId,
        name: u?.name || u?.email || "Member",
        email: u?.email || null,
        best_e1rm,
        history,
      };
    }

    res.json({
      exercise,
      user_a: historyForUser(userA),
      user_b: historyForUser(userB),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* richer leaderboard */
app.get("/api/groups/:id/leaderboard", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const type = String(req.query?.type || "strength").trim().toLowerCase();
    const exercise = String(req.query?.exercise || "Bench").trim();
    const window = String(req.query?.window || "all").trim().toLowerCase();

    const membership = await requireGroupMembership(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const membersQ = await pool.query(
      `select au.id as user_id, au.email, au.name
       from public.group_members gm
       join public.app_users au
         on au.id = gm.user_id
       where gm.group_id=$1
       order by coalesce(au.name, au.email) asc`,
      [groupId]
    );

    const members = membersQ.rows || [];
    if (!members.length) {
      return res.json({ type, exercise, window, rows: [] });
    }

    const fromISO = scoreWindowStart(window);
    const userIds = members.map((m) => m.user_id);

    const dailyQ = await pool.query(
      fromISO
        ? `select user_id, entry_date, bodyweight, is_completed, entries
           from public.daily_entries_app
           where user_id = any($1)
             and entry_date >= $2::date
           order by entry_date asc`
        : `select user_id, entry_date, bodyweight, is_completed, entries
           from public.daily_entries_app
           where user_id = any($1)
           order by entry_date asc`,
      fromISO ? [userIds, fromISO] : [userIds]
    );

    const weeklyQ = await pool.query(
      `select user_id, week_number, entries
       from public.weekly_entries_app
       where user_id = any($1)
       order by week_number asc`,
      [userIds]
    );

    const exNorm = normalizeExerciseName(exercise);

    function findBestStrength(userId) {
      let best = null;

      for (const row of dailyQ.rows) {
        if (String(row.user_id) !== String(userId)) continue;
        const entries = Array.isArray(row.entries) ? row.entries : [];

        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== exNorm) continue;

          const top = parseLoadNumber(e?.actual?.top ?? e?.top);
          const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
          const val = e1rmEpley(top, reps);

          if (!Number.isFinite(val)) continue;
          if (!best || val > best.score) {
            best = {
              score: val,
              meta: {
                date: safeDateLabel(row.entry_date),
                top,
                reps,
                source: "daily",
              },
            };
          }
        }
      }

      for (const row of weeklyQ.rows) {
        if (String(row.user_id) !== String(userId)) continue;
        const entries = Array.isArray(row.entries) ? row.entries : [];

        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== exNorm) continue;

          const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
          const reps = parseLoadNumber(e?.reps ?? e?.actual?.reps);
          const val = e1rmEpley(top, reps);

          if (!Number.isFinite(val)) continue;
          if (!best || val > best.score) {
            best = {
              score: val,
              meta: {
                week: row.week_number,
                top,
                reps,
                source: "weekly",
              },
            };
          }
        }
      }

      return best;
    }

    function findImprovement(userId) {
      const vals = [];

      for (const row of dailyQ.rows) {
        if (String(row.user_id) !== String(userId)) continue;
        const entries = Array.isArray(row.entries) ? row.entries : [];

        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== exNorm) continue;
          const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
          const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
          const val = e1rmEpley(top, reps);
          if (Number.isFinite(val)) {
            vals.push({ value: val, date: safeDateLabel(row.entry_date) });
          }
        }
      }

      if (vals.length < 2) return null;
      vals.sort((a, b) => String(a.date).localeCompare(String(b.date)));

      const first = vals[0];
      const last = vals[vals.length - 1];
      return {
        score: last.value - first.value,
        meta: {
          note: `${fmt(first.value)} → ${fmt(last.value)}`,
        },
      };
    }

    function findRelativeStrength(userId) {
      let best = null;

      for (const row of dailyQ.rows) {
        if (String(row.user_id) !== String(userId)) continue;
        const bw = Number(row.bodyweight);
        if (!Number.isFinite(bw) || bw <= 0) continue;

        const entries = Array.isArray(row.entries) ? row.entries : [];
        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== exNorm) continue;
          const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
          const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
          const e1 = e1rmEpley(top, reps);
          if (!Number.isFinite(e1)) continue;

          const score = e1 / bw;
          if (!best || score > best.score) {
            best = {
              score,
              meta: {
                date: safeDateLabel(row.entry_date),
                note: `${fmt(e1)} / ${fmt(bw)}`,
              },
            };
          }
        }
      }

      return best;
    }

    function findVolume(userId) {
      let total = 0;

      for (const row of dailyQ.rows) {
        if (String(row.user_id) !== String(userId)) continue;
        const entries = Array.isArray(row.entries) ? row.entries : [];

        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== exNorm) continue;
          const vol = sumVolumeFromEntry(e);
          if (Number.isFinite(vol)) total += vol;
        }
      }

      return total > 0 ? { score: total, meta: {} } : null;
    }

    function findAdherence(userId) {
      const rows = dailyQ.rows.filter((r) => String(r.user_id) === String(userId));
      if (!rows.length) return null;

      let completed = 0;
      for (const row of rows) {
        const entries = Array.isArray(row.entries) ? row.entries : [];
        const didWork =
          row.is_completed === true ||
          entries.some((e) => {
            const top = e?.actual?.top ?? e?.top;
            const reps = e?.actual?.reps ?? e?.reps;
            return isNonEmpty(top) || isNonEmpty(reps) || e?.completed === true;
          });

        if (didWork) completed++;
      }

      return {
        score: rows.length ? (completed / rows.length) * 100 : null,
        meta: { note: `${completed}/${rows.length} logged` },
      };
    }

    function findStreak(userId) {
      const dates = dailyQ.rows
        .filter((r) => String(r.user_id) === String(userId))
        .filter((r) => {
          const entries = Array.isArray(r.entries) ? r.entries : [];
          return (
            r.is_completed === true ||
            entries.some((e) => {
              const top = e?.actual?.top ?? e?.top;
              const reps = e?.actual?.reps ?? e?.reps;
              return isNonEmpty(top) || isNonEmpty(reps) || e?.completed === true;
            })
          );
        })
        .map((r) => safeDateLabel(r.entry_date))
        .filter(Boolean)
        .sort();

      if (!dates.length) return null;

      let best = 1;
      let cur = 1;

      for (let i = 1; i < dates.length; i++) {
        const prev = parseISODate(dates[i - 1]);
        const next = parseISODate(dates[i]);
        const diff = Math.round((next.getTime() - prev.getTime()) / 86400000);

        if (diff === 1) cur++;
        else if (diff > 1) cur = 1;

        if (cur > best) best = cur;
      }

      return { score: best, meta: {} };
    }

    const rows = members.map((m) => {
      let result = null;

      if (type === "strength") result = findBestStrength(m.user_id);
      else if (type === "improvement") result = findImprovement(m.user_id);
      else if (type === "relative_strength") result = findRelativeStrength(m.user_id);
      else if (type === "volume") result = findVolume(m.user_id);
      else if (type === "adherence") result = findAdherence(m.user_id);
      else if (type === "streak") result = findStreak(m.user_id);

      return {
        user_id: m.user_id,
        name: m.name || m.email,
        email: m.email,
        score: result?.score ?? null,
        meta: result?.meta ?? {},
      };
    });

    const ranked = rows
      .filter((r) => Number.isFinite(Number(r.score)))
      .sort((a, b) => Number(b.score) - Number(a.score))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    res.json({ type, exercise, window, rows: ranked });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
/* =====================
   Groups
===================== */
async function requireGroupMember(groupId, userId) {
  const q = await pool.query(
    `select gm.group_id, gm.user_id, gm.role
       from public.group_members gm
      where gm.group_id=$1 and gm.user_id=$2`,
    [groupId, userId]
  );
  return q.rows[0] || null;
}

async function requireGroupOwnerOrMember(groupId, userId) {
  return requireGroupMember(groupId, userId);
}

async function getGroupBasic(groupId) {
  const q = await pool.query(
    `select g.id,
            g.name,
            g.join_code as code,
            g.is_private,
            g.owner_user_id,
            g.created_at,
            (select count(*)::int from public.group_members gm where gm.group_id = g.id) as members_count
       from public.groups g
      where g.id=$1`,
    [groupId]
  );
  return q.rows[0] || null;
}

function parseWindowToFromDate(window) {
  const today = toISODateLocal(new Date());
  if (!window || window === "all") return null;

  const map = {
    "14d": 14,
    "30d": 30,
    "60d": 60,
    "90d": 90,
  };

  const days = map[String(window)] || 30;
  const d = parseISODateLocal(today);
  d.setDate(d.getDate() - days);
  return toISODateLocal(d);
}

function safeJsonObject(v, fallback = {}) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
}

function safeJsonArray(v) {
  return Array.isArray(v) ? v : [];
}

function buildMetricRowsFromEntries(entries) {
  const out = [];
  for (const e of safeJsonArray(entries)) {
    const exercise = String(e?.exercise || "").trim();
    if (!exercise) continue;

    const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
    const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
    const rpe = e?.actual?.rpe ?? e?.rpe ?? null;
    const e1rm = e1rmEpley(top, reps);

    out.push({
      exercise,
      top,
      reps,
      rpe,
      e1rm,
    });
  }
  return out;
}

async function getLatestDailyByUsers(userIds, fromDate = null) {
  if (!userIds.length) return [];

  const params = [userIds];
  let whereExtra = "";
  if (fromDate) {
    params.push(fromDate);
    whereExtra = `and entry_date >= $2::date`;
  }

  const q = await pool.query(
    `
    select d.user_id, d.entry_date, d.entries, d.bodyweight, d.is_completed
      from public.daily_entries_app d
      join (
        select user_id, max(entry_date) as max_entry_date
          from public.daily_entries_app
         where user_id = any($1)
         ${whereExtra}
         group by user_id
      ) mx
        on mx.user_id = d.user_id
       and mx.max_entry_date = d.entry_date
    `,
    params
  );

  return q.rows;
}

async function getDailyRowsForUsers(userIds, fromDate = null) {
  if (!userIds.length) return [];

  const params = [userIds];
  let sql = `
    select user_id, entry_date, entries, bodyweight, is_completed
      from public.daily_entries_app
     where user_id = any($1)
  `;

  if (fromDate) {
    params.push(fromDate);
    sql += ` and entry_date >= $2::date`;
  }

  sql += ` order by entry_date asc`;

  const q = await pool.query(sql, params);
  return q.rows;
}

function rankRows(rows) {
  let rank = 0;
  let prevScore = null;

  return rows.map((r, idx) => {
    const score = Number(r.score);
    if (prevScore == null || score !== prevScore) {
      rank = idx + 1;
      prevScore = score;
    }
    return { ...r, rank };
  });
}

function bestExerciseMetricFromDailyRows(rows, exercise) {
  const target = normalizeExerciseName(exercise);
  let best = null;

  for (const row of rows) {
    for (const m of buildMetricRowsFromEntries(row.entries)) {
      if (normalizeExerciseName(m.exercise) !== target) continue;
      if (!Number.isFinite(m.e1rm)) continue;

      if (!best || m.e1rm > best.e1rm) {
        best = {
          e1rm: m.e1rm,
          top: m.top,
          reps: m.reps,
          date: String(row.entry_date),
          bodyweight: toNum(row.bodyweight),
        };
      }
    }
  }

  return best;
}

function sumExerciseVolumeFromDailyRows(rows, exercise) {
  const target = normalizeExerciseName(exercise);
  let total = 0;

  for (const row of rows) {
    for (const m of buildMetricRowsFromEntries(row.entries)) {
      if (normalizeExerciseName(m.exercise) !== target) continue;
      if (!Number.isFinite(m.top) || !Number.isFinite(m.reps)) continue;
      total += Number(m.top) * Number(m.reps);
    }
  }

  return total;
}

function countCompletedSessions(rows) {
  return rows.filter((r) => r.is_completed === true || isDayCompleted(r)).length;
}

function buildE1rmHistory(rows, exercise) {
  const target = normalizeExerciseName(exercise);
  const points = [];

  for (const row of rows) {
    let best = null;

    for (const m of buildMetricRowsFromEntries(row.entries)) {
      if (normalizeExerciseName(m.exercise) !== target) continue;
      if (!Number.isFinite(m.e1rm)) continue;
      if (!best || m.e1rm > best.e1rm) best = m;
    }

    if (best) {
      points.push({
        date: String(row.entry_date),
        label: String(row.entry_date),
        e1rm: best.e1rm,
        top: best.top,
        reps: best.reps,
      });
    }
  }

  return points;
}

async function logGroupEvent(groupId, userId, eventType, payload = {}) {
  await pool.query(
    `insert into public.group_events (group_id, user_id, event_type, payload)
     values ($1,$2,$3,$4::jsonb)`,
    [groupId, userId || null, eventType, JSON.stringify(payload || {})]
  );
}
app.get("/api/groups", requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `select g.id,
              g.name,
              g.join_code as code,
              g.is_private,
              g.owner_user_id,
              g.created_at,
              (select count(*)::int
                 from public.group_members gm2
                where gm2.group_id = g.id) as members_count
       from public.groups g
       join public.group_members gm
         on gm.group_id = g.id
      where gm.user_id = $1
      order by g.created_at desc`,
      [req.user.id]
    );

    res.json({ groups: q.rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.post("/api/groups", requireAuth, async (req, res) => {
  try {
    const name = (req.body?.name || "My group").toString().slice(0, 60);
    const isPrivate =
      req.body?.is_private !== undefined ? !!req.body.is_private : true;

    let joinCode = makeJoinCode(8);
    for (let i = 0; i < 5; i++) {
      const exists = await pool.query(
        `select 1 from public.groups where join_code=$1`,
        [joinCode]
      );
      if (exists.rowCount === 0) break;
      joinCode = makeJoinCode(8);
    }

    const g = await pool.query(
      `insert into public.groups (owner_user_id, name, join_code, is_private)
       values ($1,$2,$3,$4)
       returning id, name, join_code as code, is_private, owner_user_id, created_at`,
      [req.user.id, name, joinCode, isPrivate]
    );

    await pool.query(
      `insert into public.group_members (group_id, user_id, role)
       values ($1,$2,'owner')
       on conflict do nothing`,
      [g.rows[0].id, req.user.id]
    );

    res.json({
      group: {
        ...g.rows[0],
        members_count: 1,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/groups/join", requireAuth, async (req, res) => {
  try {
    const code = (req.body?.code || "").toString().trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: "code required" });
    }

    const g = await pool.query(
      `select id, name, join_code as code, is_private, owner_user_id, created_at
         from public.groups
        where join_code=$1`,
      [code]
    );

    if (g.rowCount === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    await pool.query(
      `insert into public.group_members (group_id, user_id, role)
       values ($1,$2,'member')
       on conflict do nothing`,
      [g.rows[0].id, req.user.id]
    );

    await logGroupEvent(g.rows[0].id, req.user.id, "member_joined", {
      group_name: g.rows[0].name,
    });

    res.json({ group: g.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.post("/api/groups/:id/leave", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;

    const g = await pool.query(
      `select id, owner_user_id
       from public.groups
       where id=$1`,
      [groupId]
    );

    if (g.rowCount === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    const group = g.rows[0];

    // owner leaving: either block it, or delete group.
    // safest for now = block owner from leaving
    if (String(group.owner_user_id) === String(req.user.id)) {
      return res.status(400).json({
        error: "Group owner cannot leave their own group. Delete the group or transfer ownership first.",
      });
    }

    const del = await pool.query(
      `delete from public.group_members
       where group_id=$1 and user_id=$2`,
      [groupId, req.user.id]
    );

    if (del.rowCount === 0) {
      return res.status(404).json({ error: "You are not a member of this group" });
    }

    return res.json({ ok: true, left_group_id: groupId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/groups/:id/leaderboard", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const type = String(req.query?.type || "strength").trim().toLowerCase();
    const exercise = String(req.query?.exercise || "Bench").trim();
    const window = String(req.query?.window || "all").trim().toLowerCase();

    const mem = await pool.query(
      `select 1
       from public.group_members
       where group_id=$1 and user_id=$2`,
      [groupId, req.user.id]
    );

    if (mem.rowCount === 0) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const membersQ = await pool.query(
      `select au.id as user_id, au.email, au.name
       from public.group_members gm
       join public.app_users au
         on au.id = gm.user_id
       where gm.group_id = $1
       order by coalesce(au.name, au.email) asc`,
      [groupId]
    );

    const members = membersQ.rows || [];
    if (!members.length) {
      return res.json({ type, exercise, window, rows: [] });
    }

    let fromISO = null;
    const today = new Date();
    if (window === "14d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 14);
      fromISO = toISODateLocal(d);
    } else if (window === "30d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      fromISO = toISODateLocal(d);
    } else if (window === "60d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 60);
      fromISO = toISODateLocal(d);
    } else if (window === "90d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      fromISO = toISODateLocal(d);
    }

    const userIds = members.map((m) => m.user_id);

    const dailyQ = await pool.query(
      fromISO
        ? `select user_id, entry_date, bodyweight, entries
           from public.daily_entries_app
           where user_id = any($1)
             and entry_date >= $2::date
           order by entry_date asc`
        : `select user_id, entry_date, bodyweight, entries
           from public.daily_entries_app
           where user_id = any($1)
           order by entry_date asc`,
      fromISO ? [userIds, fromISO] : [userIds]
    );

    const weeklyQ = await pool.query(
      `select user_id, week_number, entries
       from public.weekly_entries_app
       where user_id = any($1)
       order by week_number asc`,
      [userIds]
    );

    const exNorm = normalizeExerciseName(exercise);

    function findBestStrength(userId) {
      let best = null;

      for (const row of dailyQ.rows) {
        if (String(row.user_id) !== String(userId)) continue;
        const entries = Array.isArray(row.entries) ? row.entries : [];

        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== exNorm) continue;

          const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
          const reps = parseLoadNumber(e?.actual?.reps ?? e?.reps);
          const val = e1rmEpley(top, reps);
          if (!Number.isFinite(val)) continue;

          if (!best || val > best.score) {
            best = {
              score: val,
              meta: {
                date: String(row.entry_date),
                top,
                reps,
                source: "daily",
              },
            };
          }
        }
      }

      for (const row of weeklyQ.rows) {
        if (String(row.user_id) !== String(userId)) continue;
        const entries = Array.isArray(row.entries) ? row.entries : [];

        for (const e of entries) {
          if (normalizeExerciseName(e?.exercise) !== exNorm) continue;

          const top = parseTrainingLoad(e?.actual?.top ?? e?.top, q.rows[0]?.bodyweight ?? null);
          const reps = parseLoadNumber(e?.reps ?? e?.actual?.reps);
          const val = e1rmEpley(top, reps);
          if (!Number.isFinite(val)) continue;

          if (!best || val > best.score) {
            best = {
              score: val,
              meta: {
                week: row.week_number,
                top,
                reps,
                source: "weekly",
              },
            };
          }
        }
      }

      return best;
    }

    const rows = members.map((m) => {
      let result = null;

      if (type === "strength") {
        result = findBestStrength(m.user_id);
      } else {
        result = null;
      }

      return {
        user_id: m.user_id,
        name: m.name || m.email,
        email: m.email,
        score: result?.score ?? null,
        meta: result?.meta ?? {},
      };
    });

    const ranked = rows
      .filter((r) => Number.isFinite(Number(r.score)))
      .sort((a, b) => Number(b.score) - Number(a.score))
      .map((r, i) => ({
        ...r,
        rank: i + 1,
      }));

    res.json({
      type,
      exercise,
      window,
      rows: ranked,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/groups/:id", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMember(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const group = await getGroupBasic(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json({ group });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/groups/:id/feed", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMember(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const q = await pool.query(
      `select ge.id,
              ge.group_id,
              ge.user_id,
              ge.event_type,
              ge.payload,
              ge.created_at,
              au.name,
              au.email
         from public.group_events ge
         left join public.app_users au
           on au.id = ge.user_id
        where ge.group_id = $1
        order by ge.created_at desc
        limit 100`,
      [groupId]
    );

    const events = q.rows.map((r) => ({
      ...r,
      user: {
        user_id: r.user_id,
        name: r.name || r.email || null,
        email: r.email || null,
      },
    }));

    res.json({ events });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/groups/:id/members", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMember(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const membersQ = await pool.query(
      `select gm.user_id,
              gm.role,
              gm.joined_at,
              au.email,
              au.name
         from public.group_members gm
         join public.app_users au
           on au.id = gm.user_id
        where gm.group_id = $1
        order by coalesce(au.name, au.email) asc`,
      [groupId]
    );

    const userIds = membersQ.rows.map((m) => m.user_id);
    const latestWeeklyQ = userIds.length
      ? await pool.query(
          `select we.user_id, we.week_number, we.entries
             from public.weekly_entries_app we
             join (
               select user_id, max(week_number) as max_week
                 from public.weekly_entries_app
                where user_id = any($1)
                group by user_id
             ) mx
               on mx.user_id = we.user_id
              and mx.max_week = we.week_number`,
          [userIds]
        )
      : { rows: [] };

    const latestDailyRows = await getLatestDailyByUsers(userIds);
    const latestWeeklyByUser = new Map(latestWeeklyQ.rows.map((r) => [r.user_id, r]));
    const latestDailyByUser = new Map(latestDailyRows.map((r) => [r.user_id, r]));

    const members = membersQ.rows.map((m) => {
      const latestWeekly = latestWeeklyByUser.get(m.user_id);
      const entries = safeJsonArray(latestWeekly?.entries);

      const metrics = {};
      for (const e of entries) {
        const ex = String(e?.exercise || "").trim();
        if (!ex) continue;
        const val = e1rmEpley(e?.top, e?.reps);
        if (!Number.isFinite(val)) continue;
        if (!Number.isFinite(metrics[ex]) || val > metrics[ex]) metrics[ex] = val;
      }

      return {
        user_id: m.user_id,
        email: m.email,
        name: m.name || m.email,
        role: m.role,
        joined_at: m.joined_at,
        latest_week: latestWeekly?.week_number ?? null,
        latest_session_date: latestDailyByUser.get(m.user_id)?.entry_date ?? null,
        metrics,
      };
    });

    res.json({ members });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/groups/:id/programs", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMember(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const q = await pool.query(
      `select gsp.id,
              gsp.group_id,
              gsp.program_id,
              coalesce(gsp.title, p.name) as title,
              gsp.notes,
              gsp.created_at,
              p.name,
              p.days_per_week,
              p.total_weeks,
              au.name as created_by_name,
              au.email as created_by_email
         from public.group_shared_programs gsp
         join public.programs_app p
           on p.id = gsp.program_id
         join public.app_users au
           on au.id = gsp.shared_by_user_id
        where gsp.group_id = $1
        order by gsp.created_at desc`,
      [groupId]
    );

    res.json({ programs: q.rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/groups/:id/programs", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupOwnerOrMember(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const programId = String(req.body?.program_id || "").trim();
    const title = req.body?.title ? String(req.body.title).trim() : null;
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    if (!programId) {
      return res.status(400).json({ error: "program_id required" });
    }

    const ownProgram = await pool.query(
      `select id, name from public.programs_app where id=$1 and user_id=$2`,
      [programId, req.user.id]
    );

    if (ownProgram.rowCount === 0) {
      return res.status(404).json({ error: "Program not found" });
    }

    const q = await pool.query(
      `insert into public.group_shared_programs (group_id, program_id, shared_by_user_id, title, notes)
       values ($1,$2,$3,$4,$5)
       on conflict (group_id, program_id) do update
         set title = coalesce(excluded.title, public.group_shared_programs.title),
             notes = coalesce(excluded.notes, public.group_shared_programs.notes)
       returning id, group_id, program_id, title, notes, created_at`,
      [groupId, programId, req.user.id, title, notes]
    );

    await logGroupEvent(groupId, req.user.id, "program_published", {
      title: title || ownProgram.rows[0].name,
      program_id: programId,
    });

    res.json({ shared_program: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/groups/:id/challenges", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMember(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const q = await pool.query(
      `select gc.*
         from public.group_challenges gc
        where gc.group_id = $1
        order by gc.created_at desc`,
      [groupId]
    );

    res.json({ challenges: q.rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/groups/:id/challenges", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupOwnerOrMember(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const name = String(req.body?.name || "").trim();
    const description = req.body?.description ? String(req.body.description).trim() : null;
    const metric_type = String(req.body?.metric_type || "").trim();
    const exercise = req.body?.exercise ? String(req.body.exercise).trim() : null;
    const scoring_type = String(req.body?.scoring_type || "max").trim();
    const start_date = String(req.body?.start_date || "").trim();
    const end_date = String(req.body?.end_date || "").trim();

    if (!name || !metric_type || !start_date || !end_date) {
      return res.status(400).json({ error: "name, metric_type, start_date, end_date required" });
    }

    if (!parseISODateLocal(start_date) || !parseISODateLocal(end_date)) {
      return res.status(400).json({ error: "start_date/end_date must be YYYY-MM-DD" });
    }

    const q = await pool.query(
      `insert into public.group_challenges
         (group_id, created_by_user_id, name, description, metric_type, exercise, scoring_type, start_date, end_date)
       values
         ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date)
       returning *`,
      [groupId, req.user.id, name, description, metric_type, exercise, scoring_type, start_date, end_date]
    );

    await logGroupEvent(groupId, req.user.id, "challenge_joined", {
      name,
      challenge_id: q.rows[0].id,
    });

    res.json({ challenge: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/groups/:id/challenges/:challengeId/leaderboard", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const challengeId = req.params.challengeId;

    const membership = await requireGroupMember(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const challengeQ = await pool.query(
      `select *
         from public.group_challenges
        where id=$1 and group_id=$2`,
      [challengeId, groupId]
    );

    if (challengeQ.rowCount === 0) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    const challenge = challengeQ.rows[0];

    const membersQ = await pool.query(
      `select au.id as user_id, au.email, au.name
         from public.group_members gm
         join public.app_users au on au.id = gm.user_id
        where gm.group_id = $1`,
      [groupId]
    );

    const userIds = membersQ.rows.map((m) => m.user_id);
    const dailyRows = await pool.query(
      `select user_id, entry_date, entries, bodyweight, is_completed
         from public.daily_entries_app
        where user_id = any($1)
          and entry_date between $2::date and $3::date
        order by entry_date asc`,
      [userIds, challenge.start_date, challenge.end_date]
    );

    const rowsByUser = new Map();
    for (const r of dailyRows.rows) {
      if (!rowsByUser.has(r.user_id)) rowsByUser.set(r.user_id, []);
      rowsByUser.get(r.user_id).push(r);
    }

    let rows = membersQ.rows.map((m) => {
      const userRows = rowsByUser.get(m.user_id) || [];
      let score = null;

      if (challenge.metric_type === "e1rm") {
        score = bestExerciseMetricFromDailyRows(userRows, challenge.exercise)?.e1rm ?? null;
      } else if (challenge.metric_type === "relative_strength") {
        const best = bestExerciseMetricFromDailyRows(userRows, challenge.exercise);
        if (best && Number.isFinite(best.e1rm) && Number.isFinite(best.bodyweight) && best.bodyweight > 0) {
          score = Math.round((best.e1rm / best.bodyweight) * 1000) / 1000;
        }
      } else if (challenge.metric_type === "volume") {
        score = sumExerciseVolumeFromDailyRows(userRows, challenge.exercise);
      } else if (challenge.metric_type === "streak") {
        score = countCompletedSessions(userRows);
      } else if (challenge.metric_type === "adherence") {
        const completed = countCompletedSessions(userRows);
        const span = Math.max(1, daysBetweenLocal(String(challenge.start_date), String(challenge.end_date)) + 1);
        const approxPlanned = Math.max(1, Math.round(span / 2));
        score = Math.round((completed / approxPlanned) * 1000) / 10;
      }

      return {
        user_id: m.user_id,
        email: m.email,
        name: m.name || m.email,
        score: Number.isFinite(Number(score)) ? Number(score) : null,
      };
    });

    rows = rows
      .filter((r) => Number.isFinite(Number(r.score)))
      .sort((a, b) => Number(b.score) - Number(a.score));

    rows = rankRows(rows);

    res.json({
      challenge,
      rows,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/groups/:id/compare", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userA = String(req.query?.user_a || "").trim();
    const userB = String(req.query?.user_b || "").trim();
    const exercise = String(req.query?.exercise || "Bench").trim();

    const membership = await requireGroupMember(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    if (!userA || !userB) {
      return res.status(400).json({ error: "user_a and user_b required" });
    }

    const membersQ = await pool.query(
      `select gm.user_id, au.name, au.email
         from public.group_members gm
         join public.app_users au on au.id = gm.user_id
        where gm.group_id = $1
          and gm.user_id = any($2)`,
      [groupId, [userA, userB]]
    );

    const memberMap = new Map(membersQ.rows.map((r) => [r.user_id, r]));
    if (!memberMap.has(userA) || !memberMap.has(userB)) {
      return res.status(400).json({ error: "Both users must belong to the group" });
    }

    const dailyRows = await getDailyRowsForUsers([userA, userB], null);
    const rowsByUser = new Map();
    for (const r of dailyRows) {
      if (!rowsByUser.has(r.user_id)) rowsByUser.set(r.user_id, []);
      rowsByUser.get(r.user_id).push(r);
    }

    const historyA = buildE1rmHistory(rowsByUser.get(userA) || [], exercise);
    const historyB = buildE1rmHistory(rowsByUser.get(userB) || [], exercise);

    const bestA = historyA.length ? Math.max(...historyA.map((x) => x.e1rm)) : null;
    const bestB = historyB.length ? Math.max(...historyB.map((x) => x.e1rm)) : null;

    res.json({
      exercise,
      user_a: {
        user_id: userA,
        name: memberMap.get(userA)?.name || memberMap.get(userA)?.email || "Athlete A",
        email: memberMap.get(userA)?.email || null,
        best_e1rm: bestA,
        history: historyA,
      },
      user_b: {
        user_id: userB,
        name: memberMap.get(userB)?.name || memberMap.get(userB)?.email || "Athlete B",
        email: memberMap.get(userB)?.email || null,
        best_e1rm: bestB,
        history: historyB,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
/* =====================
   Boot
===================== */
const PORT = process.env.PORT || 4000;

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});

Promise.all([ensureSchema(), ensureGroupEventsSchema()])
  .then(() => {
    console.log("Schema init complete");
  })
  .catch((e) => {
    console.error("Schema init failed:", e);
  });