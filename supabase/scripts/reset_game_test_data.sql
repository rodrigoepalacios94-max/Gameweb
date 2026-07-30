-- GAME DEV/RESET ONLY.
-- Limpieza controlada de datos de prueba para dejar la base lista para carga real.
-- No ejecutar como migracion automatica de produccion.
--
-- Mantiene:
-- - auth.users del admin real.
-- - public.profiles del admin real con role='admin'.
-- - estructura base y seasons.
--
-- No borra auth.users de jugadores desde SQL. Al final lista los usuarios Auth
-- vinculados a profiles player para eliminarlos manualmente desde Supabase Auth.

begin;

do $$
declare
  v_admin_email text := lower('Franciscoressa97@gmail.com');
begin
  create temp table if not exists game_reset_auth_users_to_review (
    auth_user_id uuid,
    email text,
    role text
  ) on commit preserve rows;

  truncate table game_reset_auth_users_to_review;

  insert into game_reset_auth_users_to_review (auth_user_id, email, role)
  select p.auth_user_id, coalesce(p.email, u.email), p.role
  from public.profiles p
  left join auth.users u on u.id = p.auth_user_id
  where p.role = 'player'
     or lower(coalesce(p.email, u.email, '')) <> v_admin_email;

  update public.profiles
  set player_id = null
  where role = 'admin'
    and lower(coalesce(email, '')) = v_admin_email;

  delete from public.profiles
  where role <> 'admin'
     or lower(coalesce(email, '')) <> v_admin_email;
end $$;

delete from public.match_connections;
delete from public.match_sets;
delete from public.matches;
delete from public.zone_players;
delete from public.zones;
delete from public.preliminary_rankings;
delete from public.brackets;
delete from public.ranking_award_batches;
delete from public.ranking_movements;
delete from public.rankings;
delete from public.player_category_history;
delete from public.player_benefits;
delete from public.payments;
delete from public.registration_categories;
delete from public.registrations;
delete from public.tournament_categories;
delete from public.tournaments;

delete from public.photo_albums;
delete from public.regulation_documents;

delete from public.players;
delete from public.scoring_systems;
delete from public.categories;

commit;

-- Revisar y borrar manualmente desde Supabase Dashboard > Authentication > Users.
-- No borrar el usuario Auth de Francisco.
select auth_user_id, email, role
from game_reset_auth_users_to_review
order by email;
