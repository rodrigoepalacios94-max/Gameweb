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

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.categories to anon, authenticated;
grant select, insert, update, delete on public.players to anon, authenticated;

create table if not exists public.scoring_systems (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  inscription integer not null default 0,
  preliminary integer not null default 0,
  preliminary_win integer not null default 0,
  classification integer not null default 0,
  round32 integer not null default 0,
  round16 integer not null default 0,
  octavos integer not null default 0,
  cuartos integer not null default 0,
  semifinal integer not null default 0,
  runner_up integer not null default 0,
  champion integer not null default 0,
  special_bonus integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists scoring_systems_set_updated_at on public.scoring_systems;
create trigger scoring_systems_set_updated_at
before update on public.scoring_systems
for each row execute function public.set_updated_at();

alter table public.scoring_systems enable row level security;
drop policy if exists "TEMP_DEV_scoring_systems_all" on public.scoring_systems;
create policy "TEMP_DEV_scoring_systems_all"
on public.scoring_systems
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_scoring_systems_all" on public.scoring_systems is
  'TEMP_DEV: acceso amplio mientras GAME no usa Supabase Auth definitivo.';
grant select, insert, update, delete on public.scoring_systems to anon, authenticated;

create table if not exists public.regulation_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists regulation_documents_set_updated_at on public.regulation_documents;
create trigger regulation_documents_set_updated_at
before update on public.regulation_documents
for each row execute function public.set_updated_at();

alter table public.regulation_documents enable row level security;
drop policy if exists "TEMP_DEV_regulation_documents_all" on public.regulation_documents;
create policy "TEMP_DEV_regulation_documents_all"
on public.regulation_documents
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_regulation_documents_all" on public.regulation_documents is
  'TEMP_DEV: acceso amplio mientras GAME no usa Supabase Auth definitivo.';
grant select, insert, update, delete on public.regulation_documents to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('regulations', 'regulations', false, 15728640, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['application/pdf'];

drop policy if exists "TEMP_DEV_regulations_storage_select" on storage.objects;
create policy "TEMP_DEV_regulations_storage_select"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'regulations');

drop policy if exists "TEMP_DEV_regulations_storage_insert" on storage.objects;
create policy "TEMP_DEV_regulations_storage_insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'regulations');

drop policy if exists "TEMP_DEV_regulations_storage_update" on storage.objects;
create policy "TEMP_DEV_regulations_storage_update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'regulations')
with check (bucket_id = 'regulations');

drop policy if exists "TEMP_DEV_regulations_storage_delete" on storage.objects;
create policy "TEMP_DEV_regulations_storage_delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'regulations');

create table if not exists public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photo_albums_https_url check (url ~* '^https://')
);

drop trigger if exists photo_albums_set_updated_at on public.photo_albums;
create trigger photo_albums_set_updated_at
before update on public.photo_albums
for each row execute function public.set_updated_at();

alter table public.photo_albums enable row level security;
drop policy if exists "TEMP_DEV_photo_albums_all" on public.photo_albums;
create policy "TEMP_DEV_photo_albums_all"
on public.photo_albums
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_photo_albums_all" on public.photo_albums is
  'TEMP_DEV: acceso amplio mientras GAME no usa Supabase Auth definitivo.';
grant select, insert, update, delete on public.photo_albums to anon, authenticated;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_date date not null,
  end_date date,
  registration_close_date date,
  semifinals_date date,
  finals_date date,
  status text not null default 'open' check (status in ('open', 'closed', 'in_progress', 'finished', 'cancelled')),
  price_per_category numeric(12,2) not null default 0 check (price_per_category >= 0),
  scoring_system_id uuid references public.scoring_systems(id) on delete restrict,
  match_format jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  court_capacity jsonb not null default '{}'::jsonb,
  courts jsonb not null default '[]'::jsonb,
  phases jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tournaments_set_updated_at on public.tournaments;
create trigger tournaments_set_updated_at
before update on public.tournaments
for each row execute function public.set_updated_at();

alter table public.tournaments enable row level security;
drop policy if exists "TEMP_DEV_tournaments_all" on public.tournaments;
create policy "TEMP_DEV_tournaments_all"
on public.tournaments
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_tournaments_all" on public.tournaments is
  'TEMP_DEV: acceso amplio mientras GAME no usa Supabase Auth definitivo.';
