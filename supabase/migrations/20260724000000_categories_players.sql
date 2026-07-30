create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch text not null default 'Masculino',
  level integer not null default 1 check (level > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_name_unique_ci
on public.categories (lower(btrim(name)));

create index if not exists categories_active_level_idx
on public.categories (is_active, level, name);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  document text not null check (document ~ '^[0-9]+$'),
  address text,
  phone text,
  birth_date date,
  gender text,
  current_category_id uuid not null references public.categories(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended', 'blocked_faults')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists players_email_unique_ci
on public.players (lower(btrim(email)));

create unique index if not exists players_document_unique
on public.players (document);

create index if not exists players_current_category_idx
on public.players (current_category_id);

create index if not exists players_status_idx
on public.players (status);

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
before update on public.players
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.players enable row level security;

drop policy if exists "TEMP_DEV_categories_all" on public.categories;
create policy "TEMP_DEV_categories_all"
on public.categories
for all
to anon, authenticated
using (true)
with check (true);

comment on policy "TEMP_DEV_categories_all" on public.categories is
'TEMP DEV POLICY - REMOVE WHEN SUPABASE AUTH IS ENABLED. Allows GAME temporary login to read/write categories using the publishable key.';

drop policy if exists "TEMP_DEV_players_all" on public.players;
create policy "TEMP_DEV_players_all"
on public.players
for all
to anon, authenticated
using (true)
with check (true);

comment on policy "TEMP_DEV_players_all" on public.players is
'TEMP DEV POLICY - REMOVE WHEN SUPABASE AUTH IS ENABLED. Allows GAME temporary login to read/write players using the publishable key.';

insert into public.categories (id, name, branch, level, is_active)
values
  ('11111111-1111-4111-8111-111111111111', 'Categoría Prueba A', 'Masculino', 1, true),
  ('22222222-2222-4222-8222-222222222222', 'Categoría Prueba B', 'Masculino', 2, true)
on conflict ((lower(btrim(name)))) do update
set
  branch = excluded.branch,
  level = excluded.level,
  is_active = true,
  updated_at = now();

insert into public.players (
  id,
  first_name,
  last_name,
  email,
  document,
  address,
  phone,
  birth_date,
  gender,
  current_category_id,
  status,
  avatar_url
)
values (
  '33333333-3333-4333-8333-333333333333',
  'Juan',
  'Pérez',
  'hola@hola.com',
  '30000000',
  'Domicilio inicial',
  '1122334455',
  '1990-01-01',
  'Masculino',
  '11111111-1111-4111-8111-111111111111',
  'active',
  null
)
on conflict ((lower(btrim(email)))) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  document = excluded.document,
  address = excluded.address,
  phone = excluded.phone,
  birth_date = excluded.birth_date,
  gender = excluded.gender,
  current_category_id = excluded.current_category_id,
  status = excluded.status,
  updated_at = now();
