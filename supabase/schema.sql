-- Breakthrough v1.4 rebuild — Supabase schema (fresh; old tables discarded).
-- Run in the Supabase SQL Editor. Drops the v1.2 prototype tables first.

drop table if exists encounter_relevant_cards cascade;
drop table if exists nugget_discovery cascade;
drop table if exists decks cascade;
drop table if exists encounters cascade;
drop table if exists cards cascade;
drop table if exists info_nuggets cascade;

-- ── Authored content ─────────────────────────────────────────────────────────

-- Cards (Skill / Information / Tokens alike): the full v1.4 CardDefinition
-- lives in `data` (keywords incl. Rapport/Heavy Hand, shieldTriggerEffects,
-- heavyHandEffects, trap triggers, triggered/activated abilities,
-- counters/thresholds/amplifiers). No deprecated `description` field.
create table cards (
  id text primary key,
  data jsonb not null,
  nugget_id text,
  is_token boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table info_nuggets (
  id text primary key,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Encounters: full v1.4 §7 EncounterConfig in `data` —
-- minTurnStartPriority / firstTurnBonusPriority / maxPriority / startingSide,
-- npcGuardShieldCount, opponentShields as
-- { cardId, isHint, hintText?, loreDescription, keyNuggetIds[] },
-- npcHandLimit, nuggetOverrides, scheduledPlays, startingImpressions.
-- (priorityMode / startingPriority / defaultRestorePriority / shieldBreakOrder
-- do not exist in this shape.)
create table encounters (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table decks (
  id text primary key,
  name text not null,
  description text not null default '',
  card_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Runtime progress (v1.4 §12 — the save layer the old build never wired) ──
-- Single anonymous profile for the prototype (anon key), keyed by content ids.

-- Player Collection (cards gained from broken NPC Core Shields, etc.)
create table progress_collection (
  card_id text primary key,
  gained_at timestamptz not null default now()
);

-- Global nugget discovery (persists across encounters and retries).
create table progress_nugget_discovery (
  nugget_id text primary key,
  discovered_at timestamptz not null default now()
);

-- Trait discovery, per NPC (global per v1.4 §7.1).
create table progress_trait_discovery (
  encounter_id text not null,
  trait_id text not null,
  discovered_at timestamptz not null default now(),
  primary key (encounter_id, trait_id)
);

-- Per-encounter persistence for retryable encounters: persistent core-shield
-- breaks and the Ponder-conversion memory (v1.4 §3.9/§12).
create table progress_encounters (
  encounter_id text primary key,
  broken_core_shield_card_ids jsonb not null default '[]'::jsonb,
  played_non_relevant_cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── updated_at maintenance ───────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cards_updated_at before update on cards
  for each row execute function update_updated_at();
create trigger encounters_updated_at before update on encounters
  for each row execute function update_updated_at();
create trigger info_nuggets_updated_at before update on info_nuggets
  for each row execute function update_updated_at();
create trigger decks_updated_at before update on decks
  for each row execute function update_updated_at();
create trigger progress_encounters_updated_at before update on progress_encounters
  for each row execute function update_updated_at();

-- ── Permissive RLS (anon-key prototype) ──────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'cards','info_nuggets','encounters','decks',
    'progress_collection','progress_nugget_discovery',
    'progress_trait_discovery','progress_encounters'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "allow all on %1$s" on %1$I for all using (true) with check (true)', t);
  end loop;
end $$;
