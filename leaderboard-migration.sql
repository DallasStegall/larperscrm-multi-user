-- ============================================================================
-- LarpersCRM — Leaderboard migration (shared sales table)
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
--
-- Unlike the per-agent tables, the leaderboard is SHARED: every signed-in agent
-- can read all sales (that's the whole point of a leaderboard). Writes come
-- from two places:
--   * an agent logging their own sale in the app (RLS: agent_id = auth.uid())
--   * the Discord ingestion Edge Function, which uses the service-role key and
--     bypasses RLS entirely.
-- ============================================================================

create table if not exists public.sales (
  id                  uuid primary key default gen_random_uuid(),
  agent_name          text not null,                                   -- display name on the board
  agent_id            uuid references public.profiles(id) on delete set null, -- set for app-entered sales; null for Discord-only
  ap                  numeric default 0,                               -- annual premium (the ranked metric)
  carrier             text,
  product             text,
  client_name         text,
  source              text default 'discord',                          -- 'discord' | 'crm'
  discord_message_id  text,                                            -- for de-duping Discord messages
  sold_at             timestamptz default now(),
  created_at          timestamptz default now()
);

-- Never ingest the same Discord message twice.
create unique index if not exists sales_discord_msg_unique
  on public.sales (discord_message_id)
  where discord_message_id is not null;

create index if not exists sales_sold_at_idx on public.sales (sold_at);

alter table public.sales enable row level security;

-- Shared read: any authenticated agent sees the whole board.
drop policy if exists "Signed-in agents can read all sales" on public.sales;
create policy "Signed-in agents can read all sales"
  on public.sales for select
  to authenticated
  using (true);

-- An agent may log their OWN sale from the app (agent_id must be themselves).
-- The Discord function uses the service-role key, which bypasses these policies.
drop policy if exists "Agents can add their own sales" on public.sales;
create policy "Agents can add their own sales"
  on public.sales for insert
  to authenticated
  with check (agent_id = auth.uid());

-- Agents may fix/remove a sale they entered themselves.
drop policy if exists "Agents can update their own sales" on public.sales;
create policy "Agents can update their own sales"
  on public.sales for update
  to authenticated
  using (agent_id = auth.uid());

drop policy if exists "Agents can delete their own sales" on public.sales;
create policy "Agents can delete their own sales"
  on public.sales for delete
  to authenticated
  using (agent_id = auth.uid());

-- ============================================================================
-- Done. The Leaderboard page can now read sales, and agents can log their own.
-- Connecting Discord is the next step (see the discord-sales Edge Function).
-- ============================================================================
