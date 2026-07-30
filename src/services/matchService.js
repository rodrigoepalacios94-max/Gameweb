import { DEFAULT_MATCH_FORMAT, formatResultSets, getSetsToWin, isDecidingSuperTiebreak, normalizeMatchFormat } from "../utils/matchFormat";
import { auditService } from "./auditService";
import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";

const matchSelect = `
  id,
  tournament_id,
  tournament_category_id,
  bracket_id,
  zone_id,
  phase,
  round_name,
  round_index,
  bracket_slot,
  status,
  player1_id,
  player2_id,
  winner_id,
  loser_id,
  result_type,
  result_text,
  result_detail,
  scheduled_at,
  court,
  logical_side,
  tree_slot_start,
  tree_slot_span,
  tree_round_index,
  stage_path,
  metadata,
  created_at,
  updated_at,
  tournaments:tournament_id (
    id,
    name,
    match_format
  ),
  tournament_categories:tournament_category_id (
    id,
    category_id,
    match_format,
    categories:category_id (
      id,
      name,
      branch
    )
  ),
  player1:player1_id (
    id,
    first_name,
    last_name,
    avatar_url
  ),
  player2:player2_id (
    id,
    first_name,
    last_name,
    avatar_url
  ),
  match_sets (
    set_number,
    player1_score,
    player2_score,
    set_type
  )
`;

const statusFromDb = {
  pending: "Pendiente",
  scheduled: "Programado",
  in_progress: "En juego",
  finished: "Finalizado",
  cancelled: "Cancelado",
  suspended: "Suspendido",
  paused: "Pausado",
  rescheduled: "Reprogramado",
  standby: "Doble W.O.",
};

function fullName(player) {
  return `${player?.first_name || ""} ${player?.last_name || ""}`.trim();
}

function normalizeScoreSet(set, index, format) {
  const type = set.type || (set.superTieBreak || isDecidingSuperTiebreak(index, format) ? "super_tiebreak" : "set");
  const rawPlayerAScore = set.playerAScore ?? set.a;
  const rawPlayerBScore = set.playerBScore ?? set.b;
  const playerAScore = rawPlayerAScore === "" || rawPlayerAScore == null ? NaN : Number(rawPlayerAScore);
  const playerBScore = rawPlayerBScore === "" || rawPlayerBScore == null ? NaN : Number(rawPlayerBScore);
  return {
    type,
    playerAScore,
    playerBScore,
    a: playerAScore,
    b: playerBScore,
    superTieBreak: type === "super_tiebreak",
  };
}

function getSetWinner(set, format) {
  if (!Number.isFinite(set.playerAScore) || !Number.isFinite(set.playerBScore)) return { error: "Completá todos los valores del resultado." };
  if (set.playerAScore === set.playerBScore) return { error: "Un set finalizado no puede terminar empatado." };
  if (set.type === "super_tiebreak") {
    if (Math.max(set.playerAScore, set.playerBScore) < 10) return { error: "El Super Tie-Break debe llegar al menos a 10 puntos." };
    return { winner: set.playerAScore > set.playerBScore ? "A" : "B" };
  }
  if (Math.max(set.playerAScore, set.playerBScore) < format.gamesPerSet) return { error: `Un set normal debe llegar al menos a ${format.gamesPerSet} games.` };
  return { winner: set.playerAScore > set.playerBScore ? "A" : "B" };
}

export function calculateMatchWinner({ playerAId, playerBId, sets = [], matchFormat = DEFAULT_MATCH_FORMAT }) {
  const format = normalizeMatchFormat(matchFormat);
  const requiredSets = getSetsToWin(format);
  const normalizedSets = sets.map((set, index) => normalizeScoreSet(set, index, format));
  let playerASets = 0;
  let playerBSets = 0;

  for (const set of normalizedSets) {
    const setResult = getSetWinner(set, format);
    if (setResult.error) return { valid: false, error: setResult.error, sets: normalizedSets };
    if (setResult.winner === "A") playerASets += 1;
    if (setResult.winner === "B") playerBSets += 1;
  }

  const winnerSide = playerASets >= requiredSets ? "A" : playerBSets >= requiredSets ? "B" : null;
  if (!winnerSide) {
    return {
      valid: false,
      error: `No hay ganador posible: el partido requiere ${requiredSets} sets ganados.`,
      sets: normalizedSets,
      playerASets,
      playerBSets,
    };
  }

  return {
    valid: true,
    sets: normalizedSets,
    playerASets,
    playerBSets,
    winnerId: winnerSide === "A" ? playerAId : playerBId,
    loserId: winnerSide === "A" ? playerBId : playerAId,
  };
}

function dbSetsToUi(sets = []) {
  return [...sets]
    .sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0))
    .map((set) => ({
      type: set.set_type,
      playerAScore: Number(set.player1_score || 0),
      playerBScore: Number(set.player2_score || 0),
      a: Number(set.player1_score || 0),
      b: Number(set.player2_score || 0),
      superTieBreak: set.set_type === "super_tiebreak",
    }));
}

