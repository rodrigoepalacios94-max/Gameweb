import { auditService } from "./auditService";
import { seasonService } from "./seasonService";
import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";

const rankingSelect = `
  id,
  season_id,
  category_id,
  player_id,
  points,
  position,
  previous_position,
  played_tournaments,
  created_at,
  updated_at,
  players:player_id (
    id,
    first_name,
    last_name,
    email,
    current_category_id,
    avatar_url,
    categories:current_category_id (
      id,
      name,
      branch,
      level
    )
  )
`;

function playerFullName(player) {
  return `${player?.first_name || ""} ${player?.last_name || ""}`.trim();
}

function mapPlayer(player) {
  if (!player) return null;
  const category = player.categories;
  return {
    id: player.id,
    firstName: player.first_name || "",
    lastName: player.last_name || "",
    fullName: playerFullName(player),
    email: player.email || "",
    avatar: player.avatar_url || "",
    avatarUrl: player.avatar_url || "",
    categoryId: player.current_category_id,
    categoryName: category ? `${category.name} ${category.branch}` : "",
    ranking: null,
    points: 0,
    stats: { played: 0, wins: 0, losses: 0, tournaments: 0 },
  };
}

function mapRankingEntry(row, index) {
  const player = mapPlayer(row.players);
  return {
    id: row.id,
    seasonId: row.season_id,
    categoryId: row.category_id,
    playerId: row.player_id,
    points: Number(row.points || 0),
    position: Number(row.position || index + 1),
    previousPosition: row.previous_position,
    playedTournaments: Number(row.played_tournaments || 0),
    player: player ? {
      ...player,
      ranking: Number(row.position || index + 1),
      points: Number(row.points || 0),
      stats: { ...player.stats, tournaments: Number(row.played_tournaments || 0) },
    } : null,
  };
}

function mapMovement(row) {
  return {
    id: row.id,
    seasonId: row.season_id,
    categoryId: row.category_id,
    playerId: row.player_id,
    tournamentId: row.tournament_id,
    tournamentCategoryId: row.tournament_category_id,
    concept: row.reason,
    reason: row.reason,
    points: Number(row.points_delta || 0),
    pointsDelta: Number(row.points_delta || 0),
    sourceType: row.source_type,
    sourceId: row.source_id,
    date: String(row.created_at || "").slice(0, 10),
    createdAt: row.created_at,
  };
}

export const rankingService = {
  async getRankingByCategory(categoryId, { seasonId = null } = {}) {
    const client = ensureSupabaseDataClient();
    const season = seasonId ? { id: seasonId } : await seasonService.getCurrentSeason();
    if (!season?.id || !categoryId) return [];
    const { data, error } = await client
      .from("rankings")
      .select(rankingSelect)
      .eq("season_id", season.id)
      .eq("category_id", categoryId)
      .gt("points", 0)
      .order("points", { ascending: false })
      .order("player_id", { ascending: true });
    if (error) {
      logSupabaseDataError("ranking by category", error);
      throw createDataError("No pudimos cargar el ranking.", { cause: error });
    }
    return (data || []).map(mapRankingEntry).filter((entry) => entry.player);
  },

  async getEffectiveRankingOrder(categoryId) {
    const current = await this.getRankingByCategory(categoryId);
    if (current.length) return { source: "current", entries: current };

    const client = ensureSupabaseDataClient();
    const season = await seasonService.getCurrentSeason();
    if (!season?.year) return { source: "current", entries: [] };
    const { data: previousSeason, error } = await client
      .from("seasons")
      .select("id, year")
      .lt("year", season.year)
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logSupabaseDataError("previous season lookup", error);
      throw createDataError("No pudimos cargar el ranking efectivo.", { cause: error });
    }
    if (!previousSeason?.id) return { source: "current", entries: [] };
    return { source: "previous", entries: await this.getRankingByCategory(categoryId, { seasonId: previousSeason.id }) };
  },

  async getPlayerRankingHistory(playerId) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("ranking_movements")
      .select("*")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false });
    if (error) {
      logSupabaseDataError("ranking movements by player", error);
      throw createDataError("No pudimos cargar el historial de ranking.", { cause: error });
    }
    return (data || []).map(mapMovement);
  },

  async getMovementsByPlayer(playerId) {
    return this.getPlayerRankingHistory(playerId);
  },

  async adjustPoints({ playerId, categoryId = null, tournamentId = null, concept = "Ajuste manual", points, reason }, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const numericPoints = Number(points);
    if (!Number.isFinite(numericPoints) || numericPoints === 0) {
      throw createDataError("Ingresá una cantidad de puntos válida.", { field: "points" });
    }
    if (!reason?.trim()) {
      throw createDataError("El motivo es obligatorio.", { field: "reason" });
    }
    let resolvedCategoryId = categoryId;
    if (!resolvedCategoryId) {
      const { data: player, error: playerError } = await client.from("players").select("current_category_id").eq("id", playerId).maybeSingle();
      if (playerError) {
        logSupabaseDataError("ranking adjust player lookup", playerError);
        throw createDataError("No pudimos ajustar puntos.", { cause: playerError });
      }
      resolvedCategoryId = player?.current_category_id;
    }
    if (!resolvedCategoryId) throw createDataError("No pudimos determinar la categoría del jugador.", { field: "categoryId" });

    const { data, error } = await client.rpc("adjust_ranking_points", {
      p_player_id: playerId,
      p_category_id: resolvedCategoryId,
      p_points_delta: numericPoints,
      p_reason: reason || concept,
      p_tournament_id: tournamentId,
      p_source_type: "manual_adjustment",
      p_source_id: null,
    });
    if (error) {
      logSupabaseDataError("ranking adjust rpc", error);
      throw createDataError("No pudimos ajustar puntos.", { cause: error });
    }
    await auditService.record({
      action: "adjust_points",
      entityType: "player",
      entityId: playerId,
      description: `${concept}: ${numericPoints} puntos.`,
      actor,
    });
    return {
      id: data,
      playerId,
      categoryId: resolvedCategoryId,
      tournamentId,
      concept,
      reason,
      points: numericPoints,
      pointsDelta: numericPoints,
      date: new Date().toISOString().slice(0, 10),
    };
  },
};
