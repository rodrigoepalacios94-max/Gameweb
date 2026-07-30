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

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year integer not null unique,
  starts_at date,
  ends_at date,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists seasons_one_active_idx
  on public.seasons(is_active)
  where is_active;

drop trigger if exists seasons_set_updated_at on public.seasons;
create trigger seasons_set_updated_at
before update on public.seasons
for each row execute function public.set_updated_at();

alter table public.seasons enable row level security;
drop policy if exists "TEMP_DEV_seasons_all" on public.seasons;
create policy "TEMP_DEV_seasons_all"
on public.seasons
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_seasons_all" on public.seasons is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.seasons to anon, authenticated;

create table if not exists public.rankings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  points integer not null default 0 check (points >= 0),
  position integer,
  previous_position integer,
  played_tournaments integer not null default 0 check (played_tournaments >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, category_id, player_id)
);

create index if not exists rankings_season_category_idx on public.rankings(season_id, category_id, points desc);
create index if not exists rankings_player_idx on public.rankings(player_id);

drop trigger if exists rankings_set_updated_at on public.rankings;
create trigger rankings_set_updated_at
before update on public.rankings
for each row execute function public.set_updated_at();

alter table public.rankings enable row level security;
drop policy if exists "TEMP_DEV_rankings_all" on public.rankings;
create policy "TEMP_DEV_rankings_all"
on public.rankings
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_rankings_all" on public.rankings is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.rankings to anon, authenticated;

create table if not exists public.ranking_movements (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  tournament_id uuid references public.tournaments(id) on delete set null,
  tournament_category_id uuid references public.tournament_categories(id) on delete set null,
  points_delta integer not null,
  reason text not null,
  source_type text not null default 'manual_adjustment',
  source_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists ranking_movements_season_category_idx on public.ranking_movements(season_id, category_id);
create index if not exists ranking_movements_tournament_idx on public.ranking_movements(tournament_id);
create index if not exists ranking_movements_player_idx on public.ranking_movements(player_id);
create index if not exists ranking_movements_source_idx on public.ranking_movements(source_type, source_id);

alter table public.ranking_movements enable row level security;
drop policy if exists "TEMP_DEV_ranking_movements_all" on public.ranking_movements;
create policy "TEMP_DEV_ranking_movements_all"
on public.ranking_movements
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_ranking_movements_all" on public.ranking_movements is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.ranking_movements to anon, authenticated;

create table if not exists public.player_category_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  starts_at date not null default current_date,
  ends_at date,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists player_category_history_player_idx on public.player_category_history(player_id, starts_at desc);
create unique index if not exists player_category_history_one_current_idx
  on public.player_category_history(player_id)
  where ends_at is null;

alter table public.player_category_history enable row level security;
drop policy if exists "TEMP_DEV_player_category_history_all" on public.player_category_history;
create policy "TEMP_DEV_player_category_history_all"
on public.player_category_history
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_player_category_history_all" on public.player_category_history is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.player_category_history to anon, authenticated;

alter table public.tournament_categories
  add column if not exists stage_status text not null default 'draft',
  add column if not exists generated_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists ranking_awarded_at timestamptz;

create table if not exists public.brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  tournament_category_id uuid not null references public.tournament_categories(id) on delete cascade,
  format text not null,
  size integer,
  status text not null default 'generated' check (status in ('draft', 'generated', 'locked', 'in_progress', 'finished', 'cancelled')),
  champion_player_id uuid references public.players(id) on delete set null,
  runner_up_player_id uuid references public.players(id) on delete set null,
  bracket_data jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  ranking_awarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_category_id)
);

create index if not exists brackets_tournament_category_idx on public.brackets(tournament_id, tournament_category_id);
create index if not exists brackets_status_idx on public.brackets(status);

drop trigger if exists brackets_set_updated_at on public.brackets;
create trigger brackets_set_updated_at
before update on public.brackets
for each row execute function public.set_updated_at();