grant select, insert, update, delete on public.tournaments to anon, authenticated;

create index if not exists tournaments_status_idx on public.tournaments(status);
create index if not exists tournaments_start_date_idx on public.tournaments(start_date);
create index if not exists tournaments_scoring_system_idx on public.tournaments(scoring_system_id);

create table if not exists public.tournament_categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  format text,
  recommended_format text,
  format_status text not null default 'pending',
  format_decision text,
  match_format jsonb not null default '{}'::jsonb,
  status text not null default 'Formato pendiente',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, category_id)
);

drop trigger if exists tournament_categories_set_updated_at on public.tournament_categories;
create trigger tournament_categories_set_updated_at
before update on public.tournament_categories
for each row execute function public.set_updated_at();

alter table public.tournament_categories enable row level security;
drop policy if exists "TEMP_DEV_tournament_categories_all" on public.tournament_categories;
create policy "TEMP_DEV_tournament_categories_all"
on public.tournament_categories
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_tournament_categories_all" on public.tournament_categories is
  'TEMP_DEV: acceso amplio mientras GAME no usa Supabase Auth definitivo.';
grant select, insert, update, delete on public.tournament_categories to anon, authenticated;
create index if not exists tournament_categories_tournament_idx on public.tournament_categories(tournament_id);
create index if not exists tournament_categories_category_idx on public.tournament_categories(category_id);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  tournament_id uuid not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'waived')),
  payment_due_at timestamptz,
  unit_price numeric(12,2) not null default 0,
  category_count integer not null default 1,
  subtotal numeric(12,2) not null default 0,
  subtotal_amount numeric(12,2) not null default 0,
  benefit_percentage numeric(5,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  amount_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text
);

alter table public.registrations
  add column if not exists subtotal_amount numeric(12,2) not null default 0,
  add column if not exists discount_percent numeric(5,2) not null default 0,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registrations' and column_name = 'player_id' and data_type = 'text'
  ) then
    if exists (select 1 from public.registrations where player_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'registrations.player_id contiene ids temporales. Limpia esos registros antes de aplicar esta migracion real.';
    end if;
    alter table public.registrations alter column player_id type uuid using player_id::uuid;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registrations' and column_name = 'tournament_id' and data_type = 'text'
  ) then
    if exists (select 1 from public.registrations where tournament_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'registrations.tournament_id contiene ids temporales. Limpia esos registros antes de aplicar esta migracion real.';
    end if;
    alter table public.registrations alter column tournament_id type uuid using tournament_id::uuid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.registrations'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.players'::regclass
      and a.attname = 'player_id'
  ) then
    alter table public.registrations
      add constraint registrations_player_fk foreign key (player_id) references public.players(id) on delete restrict;
  end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.registrations'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.tournaments'::regclass
      and a.attname = 'tournament_id'
  ) then
    alter table public.registrations
      add constraint registrations_tournament_fk foreign key (tournament_id) references public.tournaments(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'registrations_one_active_per_player_tournament') then
    create unique index if not exists registrations_one_active_per_player_tournament
      on public.registrations(player_id, tournament_id)
      where status <> 'cancelled';
  end if;
end $$;

drop trigger if exists registrations_set_updated_at on public.registrations;
create trigger registrations_set_updated_at
before update on public.registrations
for each row execute function public.set_updated_at();

alter table public.registrations enable row level security;
drop policy if exists "TEMP_DEV_registrations_all" on public.registrations;
create policy "TEMP_DEV_registrations_all"
on public.registrations
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_registrations_all" on public.registrations is
  'TEMP_DEV: acceso amplio mientras GAME no usa Supabase Auth definitivo.';
grant select, insert, update, delete on public.registrations to anon, authenticated;

create table if not exists public.registration_categories (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  tournament_category_id uuid not null,
  category_name text not null,
  unit_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (registration_id, tournament_category_id)
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registration_categories' and column_name = 'tournament_category_id' and data_type = 'text'
  ) then
    if exists (select 1 from public.registration_categories where tournament_category_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'registration_categories.tournament_category_id contiene ids temporales. Limpia esos registros antes de aplicar esta migracion real.';
    end if;
    alter table public.registration_categories alter column tournament_category_id type uuid using tournament_category_id::uuid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.registration_categories'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.registrations'::regclass
      and a.attname = 'registration_id'
  ) then
    alter table public.registration_categories
      add constraint registration_categories_registration_fk foreign key (registration_id) references public.registrations(id) on delete cascade;
  end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.registration_categories'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.tournament_categories'::regclass
      and a.attname = 'tournament_category_id'
  ) then
    alter table public.registration_categories
      add constraint registration_categories_tournament_category_fk foreign key (tournament_category_id) references public.tournament_categories(id) on delete restrict;
  end if;
