alter table public.registration_categories
  add column if not exists status text not null default 'active',
  add column if not exists eliminated_at timestamptz,
  add column if not exists elimination_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.registration_categories'::regclass
      and conname = 'registration_categories_status_check'
  ) then
    alter table public.registration_categories
      add constraint registration_categories_status_check
      check (status in ('active', 'eliminated_faults'));
  end if;
end;
$$;

create index if not exists registration_categories_status_idx
  on public.registration_categories (status);

alter table public.players
  alter column current_category_id drop not null;

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
  limit 1;
$$;

create or replace function public.link_admin_profile_player(
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_player_id is null or not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  update public.profiles
  set player_id = p_player_id,
      updated_at = now()
  where auth_user_id = auth.uid()
    and role = 'admin'
  returning id into v_profile_id;

  if v_profile_id is null then
    raise exception 'ADMIN_PROFILE_NOT_FOUND';
  end if;

  return p_player_id;
end;
$$;

grant execute on function public.link_admin_profile_player(uuid) to authenticated;