function uiSetsToDb(sets = []) {
  return sets.map((set, index) => ({
    setNumber: index + 1,
    player1Score: Number(set.playerAScore ?? set.a ?? 0),
    player2Score: Number(set.playerBScore ?? set.b ?? 0),
    type: set.type || (set.superTieBreak ? "super_tiebreak" : "set"),
  }));
}

function categoryLabel(row) {
  const category = row.tournament_categories?.categories;
  return category ? `${category.name} ${category.branch}` : "";
}

function mapMatch(row) {
  if (!row) return null;
  const playerA = fullName(row.player1);
  const playerB = row.result_type === "BYE" ? "BYE" : fullName(row.player2);
  const sets = dbSetsToUi(row.match_sets || []);
  const matchFormat = normalizeMatchFormat(row.tournament_categories?.match_format || row.tournaments?.match_format || DEFAULT_MATCH_FORMAT);
  const status = row.result_type === "WO" ? "W.O." : row.result_type === "DOUBLE_WO" ? "Doble W.O." : statusFromDb[row.status] || row.status;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    tournament: row.tournaments?.name || "",
    categoryId: row.tournament_categories?.category_id,
    category: categoryLabel(row),
    tournamentCategoryId: row.tournament_category_id,
    bracketId: row.bracket_id,
    zoneId: row.zone_id,
    round: row.round_name || row.phase,
    phase: row.phase,
    playerAId: row.player1_id,
    playerA: playerA || "A definir",
    playerAAvatar: row.player1?.avatar_url,
    playerBId: row.player2_id,
    playerB: playerB || "A definir",
    playerBAvatar: row.player2?.avatar_url,
    opponentId: row.player2_id,
    opponent: playerB || "A definir",
    opponentAvatar: row.player2?.avatar_url,
    date: row.scheduled_at ? String(row.scheduled_at).slice(0, 10) : "",
    time: row.scheduled_at ? new Date(row.scheduled_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "A definir",
    court: row.court || "A definir",
    status,
    result: row.result_text || (sets.length ? formatResultSets(sets) : null),
    resultDetail: row.result_detail || null,
    sets,
    winnerId: row.winner_id,
    loserId: row.loser_id,
    walkoverPlayerId: row.result_type === "WO" ? row.loser_id : null,
    doubleWalkover: row.result_type === "DOUBLE_WO",
    bye: row.result_type === "BYE",
    matchFormat,
    metadata: row.metadata || {},
  };
}

async function fetchMatches(applyFilters) {
  const client = ensureSupabaseDataClient();
  let query = client.from("matches").select(matchSelect);
  query = applyFilters ? applyFilters(query) : query;
  const { data, error } = await query.order("round_index", { ascending: true }).order("bracket_slot", { ascending: true });
  if (error) {
    logSupabaseDataError("matches fetch", error);
    throw createDataError("No pudimos cargar los partidos.", { cause: error });
  }
  return (data || []).map(mapMatch);
}

async function fetchMatchById(id) {
  const client = ensureSupabaseDataClient();
  const { data, error } = await client.from("matches").select(matchSelect).eq("id", id).maybeSingle();
  if (error) {
    logSupabaseDataError("match by id", error);
    throw createDataError("No pudimos cargar el partido.", { cause: error });
  }
  return mapMatch(data);
}

