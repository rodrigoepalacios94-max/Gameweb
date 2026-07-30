create table if not exists public.match_availability_responses (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  available_slots jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  revision integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint match_availability_slots_array check (jsonb_typeof(available_slots) = 'array')
);

create index if not exists match_availability_match_idx on public.match_availability_responses(match_id);
create index if not exists match_availability_player_idx on public.match_availability_responses(player_id);
create index if not exists match_availability_active_idx on public.match_availability_responses(match_id, player_id) where active;

create table if not exists public.game_notifications (
  id uuid primary key default gen_random_uuid(),
  role text not null default 'player' check (role in ('player', 'admin')),
  player_id uuid references public.players(id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null,
  link_path text,
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists game_notifications_player_idx on public.game_notifications(player_id, read_at, created_at desc);
create index if not exists game_notifications_role_idx on public.game_notifications(role, read_at, created_at desc);

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  recipient_email text not null,
  player_id uuid references public.players(id) on delete set null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  registration_id uuid references public.registrations(id) on delete set null,
  dedupe_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  template_payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_deliveries_status_idx on public.email_deliveries(status, next_attempt_at, created_at);
create index if not exists email_deliveries_match_idx on public.email_deliveries(match_id);
create index if not exists email_deliveries_tournament_idx on public.email_deliveries(tournament_id);
create index if not exists email_deliveries_player_idx on public.email_deliveries(player_id);

drop trigger if exists email_deliveries_set_updated_at on public.email_deliveries;
create trigger email_deliveries_set_updated_at
before update on public.email_deliveries
for each row execute function public.set_updated_at();

create unique index if not exists matches_unique_scheduled_court_active
on public.matches(scheduled_at, court)
where scheduled_at is not null
  and court is not null
  and status in ('scheduled', 'in_progress');

alter table public.match_availability_responses enable row level security;
alter table public.game_notifications enable row level security;
alter table public.email_deliveries enable row level security;

drop policy if exists "match_availability_select_own_or_admin" on public.match_availability_responses;
drop policy if exists "match_availability_insert_own_or_admin" on public.match_availability_responses;
drop policy if exists "match_availability_admin_all" on public.match_availability_responses;
create policy "match_availability_select_own_or_admin"
on public.match_availability_responses for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());
create policy "match_availability_insert_own_or_admin"
on public.match_availability_responses for insert
to authenticated
with check (public.is_admin() or player_id = public.current_player_id());
create policy "match_availability_admin_all"
on public.match_availability_responses for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "game_notifications_select_own_or_admin" on public.game_notifications;
drop policy if exists "game_notifications_update_own_or_admin" on public.game_notifications;
drop policy if exists "game_notifications_admin_all" on public.game_notifications;
create policy "game_notifications_select_own_or_admin"
on public.game_notifications for select
to authenticated
using (public.is_admin() or player_id = public.current_player_id());
create policy "game_notifications_update_own_or_admin"
on public.game_notifications for update
to authenticated
using (public.is_admin() or player_id = public.current_player_id())
with check (public.is_admin() or player_id = public.current_player_id());
create policy "game_notifications_admin_all"
on public.game_notifications for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "email_deliveries_admin_read" on public.email_deliveries;
drop policy if exists "email_deliveries_service_all" on public.email_deliveries;
create policy "email_deliveries_admin_read"
on public.email_deliveries for select
to authenticated
using (public.is_admin());

grant select, insert, update on public.match_availability_responses to authenticated;
grant select, update on public.game_notifications to authenticated;
grant select on public.email_deliveries to authenticated;
grant select, insert, update, delete on public.match_availability_responses to service_role;
grant select, insert, update, delete on public.game_notifications to service_role;
grant select, insert, update, delete on public.email_deliveries to service_role;
grant usage on schema public to service_role;

create or replace function public.game_is_valid_email(p_email text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_email, '') ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$';
$$;

create or replace function public.game_local_date(p_value timestamptz)
returns date
language sql
stable
as $$
  select (p_value at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

create or replace function public.game_slot_timestamp(p_date date, p_time text)
returns timestamptz
language sql
stable
as $$
  select ((p_date::text || ' ' || left(p_time, 5) || ':00-03')::timestamptz);
$$;

create or replace function public.game_match_slot_options(p_match_id uuid)
returns table (
  scheduled_at timestamptz,
  slot_date date,
  slot_time text,
  used_count integer,
  capacity integer,
  selectable boolean
)
language plpgsql
security invoker
stable
as $$
declare
  v_match public.matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_final_start timestamptz;
  v_is_final boolean;
  v_is_semifinal boolean;
begin
  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    return;
  end if;

  select * into v_tournament
  from public.tournaments
  where id = v_match.tournament_id;

  if not found or v_tournament.start_date is null then
    return;
  end if;

  v_is_final := lower(coalesce(v_match.round_name, v_match.phase, '')) = 'final';
  v_is_semifinal := lower(coalesce(v_match.round_name, v_match.phase, '')) like '%semifinal%';

  select min(m.scheduled_at) into v_final_start
  from public.matches m
  where m.tournament_id = v_match.tournament_id
    and lower(coalesce(m.round_name, m.phase, '')) = 'final'
    and m.scheduled_at is not null
    and m.status in ('scheduled', 'in_progress');

  return query
  with day_source as (
    select 'saturday'::text as day_key, 0 as day_offset, '["10:00","12:00","14:00"]'::jsonb as default_times, 3 as default_capacity
    union all
    select 'sunday'::text as day_key, 1 as day_offset, '["09:00","11:00","13:00"]'::jsonb as default_times, 4 as default_capacity
  ),
  generated as (
    select
      public.game_slot_timestamp((v_tournament.start_date + (week_index * 7 + day_source.day_offset))::date, time_value) as generated_at,
      (v_tournament.start_date + (week_index * 7 + day_source.day_offset))::date as generated_date,
      left(time_value, 5) as generated_time,
      greatest(
        1,
        coalesce(
          nullif(v_tournament.court_capacity ->> day_source.day_key, '')::integer,
          nullif(jsonb_array_length(coalesce(v_tournament.courts, '[]'::jsonb)), 0),
          day_source.default_capacity
        )
      ) as generated_capacity
    from generate_series(0, 9) as week_index
    cross join day_source
    cross join lateral jsonb_array_elements_text(coalesce(v_tournament.schedule -> day_source.day_key, day_source.default_times)) as time_value
  ),
  occupied as (
    select
      m.scheduled_at,
      count(*)::integer as used_count
    from public.matches m
    where m.tournament_id = v_match.tournament_id
      and m.scheduled_at is not null
      and m.status in ('scheduled', 'in_progress')
      and m.id <> v_match.id
    group by m.scheduled_at
  ),
  player_conflicts as (
    select distinct m.scheduled_at
    from public.matches m
    where m.tournament_id = v_match.tournament_id
      and m.scheduled_at is not null
      and m.status in ('scheduled', 'in_progress')
      and m.id <> v_match.id
      and (
        (v_match.player1_id is not null and v_match.player1_id in (m.player1_id, m.player2_id))
        or (v_match.player2_id is not null and v_match.player2_id in (m.player1_id, m.player2_id))
      )
  )
  select
    g.generated_at,
    g.generated_date,
    g.generated_time,
    coalesce(o.used_count, 0),
    g.generated_capacity,
    (
      g.generated_at >= now()
      and coalesce(o.used_count, 0) < g.generated_capacity
      and pc.scheduled_at is null
      and not (
        not v_is_final
        and exists (
          select 1
          from public.matches final_match
          where final_match.tournament_id = v_match.tournament_id
            and lower(coalesce(final_match.round_name, final_match.phase, '')) = 'final'
            and final_match.scheduled_at = g.generated_at
            and final_match.status in ('scheduled', 'in_progress')
        )
      )
      and not (
        v_is_semifinal
        and v_tournament.finals_date is not null
        and g.generated_date = v_tournament.finals_date
        and v_final_start is not null
        and g.generated_at >= v_final_start
      )
    ) as selectable
  from generated g
  left join occupied o on o.scheduled_at = g.generated_at
  left join player_conflicts pc on pc.scheduled_at = g.generated_at
  order by g.generated_at;
end;
$$;

grant execute on function public.game_match_slot_options(uuid) to authenticated, service_role;

create or replace function public.game_court_names_for_slot(p_tournament_id uuid, p_scheduled_at timestamptz)
returns table (court text, court_order integer)
language plpgsql
security invoker
stable
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_day_key text;
  v_capacity integer;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id;
  if not found then return; end if;

  v_day_key := case
    when extract(isodow from (p_scheduled_at at time zone 'America/Argentina/Buenos_Aires')) = 6 then 'saturday'
    else 'sunday'
  end;

  v_capacity := greatest(
    1,
    coalesce(
      nullif(v_tournament.court_capacity ->> v_day_key, '')::integer,
      nullif(jsonb_array_length(coalesce(v_tournament.courts, '[]'::jsonb)), 0),
      case when v_day_key = 'saturday' then 3 else 4 end
    )
  );

  return query
  select
    coalesce(v_tournament.courts ->> (idx - 1), 'Cancha ' || idx::text) as court,
    idx as court_order
  from generate_series(1, v_capacity) as idx
  order by idx;
end;
$$;

grant execute on function public.game_court_names_for_slot(uuid, timestamptz) to authenticated, service_role;

create or replace function public.game_enqueue_notification(
  p_role text,
  p_player_id uuid,
  p_event_type text,
  p_title text,
  p_message text,
  p_link_path text,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.game_notifications (
    role,
    player_id,
    event_type,
    title,
    message,
    link_path,
    dedupe_key
  ) values (
    p_role,
    p_player_id,
    p_event_type,
    p_title,
    p_message,
    p_link_path,
    p_dedupe_key
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.game_enqueue_email(
  p_event_type text,
  p_recipient_email text,
  p_player_id uuid,
  p_tournament_id uuid,
  p_match_id uuid,
  p_registration_id uuid,
  p_dedupe_key text,
  p_template_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.game_is_valid_email(p_recipient_email) then
    return null;
  end if;

  insert into public.email_deliveries (
    event_type,
    recipient_email,
    player_id,
    tournament_id,
    match_id,
    registration_id,
    dedupe_key,
    template_payload
  ) values (
    p_event_type,
    lower(btrim(p_recipient_email)),
    p_player_id,
    p_tournament_id,
    p_match_id,
    p_registration_id,
    p_dedupe_key,
    coalesce(p_template_payload, '{}'::jsonb)
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.game_enqueue_notification(text, uuid, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.game_enqueue_email(text, text, uuid, uuid, uuid, uuid, text, jsonb) to authenticated, service_role;

create or replace function public.game_try_schedule_match(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_slot timestamptz;
  v_court record;
begin
  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    return false;
  end if;

  if v_match.status not in ('pending', 'rescheduled', 'suspended') then
    return false;
  end if;

  if v_match.player1_id is null or v_match.player2_id is null then
    return false;
  end if;

  for v_slot in
    with latest_r1 as (
      select available_slots
      from public.match_availability_responses
      where match_id = p_match_id and player_id = v_match.player1_id and active
      order by submitted_at desc
      limit 1
    ),
    latest_r2 as (
      select available_slots
      from public.match_availability_responses
      where match_id = p_match_id and player_id = v_match.player2_id and active
      order by submitted_at desc
      limit 1
    ),
    r1 as (
      select jsonb_array_elements_text(available_slots)::timestamptz as scheduled_at
      from latest_r1
    ),
    r2 as (
      select jsonb_array_elements_text(available_slots)::timestamptz as scheduled_at
      from latest_r2
    )
    select distinct options.scheduled_at
    from r1
    join r2 using (scheduled_at)
    join public.game_match_slot_options(p_match_id) options using (scheduled_at)
    where options.selectable
    order by options.scheduled_at
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_match.tournament_id::text || ':' || v_slot::text, 0));

    for v_court in
      select court
      from public.game_court_names_for_slot(v_match.tournament_id, v_slot) courts
      where not exists (
        select 1
        from public.matches m
        where m.tournament_id = v_match.tournament_id
          and m.scheduled_at = v_slot
          and m.court = courts.court
          and m.status in ('scheduled', 'in_progress')
          and m.id <> p_match_id
      )
      order by court_order
    loop
      begin
        update public.matches
        set
          scheduled_at = v_slot,
          court = v_court.court,
          status = 'scheduled',
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'schedule',
            jsonb_build_object(
              'source', 'availability_auto',
              'updatedAt', now(),
              'readyAt', (
                select greatest(max(submitted_at), now())
                from public.match_availability_responses
                where match_id = p_match_id and active
              )
            )
          ),
          updated_at = now()
        where id = p_match_id;

        return true;
      exception when unique_violation then
        -- Another concurrent process took the same court/slot. Try next court/slot.
        continue;
      end;
    end loop;
  end loop;

  return false;
end;
$$;

create or replace function public.game_try_schedule_ready_matches(p_tournament_id uuid)
returns table (match_id uuid, scheduled boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
begin
  for v_match in
    select
      m.id,
      coalesce(
        (
          select max(r.submitted_at)
          from public.match_availability_responses r
          where r.match_id = m.id
            and r.active
            and r.player_id in (m.player1_id, m.player2_id)
        ),
        m.created_at
      ) as ready_at
    from public.matches m
    where m.tournament_id = p_tournament_id
      and m.status in ('pending', 'rescheduled', 'suspended')
      and m.player1_id is not null
      and m.player2_id is not null
      and exists (
        select 1 from public.match_availability_responses r
        where r.match_id = m.id and r.player_id = m.player1_id and r.active
      )
      and exists (
        select 1 from public.match_availability_responses r
        where r.match_id = m.id and r.player_id = m.player2_id and r.active
      )
    order by ready_at asc, m.round_index asc, m.bracket_slot asc, m.id asc
  loop
    match_id := v_match.id;
    scheduled := public.game_try_schedule_match(v_match.id);
    return next;
  end loop;
end;
$$;

grant execute on function public.game_try_schedule_match(uuid) to authenticated, service_role;
grant execute on function public.game_try_schedule_ready_matches(uuid) to authenticated, service_role;

create or replace function public.submit_match_availability(
  p_match_id uuid,
  p_player_id uuid,
  p_available_slots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_revision integer;
  v_valid_slots jsonb;
  v_input_count integer;
  v_valid_count integer;
  v_scheduled_count integer;
begin
  if not (public.is_admin() or public.current_player_id() = p_player_id) then
    raise exception 'AVAILABILITY_FORBIDDEN';
  end if;

  if jsonb_typeof(coalesce(p_available_slots, '[]'::jsonb)) <> 'array' then
    raise exception 'AVAILABLE_SLOTS_ARRAY_REQUIRED';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if p_player_id is distinct from v_match.player1_id
    and p_player_id is distinct from v_match.player2_id
  then
    raise exception 'PLAYER_NOT_IN_MATCH';
  end if;

  select count(*) into v_input_count
  from jsonb_array_elements_text(coalesce(p_available_slots, '[]'::jsonb));

  select coalesce(jsonb_agg(distinct selected.scheduled_at::text order by selected.scheduled_at::text), '[]'::jsonb)
  into v_valid_slots
  from (
    select options.scheduled_at
    from jsonb_array_elements_text(coalesce(p_available_slots, '[]'::jsonb)) raw(slot_value)
    join public.game_match_slot_options(p_match_id) options
      on options.scheduled_at = raw.slot_value::timestamptz
    where options.selectable
  ) selected;

  select jsonb_array_length(v_valid_slots) into v_valid_count;

  update public.match_availability_responses
  set active = false
  where match_id = p_match_id
    and player_id = p_player_id
    and active;

  select coalesce(max(revision), 0) + 1 into v_revision
  from public.match_availability_responses
  where match_id = p_match_id
    and player_id = p_player_id;

  insert into public.match_availability_responses (
    match_id,
    player_id,
    available_slots,
    revision,
    active
  ) values (
    p_match_id,
    p_player_id,
    v_valid_slots,
    v_revision,
    true
  );

  select count(*) into v_scheduled_count
  from public.game_try_schedule_ready_matches(v_match.tournament_id)
  where scheduled;

  return jsonb_build_object(
    'matchId', p_match_id,
    'playerId', p_player_id,
    'revision', v_revision,
    'inputCount', coalesce(v_input_count, 0),
    'acceptedCount', coalesce(v_valid_count, 0),
    'rejectedCount', greatest(coalesce(v_input_count, 0) - coalesce(v_valid_count, 0), 0),
    'scheduledCount', coalesce(v_scheduled_count, 0)
  );
end;
$$;

grant execute on function public.submit_match_availability(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.game_enqueue_match_suspended_emails(p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_player record;
  v_revision text;
  v_count integer := 0;
  v_link text;
begin
  select
    m.id,
    m.tournament_id,
    m.player1_id,
    m.player2_id,
    m.metadata,
    t.name as tournament_name,
    m.round_name,
    m.phase
  into v_match
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = p_match_id;

  if not found then
    return 0;
  end if;

  v_revision := coalesce(v_match.metadata #>> '{suspension,createdAt}', extract(epoch from now())::text);
  v_link := '/player/matches/' || p_match_id::text;

  for v_player in
    select id, email, first_name, last_name
    from public.players
    where id in (v_match.player1_id, v_match.player2_id)
      and public.game_is_valid_email(email)
  loop
    perform public.game_enqueue_email(
      'match_suspended',
      v_player.email,
      v_player.id,
      v_match.tournament_id,
      p_match_id,
      null,
      'match_suspended:' || p_match_id::text || ':' || v_revision || ':' || v_player.id::text,
      jsonb_build_object(
        'playerName', trim(coalesce(v_player.first_name, '') || ' ' || coalesce(v_player.last_name, '')),
        'tournamentName', v_match.tournament_name,
        'roundName', coalesce(v_match.round_name, v_match.phase, 'Partido'),
        'linkPath', v_link
      )
    );

    perform public.game_enqueue_notification(
      'player',
      v_player.id,
      'match_suspended',
      'Partido suspendido',
      'Tu partido fue suspendido. Actualiza los horarios en los que podes jugar para reprogramarlo.',
      v_link,
      'notification:match_suspended:' || p_match_id::text || ':' || v_revision || ':' || v_player.id::text
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.game_enqueue_match_suspended_emails(uuid) to authenticated, service_role;

create or replace function public.game_enqueue_tournament_open_emails(p_tournament_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_player record;
  v_revision text;
  v_count integer := 0;
  v_link text;
begin
  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id;

  if not found or v_tournament.status <> 'open' then
    return 0;
  end if;

  v_revision := coalesce(v_tournament.metadata ->> 'openRevision', extract(epoch from v_tournament.updated_at)::text);
  v_link := '/player/tournaments/' || p_tournament_id::text;

  for v_player in
    select distinct p.id, p.email, p.first_name, p.last_name
    from public.players p
    left join public.categories player_category on player_category.id = p.current_category_id
    where p.status = 'active'
      and public.game_is_valid_email(p.email)
      and (
        not exists (
          select 1 from public.tournament_categories tc_any
          where tc_any.tournament_id = p_tournament_id
        )
        or exists (
          select 1
          from public.tournament_categories tc
          join public.categories tournament_category on tournament_category.id = tc.category_id
          where tc.tournament_id = p_tournament_id
            and player_category.id is not null
            and tournament_category.branch = player_category.branch
            and tournament_category.level >= player_category.level
        )
      )
      and not exists (
        select 1
        from public.registrations r
        where r.tournament_id = p_tournament_id
          and r.player_id = p.id
          and r.status <> 'cancelled'
      )
  loop
    perform public.game_enqueue_email(
      'tournament_open',
      v_player.email,
      v_player.id,
      p_tournament_id,
      null,
      null,
      'tournament_open:' || p_tournament_id::text || ':' || v_revision || ':' || v_player.id::text,
      jsonb_build_object(
        'playerName', trim(coalesce(v_player.first_name, '') || ' ' || coalesce(v_player.last_name, '')),
        'tournamentName', v_tournament.name,
        'linkPath', v_link
      )
    );

    perform public.game_enqueue_notification(
      'player',
      v_player.id,
      'tournament_open',
      'Inscripciones abiertas',
      'Ya podes inscribirte al torneo ' || v_tournament.name || ' desde tu cuenta.',
      v_link,
      'notification:tournament_open:' || p_tournament_id::text || ':' || v_revision || ':' || v_player.id::text
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.game_enqueue_tournament_open_emails(uuid) to authenticated, service_role;

create or replace function public.game_enqueue_scheduled_emails(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_count integer := 0;
  v_match_count integer := 0;
  v_row record;
  v_player record;
  v_local_today date := public.game_local_date(p_now);
begin
  for v_row in
    select
      r.id as registration_id,
      r.player_id,
      r.tournament_id,
      p.email,
      p.first_name,
      p.last_name,
      t.name as tournament_name
    from public.registrations r
    join public.players p on p.id = r.player_id
    join public.tournaments t on t.id = r.tournament_id
    where r.status <> 'cancelled'
      and r.payment_status = 'pending'
      and t.start_date = (v_local_today + 7)
      and public.game_is_valid_email(p.email)
  loop
    perform public.game_enqueue_email(
      'payment_deadline_7d',
      v_row.email,
      v_row.player_id,
      v_row.tournament_id,
      null,
      v_row.registration_id,
      'payment_deadline_7d:' || v_row.tournament_id::text || ':' || v_row.registration_id::text,
      jsonb_build_object(
        'playerName', trim(coalesce(v_row.first_name, '') || ' ' || coalesce(v_row.last_name, '')),
        'tournamentName', v_row.tournament_name,
        'linkPath', '/player/tournaments/' || v_row.tournament_id::text
      )
    );
    v_payment_count := v_payment_count + 1;
  end loop;

  for v_row in
    select
      m.id as match_id,
      m.tournament_id,
      m.player1_id,
      m.player2_id,
      m.scheduled_at,
      m.court,
      t.name as tournament_name,
      p1.first_name as player1_first_name,
      p1.last_name as player1_last_name,
      p2.first_name as player2_first_name,
      p2.last_name as player2_last_name
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    left join public.players p1 on p1.id = m.player1_id
    left join public.players p2 on p2.id = m.player2_id
    where m.status = 'scheduled'
      and m.scheduled_at is not null
      and public.game_local_date(m.scheduled_at) = (v_local_today + 1)
  loop
    for v_player in
      select
        p.id,
        p.email,
        p.first_name,
        p.last_name,
        case
          when p.id = v_row.player1_id then trim(coalesce(v_row.player2_first_name, '') || ' ' || coalesce(v_row.player2_last_name, ''))
          when p.id = v_row.player2_id then trim(coalesce(v_row.player1_first_name, '') || ' ' || coalesce(v_row.player1_last_name, ''))
          else ''
        end as rival_name
      from public.players p
      where p.id in (v_row.player1_id, v_row.player2_id)
        and public.game_is_valid_email(p.email)
    loop
      perform public.game_enqueue_email(
        'match_reminder_1d',
        v_player.email,
        v_player.id,
        v_row.tournament_id,
        v_row.match_id,
        null,
        'match_reminder_1d:' || v_row.match_id::text || ':' || v_row.scheduled_at::text || ':' || v_player.id::text,
        jsonb_build_object(
          'playerName', trim(coalesce(v_player.first_name, '') || ' ' || coalesce(v_player.last_name, '')),
          'rivalName', nullif(v_player.rival_name, ''),
          'tournamentName', v_row.tournament_name,
          'scheduledAt', v_row.scheduled_at,
          'court', v_row.court,
          'linkPath', '/player/matches/' || v_row.match_id::text
        )
      );
      v_match_count := v_match_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'paymentDeadlineQueued', v_payment_count,
    'matchReminderQueued', v_match_count,
    'timezone', 'America/Argentina/Buenos_Aires'
  );
end;
$$;

grant execute on function public.game_enqueue_scheduled_emails(timestamptz) to authenticated, service_role;

create or replace function public.game_on_match_scheduling_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and old.scheduled_at is not null
    and new.scheduled_at is null
    and new.status in ('rescheduled', 'suspended')
  then
    update public.match_availability_responses
    set active = false
    where match_id = new.id
      and active;

    perform public.game_enqueue_match_suspended_emails(new.id);
  end if;

  if (tg_op = 'UPDATE')
    and (
      old.player1_id is distinct from new.player1_id
      or old.player2_id is distinct from new.player2_id
      or old.status is distinct from new.status
    )
    and new.tournament_id is not null
  then
    perform public.game_try_schedule_ready_matches(new.tournament_id);
  end if;

  return new;
end;
$$;

drop trigger if exists matches_game_scheduling_event on public.matches;
create trigger matches_game_scheduling_event
after update of player1_id, player2_id, status, scheduled_at, court on public.matches
for each row execute function public.game_on_match_scheduling_event();

create or replace function public.game_on_tournament_open_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'open'
    and old.status is distinct from new.status
  then
    update public.tournaments
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('openRevision', extract(epoch from now())::text)
    where id = new.id
      and coalesce(metadata ->> 'openRevision', '') = coalesce(new.metadata ->> 'openRevision', '');

    perform public.game_enqueue_tournament_open_emails(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists tournaments_game_open_event on public.tournaments;
create trigger tournaments_game_open_event
after update of status on public.tournaments
for each row execute function public.game_on_tournament_open_event();
