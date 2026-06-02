-- ============================================================
-- BrokerApp — Supabase Migration
-- Run this entire script in your Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query → paste → Run)
-- ============================================================

-- ── 1. Profiles (extends auth.users) ────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text not null default '',
  tagline     text not null default '',
  created_at  timestamptz not null default now()
);

-- ── 2. Properties ────────────────────────────────────────────
create table if not exists public.properties (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  property_type  text not null,
  location       text not null,
  configuration  text not null default 'Other',
  area_value     real not null default 0,
  area_unit      text not null default 'Sq Ft',
  area_sqft      real not null default 0,
  price          real not null default 0,
  status         text not null default 'Available',
  listing_type   text not null default 'For Sale',
  notes          text not null default '',
  closed_at      text,
  created_at     timestamptz not null default now()
);

-- Run this if the table already exists (adds listing_type to existing installs):
alter table public.properties add column if not exists listing_type text not null default 'For Sale';

-- ── 3. Clients ───────────────────────────────────────────────
create table if not exists public.clients (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  phone          text not null default '',
  property_type  text default '',
  location       text default '',
  budget_min     real default 0,
  budget_max     real default 0,
  configuration  text default '',
  notes          text default '',
  status         text not null default 'New Lead',
  created_at     timestamptz not null default now()
);

-- ── 4. Follow-ups ────────────────────────────────────────────
create table if not exists public.followups (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  client_name    text not null,
  phone          text default '',
  note           text not null,
  reminder_date  text not null,
  status         text not null default 'Pending',
  created_at     timestamptz not null default now()
);

-- ── 5. Enable Row Level Security ─────────────────────────────
alter table public.profiles  enable row level security;
alter table public.properties enable row level security;
alter table public.clients    enable row level security;
alter table public.followups  enable row level security;

-- ── 6. RLS Policies (users see only their own data) ──────────
-- profiles
drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id);

-- properties
drop policy if exists "properties_owner" on public.properties;
create policy "properties_owner" on public.properties
  for all using (auth.uid() = user_id);

-- clients
drop policy if exists "clients_owner" on public.clients;
create policy "clients_owner" on public.clients
  for all using (auth.uid() = user_id);

-- followups
drop policy if exists "followups_owner" on public.followups;
create policy "followups_owner" on public.followups
  for all using (auth.uid() = user_id);

-- ── 7. Auto-create profile on signup ─────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Done! ─────────────────────────────────────────────────────
-- After running this script:
-- 1. Go to Authentication → Providers → Email
-- 2. Disable "Confirm email" if you want instant login after signup
--    (recommended for single-broker use)
