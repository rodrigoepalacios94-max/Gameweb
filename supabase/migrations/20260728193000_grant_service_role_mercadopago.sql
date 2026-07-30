-- Grants minimos para Edge Functions backend de Mercado Pago.
-- service_role bypassea RLS, pero PostgREST igualmente requiere privilegios SQL.

grant usage on schema public to service_role;

grant select on table public.profiles to service_role;
grant select on table public.players to service_role;
grant select on table public.tournaments to service_role;
grant select on table public.tournament_categories to service_role;
grant select on table public.registration_categories to service_role;
grant select on table public.player_benefits to service_role;

grant select, update on table public.registrations to service_role;
grant select, insert, update on table public.payments to service_role;
