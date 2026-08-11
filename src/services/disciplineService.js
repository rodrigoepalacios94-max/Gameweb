import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";
import { schedulingService } from "./schedulingService";

const CLAIM_SELECT = `
  id,
  match_id,
  tournament_id,
  reporter_player_id,
  accused_player_id,
  description,
  status,
  created_at,
  reviewed_at,
  review_note,
  tournaments:tournament_id (
    id,
    name
  ),
  matches:match_id (
    id,
    round_name,
    phase,
    player1_id,
    player2_id
  ),
  reporter:reporter_player_id (
    id,
    first_name,
    last_name
  ),
  accused:accused_player_id (
    id,
    first_name,
    last_name
  )
`;

const FAULT_SELECT = `
  id,
  claim_id,
  player_id,
  match_id,
  tournament_id,
  reason,
  created_at,
  players:player_id (
    id,
    first_name,
    last_name
  ),
  tournaments:tournament_id (
    id,
    name
  ),
  matches:match_id (
    id,
    round_name,
    phase
  )
`;

const statusFromDb = {
  pending: "Pendiente",
  approved: "Confirmado",
  rejected: "Rechazado",
};

function fullName(player) {
  return `${player?.first_name || ""} ${player?.last_name || ""}`.trim();
}

function matchLabel(row) {
  const reporter = fullName(row.reporter) || "Jugador";
  const accused = fullName(row.accused) || "Rival";
  const round = row.matches?.round_name || row.matches?.phase || "Partido";
  return `${round} / ${reporter} vs ${accused}`;
}

function mapClaim(row) {
  if (!row) return null;
  const reporter = fullName(row.reporter);
  const accused = fullName(row.accused);
  return {
    id: row.id,
    matchId: row.match_id,
    tournamentId: row.tournament_id,
    tournament: row.tournaments?.name || "",
    categoryId: null,
    claimantPlayerId: row.reporter_player_id,
    reporterPlayerId: row.reporter_player_id,
    claimant: reporter || "Jugador",
    reportedPlayerId: row.accused_player_id,
    accusedPlayerId: row.accused_player_id,
    reportedPlayer: accused || "Rival",
    accusedPlayer: accused || "Rival",
    match: matchLabel(row),
    reason: row.description,
    description: row.description,
    status: statusFromDb[row.status] || row.status,
    statusRaw: row.status,
    date: row.created_at ? String(row.created_at).slice(0, 10) : "",
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note || "",
  };
}

function mapFault(row) {
  if (!row) return null;
  return {
    id: row.id,
    claimId: row.claim_id,
    playerId: row.player_id,
    playerName: fullName(row.players) || "Jugador",
    matchId: row.match_id,
    tournamentId: row.tournament_id,
    tournament: row.tournaments?.name || "",
    match: row.matches?.round_name || row.matches?.phase || "Partido",
    reason: row.reason,
    date: row.created_at ? String(row.created_at).slice(0, 10) : "",
    createdAt: row.created_at,
  };
}

function mapClaimRpcError(error) {
  const message = String(error?.message || "");
  if (message.includes("DESCRIPTION_REQUIRED")) return createDataError("La descripción es obligatoria.", { code: "DESCRIPTION_REQUIRED", cause: error });
  if (message.includes("DISCIPLINE_CLAIM_PENDING")) return createDataError("Ya existe un reclamo pendiente para este partido.", { code: "DISCIPLINE_CLAIM_PENDING", cause: error });
  if (message.includes("PLAYER_NOT_IN_MATCH")) return createDataError("No podés reclamar faltas en un partido ajeno.", { code: "PLAYER_NOT_IN_MATCH", cause: error });
  if (message.includes("MATCH_PLAYERS_REQUIRED")) return createDataError("El partido todavía no tiene ambos jugadores definidos.", { code: "MATCH_PLAYERS_REQUIRED", cause: error });
  return createDataError("No pudimos enviar el reclamo.", { cause: error });
}

async function getLatestUnblockByPlayerId(playerId) {
  if (!playerId) return null;
  const client = ensureSupabaseDataClient();
  const { data, error } = await client
    .from("player_discipline_unblocks")
    .select("unblocked_at")
    .eq("player_id", playerId)
    .order("unblocked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logSupabaseDataError("discipline latest unblock", error);
    throw createDataError("NO PUDIMOS CARGAR DESBLOQUEOS DISCIPLINARIOS", { cause: error });
  }
  return data?.unblocked_at || null;
}

