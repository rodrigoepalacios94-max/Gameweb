create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('admin','player')),
  player_id uuid references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'player_id'
      and data_type = 'text'
  ) then
    update public.profiles
    set player_id = null
    where player_id is not null
      and player_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    alter table public.profiles
      alter column player_id type uuid using nullif(player_id, '')::uuid;
  end if;

  update public.profiles p
  set player_id = null
  where p.player_id is not null
    and not exists (select 1 from public.players pl where pl.id = p.player_id);

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_player_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_player_id_fkey foreign key (player_id) references public.players(id) on delete restrict;
  end if;
end;
$$;

create index if not exists profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_player_id_idx on public.profiles(player_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = auth.uid()
      and role = 'admin'
  );
$$;

do $$
declare
  v_current_player_id_return_type regtype;
begin
  select p.prorettype::regtype
  into v_current_player_id_return_type
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'current_player_id'
    and p.pronargs = 0
  limit 1;

  if v_current_player_id_return_type is not null
    and v_current_player_id_return_type <> 'uuid'::regtype
  then
    if to_regclass('public.players') is not null then
      execute 'drop policy if exists "players_select_own_or_admin" on public.players';
      execute 'drop policy if exists "players_update_own_limited" on public.players';
    end if;
    if to_regclass('public.tournaments') is not null then
      execute 'drop policy if exists "tournaments_select_open_related_or_admin" on public.tournaments';
    end if;
    if to_regclass('public.tournament_categories') is not null then
      execute 'drop policy if exists "tournament_categories_select_visible" on public.tournament_categories';
    end if;
    if to_regclass('public.registrations') is not null then
      execute 'drop policy if exists "registrations_select_own_or_admin" on public.registrations';
      execute 'drop policy if exists "registrations_insert_own" on public.registrations';
    end if;
    if to_regclass('public.registration_categories') is not null then
      execute 'drop policy if exists "registration_categories_select_own_or_admin" on public.registration_categories';
      execute 'drop policy if exists "registration_categories_insert_own" on public.registration_categories';
    end if;
    if to_regclass('public.payments') is not null then
      execute 'drop policy if exists "payments_select_own_or_admin" on public.payments';
      execute 'drop policy if exists "payments_insert_own" on public.payments';
    end if;
    if to_regclass('public.player_benefits') is not null then
      execute 'drop policy if exists "player_benefits_select_own_or_admin" on public.player_benefits';
    end if;
    if to_regclass('public.player_payment_waivers') is not null then
      execute 'drop policy if exists "waivers_select_own_or_admin" on public.player_payment_waivers';
    end if;

    drop function public.current_player_id();
  end if;
end;
$$;

create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select player_id
  from public.profiles
  where auth_user_id = auth.uid()
    and role = 'player'
  limit 1;
$$;

create or replace function public.handle_game_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'game_role', new.raw_user_meta_data->>'role');
  v_player_id uuid;
begin
  if v_role = 'player' then
    if nullif(new.raw_user_meta_data->>'player_id', '') is not null then
      v_player_id := (new.raw_user_meta_data->>'player_id')::uuid;
      if not exists (select 1 from public.players where id = v_player_id) then
        raise exception 'PLAYER_NOT_FOUND_FOR_INVITE';
      end if;
    else
      insert into public.players (
        first_name,
        last_name,
        email,
        document,
        address,
        phone,
        birth_date,
        gender,
        current_category_id,
        status
      ) values (
        nullif(btrim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
        nullif(btrim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
        lower(btrim(new.email)),
        nullif(btrim(coalesce(new.raw_user_meta_data->>'document', '')), ''),
        nullif(btrim(coalesce(new.raw_user_meta_data->>'address', '')), ''),
        nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), ''),
        nullif(new.raw_user_meta_data->>'birth_date', '')::date,
        nullif(btrim(coalesce(new.raw_user_meta_data->>'gender', '')), ''),
        (new.raw_user_meta_data->>'category_id')::uuid,
        'active'
      )
      returning id into v_player_id;
    end if;

    insert into public.profiles (auth_user_id, email, role, player_id)
    values (new.id, lower(btrim(new.email)), 'player', v_player_id);
  elsif v_role = 'admin' then
    insert into public.profiles (auth_user_id, email, role, player_id)
    values (new.id, lower(btrim(new.email)), 'admin', null)
    on conflict (auth_user_id) do nothing;
  end if;

  return new;
exception
  when unique_violation then
    raise;
  when foreign_key_violation then
    raise;
end;
$$;

drop trigger if exists game_auth_user_profile on auth.users;
create trigger game_auth_user_profile
after insert on auth.users
for each row execute function public.handle_game_auth_user();

