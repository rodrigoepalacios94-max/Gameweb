import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const activeTournamentStatuses = ["open", "closed", "in_progress"];

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publicAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !publicAnonKey) {
      return json({ error: "DELETE_PLAYER_CONFIG_MISSING", message: "Falta configuracion de Supabase en la funcion." }, 500, cors);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "AUTH_REQUIRED", message: "Sesion requerida." }, 401, cors);

    const userClient = createClient(supabaseUrl, publicAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ error: "AUTH_REQUIRED", message: authError?.message || "Sesion requerida." }, 401, cors);
    }

    const { data: adminProfile, error: adminProfileError } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (adminProfileError) return json({ error: "ADMIN_PROFILE_LOOKUP_FAILED", message: adminProfileError.message }, 500, cors);
    if (adminProfile?.role !== "admin") return json({ error: "ADMIN_REQUIRED", message: "Se requiere perfil administrador." }, 403, cors);

    const body = await req.json();
    const playerId = String(body.playerId || "").trim();
    if (!playerId) return json({ error: "PLAYER_REQUIRED", message: "Falta playerId." }, 400, cors);

    const { data: player, error: playerError } = await serviceClient
      .from("players")
      .select("id, first_name, last_name, email")
      .eq("id", playerId)
      .maybeSingle();
    if (playerError) return json({ error: "PLAYER_LOOKUP_FAILED", message: playerError.message }, 500, cors);
    if (!player) return json({ error: "PLAYER_NOT_FOUND", message: "Jugador no encontrado." }, 404, cors);

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("auth_user_id, role, player_id, email")
      .eq("player_id", playerId)
      .maybeSingle();
    if (profileError) return json({ error: "PROFILE_LOOKUP_FAILED", message: profileError.message }, 500, cors);
    if (profile?.role && profile.role !== "player") {
      return json({ error: "ADMIN_PLAYER_DELETE_FORBIDDEN", message: "No se puede eliminar una cuenta administradora desde jugadores." }, 403, cors);
    }

    const adminEmail = String(Deno.env.get("GAME_ADMIN_EMAIL") || Deno.env.get("ADMIN_EMAIL") || "").trim().toLowerCase();
    if (adminEmail && String(player.email || profile?.email || "").trim().toLowerCase() === adminEmail) {
      return json({ error: "ADMIN_PLAYER_DELETE_FORBIDDEN", message: "No se puede eliminar la cuenta administradora principal desde jugadores." }, 403, cors);
    }

    const activeActivity = await collectActiveTournamentActivity(serviceClient, playerId);
    if (activeActivity.registrations > 0 || activeActivity.matches > 0 || activeActivity.zonePlayers > 0) {
      return json({
        error: "PLAYER_ACTIVE_TOURNAMENT",
        message: "El jugador actualmente esta activo en un torneo.",
        activity: activeActivity,
      }, 409, cors);
    }

    const sportHistory = await collectSportHistory(serviceClient, playerId);
    const totalHistory = Object.values(sportHistory).reduce((sum, value) => sum + value, 0);
    if (totalHistory > 0) {
      return json({
        error: "PLAYER_HAS_SPORT_HISTORY",
        message: "Este jugador tiene historial deportivo registrado.",
        activity: sportHistory,
      }, 409, cors);
    }

    if (profile?.auth_user_id) {
      const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(profile.auth_user_id);
      if (deleteAuthError) return json({ error: "AUTH_DELETE_FAILED", message: deleteAuthError.message }, 500, cors);
    }

    await serviceClient.from("profiles").delete().eq("player_id", playerId);
    const { error: deleteEmptyRankingsError } = await serviceClient
      .from("rankings")
      .delete()
      .eq("player_id", playerId)
      .eq("points", 0)
      .eq("played_tournaments", 0);
    if (deleteEmptyRankingsError) {
      return json({ error: "EMPTY_RANKINGS_DELETE_FAILED", message: deleteEmptyRankingsError.message }, 500, cors);
    }

    const { error: deletePlayerError } = await serviceClient.from("players").delete().eq("id", playerId);
    if (deletePlayerError) return json({ error: "PLAYER_DELETE_FAILED", message: deletePlayerError.message }, 500, cors);

    return json({
      ok: true,
      playerId,
      name: `${player.first_name || ""} ${player.last_name || ""}`.trim(),
    }, 200, cors);
  } catch (error) {
    return json({
      error: "DELETE_PLAYER_UNEXPECTED",
      message: error instanceof Error ? error.message : "Unknown error",
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : null,
      details: typeof error === "object" && error !== null && "details" in error ? String(error.details) : null,
      hint: typeof error === "object" && error !== null && "hint" in error ? String(error.hint) : null,
    }, 500, cors);
  }
});

