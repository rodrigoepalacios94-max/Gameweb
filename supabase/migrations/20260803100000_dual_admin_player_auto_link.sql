create or replace function public.game_auto_link_admin_players_by_email()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked_count integer := 0;
begin
  with candidates as (
    select
      pr.id as profile_id,
      pl.id as player_id
    from public.profiles pr
    join public.players pl
      on lower(btrim(pr.email)) = lower(btrim(pl.email))
    join (
      select lower(btrim(email)) as normalized_email
      from public.players
      where email is not null and btrim(email) <> ''
      group by lower(btrim(email))
      having count(*) = 1
    ) unique_player_email
      on unique_player_email.normalized_email = lower(btrim(pl.email))
    join (
      select lower(btrim(email)) as normalized_email
      from public.profiles
      where role = 'admin'
        and player_id is null
        and email is not null
        and btrim(email) <> ''
      group by lower(btrim(email))
      having count(*) = 1
    ) unique_admin_email
      on unique_admin_email.normalized_email = lower(btrim(pr.email))
    where pr.role = 'admin'
      and pr.player_id is null
      and pr.email is not null
      and pl.email is not null
      and not exists (
        select 1
        from public.profiles other
        where other.player_id = pl.id
          and other.id <> pr.id
      )
  ),
  updated as (
    update public.profiles pr
    set player_id = candidates.player_id,
        updated_at = now()
    from candidates
    where pr.id = candidates.profile_id
    returning pr.id
  )
  select count(*) into v_linked_count from updated;

  return jsonb_build_object('linkedCount', v_linked_count);
end;
$$;

revoke all on function public.game_auto_link_admin_players_by_email() from public;
revoke all on function public.game_auto_link_admin_players_by_email() from anon;
revoke all on function public.game_auto_link_admin_players_by_email() from authenticated;
grant execute on function public.game_auto_link_admin_players_by_email() to service_role;

with diagnostic as (
  select
    pr.id as profile_id,
    pr.auth_user_id,
    pr.email as profile_email,
    pr.role as profile_role,
    pr.player_id as current_profile_player_id,
    pl.id as candidate_player_id,
    pl.email as player_email,
    pl.first_name,
    pl.last_name,
    count(pl.id) over (partition by lower(btrim(pl.email))) as players_with_same_email,
    count(pr.id) over (partition by lower(btrim(pr.email))) as admin_profiles_with_same_email,
    exists (
      select 1
      from public.profiles other
      where other.player_id = pl.id
        and other.id <> pr.id
    ) as player_already_linked_to_other_profile
  from public.profiles pr
  join public.players pl
    on lower(btrim(pr.email)) = lower(btrim(pl.email))
  where pr.role = 'admin'
    and pr.player_id is null
    and pr.email is not null
    and pl.email is not null
)
select *
from diagnostic
where players_with_same_email = 1
  and admin_profiles_with_same_email = 1
  and player_already_linked_to_other_profile = false
order by profile_email;
