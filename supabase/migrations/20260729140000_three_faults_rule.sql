create table if not exists public.player_tournament_expulsions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  tournament_category_id uuid not null references public.tournament_categories(id) on delete cascade,
  claim_id uuid references public.discipline_claims(id) on delete set null,
  reason text not null default 'three_faults',
  fault_count integer not null default 3,
  pending_matches_walkovered integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique (player_id, tournament_category_id, reason)
);

create index if not exists player_tournament_expulsions_player_idx
  on public.player_tournament_expulsions(player_id);
create index if not exists player_tournament_expulsions_tournament_category_idx
  on public.player_tournament_expulsions(tournament_category_id);

create table if not exists public.player_discipline_unblocks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  previous_status text,
  unblocked_at timestamptz not null default now(),
  unblocked_by uuid references public.profiles(id) on delete set null,
  reason text not null default 'admin_unblock',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists player_discipline_unblocks_player_idx
  on public.player_discipline_unblocks(player_id, unblocked_at desc);

alter table public.discipline_claims
  add column if not exists three_faults_processed_at timestamptz,
  add column if not exists three_faults_result jsonb not null default '{}'::jsonb;

alter table public.player_tournament_expulsions enable row level security;
alter table public.player_discipline_unblocks enable row level security;

drop policy if exists "player_tournament_expulsions_read_own_or_admin" on public.player_tournament_expulsions;
drop policy if exists "player_tournament_expulsions_admin_all" on public.player_tournament_expulsions;
create policy "player_tournament_expulsions_read_own_or_admin"
on public.player_tournament_expulsions for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());
create policy "player_tournament_expulsions_admin_all"
on public.player_tournament_expulsions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "player_discipline_unblocks_read_own_or_admin" on public.player_discipline_unblocks;
drop policy if exists "player_discipline_unblocks_admin_all" on public.player_discipline_unblocks;
create policy "player_discipline_unblocks_read_own_or_admin"
on public.player_discipline_unblocks for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());
create policy "player_discipline_unblocks_admin_all"
on public.player_discipline_unblocks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.player_tournament_expulsions to authenticated;
grant select on public.player_discipline_unblocks to authenticated;
grant insert, update, delete on public.player_tournament_expulsions to authenticated;
grant insert, update, delete on public.player_discipline_unblocks to authenticated;

