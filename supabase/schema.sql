-- Breakthrough Dev Tools — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

create table if not exists cards (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists encounters (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

-- Permissive RLS: allow all operations via anon key
alter table cards enable row level security;
alter table encounters enable row level security;

create policy "Allow all on cards" on cards
  for all using (true) with check (true);

create policy "Allow all on encounters" on encounters
  for all using (true) with check (true);