alter table public.brackets enable row level security;
drop policy if exists "TEMP_DEV_brackets_all" on public.brackets;
create policy "TEMP_DEV_brackets_all"
on public.brackets
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_brackets_all" on public.brackets is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.brackets to anon, authenticated;

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  tournament_category_id uuid not null references public.tournament_categories(id) on delete cascade,
  bracket_id uuid references public.brackets(id) on delete cascade,
  name text not null,
  qualifiers_count integer not null default 1 check (qualifiers_count in (1, 2)),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'finished', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_category_id, name)
);

create index if not exists zones_tournament_category_idx on public.zones(tournament_id, tournament_category_id);

drop trigger if exists zones_set_updated_at on public.zones;
create trigger zones_set_updated_at
before update on public.zones
for each row execute function public.set_updated_at();

alter table public.zones enable row level security;
drop policy if exists "TEMP_DEV_zones_all" on public.zones;
create policy "TEMP_DEV_zones_all"
on public.zones
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_zones_all" on public.zones is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.zones to anon, authenticated;

create table if not exists public.zone_players (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  seed_order integer,
  final_position integer,
  qualified boolean not null default false,
  stats_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, player_id)
);

create index if not exists zone_players_zone_idx on public.zone_players(zone_id);
create index if not exists zone_players_player_idx on public.zone_players(player_id);

drop trigger if exists zone_players_set_updated_at on public.zone_players;
create trigger zone_players_set_updated_at
before update on public.zone_players
for each row execute function public.set_updated_at();

alter table public.zone_players enable row level security;
drop policy if exists "TEMP_DEV_zone_players_all" on public.zone_players;
create policy "TEMP_DEV_zone_players_all"
on public.zone_players
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_zone_players_all" on public.zone_players is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.zone_players to anon, authenticated;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  tournament_category_id uuid not null references public.tournament_categories(id) on delete cascade,
  bracket_id uuid references public.brackets(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete cascade,
  phase text not null,
  round_name text,
  round_index integer not null default 0,
  bracket_slot integer,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'in_progress', 'finished', 'cancelled', 'suspended', 'paused', 'rescheduled', 'standby')),
  player1_id uuid references public.players(id) on delete set null,
  player2_id uuid references public.players(id) on delete set null,
  winner_id uuid references public.players(id) on delete set null,
  loser_id uuid references public.players(id) on delete set null,
  result_type text not null default 'NORMAL' check (result_type in ('NORMAL', 'BYE', 'WO', 'DOUBLE_WO', 'EARLY_FINISH')),
  result_text text,
  result_detail jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  court text,
  logical_side text,
  tree_slot_start integer,
  tree_slot_span integer,
  tree_round_index integer,
  stage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_winner_finished_check check (
    winner_id is null
    or status in ('finished', 'standby')
    or result_type = 'BYE'
  )
);

create index if not exists matches_tournament_category_idx on public.matches(tournament_id, tournament_category_id);
create index if not exists matches_bracket_idx on public.matches(bracket_id, round_index, bracket_slot);
create index if not exists matches_zone_idx on public.matches(zone_id);
create index if not exists matches_player1_idx on public.matches(player1_id);
create index if not exists matches_player2_idx on public.matches(player2_id);
create index if not exists matches_status_idx on public.matches(status);

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

alter table public.matches enable row level security;
drop policy if exists "TEMP_DEV_matches_all" on public.matches;
create policy "TEMP_DEV_matches_all"
on public.matches
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_matches_all" on public.matches is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.matches to anon, authenticated;

create table if not exists public.match_sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  set_number integer not null,
  player1_score integer not null default 0,
  player2_score integer not null default 0,
  set_type text not null default 'set' check (set_type in ('set', 'super_tiebreak')),
  created_at timestamptz not null default now(),
  unique (match_id, set_number)
);

create index if not exists match_sets_match_idx on public.match_sets(match_id);

