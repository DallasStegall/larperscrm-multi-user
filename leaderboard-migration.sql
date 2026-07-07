-- ============================================================================
-- LarpersCRM — Leaderboard migration (sales + PII-safe leaderboard view)
-- Run ONCE in Supabase → SQL Editor. Safe to re-run (upgrades an older install).
--
-- Design:
--   * public.sales holds full per-sale rows INCLUDING customer PII (client_name,
--     carrier, product). RLS keeps each agent's rows PRIVATE to that agent —
--     nobody can read another agent's book of business.
--   * public.leaderboard_entries is a VIEW exposing ONLY non-PII columns
--     (agent name, AP, date). Every signed-in agent can read the whole view —
--     that's the shared leaderboard, with no customer data exposed.
--   * A trigger forces agent_name to the agent's own profile name on app-entered
--     sales, so nobody can post a sale under a colleague's name.
--   * Writes: an agent logs their own sale (RLS: agent_id = auth.uid()); the
--     Discord ingestion Edge Function uses the service-role key (bypasses RLS)
--     and sets agent_id = null.
-- ============================================================================

create table if not exists public.sales (
  id                  uuid primary key default gen_random_uuid(),
  agent_name          text not null,                                   -- display name on the board
  agent_id            uuid references public.profiles(id) on delete set null, -- set for app-entered sales; null for Discord-only
  ap                  numeric default 0,                               -- annual premium (the ranked metric)
  carrier             text,
  product             text,
  client_name         text,                                            -- customer PII — never exposed via the view
  source              text default 'discord',                          -- 'discord' | 'crm'
  discord_message_id  text,                                            -- for de-duping Discord messages
  sold_at             timestamptz default now(),
  created_at          timestamptz default now()
);

-- AP can never be negative.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sales_ap_nonneg') then
    alter table public.sales add constraint sales_ap_nonneg check (ap >= 0);
  end if;
end $$;

-- Never ingest the same Discord message twice.
create unique index if not exists sales_discord_msg_unique
  on public.sales (discord_message_id)
  where discord_message_id is not null;

create index if not exists sales_sold_at_idx on public.sales (sold_at);

alter table public.sales enable row level security;

-- ---------------------------------------------------------------------------
-- Base-table RLS: each agent's sales are PRIVATE to them (drop the old
-- org-wide read policy from the first version of this migration if present).
-- ---------------------------------------------------------------------------
drop policy if exists "Signed-in agents can read all sales" on public.sales;
drop policy if exists "Agents can read their own sales" on public.sales;
create policy "Agents can read their own sales"
  on public.sales for select
  to authenticated
  using (agent_id = auth.uid());

drop policy if exists "Agents can add their own sales" on public.sales;
create policy "Agents can add their own sales"
  on public.sales for insert
  to authenticated
  with check (agent_id = auth.uid());

drop policy if exists "Agents can update their own sales" on public.sales;
create policy "Agents can update their own sales"
  on public.sales for update
  to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

drop policy if exists "Agents can delete their own sales" on public.sales;
create policy "Agents can delete their own sales"
  on public.sales for delete
  to authenticated
  using (agent_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Anti-spoof: on app-entered sales (agent_id set), force agent_name to the
-- agent's OWN profile name so nobody can log a sale under someone else's name.
-- Discord rows (agent_id null, written by the service role) keep their name.
-- ---------------------------------------------------------------------------
create or replace function public.set_sale_agent_name()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  pname text;
begin
  if new.agent_id is not null then
    select full_name into pname from public.profiles where id = new.agent_id;
    new.agent_name := coalesce(nullif(trim(pname), ''), new.agent_name, 'Agent');
  end if;
  return new;
end;
$$;

drop trigger if exists sales_set_agent_name on public.sales;
create trigger sales_set_agent_name
  before insert or update on public.sales
  for each row execute function public.set_sale_agent_name();

-- ---------------------------------------------------------------------------
-- Shared, PII-FREE leaderboard view. Runs with the view owner's rights
-- (security_invoker = false) so it can read across all agents, but it only ever
-- selects safe columns — no client_name / carrier / product.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_entries
  with (security_invoker = false)
  as select id, agent_name, agent_id, ap, sold_at, source
     from public.sales;

revoke all on public.leaderboard_entries from anon;
grant select on public.leaderboard_entries to authenticated;

-- ============================================================================
-- Done. The Leaderboard reads public.leaderboard_entries (safe columns only);
-- customer PII in public.sales stays private to each agent. Connecting Discord
-- is next (the discord-sales Edge Function writes to public.sales).
-- ============================================================================
