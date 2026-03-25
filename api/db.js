"use strict";

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

  const alterUsers = [
    `alter table public.app_users add column if not exists unit_pref text`,
    `alter table public.app_users add column if not exists exercise_library jsonb not null default '[]'::jsonb`,
    `alter table public.app_users add column if not exists tracked_exercises jsonb not null default '["Bench","Squat","Deadlift"]'::jsonb`,
    `alter table public.app_users add column if not exists dashboard_exercises jsonb not null default '["Bench","Squat","Deadlift"]'::jsonb`,
    `alter table public.app_users add column if not exists active_program_id uuid`,
    `alter table public.app_users add column if not exists use_rpe boolean not null default true`,
    `alter table public.app_users add column if not exists onboarding_complete boolean not null default false`,
  ];
  for (const q of alterUsers) await pool.query(q);

  await pool.query(`create index if not exists app_users_email_idx on public.app_users (email)`);

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

  const alterPrograms = [
    `alter table public.programs_app add column if not exists start_date date`,
    `alter table public.programs_app add column if not exists training_days int[] not null default '{1,3,5,6}'`,
  ];
  for (const q of alterPrograms) await pool.query(q);

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

  const alterDaily = [
    `alter table public.daily_entries_app add column if not exists is_completed boolean not null default false`,
    `alter table public.daily_entries_app add column if not exists completed_at timestamptz`,
  ];
  for (const q of alterDaily) await pool.query(q);

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
      created_by uuid not null references public.app_users(id) on delete cascade,
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

  await pool.query(`
    create table if not exists public.user_connections (
      id uuid primary key default gen_random_uuid(),
      requester_user_id uuid not null references public.app_users(id) on delete cascade,
      target_user_id uuid not null references public.app_users(id) on delete cascade,
      relationship_type text not null check (relationship_type in ('friend','coach','client')),
      status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
      created_at timestamptz not null default now(),
      accepted_at timestamptz
    );
  `);

  await pool.query(`
    create table if not exists public.program_shares_app (
      id uuid primary key default gen_random_uuid(),
      program_id uuid not null references public.programs_app(id) on delete cascade,
      shared_by_user_id uuid not null references public.app_users(id) on delete cascade,
      shared_to_user_id uuid not null references public.app_users(id) on delete cascade,
      relationship_type text check (relationship_type in ('friend','coach','client')),
      message text,
      status text not null default 'pending' check (status in ('pending','accepted','declined','copied')),
      created_at timestamptz not null default now(),
      accepted_at timestamptz,
      copied_at timestamptz
    );
  `);

  // Indexes
  const indexes = [
    `create index if not exists ix_daily_entries_user_date on public.daily_entries_app(user_id, entry_date)`,
    `create index if not exists ix_weekly_entries_app_user on public.weekly_entries_app(user_id)`,
    `create index if not exists ix_weekly_entries_app_week on public.weekly_entries_app(week_number)`,
    `create index if not exists ix_programs_app_user on public.programs_app(user_id)`,
    `create index if not exists ix_group_members_user on public.group_members(user_id)`,
    `create index if not exists ix_group_members_group on public.group_members(group_id)`,
    `create index if not exists ix_group_events_group_created on public.group_events(group_id, created_at desc)`,
    `create index if not exists ix_group_shared_programs_group on public.group_shared_programs(group_id, created_at desc)`,
    `create index if not exists ix_group_challenges_group on public.group_challenges(group_id, created_at desc)`,
  ];
  for (const q of indexes) await pool.query(q);

  console.log("Schema init complete");
}

module.exports = { pool, ensureSchema };