alter table public.match_sets enable row level security;
drop policy if exists "TEMP_DEV_match_sets_all" on public.match_sets;
create policy "TEMP_DEV_match_sets_all"
on public.match_sets
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_match_sets_all" on public.match_sets is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.match_sets to anon, authenticated;

create table if not exists public.match_connections (
  id uuid primary key default gen_random_uuid(),
  parent_match_id uuid not null references public.matches(id) on delete cascade,
  child_match_id uuid not null references public.matches(id) on delete cascade,
  child_slot integer not null check (child_slot in (1, 2)),
  created_at timestamptz not null default now(),
  unique (parent_match_id),
  unique (child_match_id, child_slot)
);

create index if not exists match_connections_parent_idx on public.match_connections(parent_match_id);
create index if not exists match_connections_child_idx on public.match_connections(child_match_id);

alter table public.match_connections enable row level security;
drop policy if exists "TEMP_DEV_match_connections_all" on public.match_connections;
create policy "TEMP_DEV_match_connections_all"
on public.match_connections
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_match_connections_all" on public.match_connections is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.match_connections to anon, authenticated;

create table if not exists public.preliminary_rankings (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  tournament_category_id uuid not null references public.tournament_categories(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  match_id uuid references public.matches(id) on delete set null,
  preliminary_position integer,
  preliminary_role text,
  won boolean,
  performance_score numeric(12,4) not null default 0,
  sets_won integer not null default 0,
  sets_lost integer not null default 0,
  games_won integer not null default 0,
  games_lost integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_category_id, player_id)
);

create index if not exists preliminary_rankings_tournament_category_idx on public.preliminary_rankings(tournament_id, tournament_category_id);
create index if not exists preliminary_rankings_player_idx on public.preliminary_rankings(player_id);

drop trigger if exists preliminary_rankings_set_updated_at on public.preliminary_rankings;
create trigger preliminary_rankings_set_updated_at
before update on public.preliminary_rankings
for each row execute function public.set_updated_at();

alter table public.preliminary_rankings enable row level security;
drop policy if exists "TEMP_DEV_preliminary_rankings_all" on public.preliminary_rankings;
create policy "TEMP_DEV_preliminary_rankings_all"
on public.preliminary_rankings
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_preliminary_rankings_all" on public.preliminary_rankings is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.preliminary_rankings to anon, authenticated;

create table if not exists public.ranking_award_batches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  tournament_category_id uuid not null references public.tournament_categories(id) on delete restrict,
  bracket_id uuid references public.brackets(id) on delete set null,
  awarded_at timestamptz not null default now(),
  created_by text,
  unique (season_id, tournament_category_id)
);

alter table public.ranking_award_batches enable row level security;
drop policy if exists "TEMP_DEV_ranking_award_batches_all" on public.ranking_award_batches;
create policy "TEMP_DEV_ranking_award_batches_all"
on public.ranking_award_batches
for all
to anon, authenticated
using (true)
with check (true);
comment on policy "TEMP_DEV_ranking_award_batches_all" on public.ranking_award_batches is
  'TEMP_DEV: REMOVE WHEN SUPABASE AUTH IS ENABLED.';
grant select, insert, update, delete on public.ranking_award_batches to anon, authenticated;

create or replace function public.get_current_season()
returns public.seasons
language sql
security invoker
stable
as $$
  select *
  from public.seasons
  where is_active
  order by starts_at desc nulls last, year desc
  limit 1;
$$;

grant execute on function public.get_current_season() to anon, authenticated;

create or replace function public.recalculate_ranking_positions(
  p_season_id uuid,
  p_category_id uuid
)
returns void
language plpgsql
security invoker
as $$
begin
  with ordered as (
    select
      id,
      row_number() over (order by points desc, player_id asc) as new_position
    from public.rankings
    where season_id = p_season_id
      and category_id = p_category_id
      and points > 0
  )
  update public.rankings r
  set
    previous_position = r.position,
    position = ordered.new_position,
    updated_at = now()
  from ordered
  where r.id = ordered.id;

  update public.rankings
  set
    previous_position = position,
    position = null,
    updated_at = now()
  where season_id = p_season_id
    and category_id = p_category_id
    and points = 0;