create or replace function public.check_signup_uniqueness(
  p_email text,
  p_document text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'emailExists', exists (
      select 1
      from public.players
      where lower(btrim(email)) = lower(btrim(p_email))
    ),
    'documentExists', nullif(btrim(coalesce(p_document, '')), '') is not null
      and exists (
        select 1
        from public.players
        where document = btrim(p_document)
      )
  );
$$;

grant execute on function public.check_signup_uniqueness(text, text) to anon, authenticated;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (auth.uid() = auth_user_id or public.is_admin());

create policy "profiles_admin_all"
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.profiles to authenticated;

do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'categories','players','scoring_systems','regulation_documents','photo_albums',
    'tournaments','tournament_categories','registrations','registration_categories',
    'payments','player_benefits','seasons','rankings','ranking_movements',
    'player_category_history','brackets','zones','zone_players','matches',
    'match_sets','match_connections','preliminary_rankings','ranking_award_batches'
  ]
  loop
    foreach v_policy in array array[
      'TEMP_DEV_categories_all','TEMP_DEV_players_all','TEMP_DEV_scoring_systems_all',
      'TEMP_DEV_regulation_documents_all','TEMP_DEV_photo_albums_all',
      'TEMP_DEV_tournaments_all','TEMP_DEV_tournament_categories_all',
      'TEMP_DEV_registrations_all','TEMP_DEV_registration_categories_all',
      'TEMP_DEV_payments_all','TEMP_DEV_player_benefits_all','TEMP_DEV_seasons_all',
      'TEMP_DEV_rankings_all','TEMP_DEV_ranking_movements_all',
      'TEMP_DEV_player_category_history_all','TEMP_DEV_brackets_all',
      'TEMP_DEV_zones_all','TEMP_DEV_zone_players_all','TEMP_DEV_matches_all',
      'TEMP_DEV_match_sets_all','TEMP_DEV_match_connections_all',
      'TEMP_DEV_preliminary_rankings_all','TEMP_DEV_ranking_award_batches_all'
    ]
    loop
      execute format('drop policy if exists %I on public.%I', v_policy, v_table);
    end loop;
  end loop;
end;
$$;

drop policy if exists "TEMP_DEV_regulations_storage_select" on storage.objects;
drop policy if exists "TEMP_DEV_regulations_storage_insert" on storage.objects;
drop policy if exists "TEMP_DEV_regulations_storage_update" on storage.objects;
drop policy if exists "TEMP_DEV_regulations_storage_delete" on storage.objects;

revoke all on public.categories from anon;
revoke all on public.players from anon;
revoke all on public.scoring_systems from anon;
revoke all on public.regulation_documents from anon;
revoke all on public.photo_albums from anon;
revoke all on public.tournaments from anon;
revoke all on public.tournament_categories from anon;
revoke all on public.registrations from anon;
revoke all on public.registration_categories from anon;
revoke all on public.payments from anon;
revoke all on public.player_benefits from anon;
revoke all on public.seasons from anon;
revoke all on public.rankings from anon;
revoke all on public.ranking_movements from anon;
revoke all on public.player_category_history from anon;
revoke all on public.brackets from anon;
revoke all on public.zones from anon;
revoke all on public.zone_players from anon;
revoke all on public.matches from anon;
revoke all on public.match_sets from anon;
revoke all on public.match_connections from anon;
revoke all on public.preliminary_rankings from anon;
revoke all on public.ranking_award_batches from anon;

grant select on public.categories to anon, authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.players to authenticated;
grant select, insert, update, delete on public.scoring_systems to authenticated;
grant select, insert, update, delete on public.regulation_documents to authenticated;
grant select, insert, update, delete on public.photo_albums to authenticated;
grant select, insert, update, delete on public.tournaments to authenticated;
grant select, insert, update, delete on public.tournament_categories to authenticated;
grant select, insert, update, delete on public.registrations to authenticated;
grant select, insert, update, delete on public.registration_categories to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.player_benefits to authenticated;
grant select, insert, update, delete on public.seasons to authenticated;
grant select, insert, update, delete on public.rankings to authenticated;
grant select, insert, update, delete on public.ranking_movements to authenticated;
grant select, insert, update, delete on public.player_category_history to authenticated;
grant select, insert, update, delete on public.brackets to authenticated;
grant select, insert, update, delete on public.zones to authenticated;
grant select, insert, update, delete on public.zone_players to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update, delete on public.match_sets to authenticated;
grant select, insert, update, delete on public.match_connections to authenticated;
grant select, insert, update, delete on public.preliminary_rankings to authenticated;
grant select, insert, update, delete on public.ranking_award_batches to authenticated;

