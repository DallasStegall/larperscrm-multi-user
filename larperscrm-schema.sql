-- ============================================================================
-- LarpersCRM — Database Schema (Supabase / PostgreSQL)
-- Step 1 of the migration from single-file prototype to multi-agent web app.
--
-- WHAT THIS DOES:
--   * Creates a table for each core entity in the CRM.
--   * Every row is owned by an agent (agent_id).
--   * Row-Level Security (RLS) makes each agent see ONLY their own rows.
--   * A trigger auto-creates a profile row whenever someone signs up.
--
-- HOW TO USE:
--   1. Create a free Supabase project (see the runbook in chat).
--   2. Open the project's SQL Editor.
--   3. Paste this entire file and click "Run".
--   4. Email auth is on by default — nothing else to configure here.
--
-- Data isolation model (v1): each agent sees only their own data.
-- Upline-sees-downline visibility (from the HCMS/hierarchy section) is a more
-- advanced policy layer we'll add deliberately once the base is working live.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PROFILES  (extends Supabase's built-in auth.users)
-- One row per agent. Auto-created on signup via the trigger at the bottom.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text default 'Agent',
  phone       text,
  npn         text,
  upline_id   uuid references public.profiles(id),   -- for future hierarchy
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Agents can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Agents can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);


-- ---------------------------------------------------------------------------
-- LEAD BATCHES
-- ---------------------------------------------------------------------------
create table if not exists public.lead_batches (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  visibility    text default 'private',   -- 'private' | 'shared'
  access_level  text,                      -- 'full' | 'dial' (when shared)
  active        boolean default true,
  created_at    timestamptz default now()
);

alter table public.lead_batches enable row level security;

create policy "Agents manage their own batches"
  on public.lead_batches for all
  using (auth.uid() = agent_id)
  with check (auth.uid() = agent_id);


-- ---------------------------------------------------------------------------
-- LEADS
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.profiles(id) on delete cascade,
  batch_id    uuid references public.lead_batches(id) on delete set null,
  name        text not null,
  phone       text,
  email       text,
  stage       text default 'new',   -- 'new' | 'called' | 'called5' | ...
  source      text,
  created_at  timestamptz default now()
);

alter table public.leads enable row level security;

create policy "Agents manage their own leads"
  on public.leads for all
  using (auth.uid() = agent_id)
  with check (auth.uid() = agent_id);


-- ---------------------------------------------------------------------------
-- POLICIES  (My Policies)
-- ---------------------------------------------------------------------------
create table if not exists public.policies (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references public.profiles(id) on delete cascade,
  carrier          text,
  product          text,
  status           text default 'pending',
  monthly_premium  numeric default 0,
  annual_premium   numeric default 0,
  face_amount      numeric default 0,
  policy_number    text,
  sale_date        date,
  effective_date   date,
  reason           text,                   -- manual-entry audit reason
  created_at       timestamptz default now()
);

alter table public.policies enable row level security;

create policy "Agents manage their own policies"
  on public.policies for all
  using (auth.uid() = agent_id)
  with check (auth.uid() = agent_id);


-- ---------------------------------------------------------------------------
-- CARRIER APPOINTMENTS  (HCMS "My Carriers")
-- ---------------------------------------------------------------------------
create table if not exists public.carrier_appointments (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.profiles(id) on delete cascade,
  carrier_name    text not null,
  status          text default 'active',   -- active|pending|terminated|...
  with_alibi      boolean default true,
  comp            text,
  upline          text,
  writing_number  text,
  imo             text,
  note            text,
  created_at      timestamptz default now()
);

alter table public.carrier_appointments enable row level security;

create policy "Agents manage their own carrier appointments"
  on public.carrier_appointments for all
  using (auth.uid() = agent_id)
  with check (auth.uid() = agent_id);


-- ---------------------------------------------------------------------------
-- CALENDAR APPOINTMENTS
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  appt_date   date not null,
  appt_time   time,
  notes       text,
  created_at  timestamptz default now()
);

alter table public.appointments enable row level security;

create policy "Agents manage their own appointments"
  on public.appointments for all
  using (auth.uid() = agent_id)
  with check (auth.uid() = agent_id);


-- ---------------------------------------------------------------------------
-- FACE-TO-FACE SESSIONS
-- ---------------------------------------------------------------------------
create table if not exists public.f2f_sessions (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.profiles(id) on delete cascade,
  client_name   text not null,
  method        text,                     -- 'email' | 'sms'
  contact       text,
  link_token    text,
  status        text default 'waiting',   -- 'waiting' | 'ended'
  created_at    timestamptz default now()
);

alter table public.f2f_sessions enable row level security;

create policy "Agents manage their own sessions"
  on public.f2f_sessions for all
  using (auth.uid() = agent_id)
  with check (auth.uid() = agent_id);


-- ---------------------------------------------------------------------------
-- INTEGRATIONS  (inbound lead webhooks)
-- ---------------------------------------------------------------------------
create table if not exists public.integrations (
  id             uuid primary key default gen_random_uuid(),
  agent_id       uuid not null references public.profiles(id) on delete cascade,
  name           text not null,
  webhook_token  text not null,
  active         boolean default true,
  created_at     timestamptz default now()
);

alter table public.integrations enable row level security;

create policy "Agents manage their own integrations"
  on public.integrations for all
  using (auth.uid() = agent_id)
  with check (auth.uid() = agent_id);


-- ---------------------------------------------------------------------------
-- AUTO-CREATE PROFILE ON SIGNUP
-- When a new user signs up through Supabase Auth, create their profile row
-- automatically, pulling full_name from the signup metadata if provided.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- Done. Every table has RLS on, so each agent's data is isolated by default.
-- Next: we wire the app's login/signup screens to this project and start
-- reading/writing real per-agent data, feature by feature.
-- ============================================================================
