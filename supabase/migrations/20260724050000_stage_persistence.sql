alter table public.match_connections
  drop constraint if exists match_connections_no_self_reference,
  add constraint match_connections_no_self_reference check (parent_match_id <> child_match_id);

create or replace function public.persist_tournament_stage(
  p_tournament_id uuid,
  p_category_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_stage public.tournament_categories%rowtype;
  v_bracket_id uuid;
  v_zone jsonb;
  v_zone_player jsonb;
  v_match jsonb;
  v_set jsonb;
  v_connection jsonb;
  v_preliminary jsonb;
  v_zone_ids jsonb := '{}'::jsonb;
  v_match_ids jsonb := '{}'::jsonb;
  v_zone_id uuid;
  v_match_id uuid;
  v_parent_id uuid;
  v_child_id uuid;
  v_set_index integer;
  v_bracket_data_text text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_STAGE_PAYLOAD';
  end if;
  v_bracket_data_text := coalesce(p_payload->'bracketData', '{}'::jsonb)::text;

  select *
  into v_stage
  from public.tournament_categories
  where tournament_id = p_tournament_id
    and category_id = p_category_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_CATEGORY_NOT_FOUND';
  end if;

  if v_stage.locked_at is not null
    or v_stage.stage_status in ('locked', 'in_progress', 'finished')
    or exists (
      select 1
      from public.matches
      where tournament_category_id = v_stage.id
        and status in ('scheduled', 'in_progress', 'finished', 'standby')
        and result_type <> 'BYE'
        and not (
          coalesce((p_payload->>'allowFinishedPreliminaries')::boolean, false)
          and phase = 'Preliminar'
          and status = 'finished'
        )
    )
  then
    raise exception 'STAGE_ALREADY_LOCKED';
  end if;

  delete from public.preliminary_rankings where tournament_category_id = v_stage.id;
  delete from public.brackets where tournament_category_id = v_stage.id;
  delete from public.matches where tournament_category_id = v_stage.id;
  delete from public.zones where tournament_category_id = v_stage.id;

  insert into public.brackets (
    tournament_id,
    tournament_category_id,
    format,
    size,
    status,
    bracket_data
  ) values (
    p_tournament_id,
    v_stage.id,
    p_payload->>'format',
    nullif(p_payload->>'size', '')::integer,
    'generated',
    '{}'::jsonb
  )
  returning id into v_bracket_id;

  for v_zone in
    select * from jsonb_array_elements(coalesce(p_payload->'zones', '[]'::jsonb))
  loop
    insert into public.zones (
      tournament_id,
      tournament_category_id,
      bracket_id,
      name,
      qualifiers_count,
      status
    ) values (
      p_tournament_id,
      v_stage.id,
      v_bracket_id,
      v_zone->>'name',
      coalesce(nullif(v_zone->>'qualifiersCount', '')::integer, 1),
      coalesce(nullif(v_zone->>'status', ''), 'pending')
    )
    returning id into v_zone_id;

    v_zone_ids := v_zone_ids || jsonb_build_object(v_zone->>'tempId', v_zone_id);
    v_bracket_data_text := replace(v_bracket_data_text, '"' || (v_zone->>'tempId') || '"', '"' || v_zone_id::text || '"');

    for v_zone_player in
      select * from jsonb_array_elements(coalesce(v_zone->'players', '[]'::jsonb))
    loop
      insert into public.zone_players (
        zone_id,
        player_id,
        seed_order,
        final_position,
        qualified,
        stats_snapshot
      ) values (
        v_zone_id,
        (v_zone_player->>'playerId')::uuid,
        nullif(v_zone_player->>'seedOrder', '')::integer,
        nullif(v_zone_player->>'finalPosition', '')::integer,
        coalesce((v_zone_player->>'qualified')::boolean, false),
        coalesce(v_zone_player->'statsSnapshot', '{}'::jsonb)
      )
      on conflict (zone_id, player_id) do update set
        seed_order = excluded.seed_order,
        final_position = excluded.final_position,
        qualified = excluded.qualified,
        stats_snapshot = excluded.stats_snapshot,
        updated_at = now();
    end loop;
  end loop;

  for v_match in
    select * from jsonb_array_elements(coalesce(p_payload->'matches', '[]'::jsonb))
  loop
    v_zone_id := null;
    if nullif(v_match->>'zoneTempId', '') is not null then
      v_zone_id := (v_zone_ids->>(v_match->>'zoneTempId'))::uuid;
      if v_zone_id is null then
        raise exception 'ZONE_MAPPING_NOT_FOUND %', v_match->>'zoneTempId';
      end if;
    end if;

    insert into public.matches (
      tournament_id,
      tournament_category_id,
      bracket_id,
      zone_id,
      phase,
      round_name,
      round_index,
      bracket_slot,
      status,
      player1_id,
      player2_id,
      winner_id,
      loser_id,
      result_type,
      result_text,
      result_detail,
      logical_side,
      tree_slot_start,
      tree_slot_span,
      tree_round_index,
      stage_path,
      metadata
    ) values (
      p_tournament_id,
      v_stage.id,
      v_bracket_id,
      v_zone_id,
      v_match->>'phase',
      v_match->>'roundName',
      coalesce(nullif(v_match->>'roundIndex', '')::integer, 0),
      nullif(v_match->>'bracketSlot', '')::integer,
      coalesce(nullif(v_match->>'status', ''), 'pending'),
      nullif(v_match->>'player1Id', '')::uuid,
      nullif(v_match->>'player2Id', '')::uuid,
      nullif(v_match->>'winnerId', '')::uuid,
      nullif(v_match->>'loserId', '')::uuid,
      coalesce(nullif(v_match->>'resultType', ''), 'NORMAL'),
      nullif(v_match->>'resultText', ''),
      coalesce(v_match->'resultDetail', '{}'::jsonb),
      nullif(v_match->>'logicalSide', ''),
      nullif(v_match->>'treeSlotStart', '')::integer,
      nullif(v_match->>'treeSlotSpan', '')::integer,
      nullif(v_match->>'treeRoundIndex', '')::integer,
      nullif(v_match->>'stagePath', ''),
      coalesce(v_match->'metadata', '{}'::jsonb) || jsonb_build_object('temporaryId', v_match->>'tempId')
    )
    returning id into v_match_id;

    v_match_ids := v_match_ids || jsonb_build_object(v_match->>'tempId', v_match_id);
    v_bracket_data_text := replace(v_bracket_data_text, '"' || (v_match->>'tempId') || '"', '"' || v_match_id::text || '"');

    v_set_index := 0;
    for v_set in
      select * from jsonb_array_elements(coalesce(v_match->'sets', '[]'::jsonb))
    loop
      v_set_index := v_set_index + 1;
      insert into public.match_sets (
        match_id,
        set_number,
        player1_score,
        player2_score,
        set_type
      ) values (
        v_match_id,
        coalesce(nullif(v_set->>'setNumber', '')::integer, v_set_index),
        coalesce(nullif(v_set->>'player1Score', '')::integer, 0),
        coalesce(nullif(v_set->>'player2Score', '')::integer, 0),
        coalesce(nullif(v_set->>'type', ''), 'set')
      );
    end loop;
  end loop;

  for v_connection in
    select * from jsonb_array_elements(coalesce(p_payload->'connections', '[]'::jsonb))
  loop
    v_parent_id := (v_match_ids->>(v_connection->>'parentTempId'))::uuid;
    v_child_id := (v_match_ids->>(v_connection->>'childTempId'))::uuid;
    if v_parent_id is null or v_child_id is null then
      raise exception 'MATCH_CONNECTION_MAPPING_NOT_FOUND parent=% child=%', v_connection->>'parentTempId', v_connection->>'childTempId';
    end if;
    if v_parent_id = v_child_id then
      raise exception 'MATCH_CONNECTION_SELF_REFERENCE %', v_connection->>'parentTempId';
    end if;

    insert into public.match_connections (
      parent_match_id,
      child_match_id,
      child_slot
    ) values (
      v_parent_id,
      v_child_id,
      coalesce(nullif(v_connection->>'childSlot', '')::integer, 1)
    );
  end loop;

  for v_preliminary in
    select * from jsonb_array_elements(coalesce(p_payload->'preliminaryRankings', '[]'::jsonb))
  loop
    v_match_id := null;
    if nullif(v_preliminary->>'matchTempId', '') is not null then
      v_match_id := (v_match_ids->>(v_preliminary->>'matchTempId'))::uuid;
    end if;
    insert into public.preliminary_rankings (
      tournament_id,
      tournament_category_id,
      player_id,
      match_id,
      preliminary_position,
      preliminary_role,
      won,
      performance_score,
      sets_won,
      sets_lost,
      games_won,
      games_lost
    ) values (
      p_tournament_id,
      v_stage.id,
      (v_preliminary->>'playerId')::uuid,
      v_match_id,
      nullif(v_preliminary->>'position', '')::integer,
      nullif(v_preliminary->>'role', ''),
      nullif(v_preliminary->>'won', '')::boolean,
      coalesce(nullif(v_preliminary->>'performanceScore', '')::numeric, 0),
      coalesce(nullif(v_preliminary->>'setsWon', '')::integer, 0),
      coalesce(nullif(v_preliminary->>'setsLost', '')::integer, 0),
      coalesce(nullif(v_preliminary->>'gamesWon', '')::integer, 0),
      coalesce(nullif(v_preliminary->>'gamesLost', '')::integer, 0)
    )
    on conflict (tournament_category_id, player_id) do update set
      match_id = excluded.match_id,
      preliminary_position = excluded.preliminary_position,
      preliminary_role = excluded.preliminary_role,
      won = excluded.won,
      performance_score = excluded.performance_score,
      sets_won = excluded.sets_won,
      sets_lost = excluded.sets_lost,
      games_won = excluded.games_won,
      games_lost = excluded.games_lost,
      updated_at = now();
  end loop;

  update public.brackets
  set
    bracket_data = v_bracket_data_text::jsonb,
    updated_at = now()
  where id = v_bracket_id;

  update public.tournament_categories
  set
    stage_status = 'generated',
    generated_at = now(),
    status = coalesce(nullif(p_payload->>'stageLabel', ''), 'Cuadro generado'),
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_payload->'stageMetadata', '{}'::jsonb),
    updated_at = now()
  where id = v_stage.id;

  return jsonb_build_object(
    'bracketId', v_bracket_id,
    'matchIds', v_match_ids,
    'zoneIds', v_zone_ids
  );