export const matchService = {
  async getMatches() {
    return fetchMatches();
  },

  async getPlayerMatches(playerId) {
    return fetchMatches((query) => query.or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`));
  },

  async getMatchById(id) {
    return fetchMatchById(id);
  },

  async getMatchesByPlayer(playerId) {
    return this.getPlayerMatches(playerId);
  },

  async getMatchesByTournament(tournamentId, categoryId = null) {
    let tournamentCategoryId = null;
    if (categoryId) {
      const client = ensureSupabaseDataClient();
      const { data, error } = await client
        .from("tournament_categories")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("category_id", categoryId)
        .maybeSingle();
      if (error) {
        logSupabaseDataError("match tournament category lookup", error);
        throw createDataError("No pudimos cargar los partidos del torneo.", { cause: error });
      }
      tournamentCategoryId = data?.id || null;
      if (!tournamentCategoryId) return [];
    }
    return fetchMatches((query) => {
      let scoped = query.eq("tournament_id", tournamentId);
      if (tournamentCategoryId) scoped = scoped.eq("tournament_category_id", tournamentCategoryId);
      return scoped;
    });
  },

  async savePartialResult(id, { sets = [] }, actor = "admin-1") {
    const match = await fetchMatchById(id);
    if (!match) return null;
    const client = ensureSupabaseDataClient();
    const normalizedSets = sets
      .filter((set) => set.playerAScore !== "" && set.playerBScore !== "")
      .map((set, index) => normalizeScoreSet(set, index, match.matchFormat));
    const { error } = await client.rpc("save_match_result", {
      p_match_id: id,
      p_sets: uiSetsToDb(normalizedSets),
      p_result_type: "NORMAL",
      p_winner_id: null,
      p_loser_id: null,
      p_result_text: normalizedSets.length ? formatResultSets(normalizedSets) : null,
      p_status: "in_progress",
    });
    if (error) {
      logSupabaseDataError("save partial result", error);
      throw createDataError("No pudimos guardar el parcial.", { cause: error });
    }
    await auditService.record({
      action: "save_partial_result",
      entityType: "match",
      entityId: id,
      description: "Resultado parcial guardado",
      actor,
    });
    return fetchMatchById(id);
  },

  async finalizeMatch(id, payload = {}, actor = "admin-1") {
    const match = await fetchMatchById(id);
    if (!match) return null;
    const {
      sets = [],
      completedEarly = false,
      earlyFinishReason = "",
      manualWinnerId = null,
    } = Array.isArray(payload) ? { sets: payload } : payload || {};
    const result = calculateMatchWinner({ ...match, sets, matchFormat: match.matchFormat });
    let winnerId = result.winnerId;
    let loserId = result.loserId;
    let resultSets = result.sets;
    let resultType = "NORMAL";
    if (!result.valid && completedEarly) {
      if (!earlyFinishReason?.trim()) throw createDataError("Indica el motivo de finalizacion anticipada.");
      if (![match.playerAId, match.playerBId].includes(manualWinnerId)) throw createDataError("Selecciona el ganador del partido finalizado anticipadamente.");
      winnerId = manualWinnerId;
      loserId = manualWinnerId === match.playerAId ? match.playerBId : match.playerAId;
      resultSets = sets.filter((set) => set.playerAScore !== "" && set.playerBScore !== "").map((set, index) => normalizeScoreSet(set, index, match.matchFormat));
      resultType = "EARLY_FINISH";
    } else if (!result.valid) {
      throw createDataError(result.error);
    }

    const client = ensureSupabaseDataClient();
    const { error } = await client.rpc("save_match_result", {
      p_match_id: id,
      p_sets: uiSetsToDb(resultSets),
      p_result_type: resultType,
      p_winner_id: winnerId,
      p_loser_id: loserId,
      p_result_text: resultSets.length ? formatResultSets(resultSets) : "Finalizacion anticipada",
      p_status: "finished",
    });
    if (error) {
      logSupabaseDataError("finalize match", error);
      throw createDataError("No pudimos finalizar el partido.", { cause: error });
    }
    await auditService.record({
      action: "finalize_match",
      entityType: "match",
      entityId: id,
      description: "Resultado cargado",
      actor,
    });
    return fetchMatchById(id);
  },

  async editResult(id, payload = {}, actor = "admin-1") {
    return this.finalizeMatch(id, payload, actor);
  },

  async saveResult(id, payload, actor = "admin-1") {
    return this.finalizeMatch(id, payload, actor);
  },

  async registerWalkover(id, { walkoverPlayerId = null, doubleWalkover = false }, actor = "admin-1") {
    const match = await fetchMatchById(id);
    if (!match) return null;
    const winnerId = doubleWalkover ? null : walkoverPlayerId === match.playerAId ? match.playerBId : match.playerAId;
    const loserId = doubleWalkover ? null : walkoverPlayerId;
    const sets = doubleWalkover ? [] : winnerId === match.playerAId
      ? [{ playerAScore: 6, playerBScore: 0 }, { playerAScore: 6, playerBScore: 0 }]
      : [{ playerAScore: 0, playerBScore: 6 }, { playerAScore: 0, playerBScore: 6 }];
    const client = ensureSupabaseDataClient();
    const { error } = await client.rpc("save_match_result", {
      p_match_id: id,
      p_sets: uiSetsToDb(sets),
      p_result_type: doubleWalkover ? "DOUBLE_WO" : "WO",
      p_winner_id: winnerId,
      p_loser_id: loserId,
      p_result_text: doubleWalkover ? "Doble W.O. - pendiente de resolucion" : "Ganador por W.O.",
      p_status: doubleWalkover ? "standby" : "finished",
    });
    if (error) {
      logSupabaseDataError("register walkover", error);
      throw createDataError("No pudimos registrar el W.O.", { cause: error });
    }
    await auditService.record({
      action: doubleWalkover ? "register_double_walkover" : "register_walkover",
      entityType: "match",
      entityId: id,
      description: doubleWalkover ? "Doble W.O. registrado" : "W.O. registrado",
      actor,
    });
    return fetchMatchById(id);
  },

  async rescheduleMatch(id, { date, time, court }, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const scheduledAt = date ? new Date(`${date}T${time || "00:00"}`).toISOString() : null;
    const { error } = await client
      .from("matches")
      .update({ scheduled_at: scheduledAt, court: court || null, status: "rescheduled" })
      .eq("id", id);
    if (error) {
      logSupabaseDataError("reschedule match", error);
      throw createDataError("No pudimos reprogramar el partido.", { cause: error });
    }
    await auditService.record({
      action: "reschedule_match",
      entityType: "match",
      entityId: id,
      description: "Partido reprogramado.",
      actor,
    });
    return fetchMatchById(id);
  },

  calculateMatchWinner,
};
