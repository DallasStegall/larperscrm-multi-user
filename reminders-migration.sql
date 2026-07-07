-- ============================================================================
-- LarpersCRM — Reminders migration
-- Run this ONCE in your Supabase project's SQL Editor (Dashboard > SQL Editor).
--
-- WHAT THIS DOES:
--   1. Adds reminder-preference columns to profiles (used by the Settings page).
--   2. Creates reminder_log so the reminder service never sends a duplicate.
--
-- Safe to run more than once (uses IF NOT EXISTS everywhere).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Reminder preferences on the agent's profile
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists reminder_via_sms            boolean default false,
  add column if not exists reminder_via_email          boolean default true,
  add column if not exists reminder_email              text,               -- optional override; falls back to auth email
  add column if not exists reminder_appt_enabled       boolean default true,
  add column if not exists reminder_appt_lead_minutes  integer default 1440, -- 24h before
  add column if not exists reminder_f2f_enabled        boolean default true;


-- ---------------------------------------------------------------------------
-- 2) Reminder log — one row per reminder actually sent, so the scheduled
--    service is idempotent and won't spam an agent on every run.
--    kind = 'appointment' | 'f2f'   ref_id = the appointments.id / f2f_sessions.id
-- ---------------------------------------------------------------------------
create table if not exists public.reminder_log (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  ref_id     uuid not null,
  channel    text,                       -- 'sms' | 'email'
  sent_at    timestamptz default now()
);

-- One reminder per (agent, kind, ref, channel).
create unique index if not exists reminder_log_unique
  on public.reminder_log (agent_id, kind, ref_id, channel);

alter table public.reminder_log enable row level security;

-- Agents may read their own reminder history. Inserts are done by the
-- reminder service using the service-role key, which bypasses RLS — so no
-- insert policy is granted to regular agents.
drop policy if exists "Agents can view their own reminder log" on public.reminder_log;
create policy "Agents can view their own reminder log"
  on public.reminder_log for select
  using (auth.uid() = agent_id);


-- ============================================================================
-- Done. The Settings page can now save reminder preferences, and the
-- send-reminders Edge Function has everything it needs to run.
-- ============================================================================
