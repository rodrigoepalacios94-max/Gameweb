create or replace function public.resolve_oauth_player_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text;
  v_profile public.profiles%rowtype;
  v_player public.players%rowtype;
  v_existing_profile public.profiles%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select lower(btrim(email))
  into v_email
  from auth.users
  where id = v_auth_user_id;

  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;

  select * into v_profile
  from public.profiles
  where auth_user_id = v_auth_user_id;

  if found then
    return jsonb_build_object(
      'status', 'profile_exists',
      'role', v_profile.role,
      'playerId', v_profile.player_id
    );
  end if;

  select * into v_player
  from public.players
  where lower(btrim(email)) = v_email
  limit 1;

  if not found then
    return jsonb_build_object('status', 'needs_profile', 'email', v_email);
  end if;

  select * into v_existing_profile
  from public.profiles
  where player_id = v_player.id
  limit 1;

  if found and v_existing_profile.auth_user_id <> v_auth_user_id then
    return jsonb_build_object('status', 'conflict', 'email', v_email);
  end if;

  insert into public.profiles (auth_user_id, email, role, player_id)
  values (v_auth_user_id, v_email, 'player', v_player.id)
  on conflict (auth_user_id) do update
  set email = excluded.email,
      role = 'player',
      player_id = excluded.player_id,
      updated_at = now();

  return jsonb_build_object('status', 'linked_existing_player', 'playerId', v_player.id);
end;
$$;

create or replace function public.complete_google_player_profile(
  p_first_name text,
  p_last_name text,
  p_document text default null,
  p_address text default null,
  p_phone text default null,
  p_birth_date date default null,
  p_gender text default null,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text;
  v_profile public.profiles%rowtype;
  v_player public.players%rowtype;
  v_existing_profile public.profiles%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_first_name, '')), '') is null then
    raise exception 'FIRST_NAME_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_last_name, '')), '') is null then
    raise exception 'LAST_NAME_REQUIRED';
  end if;
  if p_category_id is null then
    raise exception 'CATEGORY_REQUIRED';
  end if;

  select lower(btrim(email))
  into v_email
  from auth.users
  where id = v_auth_user_id;

  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_document, '')), '') is not null
    and exists (
      select 1
      from public.players
      where document = btrim(p_document)
        and lower(btrim(email)) <> v_email
    )
  then
    raise exception 'DOCUMENT_ALREADY_EXISTS';
  end if;

  select * into v_profile
  from public.profiles
  where auth_user_id = v_auth_user_id;

  if found then
    return jsonb_build_object('status', 'profile_exists', 'playerId', v_profile.player_id);
  end if;

  select * into v_player
  from public.players
  where lower(btrim(email)) = v_email
  limit 1;

  if found then
    select * into v_existing_profile
    from public.profiles
    where player_id = v_player.id
    limit 1;

    if found and v_existing_profile.auth_user_id <> v_auth_user_id then
      raise exception 'PLAYER_ALREADY_LINKED';
    end if;

    insert into public.profiles (auth_user_id, email, role, player_id)
    values (v_auth_user_id, v_email, 'player', v_player.id)
    on conflict (auth_user_id) do update
    set email = excluded.email,
        role = 'player',
        player_id = excluded.player_id,
        updated_at = now();

    return jsonb_build_object('status', 'linked_existing_player', 'playerId', v_player.id);
  end if;

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
    btrim(p_first_name),
    btrim(p_last_name),
    v_email,
    nullif(btrim(coalesce(p_document, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    p_birth_date,
    nullif(btrim(coalesce(p_gender, '')), ''),
    p_category_id,
    'active'
  )
  returning * into v_player;

  insert into public.profiles (auth_user_id, email, role, player_id)
  values (v_auth_user_id, v_email, 'player', v_player.id);

  return jsonb_build_object('status', 'created_player', 'playerId', v_player.id);
end;
$$;

grant execute on function public.resolve_oauth_player_profile() to authenticated;
grant execute on function public.complete_google_player_profile(text, text, text, text, text, date, text, uuid) to authenticated;