async function countRows(client: any, table: string, column: string, playerId: string, buildQuery?: (query: any) => any) {
  let query = client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, playerId);
  if (buildQuery) query = buildQuery(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function countMatches(client: any, playerId: string, buildQuery?: (query: any) => any) {
  let query = client
    .from("matches")
    .select("id", { count: "exact", head: true })
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId},winner_id.eq.${playerId},loser_id.eq.${playerId}`);
  if (buildQuery) query = buildQuery(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function collectActiveTournamentActivity(client: any, playerId: string) {
  const { data: activeRegistrations, error: activeRegistrationsError } = await client
    .from("registrations")
    .select("id, tournaments!inner(id, status)")
    .eq("player_id", playerId)
    .neq("status", "cancelled")
    .in("tournaments.status", activeTournamentStatuses);
  if (activeRegistrationsError) throw activeRegistrationsError;

  const activeTournamentIds = [...new Set((activeRegistrations || []).map((item: any) => item.tournaments?.id).filter(Boolean))];
  const matches = activeTournamentIds.length
    ? await countMatches(client, playerId, (query) => query.in("tournament_id", activeTournamentIds))
    : 0;
  const zonePlayers = activeTournamentIds.length
    ? await countActiveZonePlayers(client, playerId, activeTournamentIds)
    : 0;

  return {
    registrations: activeRegistrations?.length || 0,
    matches,
    zonePlayers,
  };
}

async function collectSportHistory(client: any, playerId: string) {
  const [
    registrations,
    payments,
    rankingMovements,
    meaningfulRankings,
    playerBenefits,
    categoryHistory,
    zonePlayers,
    preliminaryRankings,
    matches,
    bracketChampion,
    bracketRunnerUp,
  ] = await Promise.all([
    countRows(client, "registrations", "player_id", playerId, (query) => query.neq("status", "cancelled")),
    countRows(client, "payments", "player_id", playerId),
    countRows(client, "ranking_movements", "player_id", playerId),
    countRows(client, "rankings", "player_id", playerId, (query) => query.or("points.gt.0,played_tournaments.gt.0")),
    countRows(client, "player_benefits", "player_id", playerId),
    countRows(client, "player_category_history", "player_id", playerId),
    countRows(client, "zone_players", "player_id", playerId),
    countRows(client, "preliminary_rankings", "player_id", playerId),
    countMatches(client, playerId),
    countRows(client, "brackets", "champion_player_id", playerId),
    countRows(client, "brackets", "runner_up_player_id", playerId),
  ]);

  return {
    registrations,
    payments,
    rankingMovements,
    rankings: meaningfulRankings,
    playerBenefits,
    categoryHistory,
    zonePlayers,
    preliminaryRankings,
    matches,
    bracketResults: bracketChampion + bracketRunnerUp,
  };
}

async function countActiveZonePlayers(client: any, playerId: string, tournamentIds: string[]) {
  const { count, error } = await client
    .from("zone_players")
    .select("id, zones!inner(tournament_id)", { count: "exact", head: true })
    .eq("player_id", playerId)
    .in("zones.tournament_id", tournamentIds);
  if (error) throw error;
  return count || 0;
}

function json(payload: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