end;
$$;

grant execute on function public.recalculate_ranking_positions(uuid, uuid) to anon, authenticated;

create or replace function public.rebuild_ranking(
  p_season_id uuid,
  p_category_id uuid
)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.rankings
  where season_id = p_season_id
    and category_id = p_category_id;

  insert into public.rankings (season_id, category_id, player_id, points, played_tournaments)
  select
    p_season_id,
    p_category_id,
    player_id,
    greatest(sum(points_delta), 0)::integer,
    count(distinct tournament_id)::integer
  from public.ranking_movements
  where season_id = p_season_id
    and category_id = p_category_id
  group by player_id
  having greatest(sum(points_delta), 0) > 0
  on conflict (season_id, category_id, player_id) do update set
    points = excluded.points,
    played_tournaments = excluded.played_tournaments,
    updated_at = now();

  perform public.recalculate_ranking_positions(p_season_id, p_category_id);
end;
$$;

grant execute on function public.rebuild_ranking(uuid, uuid) to anon, authenticated;

create or replace function public.adjust_ranking_points(
  p_player_id uuid,
  p_category_id uuid,
  p_points_delta integer,
  p_reason text,
  p_tournament_id uuid default null,
  p_source_type text default 'manual_adjustment',
  p_source_id uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_season public.seasons%rowtype;
  v_movement_id uuid;
begin
  select * into v_season from public.get_current_season();
  if v_season.id is null then
    raise exception 'NO_ACTIVE_SEASON';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'RANKING_REASON_REQUIRED';
  end if;

  insert into public.ranking_movements (
    season_id,
    category_id,
    player_id,
    tournament_id,
    points_delta,
    reason,
    source_type,
    source_id
  ) values (
    v_season.id,
    p_category_id,
    p_player_id,
    p_tournament_id,
    p_points_delta,
    p_reason,
    p_source_type,
    p_source_id
  )
  returning id into v_movement_id;

  insert into public.rankings (season_id, category_id, player_id, points, played_tournaments)
  values (v_season.id, p_category_id, p_player_id, greatest(p_points_delta, 0), case when p_tournament_id is null then 0 else 1 end)
  on conflict (season_id, category_id, player_id) do update set
    points = greatest(public.rankings.points + p_points_delta, 0),
    played_tournaments = public.rankings.played_tournaments + case when p_tournament_id is null then 0 else 1 end,
    updated_at = now();

  perform public.recalculate_ranking_positions(v_season.id, p_category_id);
  return v_movement_id;
end;
$$;

grant execute on function public.adjust_ranking_points(uuid, uuid, integer, text, uuid, text, uuid) to anon, authenticated;

create or replace function public.advance_winner(p_parent_match_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  return;
end;
$$;

create or replace function public.save_match_result(
  p_match_id uuid,
  p_sets jsonb,
  p_result_type text default 'NORMAL',
  p_winner_id uuid default null,
  p_loser_id uuid default null,
  p_result_text text default null,
  p_status text default 'finished'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_match public.matches%rowtype;
  v_set jsonb;
  v_index integer := 0;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if v_match.status = 'finished' and exists (
    select 1 from public.match_connections mc
    join public.matches child on child.id = mc.child_match_id
    where mc.parent_match_id = p_match_id
      and child.status = 'finished'
  ) then
    raise exception 'CHILD_MATCH_ALREADY_FINISHED';
  end if;

  delete from public.match_sets where match_id = p_match_id;

  if p_sets is not null then
    for v_set in select * from jsonb_array_elements(p_sets)
    loop
      v_index := v_index + 1;
      insert into public.match_sets (
        match_id,
        set_number,
        player1_score,
        player2_score,
        set_type
      ) values (
        p_match_id,
        coalesce((v_set->>'setNumber')::integer, v_index),
        coalesce((v_set->>'player1Score')::integer, (v_set->>'playerAScore')::integer, (v_set->>'a')::integer, 0),
        coalesce((v_set->>'player2Score')::integer, (v_set->>'playerBScore')::integer, (v_set->>'b')::integer, 0),
        coalesce(v_set->>'type', 'set')
      )
      on conflict (match_id, set_number) do update set
        player1_score = excluded.player1_score,
        player2_score = excluded.player2_score,
        set_type = excluded.set_type;
    end loop;
  end if;

  update public.matches
  set
    status = p_status,
    result_type = p_result_type,
    winner_id = case when p_result_type = 'DOUBLE_WO' then null else p_winner_id end,
    loser_id = case when p_result_type = 'DOUBLE_WO' then null else p_loser_id end,
    result_text = p_result_text,
    result_detail = jsonb_build_object(
      'sets', coalesce(p_sets, '[]'::jsonb),
      'winnerId', p_winner_id,
      'loserId', p_loser_id,
      'resultType', p_result_type
    ),
    updated_at = now()
  where id = p_match_id;

  perform public.advance_winner(p_match_id);
  return p_match_id;
end;
$$;

grant execute on function public.save_match_result(uuid, jsonb, text, uuid, uuid, text, text) to anon, authenticated;

create or replace function public.advance_winner(p_parent_match_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_parent public.matches%rowtype;
  v_connection public.match_connections%rowtype;
  v_child public.matches%rowtype;
begin
  select * into v_parent from public.matches where id = p_parent_match_id;
  if not found then
    raise exception 'PARENT_MATCH_NOT_FOUND';
  end if;
  if v_parent.winner_id is null then
    return;
  end if;

  select * into v_connection from public.match_connections where parent_match_id = p_parent_match_id;
  if not found then
    update public.brackets
    set
      champion_player_id = v_parent.winner_id,
      runner_up_player_id = v_parent.loser_id,
      status = 'finished',
      updated_at = now()
    where id = v_parent.bracket_id
      and not exists (
        select 1 from public.match_connections
        where child_match_id = p_parent_match_id
      );
    return;
  end if;

  select * into v_child from public.matches where id = v_connection.child_match_id for update;
  if not found then
    raise exception 'CHILD_MATCH_NOT_FOUND';
  end if;
  if v_child.status = 'finished' then
    raise exception 'CHILD_MATCH_ALREADY_FINISHED';
  end if;

  if v_connection.child_slot = 1 then
    update public.matches
    set player1_id = v_parent.winner_id, updated_at = now()
    where id = v_child.id
      and player1_id is distinct from v_parent.winner_id;
  else
    update public.matches
    set player2_id = v_parent.winner_id, updated_at = now()
    where id = v_child.id
      and player2_id is distinct from v_parent.winner_id;
  end if;
end;
$$;

grant execute on function public.advance_winner(uuid) to anon, authenticated;

create or replace function public.set_player_category(
  p_player_id uuid,
  p_category_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_history_id uuid;
begin
  update public.player_category_history
  set ends_at = current_date
  where player_id = p_player_id
    and ends_at is null;

  insert into public.player_category_history (player_id, category_id, starts_at, reason)
  values (p_player_id, p_category_id, current_date, p_reason)
  returning id into v_history_id;

  update public.players
  set current_category_id = p_category_id, updated_at = now()
  where id = p_player_id;

  insert into public.rankings (season_id, category_id, player_id, points, position, played_tournaments)
  select id, p_category_id, p_player_id, 0, null, 0
  from public.seasons
  where is_active
  on conflict (season_id, category_id, player_id) do nothing;

  return v_history_id;
end;
$$;

grant execute on function public.set_player_category(uuid, uuid, text) to anon, authenticated;

insert into public.seasons (name, year, starts_at, ends_at, is_active)
values ('Temporada 2026', 2026, '2026-01-01', '2026-12-31', true)
on conflict (year) do update set
  name = excluded.name,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  is_active = excluded.is_active;
