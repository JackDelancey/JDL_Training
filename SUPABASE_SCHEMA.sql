-- JDL Training (MVP) - Supabase Postgres schema
-- Run this in Supabase SQL Editor (it is safe to re-run)

create table if not exists public.users (
  email text primary key,
  password_hash text not null,
  name text not null,
  unit_pref text not null default 'kg' check (unit_pref in ('kg','lb')),
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  email text not null references public.users(email) on delete cascade,
  exercise text not null,
  target_kg numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (email, exercise)
);

create table if not exists public.weekly_entries (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.users(email) on delete cascade,
  week_number int not null check (week_number > 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, week_number)
);

create table if not exists public.tracked_exercises (
  email text not null references public.users(email) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (email, name)
);

create table if not exists public.exercise_library (
  email text not null references public.users(email) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (email, name)
);

create table if not exists public.programs (
  email text primary key references public.users(email) on delete cascade,
  programs jsonb not null default '[]'::jsonb,
  active_program_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id text primary key,
  code text not null unique,
  name text not null,
  owner_email text not null references public.users(email) on delete cascade,
  members jsonb not null default '[]'::jsonb, -- JSON array of emails
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_weekly_email_week on public.weekly_entries(email, week_number);
create index if not exists idx_groups_owner on public.groups(owner_email);