drop policy if exists "categories_read_active_or_admin" on public.categories;
drop policy if exists "categories_admin_all" on public.categories;
create policy "categories_read_active_or_admin"
on public.categories for select
to anon, authenticated
using (is_active = true or public.is_admin());
create policy "categories_admin_all"
on public.categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "players_select_own_or_admin" on public.players;
drop policy if exists "players_update_own_limited" on public.players;
drop policy if exists "players_admin_all" on public.players;
create policy "players_select_own_or_admin"
on public.players for select
to authenticated
using (id = public.current_player_id() or public.is_admin());
create policy "players_update_own_limited"
on public.players for update
to authenticated
using (id = public.current_player_id())
with check (id = public.current_player_id());
create policy "players_admin_all"
on public.players for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tournaments_select_open_related_or_admin" on public.tournaments;
drop policy if exists "tournaments_admin_all" on public.tournaments;
create policy "tournaments_select_open_related_or_admin"
on public.tournaments for select
to authenticated
using (
  status = 'open'
  or public.is_admin()
  or exists (
    select 1 from public.registrations r
    where r.tournament_id = public.tournaments.id
      and r.player_id = public.current_player_id()
      and r.status <> 'cancelled'
  )
);
create policy "tournaments_admin_all"
on public.tournaments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tournament_categories_select_visible" on public.tournament_categories;
drop policy if exists "tournament_categories_admin_all" on public.tournament_categories;
create policy "tournament_categories_select_visible"
on public.tournament_categories for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.tournaments t
    where t.id = tournament_id
      and (
        t.status = 'open'
        or exists (
          select 1 from public.registrations r
          where r.tournament_id = t.id
            and r.player_id = public.current_player_id()
            and r.status <> 'cancelled'
        )
      )
  )
);
create policy "tournament_categories_admin_all"
on public.tournament_categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "registrations_select_own_or_admin" on public.registrations;
drop policy if exists "registrations_insert_own" on public.registrations;
drop policy if exists "registrations_admin_all" on public.registrations;
create policy "registrations_select_own_or_admin"
on public.registrations for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());
create policy "registrations_insert_own"
on public.registrations for insert
to authenticated
with check (player_id = public.current_player_id());
create policy "registrations_admin_all"
on public.registrations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "registration_categories_select_own_or_admin" on public.registration_categories;
drop policy if exists "registration_categories_insert_own" on public.registration_categories;
drop policy if exists "registration_categories_admin_all" on public.registration_categories;
create policy "registration_categories_select_own_or_admin"
on public.registration_categories for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.registrations r
    where r.id = registration_id
      and r.player_id = public.current_player_id()
  )
);
create policy "registration_categories_insert_own"
on public.registration_categories for insert
to authenticated
with check (
  exists (
    select 1 from public.registrations r
    where r.id = registration_id
      and r.player_id = public.current_player_id()
  )
);
create policy "registration_categories_admin_all"
on public.registration_categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "payments_select_own_or_admin" on public.payments;
drop policy if exists "payments_insert_own" on public.payments;
drop policy if exists "payments_admin_all" on public.payments;
create policy "payments_select_own_or_admin"
on public.payments for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());
create policy "payments_insert_own"
on public.payments for insert
to authenticated
with check (player_id = public.current_player_id());
create policy "payments_admin_all"
on public.payments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "player_benefits_select_own_or_admin" on public.player_benefits;
drop policy if exists "player_benefits_admin_all" on public.player_benefits;
create policy "player_benefits_select_own_or_admin"
on public.player_benefits for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());
create policy "player_benefits_admin_all"
on public.player_benefits for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "sports_read_authenticated" on public.brackets;
drop policy if exists "sports_admin_all_brackets" on public.brackets;
create policy "sports_read_authenticated" on public.brackets for select to authenticated using (true);
create policy "sports_admin_all_brackets" on public.brackets for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "zones_read_authenticated" on public.zones;
drop policy if exists "zones_admin_all" on public.zones;
create policy "zones_read_authenticated" on public.zones for select to authenticated using (true);
create policy "zones_admin_all" on public.zones for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "zone_players_read_authenticated" on public.zone_players;
drop policy if exists "zone_players_admin_all" on public.zone_players;
create policy "zone_players_read_authenticated" on public.zone_players for select to authenticated using (true);
create policy "zone_players_admin_all" on public.zone_players for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "matches_read_authenticated" on public.matches;
drop policy if exists "matches_admin_all" on public.matches;
create policy "matches_read_authenticated" on public.matches for select to authenticated using (true);
create policy "matches_admin_all" on public.matches for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "match_sets_read_authenticated" on public.match_sets;
drop policy if exists "match_sets_admin_all" on public.match_sets;
create policy "match_sets_read_authenticated" on public.match_sets for select to authenticated using (true);
create policy "match_sets_admin_all" on public.match_sets for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "match_connections_read_authenticated" on public.match_connections;
drop policy if exists "match_connections_admin_all" on public.match_connections;
create policy "match_connections_read_authenticated" on public.match_connections for select to authenticated using (true);
create policy "match_connections_admin_all" on public.match_connections for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rankings_read_authenticated" on public.rankings;
drop policy if exists "rankings_admin_all" on public.rankings;
create policy "rankings_read_authenticated" on public.rankings for select to authenticated using (true);
create policy "rankings_admin_all" on public.rankings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ranking_movements_read_authenticated" on public.ranking_movements;
drop policy if exists "ranking_movements_admin_all" on public.ranking_movements;
create policy "ranking_movements_read_authenticated" on public.ranking_movements for select to authenticated using (true);
create policy "ranking_movements_admin_all" on public.ranking_movements for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "preliminary_rankings_read_authenticated" on public.preliminary_rankings;
drop policy if exists "preliminary_rankings_admin_all" on public.preliminary_rankings;
create policy "preliminary_rankings_read_authenticated" on public.preliminary_rankings for select to authenticated using (true);
create policy "preliminary_rankings_admin_all" on public.preliminary_rankings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_only_scoring_systems" on public.scoring_systems;
drop policy if exists "read_scoring_systems_authenticated" on public.scoring_systems;
create policy "read_scoring_systems_authenticated" on public.scoring_systems for select to authenticated using (true);
create policy "admin_only_scoring_systems" on public.scoring_systems for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read_regulation_documents_authenticated" on public.regulation_documents;
drop policy if exists "admin_only_regulation_documents" on public.regulation_documents;
create policy "read_regulation_documents_authenticated" on public.regulation_documents for select to authenticated using (is_active = true or public.is_admin());
create policy "admin_only_regulation_documents" on public.regulation_documents for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read_photo_albums_authenticated" on public.photo_albums;
drop policy if exists "admin_only_photo_albums" on public.photo_albums;
create policy "read_photo_albums_authenticated" on public.photo_albums for select to authenticated using (is_active = true or public.is_admin());
create policy "admin_only_photo_albums" on public.photo_albums for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "regulations_storage_select_authenticated" on storage.objects;
drop policy if exists "regulations_storage_admin_insert" on storage.objects;
drop policy if exists "regulations_storage_admin_update" on storage.objects;
drop policy if exists "regulations_storage_admin_delete" on storage.objects;
create policy "regulations_storage_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'regulations');
create policy "regulations_storage_admin_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'regulations' and public.is_admin());
create policy "regulations_storage_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'regulations' and public.is_admin())
with check (bucket_id = 'regulations' and public.is_admin());
create policy "regulations_storage_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'regulations' and public.is_admin());

