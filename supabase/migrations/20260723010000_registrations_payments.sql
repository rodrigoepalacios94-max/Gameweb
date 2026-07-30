create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  tournament_id text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'waived')),
  payment_due_at timestamptz,
  unit_price numeric(12, 2) not null default 0,
  category_count integer not null default 0,
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  benefit_percentage numeric(5, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  amount_breakdown jsonb not null default '{}'::jsonb,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_categories (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  tournament_category_id text not null,
  category_name text,
  unit_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (registration_id, tournament_category_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  player_id text not null,
  tournament_id text not null,
  provider text not null default 'mercado_pago',
  provider_payment_id text,
  provider_preference_id text,
  amount numeric(12, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  payment_method text,
  amount_breakdown jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.player_payment_waivers (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  year integer not null,
  starts_at date not null,
  ends_at date not null,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  constraint player_payment_waivers_year_bounds check (
    starts_at <= ends_at
    and extract(year from starts_at)::integer = year
    and ends_at = make_date(year, 12, 31)
  )
);

create index if not exists registrations_player_id_idx on public.registrations (player_id);
create index if not exists registrations_tournament_id_idx on public.registrations (tournament_id);
create index if not exists registrations_payment_due_idx on public.registrations (payment_due_at) where status = 'confirmed' and payment_status = 'pending';
create index if not exists registration_categories_registration_idx on public.registration_categories (registration_id);
create index if not exists payments_registration_idx on public.payments (registration_id);
create index if not exists payments_player_id_idx on public.payments (player_id);
create index if not exists player_payment_waivers_player_year_idx on public.player_payment_waivers (player_id, year);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists registrations_set_updated_at on public.registrations;
create trigger registrations_set_updated_at
before update on public.registrations
for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.registrations enable row level security;
alter table public.registration_categories enable row level security;
alter table public.payments enable row level security;
alter table public.player_payment_waivers enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.current_player_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select player_id from public.profiles
  where auth_user_id = auth.uid()
  limit 1;
$$;

drop policy if exists "registrations_select_own_or_admin" on public.registrations;
create policy "registrations_select_own_or_admin"
on public.registrations
for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());

drop policy if exists "registration_categories_select_own_or_admin" on public.registration_categories;
create policy "registration_categories_select_own_or_admin"
on public.registration_categories
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.registrations r
    where r.id = registration_id
      and r.player_id = public.current_player_id()
  )
);

drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin"
on public.payments
for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());

drop policy if exists "waivers_select_own_or_admin" on public.player_payment_waivers;
create policy "waivers_select_own_or_admin"
on public.player_payment_waivers
for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());

drop policy if exists "registrations_admin_all" on public.registrations;
create policy "registrations_admin_all"
on public.registrations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "payments_admin_all" on public.payments;
create policy "payments_admin_all"
on public.payments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "registration_categories_admin_all" on public.registration_categories;
create policy "registration_categories_admin_all"
on public.registration_categories
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "waivers_admin_all" on public.player_payment_waivers;
create policy "waivers_admin_all"
on public.player_payment_waivers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.process_expired_pending_registrations(p_now timestamptz default now())
returns table(registration_id uuid, player_id text, tournament_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.registrations r
  set
    status = 'cancelled',
    cancel_reason = 'payment_expired',
    cancelled_at = coalesce(r.cancelled_at, p_now),
    updated_at = p_now
  where r.status = 'confirmed'
    and r.payment_status = 'pending'
    and r.payment_due_at is not null
    and r.payment_due_at <= p_now
  returning r.id, r.player_id, r.tournament_id;
end;
$$;
