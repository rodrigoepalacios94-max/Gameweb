alter table public.payments
  add column if not exists qr_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_end_date_not_before_start'
      and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments
      add constraint tournaments_end_date_not_before_start
      check (end_date is null or start_date is null or end_date >= start_date)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_finals_date_not_before_start'
      and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments
      add constraint tournaments_finals_date_not_before_start
      check (finals_date is null or start_date is null or finals_date >= start_date)
      not valid;
  end if;
end $$;

create index if not exists payments_qr_pending_idx
  on public.payments(registration_id, payment_method, status, created_at desc)
  where provider = 'mercadopago';

create or replace function public.game_format_currency(p_amount numeric)
returns text
language sql
immutable
as $$
  select '$ ' || trim(to_char(coalesce(p_amount, 0), 'FM999G999G999G990D00'));
$$;

create or replace function public.game_player_name(p_first_name text, p_last_name text)
returns text
language sql
immutable
as $$
  select nullif(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), '');
$$;

create or replace function public.game_enqueue_match_programmed_emails(p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_player record;
  v_count integer := 0;
  v_revision text;
begin
  select
    m.id,
    m.tournament_id,
    m.player1_id,
    m.player2_id,
    m.scheduled_at,
    m.court,
    t.name as tournament_name,
    c.name || ' ' || c.branch as category_name,
    p1.first_name as player1_first_name,
    p1.last_name as player1_last_name,
    p2.first_name as player2_first_name,
    p2.last_name as player2_last_name
  into v_match
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  left join public.tournament_categories tc on tc.id = m.tournament_category_id
  left join public.categories c on c.id = tc.category_id
  left join public.players p1 on p1.id = m.player1_id
  left join public.players p2 on p2.id = m.player2_id
  where m.id = p_match_id;

  if not found or v_match.scheduled_at is null or v_match.player1_id is null or v_match.player2_id is null then
    return 0;
  end if;

  v_revision := v_match.scheduled_at::text || ':' || coalesce(v_match.court, '');

  for v_player in
    select
      p.id,
      p.email,
      p.first_name,
      p.last_name,
      case
        when p.id = v_match.player1_id then public.game_player_name(v_match.player2_first_name, v_match.player2_last_name)
        when p.id = v_match.player2_id then public.game_player_name(v_match.player1_first_name, v_match.player1_last_name)
        else null
      end as rival_name
    from public.players p
    where p.id in (v_match.player1_id, v_match.player2_id)
      and public.game_is_valid_email(p.email)
  loop
    perform public.game_enqueue_email(
      'match_programmed',
      v_player.email,
      v_player.id,
      v_match.tournament_id,
      v_match.id,
      null,
      'match_programmed:' || v_match.id::text || ':' || v_revision || ':' || v_player.id::text,
      jsonb_build_object(
        'playerName', public.game_player_name(v_player.first_name, v_player.last_name),
        'rivalName', v_player.rival_name,
        'tournamentName', v_match.tournament_name,
        'categoryName', v_match.category_name,
        'scheduledAt', v_match.scheduled_at,
        'court', v_match.court,
        'linkPath', '/player/matches/' || v_match.id::text
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.game_enqueue_results_published_emails(p_tournament_id uuid)
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
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id;
  if not found then return 0; end if;
  v_revision := coalesce(v_tournament.finalized_at::text, v_tournament.updated_at::text, now()::text);

  for v_player in
    select distinct p.id, p.email, p.first_name, p.last_name
    from public.registrations r
    join public.players p on p.id = r.player_id
    where r.tournament_id = p_tournament_id
      and r.status <> 'cancelled'
      and r.payment_status in ('paid', 'waived')
      and public.game_is_valid_email(p.email)
  loop
    perform public.game_enqueue_email(
      'bracket_published',
      v_player.email,
      v_player.id,
      p_tournament_id,
      null,
      null,
      'bracket_published:' || p_tournament_id::text || ':' || v_revision || ':' || v_player.id::text,
      jsonb_build_object(
        'playerName', public.game_player_name(v_player.first_name, v_player.last_name),
        'tournamentName', v_tournament.name,
        'linkPath', '/player/tournaments/' || p_tournament_id::text
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.game_enqueue_photo_album_published_emails(p_album_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_album public.photo_albums%rowtype;
  v_player record;
  v_revision text;
  v_count integer := 0;
begin
  select * into v_album from public.photo_albums where id = p_album_id;
  if not found or not coalesce(v_album.is_active, false) then return 0; end if;
  v_revision := coalesce(v_album.updated_at::text, v_album.created_at::text, now()::text);

  for v_player in
    select id, email, first_name, last_name
    from public.players
    where status = 'active'
      and public.game_is_valid_email(email)
  loop
    perform public.game_enqueue_email(
      'photo_album_published',
      v_player.email,
      v_player.id,
      null,
      null,
      null,
      'photo_album_published:' || p_album_id::text || ':' || v_revision || ':' || v_player.id::text,
      jsonb_build_object(
        'playerName', public.game_player_name(v_player.first_name, v_player.last_name),
        'albumTitle', v_album.title,
        'linkPath', '/player/photos'
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.game_enqueue_tournament_winner_emails(p_tournament_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select
      b.id as bracket_id,
      b.champion_player_id,
      t.name as tournament_name,
      p.email,
      p.first_name,
      p.last_name
    from public.brackets b
    join public.tournaments t on t.id = b.tournament_id
    join public.players p on p.id = b.champion_player_id
    where b.tournament_id = p_tournament_id
      and b.champion_player_id is not null
      and public.game_is_valid_email(p.email)
  loop
    perform public.game_enqueue_email(
      'tournament_winner',
      v_row.email,
      v_row.champion_player_id,
      p_tournament_id,
      null,
      null,
      'tournament_winner:' || p_tournament_id::text || ':' || v_row.bracket_id::text || ':' || v_row.champion_player_id::text,
      jsonb_build_object(
        'playerName', public.game_player_name(v_row.first_name, v_row.last_name),
        'tournamentName', v_row.tournament_name,
        'linkPath', '/player/tournaments/' || p_tournament_id::text
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

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
  v_now timestamptz := coalesce(p_now, now());
  v_local_today date := public.game_local_date(coalesce(p_now, now()));
begin
  for v_row in
    select
      r.id as registration_id,
      r.player_id,
      r.tournament_id,
      r.payment_due_at,
      r.total_amount,
      p.email,
      p.first_name,
      p.last_name,
      t.name as tournament_name
    from public.registrations r
    join public.players p on p.id = r.player_id
    join public.tournaments t on t.id = r.tournament_id
    where r.status <> 'cancelled'
      and r.payment_status = 'pending'
      and coalesce(r.total_amount, 0) > 0
      and (r.payment_due_at is null or r.payment_due_at >= v_now)
      and public.game_is_valid_email(p.email)
      and not exists (
        select 1 from public.payments pay
        where pay.registration_id = r.id
          and pay.status = 'approved'
      )
  loop
    perform public.game_enqueue_email(
      'payment_pending_reminder',
      v_row.email,
      v_row.player_id,
      v_row.tournament_id,
      null,
      v_row.registration_id,
      'payment_pending_reminder:' || v_row.registration_id::text || ':' || v_local_today::text,
      jsonb_build_object(
        'playerName', public.game_player_name(v_row.first_name, v_row.last_name),
        'tournamentName', v_row.tournament_name,
        'amount', public.game_format_currency(v_row.total_amount),
        'paymentDueAt', v_row.payment_due_at,
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
      c.name || ' ' || c.branch as category_name,
      p1.first_name as player1_first_name,
      p1.last_name as player1_last_name,
      p2.first_name as player2_first_name,
      p2.last_name as player2_last_name
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    left join public.tournament_categories tc on tc.id = m.tournament_category_id
    left join public.categories c on c.id = tc.category_id
    left join public.players p1 on p1.id = m.player1_id
    left join public.players p2 on p2.id = m.player2_id
    where m.status = 'scheduled'
      and m.scheduled_at is not null
      and m.scheduled_at > v_now
      and m.scheduled_at <= (v_now + interval '24 hours')
  loop
    for v_player in
      select
        p.id,
        p.email,
        p.first_name,
        p.last_name,
        case
          when p.id = v_row.player1_id then public.game_player_name(v_row.player2_first_name, v_row.player2_last_name)
          when p.id = v_row.player2_id then public.game_player_name(v_row.player1_first_name, v_row.player1_last_name)
          else null
        end as rival_name
      from public.players p
      where p.id in (v_row.player1_id, v_row.player2_id)
        and public.game_is_valid_email(p.email)
    loop
      perform public.game_enqueue_email(
        'match_reminder_24h',
        v_player.email,
        v_player.id,
        v_row.tournament_id,
        v_row.match_id,
        null,
        'match_reminder_24h:' || v_row.match_id::text || ':' || v_row.scheduled_at::text || ':' || v_player.id::text,
        jsonb_build_object(
          'playerName', public.game_player_name(v_player.first_name, v_player.last_name),
          'rivalName', v_player.rival_name,
          'tournamentName', v_row.tournament_name,
          'categoryName', v_row.category_name,
          'scheduledAt', v_row.scheduled_at,
          'court', v_row.court,
          'linkPath', '/player/matches/' || v_row.match_id::text
        )
      );
      v_match_count := v_match_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'paymentPendingQueued', v_payment_count,
    'matchReminderQueued', v_match_count,
    'timezone', 'America/Argentina/Buenos_Aires'
  );
end;
$$;

create or replace function public.game_on_match_business_email_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scheduled_at is not null and new.status in ('scheduled', 'rescheduled') then
    if tg_op = 'INSERT' then
      perform public.game_enqueue_match_programmed_emails(new.id);
    elsif old.scheduled_at is distinct from new.scheduled_at
      or old.court is distinct from new.court
      or old.status is distinct from new.status
    then
      perform public.game_enqueue_match_programmed_emails(new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists matches_game_business_email_event on public.matches;
create trigger matches_game_business_email_event
after insert or update of scheduled_at, court, status on public.matches
for each row execute function public.game_on_match_business_email_event();

create or replace function public.game_on_photo_album_business_email_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active = true and (tg_op = 'INSERT' or old.is_active is distinct from new.is_active) then
    perform public.game_enqueue_photo_album_published_emails(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists photo_albums_game_business_email_event on public.photo_albums;
create trigger photo_albums_game_business_email_event
after insert or update of is_active on public.photo_albums
for each row execute function public.game_on_photo_album_business_email_event();

create or replace function public.game_on_tournament_finished_business_email_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'finished' and old.status is distinct from new.status then
    perform public.game_enqueue_results_published_emails(new.id);
    perform public.game_enqueue_tournament_winner_emails(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_game_finished_business_email_event on public.tournaments;
create trigger tournaments_game_finished_business_email_event
after update of status on public.tournaments
for each row execute function public.game_on_tournament_finished_business_email_event();

grant execute on function public.game_enqueue_match_programmed_emails(uuid) to authenticated, service_role;
grant execute on function public.game_enqueue_results_published_emails(uuid) to authenticated, service_role;
grant execute on function public.game_enqueue_photo_album_published_emails(uuid) to authenticated, service_role;
grant execute on function public.game_enqueue_tournament_winner_emails(uuid) to authenticated, service_role;
grant execute on function public.game_enqueue_scheduled_emails(timestamptz) to authenticated, service_role;
grant execute on function public.game_format_currency(numeric) to authenticated, service_role;
grant execute on function public.game_player_name(text, text) to authenticated, service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_supabase_url text := nullif(current_setting('app.settings.supabase_url', true), '');
  v_cron_secret text := nullif(current_setting('app.settings.game_cron_secret', true), '');
  v_function_url text;
begin
  if v_supabase_url is null or v_cron_secret is null then
    raise notice 'GAME email cron not scheduled. Configure app.settings.supabase_url and app.settings.game_cron_secret, then rerun this migration block.';
    return;
  end if;

  v_function_url := rtrim(v_supabase_url, '/') || '/functions/v1/send-game-emails';

  if exists (
    select 1
    from cron.job
    where jobname = 'game_process_email_queue_every_15m'
  ) then
    return;
  end if;

  perform cron.schedule(
    'game_process_email_queue_every_15m',
    '*/15 * * * *',
    format(
      $cron$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-game-cron-secret', %L
        ),
        body := jsonb_build_object(
          'reason', 'cron',
          'enqueueScheduled', true
        ),
        timeout_milliseconds := 30000
      );
      $cron$,
      v_function_url,
      v_cron_secret
    )
  );
end $$;