revoke execute on function public.persist_tournament_stage(uuid, uuid, jsonb) from anon;
revoke execute on function public.create_registration_for_player(uuid, uuid, uuid[], text) from anon;
revoke execute on function public.cancel_overdue_registrations(timestamptz) from anon;
revoke execute on function public.process_expired_pending_registrations(timestamptz) from anon;
revoke execute on function public.get_current_season() from anon;
revoke execute on function public.advance_winner(uuid) from anon;
revoke execute on function public.finalize_tournament_category(uuid) from anon;
revoke execute on function public.save_match_result(uuid, jsonb, text, uuid, uuid, text, text) from anon;
revoke execute on function public.mark_registration_paid_manual(uuid, text) from anon;
revoke execute on function public.adjust_ranking_points(uuid, uuid, integer, text, uuid, text, uuid) from anon;
revoke execute on function public.rebuild_ranking(uuid, uuid) from anon;
revoke execute on function public.recalculate_ranking_positions(uuid, uuid) from anon;
revoke execute on function public.set_player_category(uuid, uuid, text) from anon;

grant execute on function public.create_registration_for_player(uuid, uuid, uuid[], text) to authenticated;
grant execute on function public.cancel_overdue_registrations(timestamptz) to authenticated;
grant execute on function public.process_expired_pending_registrations(timestamptz) to authenticated;
grant execute on function public.get_current_season() to authenticated;
grant execute on function public.persist_tournament_stage(uuid, uuid, jsonb) to authenticated;
grant execute on function public.advance_winner(uuid) to authenticated;
grant execute on function public.finalize_tournament_category(uuid) to authenticated;
grant execute on function public.save_match_result(uuid, jsonb, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.mark_registration_paid_manual(uuid, text) to authenticated;
grant execute on function public.adjust_ranking_points(uuid, uuid, integer, text, uuid, text, uuid) to authenticated;
grant execute on function public.rebuild_ranking(uuid, uuid) to authenticated;
grant execute on function public.recalculate_ranking_positions(uuid, uuid) to authenticated;
grant execute on function public.set_player_category(uuid, uuid, text) to authenticated;
