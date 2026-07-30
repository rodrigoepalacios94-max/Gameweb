create table if not exists public.discipline_claims (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  reporter_player_id uuid not null references public.players(id) on delete restrict,
  accused_player_id uuid not null references public.players(id) on delete restrict,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text
);

create unique index if not exists discipline_claims_one_pending_per_reporter_match
  on public.discipline_claims(match_id, reporter_player_id)
  where status = 'pending';

create index if not exists discipline_claims_match_idx on public.discipline_claims(match_id);
create index if not exists discipline_claims_tournament_idx on public.discipline_claims(tournament_id);
create index if not exists discipline_claims_status_idx on public.discipline_claims(status);
create index if not exists discipline_claims_accused_idx on public.discipline_claims(accused_player_id);

create table if not exists public.player_discipline_faults (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid unique references public.discipline_claims(id) on delete set null,
  player_id uuid not null references public.players(id) on delete restrict,
  match_id uuid references public.matches(id) on delete set null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists player_discipline_faults_player_idx on public.player_discipline_faults(player_id);
create index if not exists player_discipline_faults_match_idx on public.player_discipline_faults(match_id);
create index if not exists player_discipline_faults_tournament_idx on public.player_discipline_faults(tournament_id);

alter table public.discipline_claims enable row level security;
alter table public.player_discipline_faults enable row level security;

drop policy if exists "discipline_claims_select_own_or_admin" on public.discipline_claims;
drop policy if exists "discipline_claims_admin_all" on public.discipline_claims;
create policy "discipline_claims_select_own_or_admin"
on public.discipline_claims for select
to authenticated
using (
  public.is_admin()
  or reporter_player_id = public.current_player_id()
  or accused_player_id = public.current_player_id()
);
create policy "discipline_claims_admin_all"
on public.discipline_claims for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "player_discipline_faults_select_own_or_admin" on public.player_discipline_faults;
drop policy if exists "player_discipline_faults_admin_all" on public.player_discipline_faults;
create policy "player_discipline_faults_select_own_or_admin"
on public.player_discipline_faults for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());
create policy "player_discipline_faults_admin_all"
on public.player_discipline_faults for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.discipline_claims to authenticated;
grant select on public.player_discipline_faults to authenticated;
grant insert, update, delete on public.discipline_claims to authenticated;
grant insert, update, delete on public.player_discipline_faults to authenticated;

create or replace function public.create_match_discipline_claim(
  p_match_id uuid,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_player_id uuid;
  v_match record;
  v_accused_player_id uuid;
  v_claim_id uuid;
begin
  v_reporter_player_id := public.current_player_id();

  if v_reporter_player_id is null then
    raise exception 'PLAYER_PROFILE_REQUIRED';
  end if;

  if p_description is null or length(btrim(p_description)) = 0 then
    raise exception 'DESCRIPTION_REQUIRED';
  end if;

  select id, tournament_id, player1_id, player2_id
  into v_match
  from public.matches
  where id = p_match_id;

  if v_match.id is null then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if v_match.player1_id is null or v_match.player2_id is null then
    raise exception 'MATCH_PLAYERS_REQUIRED';
  end if;

  if v_reporter_player_id = v_match.player1_id then
    v_accused_player_id := v_match.player2_id;
  elsif v_reporter_player_id = v_match.player2_id then
    v_accused_player_id := v_match.player1_id;
  else
    raise exception 'PLAYER_NOT_IN_MATCH';
  end if;

  if exists (
    select 1
    from public.discipline_claims
    where match_id = p_match_id
      and reporter_player_id = v_reporter_player_id
      and status = 'pending'
  ) then
    raise exception 'DISCIPLINE_CLAIM_PENDING';
  end if;

  insert into public.discipline_claims (
    match_id,
    tournament_id,
    reporter_player_id,
    accused_player_id,
    description
  )
  values (
    p_match_id,
    v_match.tournament_id,
    v_reporter_player_id,
    v_accused_player_id,
    btrim(p_description)
  )
  returning id into v_claim_id;

  return v_claim_id;
end;
$$;

create or replace function public.review_match_discipline_claim(
  p_claim_id uuid,
  p_status text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_profile_id uuid;
  v_claim public.discipline_claims%rowtype;
  v_fault_count integer;
  v_player_name text;
  v_triggered boolean := false;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;

  select id
  into v_admin_profile_id
  from public.profiles
  where auth_user_id = auth.uid()
    and role = 'admin'
  limit 1;

  select *
  into v_claim
  from public.discipline_claims
  where id = p_claim_id
  for update;

  if v_claim.id is null then
    raise exception 'CLAIM_NOT_FOUND';
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'CLAIM_ALREADY_REVIEWED';
  end if;

  update public.discipline_claims
  set status = p_status,
      reviewed_at = now(),
      reviewed_by = v_admin_profile_id,
      review_note = nullif(btrim(coalesce(p_review_note, '')), '')
  where id = p_claim_id;

  if p_status = 'approved' then
    insert into public.player_discipline_faults (
      claim_id,
      player_id,
      match_id,
      tournament_id,
      reason,
      created_by
    )
    values (
      p_claim_id,
      v_claim.accused_player_id,
      v_claim.match_id,
      v_claim.tournament_id,
      'Reclamo aprobado: ' || v_claim.description,
      v_admin_profile_id
    )
    on conflict (claim_id) do nothing;

    select count(*)
    into v_fault_count
    from public.player_discipline_faults
    where player_id = v_claim.accused_player_id;

    if v_fault_count >= 3 then
      update public.players
      set status = 'blocked_faults',
          updated_at = now()
      where id = v_claim.accused_player_id
        and status <> 'blocked_faults';
      v_triggered := true;
    end if;
  else
    select count(*)
    into v_fault_count
    from public.player_discipline_faults
    where player_id = v_claim.accused_player_id;
  end if;

  select btrim(first_name || ' ' || last_name)
  into v_player_name
  from public.players
  where id = v_claim.accused_player_id;

  return jsonb_build_object(
    'claimId', p_claim_id,
    'status', p_status,
    'faultPlayerId', v_claim.accused_player_id,
    'faultCount', coalesce(v_fault_count, 0),
    'disciplinaryElimination', jsonb_build_object(
      'triggered', v_triggered,
      'alreadyProcessed', false,
      'playerId', v_claim.accused_player_id,
      'playerName', coalesce(v_player_name, 'Jugador'),
      'faultCount', coalesce(v_fault_count, 0),
      'limit', 3
    )
  );
end;
$$;

grant execute on function public.create_match_discipline_claim(uuid, text) to authenticated;
grant execute on function public.review_match_discipline_claim(uuid, text, text) to authenticated;
