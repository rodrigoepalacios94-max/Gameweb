-- Ejecutar despues de crear manualmente los usuarios en Supabase Auth.
-- No contiene passwords ni service_role keys.

-- Admin GAME: vincula el usuario Auth creado para Francisco con rol admin.
insert into public.profiles (auth_user_id, email, role, player_id)
select id, email, 'admin', null
from auth.users
where lower(email) = lower('Franciscoressa97@gmail.com')
on conflict (auth_user_id) do update
set
  email = excluded.email,
  role = 'admin',
  player_id = null,
  updated_at = now();

-- Player de prueba: reemplazar el email por el usuario Auth real del jugador.
-- Mantener player_id = 'player-1' para vincularlo con el mock actual.
/*
insert into public.profiles (auth_user_id, email, role, player_id)
select id, email, 'player', 'player-1'
from auth.users
where lower(email) = lower('jugador.demo@email.com')
on conflict (auth_user_id) do update
set
  email = excluded.email,
  role = 'player',
  player_id = 'player-1',
  updated_at = now();
*/