end $$;

alter table public.registration_categories enable row level security;
drop policy if exists "TEMP_DEV_registration_categories_all" on public.registration_categories;
create policy "TEMP_DEV_registration_categories_all"
on public.registration_categories
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_registration_categories_all" on public.registration_categories is
  'TEMP_DEV: acceso amplio mientras GAME no usa Supabase Auth definitivo.';
grant select, insert, update, delete on public.registration_categories to anon, authenticated;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  player_id uuid not null,
  tournament_id uuid not null,
  provider text not null default 'manual',
  provider_payment_id text,
  provider_preference_id text,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending',
  payment_method text,
  amount_breakdown jsonb not null default '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments add column if not exists approved_by text;

do $$
declare
  fk_name text;
  payments_regclass regclass := to_regclass('public.payments');
begin
  if payments_regclass is not null then
    select conname into fk_name
    from pg_constraint
    where conrelid = payments_regclass
      and contype = 'f'
      and array_position(conkey, (
        select attnum from pg_attribute
        where attrelid = payments_regclass and attname = 'approved_by'
      )) is not null
    limit 1;

    if fk_name is not null then
      execute format('alter table public.payments drop constraint %I', fk_name);
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'approved_by' and data_type = 'uuid'
  ) then
    alter table public.payments alter column approved_by type text using approved_by::text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.payments'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.registrations'::regclass
      and a.attname = 'registration_id'
  ) then
    alter table public.payments
      add constraint payments_registration_fk foreign key (registration_id) references public.registrations(id) on delete cascade;
  end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.payments'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.players'::regclass
      and a.attname = 'player_id'
  ) then
    alter table public.payments
      add constraint payments_player_fk foreign key (player_id) references public.players(id) on delete restrict;
  end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.payments'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.tournaments'::regclass
      and a.attname = 'tournament_id'
  ) then
    alter table public.payments
      add constraint payments_tournament_fk foreign key (tournament_id) references public.tournaments(id) on delete cascade;
  end if;
end $$;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
drop policy if exists "TEMP_DEV_payments_all" on public.payments;
create policy "TEMP_DEV_payments_all"
on public.payments
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_payments_all" on public.payments is
  'TEMP_DEV: acceso amplio mientras GAME no usa Supabase Auth definitivo.';
grant select, insert, update, delete on public.payments to anon, authenticated;

create table if not exists public.player_benefits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  discount_percent numeric(5,2) not null check (discount_percent >= 0 and discount_percent <= 100),
  starts_at date not null default current_date,
  ends_at date,
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text
);

alter table public.player_benefits enable row level security;
drop policy if exists "TEMP_DEV_player_benefits_all" on public.player_benefits;
create policy "TEMP_DEV_player_benefits_all"
on public.player_benefits
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_player_benefits_all" on public.player_benefits is
  'TEMP_DEV: acceso amplio mientras GAME no usa Supabase Auth definitivo.';
grant select, insert, update, delete on public.player_benefits to anon, authenticated;
create unique index if not exists player_benefits_one_active_idx
  on public.player_benefits(player_id)
  where revoked_at is null;

create or replace function public.cancel_overdue_registrations(p_now timestamptz default now())
returns table (
  registration_id uuid,
  player_id uuid,
  tournament_id uuid
)
language plpgsql
security invoker
as $$
begin
  return query
  update public.registrations r
  set
    status = 'cancelled',
    cancel_reason = 'payment_expired',
    cancelled_at = p_now,
    updated_at = now()
  where r.status = 'confirmed'
    and r.payment_status = 'pending'
    and r.payment_due_at is not null
    and r.payment_due_at <= p_now
    and exists (
      select 1 from public.tournaments t
      where t.id = r.tournament_id
        and t.status = 'open'
    )
  returning r.id, r.player_id, r.tournament_id;
end;
$$;

grant execute on function public.cancel_overdue_registrations(timestamptz) to anon, authenticated;