export const disciplineService = {
  async getClaims(filters = {}) {
    const client = ensureSupabaseDataClient();
    let query = client.from("discipline_claims").select(CLAIM_SELECT).order("created_at", { ascending: false });
    if (filters.matchId) query = query.eq("match_id", filters.matchId);
    if (filters.tournamentId) query = query.eq("tournament_id", filters.tournamentId);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.playerId) query = query.or(`reporter_player_id.eq.${filters.playerId},accused_player_id.eq.${filters.playerId}`);
    const { data, error } = await query;
    if (error) {
      logSupabaseDataError("discipline claims list", error);
      throw createDataError("NO PUDIMOS CARGAR RECLAMOS DISCIPLINARIOS", { cause: error });
    }
    return (data || []).map(mapClaim).filter(Boolean);
  },

  async getFaults(filters = {}) {
    const client = ensureSupabaseDataClient();
    let query = client.from("player_discipline_faults").select(FAULT_SELECT).order("created_at", { ascending: false });
    if (filters.playerId) query = query.eq("player_id", filters.playerId);
    if (filters.matchId) query = query.eq("match_id", filters.matchId);
    if (filters.tournamentId) query = query.eq("tournament_id", filters.tournamentId);
    const { data, error } = await query;
    if (error) {
      logSupabaseDataError("discipline faults list", error);
      throw createDataError("NO PUDIMOS CARGAR FALTAS DISCIPLINARIAS", { cause: error });
    }
    return (data || []).map(mapFault).filter(Boolean);
  },

  async getPlayerDiscipline(playerId) {
    const [claims, faults, lastUnblock] = await Promise.all([
      this.getClaims({ playerId }),
      this.getFaults({ playerId }),
      getLatestUnblockByPlayerId(playerId),
    ]);
    const activeFaults = lastUnblock
      ? faults.filter((fault) => new Date(fault.createdAt || 0) > new Date(lastUnblock))
      : faults;
    return {
      claims,
      faults,
      activeFaultCount: activeFaults.length,
      status: activeFaults.length >= 3 ? "Bloqueado" : activeFaults.length ? "Seguimiento" : "Sin sanciones",
    };
  },

  async createClaim({ matchId, description }) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("create_match_discipline_claim", {
      p_match_id: matchId,
      p_description: description,
    });
    if (error) {
      logSupabaseDataError("discipline claim create", error);
      throw mapClaimRpcError(error);
    }
    const claims = await this.getClaims({ matchId });
    return claims.find((claim) => claim.id === data) || null;
  },

  async confirmClaim(claimId, reviewNote = "") {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("review_match_discipline_claim", {
      p_claim_id: claimId,
      p_status: "approved",
      p_review_note: reviewNote || null,
    });
    if (error) {
      logSupabaseDataError("discipline claim approve", error);
      throw createDataError("NO PUDIMOS APROBAR EL RECLAMO", { cause: error });
    }
    const elimination = data?.disciplinaryElimination;
    if (elimination?.scheduleRecalculationRequired && elimination?.tournamentId) {
      try {
        await schedulingService.recalculateSchedule(elimination.tournamentId, { preserveScheduled: true });
      } catch (scheduleError) {
        logSupabaseDataError("discipline schedule recalculation", scheduleError.cause || scheduleError);
      }
    }
    return data;
  },

  async rejectClaim(claimId, reviewNote = "") {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("review_match_discipline_claim", {
      p_claim_id: claimId,
      p_status: "rejected",
      p_review_note: reviewNote || null,
    });
    if (error) {
      logSupabaseDataError("discipline claim reject", error);
      throw createDataError("NO PUDIMOS RECHAZAR EL RECLAMO", { cause: error });
    }
    return data;
  },

  async blockPlayer(playerId) {
    const { playerService } = await import("./playerService");
    return playerService.setPlayerStatus(playerId, "Bloqueado por faltas");
  },

  async unblockPlayer(playerId) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("unblock_player_faults", {
      p_player_id: playerId,
      p_reason: "admin_unblock",
    });
    if (error) {
      logSupabaseDataError("discipline player unblock", error);
      throw createDataError("NO PUDIMOS DESBLOQUEAR EL JUGADOR", { cause: error });
    }
    return data;
  },
};
