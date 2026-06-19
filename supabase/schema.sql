-- Breakthrough Dev Tools — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ── Info Nuggets (discoverable lore pieces) ──────────────────
create table if not exists info_nuggets (
  id text primary key,
  name text not null,
  long_description text not null default '',
  image_url text,
  default_card_id text,  -- FK backfilled after card creation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Cards ────────────────────────────────────────────────────
create table if not exists cards (
  id text primary key,
  data jsonb not null,
  nugget_id text references info_nuggets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Back-reference from nugget to its default card
alter table info_nuggets
  add constraint info_nuggets_default_card_fk
  foreign key (default_card_id) references cards(id) on delete set null;

-- ── Encounters ───────────────────────────────────────────────
create table if not exists encounters (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Encounter Relevant Cards (nugget override junction) ──────
create table if not exists encounter_relevant_cards (
  id text primary key default gen_random_uuid()::text,
  encounter_id text not null references encounters(id) on delete cascade,
  nugget_id text not null references info_nuggets(id) on delete cascade,
  card_id text not null references cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (encounter_id, nugget_id)
);

-- ── Nugget Discovery (runtime progress) ─────────────────────
create table if not exists nugget_discovery (
  encounter_id text not null references encounters(id) on delete cascade,
  nugget_id text not null references info_nuggets(id) on delete cascade,
  discovered_at timestamptz not null default now(),
  primary key (encounter_id, nugget_id)
);

-- Auto-update updated_at on row changes
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cards_updated_at
  before update on cards
  for each row execute function update_updated_at();

create trigger encounters_updated_at
  before update on encounters
  for each row execute function update_updated_at();

create trigger info_nuggets_updated_at
  before update on info_nuggets
  for each row execute function update_updated_at();

-- ── Decks (curated starter / personality decks) ────────────────
create table if not exists decks (
  id text primary key,
  name text not null,
  description text not null default '',
  card_list jsonb not null default '{"cards":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger decks_updated_at
  before update on decks
  for each row execute function update_updated_at();

-- Permissive RLS: allow all operations via anon key
alter table cards enable row level security;
alter table encounters enable row level security;
alter table info_nuggets enable row level security;
alter table encounter_relevant_cards enable row level security;
alter table nugget_discovery enable row level security;

create policy "Allow all on cards" on cards
  for all using (true) with check (true);

create policy "Allow all on encounters" on encounters
  for all using (true) with check (true);

create policy "Allow all on info_nuggets" on info_nuggets
  for all using (true) with check (true);

create policy "Allow all on encounter_relevant_cards" on encounter_relevant_cards
  for all using (true) with check (true);

create policy "Allow all on nugget_discovery" on nugget_discovery
  for all using (true) with check (true);

alter table decks enable row level security;

create policy "Allow all on decks" on decks
  for all using (true) with check (true);