create or replace function public.process_expired_pending_registrations(p_now timestamptz default now())
returns table (
  registration_id uuid,
  player_id uuid,
  tournament_id uuid
)
language sql
security invoker
as $$
  select * from public.cancel_overdue_registrations(p_now);
$$;

grant execute on function public.process_expired_pending_registrations(timestamptz) to anon, authenticated;

create or replace function public.create_registration_for_player(
  p_player_id uuid,
  p_tournament_id uuid,
  p_category_ids uuid[],
  p_payment_mode text default 'later'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_registration_id uuid;
  v_due_at timestamptz;
  v_unit_price numeric(12,2);
  v_category_count integer;
  v_subtotal numeric(12,2);
  v_discount_percent numeric(5,2);
  v_discount_amount numeric(12,2);
  v_total numeric(12,2);
  v_payment_status text;
  v_payment_provider text;
  v_payment_method text;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id;
  if not found then
    raise exception 'TORNEO_NO_ENCONTRADO';
  end if;
  if v_tournament.status <> 'open' then
    raise exception 'TORNEO_SIN_INSCRIPCIONES_ABIERTAS';
  end if;
  if p_category_ids is null or coalesce(array_length(p_category_ids, 1), 0) = 0 then
    raise exception 'CATEGORIA_REQUERIDA';
  end if;
  if exists (
    select 1 from public.registrations
    where player_id = p_player_id
      and tournament_id = p_tournament_id
      and status <> 'cancelled'
  ) then
    raise exception 'JUGADOR_YA_INSCRIPTO_EN_TORNEO';
  end if;

  v_due_at := (v_tournament.start_date::timestamptz - interval '3 days');
  if p_payment_mode = 'later' and now() >= v_due_at then
    raise exception 'PAGO_POSTERIOR_NO_DISPONIBLE';
  end if;

  select count(*) into v_category_count
  from public.tournament_categories tc
  where tc.tournament_id = p_tournament_id
    and tc.category_id = any(p_category_ids);
  if v_category_count <> coalesce(array_length(p_category_ids, 1), 0) then
    raise exception 'CATEGORIA_INVALIDA_PARA_TORNEO';
  end if;

  select coalesce(max(pb.discount_percent), 0) into v_discount_percent
  from public.player_benefits pb
  where pb.player_id = p_player_id
    and pb.revoked_at is null
    and pb.starts_at <= current_date
    and (pb.ends_at is null or pb.ends_at >= current_date);

  v_unit_price := coalesce(v_tournament.price_per_category, 0);
  v_subtotal := v_unit_price * v_category_count;
  v_discount_amount := round(v_subtotal * v_discount_percent / 100, 2);
  v_total := greatest(v_subtotal - v_discount_amount, 0);
  v_payment_status := case when v_total = 0 then 'waived' when p_payment_mode = 'now' then 'paid' else 'pending' end;
  v_payment_provider := case when v_total = 0 then 'waiver' when p_payment_mode = 'now' then 'mercado_pago_mock' else 'pending' end;
  v_payment_method := case when v_total = 0 then 'waiver' when p_payment_mode = 'now' then 'mercado_pago_mock' else null end;

  insert into public.registrations (
    player_id,
    tournament_id,
    status,
    payment_status,
    payment_due_at,
    unit_price,
    category_count,
    subtotal,
    subtotal_amount,
    benefit_percentage,
    discount_percent,
    discount_amount,
    total_amount,
    amount_breakdown
  ) values (
    p_player_id,
    p_tournament_id,
    'confirmed',
    v_payment_status,
    v_due_at,
    v_unit_price,
    v_category_count,
    v_subtotal,
    v_subtotal,
    v_discount_percent,
    v_discount_percent,
    v_discount_amount,
    v_total,
    jsonb_build_object(
      'categoryIds', p_category_ids,
      'unitPrice', v_unit_price,
      'subtotal', v_subtotal,
      'discountAmount', v_discount_amount,
      'benefitPercentage', v_discount_percent,
      'total', v_total,
      'waived', v_total = 0
    )
  )
  returning id into v_registration_id;

  insert into public.registration_categories (registration_id, tournament_category_id, category_name, unit_price)
  select
    v_registration_id,
    tc.id,
    c.name || ' ' || c.branch,
    v_unit_price
  from public.tournament_categories tc
  join public.categories c on c.id = tc.category_id
  where tc.tournament_id = p_tournament_id
    and tc.category_id = any(p_category_ids);

  insert into public.payments (
    registration_id,
    player_id,
    tournament_id,
    provider,
    provider_payment_id,
    provider_preference_id,
    amount,
    status,
    payment_method,
    amount_breakdown,
    approved_at
  ) values (
    v_registration_id,
    p_player_id,
    p_tournament_id,
    v_payment_provider,
    case when p_payment_mode = 'now' and v_total > 0 then gen_random_uuid()::text else null end,
    case when p_payment_mode = 'now' and v_total > 0 then gen_random_uuid()::text else null end,
    v_total,
    case when v_payment_status = 'pending' then 'pending' else 'approved' end,
    v_payment_method,
    jsonb_build_object(
      'categoryIds', p_category_ids,
      'unitPrice', v_unit_price,
      'subtotal', v_subtotal,
      'discountAmount', v_discount_amount,
      'benefitPercentage', v_discount_percent,
      'total', v_total,
      'waived', v_total = 0
    ),
    case when v_payment_status = 'pending' then null else now() end
  );

  return v_registration_id;
end;
$$;

grant execute on function public.create_registration_for_player(uuid, uuid, uuid[], text) to anon, authenticated;

create or replace function public.mark_registration_paid_manual(
  p_registration_id uuid,
  p_actor text default 'admin-1'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_registration public.registrations%rowtype;
begin
  select * into v_registration from public.registrations where id = p_registration_id and status <> 'cancelled';
  if not found then
    raise exception 'INSCRIPCION_NO_ENCONTRADA';
  end if;

  update public.registrations
  set payment_status = 'paid', updated_at = now()
  where id = p_registration_id;

  insert into public.payments (
    registration_id,
    player_id,
    tournament_id,
    provider,
    amount,
    status,
    payment_method,
    amount_breakdown,
    approved_by,
    approved_at
  ) values (
    p_registration_id,
    v_registration.player_id,
    v_registration.tournament_id,
    'manual',
    v_registration.total_amount,
    'approved',
    'manual',
    v_registration.amount_breakdown,
    p_actor,
    now()
  )
  on conflict do nothing;

  update public.payments
  set
    status = 'approved',
    payment_method = 'manual',
    provider = 'manual',
    approved_by = p_actor,
    approved_at = coalesce(approved_at, now()),
    updated_at = now()
  where registration_id = p_registration_id;

  return p_registration_id;
end;
$$;

grant execute on function public.mark_registration_paid_manual(uuid, text) to anon, authenticated;

create or replace function public.recalculate_open_tournament_due_dates()
returns trigger
language plpgsql
as $$
begin
  if new.start_date is distinct from old.start_date and new.status = 'open' then
    update public.registrations
    set
      payment_due_at = (new.start_date::timestamptz - interval '3 days'),
      updated_at = now()
    where tournament_id = new.id
      and status = 'confirmed'
      and payment_status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_recalculate_due_dates on public.tournaments;
create trigger tournaments_recalculate_due_dates
after update of start_date on public.tournaments
for each row execute function public.recalculate_open_tournament_due_dates();

insert into public.scoring_systems (
  name,
  is_active,
  inscription,
  preliminary,
  preliminary_win,
  classification,
  round32,
  round16,
  octavos,
  cuartos,
  semifinal,
  runner_up,
  champion,
  special_bonus
) values
  ('GAME 250', true, 20, 30, 20, 40, 0, 70, 100, 140, 190, 160, 250, 0),
  ('GAME 500', true, 40, 50, 30, 70, 0, 120, 180, 240, 320, 300, 500, 0),
  ('GAME 1000', true, 70, 80, 50, 120, 0, 180, 260, 380, 520, 650, 1000, 0),
  ('MASTER GAME 1500', true, 100, 120, 80, 180, 0, 260, 380, 560, 780, 950, 1500, 0)
on conflict (name) do update set
  is_active = excluded.is_active,
  inscription = excluded.inscription,
  preliminary = excluded.preliminary,
  preliminary_win = excluded.preliminary_win,
  classification = excluded.classification,
  round32 = excluded.round32,
  round16 = excluded.round16,
  octavos = excluded.octavos,
  cuartos = excluded.cuartos,
  semifinal = excluded.semifinal,
  runner_up = excluded.runner_up,
  champion = excluded.champion,
  special_bonus = excluded.special_bonus;