end;
$$;

grant execute on function public.persist_tournament_stage(uuid, uuid, jsonb) to anon, authenticated;

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

  select * into v_connection
  from public.match_connections
  where parent_match_id = p_parent_match_id;

  if not found then
    update public.brackets
    set
      champion_player_id = v_parent.winner_id,
      runner_up_player_id = v_parent.loser_id,
      status = 'finished',
      updated_at = now()
    where id = v_parent.bracket_id;

    update public.tournament_categories
    set
      stage_status = 'finished',
      updated_at = now()
    where id = v_parent.tournament_category_id;
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

create or replace function public.finalize_tournament_category(p_tournament_category_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_stage public.tournament_categories%rowtype;
  v_tournament public.tournaments%rowtype;
  v_bracket public.brackets%rowtype;
  v_final public.matches%rowtype;
  v_scoring public.scoring_systems%rowtype;
  v_season public.seasons%rowtype;
  v_batch_id uuid;
  v_player_id uuid;
  v_points integer;
begin
  select * into v_stage
  from public.tournament_categories
  where id = p_tournament_category_id
  for update;
  if not found then
    raise exception 'TOURNAMENT_CATEGORY_NOT_FOUND';
  end if;

  select * into v_tournament from public.tournaments where id = v_stage.tournament_id;
  select * into v_bracket from public.brackets where tournament_category_id = v_stage.id for update;
  if not found then
    raise exception 'BRACKET_NOT_FOUND';
  end if;

  select m.*
  into v_final
  from public.matches m
  where m.bracket_id = v_bracket.id
    and m.status = 'finished'
    and m.winner_id is not null
    and not exists (
      select 1 from public.match_connections mc
      where mc.parent_match_id = m.id
    )
  order by m.round_index desc, m.bracket_slot nulls last
  limit 1;

  if not found then
    raise exception 'FINAL_NOT_FINISHED';
  end if;

  update public.brackets
  set
    champion_player_id = v_final.winner_id,
    runner_up_player_id = v_final.loser_id,
    status = 'finished',
    updated_at = now()
  where id = v_bracket.id
  returning * into v_bracket;

  update public.tournament_categories
  set
    stage_status = 'finished',
    updated_at = now()
  where id = v_stage.id
  returning * into v_stage;

  if v_stage.ranking_awarded_at is not null then
    return jsonb_build_object('status', 'already_awarded', 'bracketId', v_bracket.id);
  end if;

  select * into v_scoring
  from public.scoring_systems
  where id = v_tournament.scoring_system_id;
  if not found then
    raise exception 'SCORING_SYSTEM_NOT_FOUND';
  end if;

  select * into v_season from public.get_current_season();
  if not found or v_season.id is null then
    raise exception 'CURRENT_SEASON_NOT_FOUND';
  end if;

  insert into public.ranking_award_batches (
    season_id,
    tournament_id,
    tournament_category_id,
    bracket_id,
    created_by
  ) values (
    v_season.id,
    v_stage.tournament_id,
    v_stage.id,
    v_bracket.id,
    'finalize_tournament_category'
  )
  on conflict (season_id, tournament_category_id) do nothing
  returning id into v_batch_id;

  if v_batch_id is null then
    update public.tournament_categories
    set ranking_awarded_at = coalesce(ranking_awarded_at, now())
    where id = v_stage.id;
    return jsonb_build_object('status', 'already_awarded', 'bracketId', v_bracket.id);
  end if;

  for v_player_id in
    select distinct r.player_id
    from public.registrations r
    join public.registration_categories rc on rc.registration_id = r.id
    where rc.tournament_category_id = v_stage.id
      and r.status <> 'cancelled'
  loop
    if coalesce(v_scoring.inscription, 0) <> 0 then
      perform public.adjust_ranking_points(
        v_player_id,
        v_stage.category_id,
        v_scoring.inscription,
        'Inscripcion torneo',
        v_stage.tournament_id,
        'tournament_inscription',
        v_bracket.id
      );
    end if;
  end loop;

  for v_player_id in
    select distinct player_id
    from public.preliminary_rankings
    where tournament_category_id = v_stage.id
  loop
    select
      coalesce(v_scoring.preliminary, 0)
      + case
          when exists (
            select 1
            from public.preliminary_rankings pr
            where pr.tournament_category_id = v_stage.id
              and pr.player_id = v_player_id
              and pr.won is true
          ) then coalesce(v_scoring.preliminary_win, 0)
          else 0
        end
    into v_points;
    if v_points <> 0 then
      perform public.adjust_ranking_points(
        v_player_id,
        v_stage.category_id,
        v_points,
        'Ranking preliminar',
        v_stage.tournament_id,
        'preliminary_ranking',
        v_bracket.id
      );
    end if;
  end loop;

  if coalesce(v_scoring.runner_up, 0) <> 0 and v_bracket.runner_up_player_id is not null then
    perform public.adjust_ranking_points(
      v_bracket.runner_up_player_id,
      v_stage.category_id,
      v_scoring.runner_up,
      'Subcampeon torneo',
      v_stage.tournament_id,
      'tournament_result',
      v_bracket.id
    );
  end if;

  if coalesce(v_scoring.champion, 0) <> 0 and v_bracket.champion_player_id is not null then
    perform public.adjust_ranking_points(
      v_bracket.champion_player_id,
      v_stage.category_id,
      v_scoring.champion,
      'Campeon torneo',
      v_stage.tournament_id,
      'tournament_result',
      v_bracket.id
    );
  end if;

  update public.tournament_categories
  set ranking_awarded_at = now()
  where id = v_stage.id;

  update public.brackets
  set ranking_awarded_at = now()
  where id = v_bracket.id;

  return jsonb_build_object(
    'status', 'awarded',
    'bracketId', v_bracket.id,
    'championPlayerId', v_bracket.champion_player_id,
    'runnerUpPlayerId', v_bracket.runner_up_player_id
  );
end;
$$;

grant execute on function public.finalize_tournament_category(uuid) to anon, authenticated;