create or replace function public.recalculate_zone_snapshots_for_category(
  p_tournament_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone record;
begin
  for v_zone in
    select id, qualifiers_count
    from public.zones
    where tournament_category_id = p_tournament_category_id
  loop
    with stats as (
      select
        zp.id as zone_player_id,
        zp.player_id,
        coalesce(zp.seed_order, 9999) as seed_order,
        count(distinct m.id) filter (where m.id is not null) as played,
        count(distinct m.id) filter (where m.winner_id = zp.player_id) as wins,
        count(distinct m.id) filter (where m.loser_id = zp.player_id) as losses,
        coalesce(sum(case
          when ms.id is null then 0
          when m.player1_id = zp.player_id and ms.player1_score > ms.player2_score then 1
          when m.player2_id = zp.player_id and ms.player2_score > ms.player1_score then 1
          else 0
        end), 0)::integer as sets_won,
        coalesce(sum(case
          when ms.id is null then 0
          when m.player1_id = zp.player_id and ms.player1_score < ms.player2_score then 1
          when m.player2_id = zp.player_id and ms.player2_score < ms.player1_score then 1
          else 0
        end), 0)::integer as sets_lost,
        coalesce(sum(case
          when ms.id is null then 0
          when m.player1_id = zp.player_id then ms.player1_score
          when m.player2_id = zp.player_id then ms.player2_score
          else 0
        end), 0)::integer as games_won,
        coalesce(sum(case
          when ms.id is null then 0
          when m.player1_id = zp.player_id then ms.player2_score
          when m.player2_id = zp.player_id then ms.player1_score
          else 0
        end), 0)::integer as games_lost
      from public.zone_players zp
      left join public.matches m
        on m.zone_id = zp.zone_id
       and m.status = 'finished'
       and m.winner_id is not null
       and (m.player1_id = zp.player_id or m.player2_id = zp.player_id)
      left join public.match_sets ms on ms.match_id = m.id
      where zp.zone_id = v_zone.id
      group by zp.id, zp.player_id, zp.seed_order
    ),
    ranked as (
      select
        stats.*,
        row_number() over (
          order by
            wins desc,
            (sets_won - sets_lost) desc,
            (games_won - games_lost) desc,
            seed_order asc,
            player_id asc
        ) as position
      from stats
    )
    update public.zone_players zp
    set
      final_position = ranked.position,
      qualified = ranked.position <= v_zone.qualifiers_count,
      stats_snapshot = jsonb_build_object(
        'played', ranked.played,
        'wins', ranked.wins,
        'losses', ranked.losses,
        'setsWon', ranked.sets_won,
        'setsLost', ranked.sets_lost,
        'setsDiff', ranked.sets_won - ranked.sets_lost,
        'gamesWon', ranked.games_won,
        'gamesLost', ranked.games_lost,
        'gamesDiff', ranked.games_won - ranked.games_lost,
        'zonePoints', ranked.wins,
        'position', ranked.position,
        'recalculatedAt', now()
      ),
      updated_at = now()
    from ranked
    where zp.id = ranked.zone_player_id;
  end loop;
end;
$$;

create or replace function public.recalculate_preliminary_rankings_for_category(
  p_tournament_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage public.tournament_categories%rowtype;
begin
  select * into v_stage
  from public.tournament_categories
  where id = p_tournament_category_id;

  if v_stage.id is null then
    return;
  end if;

  with participants as (
    select distinct m.player1_id as player_id
    from public.matches m
    where m.tournament_category_id = p_tournament_category_id
      and (lower(coalesce(m.phase, '')) like '%prelim%' or lower(coalesce(m.round_name, '')) like '%prelim%')
      and m.player1_id is not null
    union
    select distinct m.player2_id as player_id
    from public.matches m
    where m.tournament_category_id = p_tournament_category_id
      and (lower(coalesce(m.phase, '')) like '%prelim%' or lower(coalesce(m.round_name, '')) like '%prelim%')
      and m.player2_id is not null
    union
    select player_id
    from public.preliminary_rankings
    where tournament_category_id = p_tournament_category_id
  ),
  stats as (
    select
      p.player_id,
      min(m.id) filter (where m.id is not null) as match_id,
      count(distinct m.id) filter (where m.id is not null) as played,
      count(distinct m.id) filter (where m.winner_id = p.player_id) as wins,
      coalesce(sum(case
        when ms.id is null then 0
        when m.player1_id = p.player_id and ms.player1_score > ms.player2_score then 1
        when m.player2_id = p.player_id and ms.player2_score > ms.player1_score then 1
        else 0
      end), 0)::integer as sets_won,
      coalesce(sum(case
        when ms.id is null then 0
        when m.player1_id = p.player_id and ms.player1_score < ms.player2_score then 1
        when m.player2_id = p.player_id and ms.player2_score < ms.player1_score then 1
        else 0
      end), 0)::integer as sets_lost,
      coalesce(sum(case
        when ms.id is null then 0
        when m.player1_id = p.player_id then ms.player1_score
        when m.player2_id = p.player_id then ms.player2_score
        else 0
      end), 0)::integer as games_won,
      coalesce(sum(case
        when ms.id is null then 0
        when m.player1_id = p.player_id then ms.player2_score
        when m.player2_id = p.player_id then ms.player1_score
        else 0
      end), 0)::integer as games_lost
    from participants p
    left join public.matches m
      on m.tournament_category_id = p_tournament_category_id
     and m.status = 'finished'
     and m.winner_id is not null
     and (lower(coalesce(m.phase, '')) like '%prelim%' or lower(coalesce(m.round_name, '')) like '%prelim%')
     and (m.player1_id = p.player_id or m.player2_id = p.player_id)
    left join public.match_sets ms on ms.match_id = m.id
    group by p.player_id
  ),
  ranked as (
    select
      stats.*,
      (wins * 1000 + (sets_won - sets_lost) * 100 + (games_won - games_lost))::numeric(12,4) as performance_score,
      row_number() over (
        order by
          wins desc,
          (sets_won - sets_lost) desc,
          (games_won - games_lost) desc,
          player_id asc
      ) as position
    from stats
    where player_id is not null
  )
  insert into public.preliminary_rankings (
    tournament_id,
    tournament_category_id,
    player_id,
    match_id,
    preliminary_position,
    won,
    performance_score,
    sets_won,
    sets_lost,
    games_won,
    games_lost
  )
  select
    v_stage.tournament_id,
    p_tournament_category_id,
    player_id,
    match_id,
    position,
    wins > 0,
    performance_score,
    sets_won,
    sets_lost,
    games_won,
    games_lost
  from ranked
  on conflict (tournament_category_id, player_id) do update set
    match_id = excluded.match_id,
    preliminary_position = excluded.preliminary_position,
    won = excluded.won,
    performance_score = excluded.performance_score,
    sets_won = excluded.sets_won,
    sets_lost = excluded.sets_lost,
    games_won = excluded.games_won,
    games_lost = excluded.games_lost,
    updated_at = now();
end;
$$;

create or replace function public.process_three_fault_expulsion(
  p_player_id uuid,
  p_tournament_id uuid,
  p_tournament_category_id uuid,
  p_claim_id uuid,
  p_fault_count integer,
  p_actor_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_sets jsonb;
  v_winner_id uuid;
  v_processed_matches integer := 0;
  v_expulsion_id uuid;
  v_already_processed boolean := false;
begin
  if p_player_id is null or p_tournament_id is null or p_tournament_category_id is null then
    raise exception 'THREE_FAULTS_CONTEXT_REQUIRED';
  end if;

  update public.players
  set status = 'blocked_faults',
      updated_at = now()
  where id = p_player_id
    and status <> 'blocked_faults';

  update public.registration_categories rc
  set status = 'eliminated_faults',
      eliminated_at = coalesce(rc.eliminated_at, now()),
      elimination_reason = coalesce(rc.elimination_reason, 'three_faults'),
      eliminated_by = coalesce(rc.eliminated_by, coalesce(p_actor_profile_id::text, 'system'))
  from public.registrations r
  where rc.registration_id = r.id
    and r.player_id = p_player_id
    and r.tournament_id = p_tournament_id
    and rc.tournament_category_id = p_tournament_category_id
    and rc.status <> 'eliminated_faults';

  for v_match in
    select *
    from public.matches
    where tournament_id = p_tournament_id
      and tournament_category_id = p_tournament_category_id
      and (player1_id = p_player_id or player2_id = p_player_id)
      and coalesce(status, '') not in ('finished', 'cancelled', 'standby')
      and coalesce(result_type, '') not in ('BYE', 'WO', 'DOUBLE_WO')
    order by round_index asc, bracket_slot asc nulls last, created_at asc
    for update
  loop
    if v_match.player1_id is null or v_match.player2_id is null then
      continue;
    end if;

    if v_match.player1_id = p_player_id then
      v_winner_id := v_match.player2_id;
      v_sets := jsonb_build_array(
        jsonb_build_object('setNumber', 1, 'player1Score', 0, 'player2Score', 6, 'type', 'set'),
        jsonb_build_object('setNumber', 2, 'player1Score', 0, 'player2Score', 6, 'type', 'set')
      );
    else
      v_winner_id := v_match.player1_id;
      v_sets := jsonb_build_array(
        jsonb_build_object('setNumber', 1, 'player1Score', 6, 'player2Score', 0, 'type', 'set'),
        jsonb_build_object('setNumber', 2, 'player1Score', 6, 'player2Score', 0, 'type', 'set')
      );
    end if;

    perform public.save_match_result(
      v_match.id,
      v_sets,
      'WO',
      v_winner_id,
      p_player_id,
      'W.O. por expulsion disciplinaria',
      'finished'
    );
    v_processed_matches := v_processed_matches + 1;
  end loop;

  perform public.recalculate_zone_snapshots_for_category(p_tournament_category_id);
  perform public.recalculate_preliminary_rankings_for_category(p_tournament_category_id);

  insert into public.player_tournament_expulsions (
    player_id,
    tournament_id,
    tournament_category_id,
    claim_id,
    reason,
    fault_count,
    pending_matches_walkovered,
    created_by,
    metadata
  )
  values (
    p_player_id,
    p_tournament_id,
    p_tournament_category_id,
    p_claim_id,
    'three_faults',
    p_fault_count,
    v_processed_matches,
    p_actor_profile_id,
    jsonb_build_object(
      'processedAt', now(),
      'source', 'discipline_claim_approval'
    )
  )
  on conflict (player_id, tournament_category_id, reason) do update set
    claim_id = coalesce(public.player_tournament_expulsions.claim_id, excluded.claim_id),
    fault_count = greatest(public.player_tournament_expulsions.fault_count, excluded.fault_count),
    pending_matches_walkovered = greatest(public.player_tournament_expulsions.pending_matches_walkovered, excluded.pending_matches_walkovered),
    metadata = public.player_tournament_expulsions.metadata || jsonb_build_object('lastCheckedAt', now())
  returning id, (xmax <> 0) into v_expulsion_id, v_already_processed;

  return jsonb_build_object(
    'triggered', true,
    'alreadyProcessed', v_already_processed,
    'playerId', p_player_id,
    'tournamentId', p_tournament_id,
    'tournamentCategoryId', p_tournament_category_id,
    'expulsionId', v_expulsion_id,
    'faultCount', p_fault_count,
    'limit', 3,
    'walkoverMatches', v_processed_matches,
    'scheduleRecalculationRequired', true
  );
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
  v_fault_count integer := 0;
  v_player_name text;
  v_unblocked_at timestamptz;
  v_expulsion_result jsonb := jsonb_build_object('triggered', false);
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

  select max(unblocked_at)
  into v_unblocked_at
  from public.player_discipline_unblocks
  where player_id = v_claim.accused_player_id;

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
  end if;

  select count(*)
  into v_fault_count
  from public.player_discipline_faults
  where player_id = v_claim.accused_player_id
    and created_at > coalesce(v_unblocked_at, '-infinity'::timestamptz);

  if p_status = 'approved' and v_fault_count >= 3 then
    v_expulsion_result := public.process_three_fault_expulsion(
      v_claim.accused_player_id,
      v_claim.tournament_id,
      (select tournament_category_id from public.matches where id = v_claim.match_id),
      p_claim_id,
      v_fault_count,
      v_admin_profile_id
    );

    update public.discipline_claims
    set three_faults_processed_at = coalesce(three_faults_processed_at, now()),
        three_faults_result = v_expulsion_result
    where id = p_claim_id;
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
    'disciplinaryElimination', v_expulsion_result || jsonb_build_object(
      'playerId', v_claim.accused_player_id,
      'playerName', coalesce(v_player_name, 'Jugador'),
      'faultCount', coalesce(v_fault_count, 0),
      'limit', 3
    )
  );
end;
$$;

create or replace function public.unblock_player_faults(
  p_player_id uuid,
  p_reason text default 'admin_unblock'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_profile_id uuid;
  v_previous_status text;
  v_unblock_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select id
  into v_admin_profile_id
  from public.profiles
  where auth_user_id = auth.uid()
    and role = 'admin'
  limit 1;

  select status
  into v_previous_status
  from public.players
  where id = p_player_id
  for update;

  if v_previous_status is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  update public.players
  set status = 'active',
      updated_at = now()
  where id = p_player_id;

  insert into public.player_discipline_unblocks (
    player_id,
    previous_status,
    unblocked_by,
    reason,
    metadata
  )
  values (
    p_player_id,
    v_previous_status,
    v_admin_profile_id,
    coalesce(nullif(btrim(p_reason), ''), 'admin_unblock'),
    jsonb_build_object('unblockedAt', now(), 'scope', 'future_tournaments_only')
  )
  returning id into v_unblock_id;

  return jsonb_build_object(
    'playerId', p_player_id,
    'unblockId', v_unblock_id,
    'previousStatus', v_previous_status,
    'status', 'active',
    'doesNotRevertTournamentExpulsions', true
  );
end;
$$;

create or replace function public.create_registration_for_player(
  p_player_id uuid,
  p_tournament_id uuid,
  p_category_ids uuid[],
  p_payment_mode text default 'later'
)
returns uuid
language plpgsql
security definer
set search_path = public
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
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_admin() and p_player_id is distinct from public.current_player_id() then
    raise exception 'PLAYER_FORBIDDEN';
  end if;

  if exists (select 1 from public.players where id = p_player_id and status = 'blocked_faults') then
    raise exception 'PLAYER_BLOCKED_FAULTS';
  end if;

  if p_payment_mode not in ('later', 'mercadopago') then
    raise exception 'MODO_PAGO_INVALIDO';
  end if;

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
    select 1
    from public.registrations r
    join public.registration_categories rc on rc.registration_id = r.id
    join public.tournament_categories tc on tc.id = rc.tournament_category_id
    where r.player_id = p_player_id
      and r.tournament_id = p_tournament_id
      and r.status <> 'cancelled'
      and rc.status = 'eliminated_faults'
      and tc.category_id = any(p_category_ids)
  ) then
    raise exception 'PLAYER_EXPELLED_FROM_TOURNAMENT';
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
  v_payment_status := case when v_total = 0 then 'waived' else 'pending' end;
  v_payment_provider := case
    when v_total = 0 then 'waiver'
    when p_payment_mode = 'mercadopago' then 'mercadopago'
    else 'pending'
  end;
  v_payment_method := case when v_total = 0 then 'waiver' else null end;

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
    external_reference,
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
    v_registration_id::text,
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

grant execute on function public.recalculate_zone_snapshots_for_category(uuid) to authenticated;
grant execute on function public.recalculate_preliminary_rankings_for_category(uuid) to authenticated;
grant execute on function public.process_three_fault_expulsion(uuid, uuid, uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.review_match_discipline_claim(uuid, text, text) to authenticated;
grant execute on function public.unblock_player_faults(uuid, text) to authenticated;
grant execute on function public.create_registration_for_player(uuid, uuid, uuid[], text) to authenticated;
