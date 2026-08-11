import { DEFAULT_MATCH_FORMAT, formatResultSets } from "../utils/matchFormat";
import { buildPreliminaryBracketFromResults, buildZoneEliminationBracket, generateCategoryBracketInDb, TOURNAMENT_FORMATS } from "./tournamentCategoryService";
import { rankingService } from "./rankingService";
import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";

const tournamentSelect = `
  id,
  name,
  match_format,
  metadata
`;

const stageSelect = `
  id,
  tournament_id,
  category_id,
  format,
  recommended_format,
  format_status,
  format_decision,
  match_format,
  status,
  stage_status,
  generated_at,
  locked_at,
  ranking_awarded_at,
  metadata,
  categories:category_id (
    id,
    name,
    branch,
    level,
    is_active
  )
`;

const persistedStageSelect = `
  id,
  tournament_id,
  category_id,
  format,
  status,
  stage_status,
  generated_at,
  locked_at,
  ranking_awarded_at,
  match_format,
  metadata,
  brackets (
    id,
    format,
    size,
    status,
    champion_player_id,
    runner_up_player_id,
    bracket_data,
    generated_at,
    ranking_awarded_at
  ),
  zones (
    id,
    name,
    qualifiers_count,
    status,
    zone_players (
      player_id,
      seed_order,
      final_position,
      qualified,
      stats_snapshot,
      players:player_id (
        id,
        first_name,
        last_name
      )
    )
  ),
  matches (
    id,
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
    metadata,
    match_sets (
      set_number,
      player1_score,
      player2_score,
      set_type
    )
  )
`;

function fullName(player) {
  return `${player?.first_name || player?.firstName || ""} ${player?.last_name || player?.lastName || ""}`.trim();
}

function categoryLabel(category) {
  if (!category) return "Categoria";
  return `${category.name} ${category.branch || ""}`.trim();
}

function mapDbPlayer(row, rankingMap, fallbackRanking) {
  const rankingEntry = rankingMap.get(row.id);
  return {
    id: row.id,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    fullName: fullName(row),
    avatar: row.avatar_url || "",
    avatarUrl: row.avatar_url || "",
    categoryId: row.current_category_id,
    ranking: rankingEntry?.position || fallbackRanking,
    points: rankingEntry?.points || 0,
  };
}

function normalizeDateInput(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value ?? fallback);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function isEligibleRegistration(registration, now = new Date()) {
  const nowDate = normalizeDateInput(now);
  if (!registration || registration.status === "cancelled") return false;
  if (["paid", "waived"].includes(registration.payment_status)) return true;
  if (registration.payment_status !== "pending") return false;
  if (!registration.payment_due_at) return true;
  const dueAt = new Date(registration.payment_due_at);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() >= nowDate.getTime();
}

async function fetchTournamentCategoryParticipantRows(tournamentCategoryId) {
  const client = ensureSupabaseDataClient();
  const selectParticipantRows = `
      player_id,
      status,
      payment_status,
      payment_due_at,
      registration_categories!inner (
        tournament_category_id
      ),
      players:player_id (
        id,
        first_name,
        last_name,
        avatar_url,
        current_category_id
      )
    `;
  const { data, error } = await client
    .from("registrations")
    .select(selectParticipantRows)
    .eq("registration_categories.tournament_category_id", tournamentCategoryId);
  if (error) {
    logSupabaseDataError("tournament category participants", {
      ...error,
      table: "registrations",
      select: selectParticipantRows,
      filter: `registration_categories.tournament_category_id eq ${tournamentCategoryId}`,
    });
    throw createDataError("No pudimos cargar los inscriptos de la categoria.", { cause: error });
  }
  return (data || []).filter((registration) => isEligibleRegistration(registration));
}

export async function getTournamentCategoryParticipants(tournamentCategoryId, { categoryId = null, withRanking = true } = {}) {
  if (!tournamentCategoryId) return [];
  let effectiveCategoryId = categoryId;
  let tournamentCategoryName = "";
  const client = ensureSupabaseDataClient();
  const { data: stage, error: stageError } = await client
    .from("tournament_categories")
    .select("category_id, categories:category_id(name, branch)")
    .eq("id", tournamentCategoryId)
    .maybeSingle();
  if (stageError) {
    logSupabaseDataError("participant stage category lookup", stageError);
    throw createDataError("No pudimos cargar la categoria del torneo.", { cause: stageError });
  }
  effectiveCategoryId = effectiveCategoryId || stage?.category_id || null;
  tournamentCategoryName = categoryLabel(stage?.categories);
  const [rows, ranking] = await Promise.all([
    fetchTournamentCategoryParticipantRows(tournamentCategoryId),
    withRanking && effectiveCategoryId ? rankingService.getEffectiveRankingOrder(effectiveCategoryId) : Promise.resolve({ entries: [] }),
  ]);
  const rankingMap = new Map((ranking.entries || []).map((entry) => [entry.playerId, { position: entry.position, points: entry.points }]));
  const seen = new Set();
  return rows
    .map((registration, index) => mapDbPlayer(registration.players, rankingMap, index + 999))
    .filter((player) => {
      if (!player?.id || seen.has(player.id)) return false;
      seen.add(player.id);
      return true;
    })
    .map((player) => ({
      ...player,
      tournamentCategoryId,
      tournamentCategoryName,
      categoryName: tournamentCategoryName || player.categoryName || "",
    }));
}

function normalizeDbStatus(status, resultType = "NORMAL") {
  if (resultType === "BYE") return "finished";
  const normalized = String(status || "").toLowerCase();
  if (["finalizado", "finished"].includes(normalized)) return "finished";
  if (["programado", "scheduled"].includes(normalized)) return "scheduled";
  if (["en juego", "in_progress"].includes(normalized)) return "in_progress";
  if (["reprogramado", "rescheduled"].includes(normalized)) return "rescheduled";
  if (["suspendido", "suspended"].includes(normalized)) return "suspended";
  if (["doble w.o.", "double w.o.", "standby"].includes(normalized)) return "standby";
  return "pending";
}

function uiSetToPayload(set, index) {
  return {
    setNumber: Number(set.setNumber || index + 1),
    player1Score: Number(set.player1Score ?? set.playerAScore ?? set.playerA ?? set.a ?? 0),
    player2Score: Number(set.player2Score ?? set.playerBScore ?? set.playerB ?? set.b ?? 0),
    type: set.type || (set.superTieBreak ? "super_tiebreak" : "set"),
  };
}

function getResultType(match) {
  if (match.resultDetail?.type) return match.resultDetail.type;
  if (match.bye) return "BYE";
  return "NORMAL";
}

function getResultText(match) {
  if (match.result) return match.result;
  if (match.sets?.length) return formatResultSets(match.sets);
  return null;
}

function matchPlayerName(match, slot) {
  return slot === 1 ? match.playerA : match.playerB;
}

function matchPlayerId(match, slot) {
  return slot === 1 ? match.playerAId : match.playerBId;
}

function makeTempId(prefix, ...parts) {
  return [prefix, ...parts].filter((part) => part !== null && part !== undefined && part !== "").join("::");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function readRoundMatchTempId(round, match, matchIndex) {
  return match.matchId || makeTempId("round", round.id || round.name, match.id || matchIndex + 1);
}

function collectRoundMatches(bracket, matchMap) {
  (bracket.rounds || []).forEach((round, roundIndex) => {
    (round.matches || []).forEach((match, matchIndex) => {
      const tempId = readRoundMatchTempId(round, match, matchIndex);
      match.matchId = tempId;
      if (matchMap.has(tempId)) return;
      matchMap.set(tempId, {
        tempId,
        phase: "Cuadro principal",
        roundName: round.name,
        roundIndex,
        bracketSlot: matchIndex + 1,
        status: "pending",
        player1Id: match.playerAId || null,
        player2Id: match.playerBId || null,
        resultType: "NORMAL",
        resultText: null,
        resultDetail: {},
        sets: [],
        metadata: {
          bracketMatchId: match.id,
          connectionNote: match.connectionNote || null,
          playerALabel: match.playerA || null,
          playerBLabel: match.playerB || null,
        },
      });
    });
  });
}

function collectPhysicalMatches(db, bracket, matchMap) {
  const zoneByName = new Map((bracket.zones || []).map((zone) => [zone.name, zone.id]));
  db.matches.forEach((match) => {
    const resultType = getResultType(match);
    matchMap.set(match.id, {
      tempId: match.id,
      phase: match.phase === "BYE" ? "Cuadro principal" : match.phase || "Cuadro principal",
      roundName: match.round || match.phase,
      roundIndex: 0,
      bracketSlot: 0,
      status: normalizeDbStatus(match.status, resultType),
      player1Id: match.playerAId || null,
      player2Id: match.playerBId || null,
      winnerId: match.winnerId || null,
      loserId: match.loserId || null,
      resultType,
      resultText: getResultText(match),
      resultDetail: match.resultDetail || {},
      zoneTempId: match.phase === "Zonas" ? zoneByName.get(match.round) || null : null,
      sets: (match.sets || []).map(uiSetToPayload),
      metadata: {
        connectionNote: match.connectionNote || null,
        bye: Boolean(match.bye),
        byeSource: match.byeSource || null,
        playerALabel: match.playerA || null,
        playerBLabel: match.playerB || null,
      },
    });
  });
}

function collectPreliminaryByes(bracket, matchMap) {
  (bracket.preliminaries || []).forEach((match, index) => {
    if (!match.bye || match.matchId) return;
    const tempId = makeTempId("preliminary-bye", match.byePlayerId || match.playerA || index + 1);
    match.matchId = tempId;
    matchMap.set(tempId, {
      tempId,
      phase: "Preliminar",
      roundName: "Preliminar",
      roundIndex: -1,
      bracketSlot: index + 1,
      status: "finished",
      player1Id: match.byePlayerId || null,
      player2Id: null,
      winnerId: match.byePlayerId || null,
      loserId: null,
      resultType: "BYE",
      resultText: "6-0 / 6-0",
      resultDetail: { type: "BYE", source: "Preliminar", note: match.result || "Clasifica directo por ranking de categoria." },
      sets: [
        { setNumber: 1, player1Score: 6, player2Score: 0, type: "set" },
        { setNumber: 2, player1Score: 6, player2Score: 0, type: "set" },
      ],
      metadata: {
        bye: true,
        playerALabel: match.playerA || null,
        playerBLabel: "BYE",
      },
    });
  });
}

function enrichRoundMetadata(bracket, matchMap) {
  (bracket.rounds || []).forEach((round, roundIndex) => {
    (round.matches || []).forEach((match, matchIndex) => {
      const tempId = readRoundMatchTempId(round, match, matchIndex);
      const entry = matchMap.get(tempId);
      if (!entry) return;
      entry.roundIndex = roundIndex;
      entry.bracketSlot = matchIndex + 1;
      entry.metadata = {
        ...(entry.metadata || {}),
        bracketMatchId: match.id,
        connectionNote: match.connectionNote || entry.metadata?.connectionNote || null,
        playerALabel: match.playerA || entry.metadata?.playerALabel || null,
        playerBLabel: match.playerB || entry.metadata?.playerBLabel || null,
      };
    });
  });
}

function findChildByWinnerLabel(parentRound, parentIndex, nextRound) {
  const label = `Ganador ${parentRound.name} ${parentIndex + 1}`;
  for (const [childIndex, childMatch] of (nextRound.matches || []).entries()) {
    if (matchPlayerName(childMatch, 1) === label) return { childMatch, childIndex, childSlot: 1 };
    if (matchPlayerName(childMatch, 2) === label) return { childMatch, childIndex, childSlot: 2 };
  }
  return null;
}

function fallbackChild(parentRound, parentIndex, nextRound) {
  const isRoundOf32 = String(parentRound.id || parentRound.name || "").includes("32");
  const childIndex = isRoundOf32 && nextRound.matches.length > 1
    ? (parentIndex === 0 ? 0 : nextRound.matches.length - 1)
    : Math.floor(parentIndex / 2);
  const childMatch = nextRound.matches[childIndex];
  if (!childMatch) return null;
  return {
    childMatch,
    childIndex,
    childSlot: isRoundOf32 ? 2 : (parentIndex % 2 === 0 ? 1 : 2),
  };
}

function buildConnections(bracket) {
  const connections = [];
  const seen = new Set();
  const rounds = bracket.rounds || [];
  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    const round = rounds[roundIndex];
    const nextRound = rounds[roundIndex + 1];
    (round.matches || []).forEach((match, matchIndex) => {
      const parentTempId = readRoundMatchTempId(round, match, matchIndex);
      const child = findChildByWinnerLabel(round, matchIndex, nextRound) || fallbackChild(round, matchIndex, nextRound);
      if (!child) return;
      const childTempId = readRoundMatchTempId(nextRound, child.childMatch, child.childIndex);
      if (!parentTempId || !childTempId || parentTempId === childTempId) return;
      const key = `${parentTempId}->${childTempId}:${child.childSlot}`;
      if (seen.has(key)) return;
      seen.add(key);
      connections.push({ parentTempId, childTempId, childSlot: child.childSlot });
    });
  }
  return connections;
}

function buildPreliminaryRankings(bracket, db) {
  const rows = [];
  (bracket.preliminaries || []).forEach((match, index) => {
    if (!match.byePlayerId) return;
    rows.push({
      playerId: match.byePlayerId,
      matchTempId: match.matchId || null,
      position: index + 1,
      role: "bye_preliminar",
      won: true,
      performanceScore: 0,
      setsWon: 2,
      setsLost: 0,
      gamesWon: 12,
      gamesLost: 0,
    });
  });
  db.matches
    .filter((match) => match.phase === "Preliminar" && match.winnerId)
    .forEach((match, index) => {
      const totals = {
        [match.playerAId]: { setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 },
        [match.playerBId]: { setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 },
      };
      (match.sets || []).forEach((set) => {
        const a = Number(set.playerAScore ?? set.playerA ?? set.a ?? 0);
        const b = Number(set.playerBScore ?? set.playerB ?? set.b ?? 0);
        totals[match.playerAId].gamesWon += a;
        totals[match.playerAId].gamesLost += b;
        totals[match.playerBId].gamesWon += b;
        totals[match.playerBId].gamesLost += a;
        if (a > b) {
          totals[match.playerAId].setsWon += 1;
          totals[match.playerBId].setsLost += 1;
        } else if (b > a) {
          totals[match.playerBId].setsWon += 1;
          totals[match.playerAId].setsLost += 1;
        }
      });
      [match.playerAId, match.playerBId].filter(Boolean).forEach((playerId) => {
        const won = match.winnerId === playerId;
        const metrics = totals[playerId] || {};
        rows.push({
          playerId,
          matchTempId: match.id,
          position: index + 1,
          role: won ? "ganador_preliminar" : "perdedor_preliminar",
          won,
          performanceScore: won ? (match.preliminaryScore ?? 0) : (match.loserPreliminaryScore ?? 0),
          setsWon: metrics.setsWon || 0,
          setsLost: metrics.setsLost || 0,
          gamesWon: metrics.gamesWon || 0,
          gamesLost: metrics.gamesLost || 0,
        });
      });
    });
  return rows;
}

function applyDbIdsToBracket(bracket, rpcResult) {
  const matchIds = rpcResult?.matchIds || {};
  const zoneIds = rpcResult?.zoneIds || {};
  const copy = cloneJson(bracket);
  (copy.preliminaries || []).forEach((match) => {
    if (match.matchId && matchIds[match.matchId]) match.matchId = matchIds[match.matchId];
  });
  (copy.directByes || []).forEach((match) => {
    if (match.matchId && matchIds[match.matchId]) match.matchId = matchIds[match.matchId];
  });
  (copy.rounds || []).forEach((round) => {
    (round.matches || []).forEach((match) => {
      if (match.matchId && matchIds[match.matchId]) match.matchId = matchIds[match.matchId];
    });
  });
  (copy.zones || []).forEach((zone) => {
    zone.tempId = zone.id;
    if (zone.id && zoneIds[zone.id]) zone.id = zoneIds[zone.id];
  });
  return copy;
}

function buildPayload(db, bracket, stage, options = {}) {
  const matchMap = new Map();
  collectPhysicalMatches(db, bracket, matchMap);
  collectRoundMatches(bracket, matchMap);
  collectPreliminaryByes(bracket, matchMap);
  enrichRoundMetadata(bracket, matchMap);

  const zones = (bracket.zones || []).map((zone) => ({
    tempId: zone.id,
    name: zone.name,
    qualifiersCount: Number(zone.qualifiers || 1),
    status: zone.status === "Finalizada" ? "finished" : "pending",
    players: (zone.playerIds || []).map((playerId, index) => ({
      playerId,
      seedOrder: index + 1,
      finalPosition: null,
      qualified: false,
      statsSnapshot: {},
    })),
  }));

  const bracketData = cloneJson(bracket);
  return {
    format: stage.format,
    size: (bracket.rounds?.[0]?.matches?.length || 0) * 2 || stage.participants?.length || 0,
    stageLabel: stage.format === "Zonas" ? "Zonas en juego" : "Cuadro generado",
    stageMetadata: {
      participants: stage.participants || [],
      inscriptionsCount: stage.inscriptionsCount || 0,
      bracketKey: stage.bracketKey,
      zonesConfig: stage.zonesConfig || null,
    },
    bracketData,
    zones,
    matches: [...matchMap.values()],
    connections: buildConnections(bracket),
    preliminaryRankings: buildPreliminaryRankings(bracket, db),
    allowFinishedPreliminaries: Boolean(options.allowFinishedPreliminaries),
  };
}

function validateFormat(stage) {
  if (!stage?.participants?.length) throw createDataError("No hay inscriptos para generar esta categoria.");
  if (stage.formatStatus && stage.formatStatus !== "confirmed") throw createDataError("Confirmá el formato antes de generar la fase.");
  if (!TOURNAMENT_FORMATS.includes(stage.format)) throw createDataError("El formato de la categoria no es valido.");
}

async function fetchStageSeed(tournamentId, categoryId) {
  const client = ensureSupabaseDataClient();
  const [{ data: tournament, error: tournamentError }, { data: stage, error: stageError }] = await Promise.all([
    client.from("tournaments").select(tournamentSelect).eq("id", tournamentId).maybeSingle(),
    client.from("tournament_categories").select(stageSelect).eq("tournament_id", tournamentId).eq("category_id", categoryId).maybeSingle(),
  ]);
  if (tournamentError) {
    logSupabaseDataError("stage tournament lookup", tournamentError);
    throw createDataError("No pudimos cargar el torneo.", { cause: tournamentError });
  }
  if (stageError) {
    logSupabaseDataError("stage category lookup", stageError);
    throw createDataError("No pudimos cargar la categoria del torneo.", { cause: stageError });
  }
  if (!tournament || !stage) throw createDataError("No encontramos la categoria del torneo.");
  return { tournament, stage };
}

async function fetchParticipants(tournamentId, stage) {
  return getTournamentCategoryParticipants(stage.id, { categoryId: stage.category_id });
}

function buildVirtualDb({ tournament, stage, players }) {
  const category = stage.categories;
  const stageModel = {
    id: stage.id,
    tournamentId: tournament.id,
    categoryId: stage.category_id,
    categoryName: categoryLabel(category),
    status: stage.status || "Formato confirmado",
    format: stage.format || "",
    formatStatus: stage.format_status || "pending",
    formatDecision: stage.format_decision || "",
    recommendedFormat: stage.recommended_format || "",
    matchFormat: stage.match_format || tournament.match_format || DEFAULT_MATCH_FORMAT,
    participants: players.map((player) => player.id),
    inscriptionsCount: players.length,
    zonesConfig: stage.metadata?.zonesConfig || null,
    bracketKey: stage.metadata?.bracketKey || `${tournament.id}::${stage.category_id}`,
    progress: null,
  };
  return {
    tournaments: [{
      id: tournament.id,
      name: tournament.name,
      matchFormat: tournament.match_format || DEFAULT_MATCH_FORMAT,
      categories: [stage.category_id],
      categoryStages: [stageModel],
      participants: players.map((player) => player.id),
    }],
    categories: [{
      id: category.id,
      name: category.name,
      branch: category.branch || "",
      level: category.level || 1,
      status: category.is_active ? "Activa" : "Inactiva",
    }],
    players,
    enrollments: players.map((player) => ({
      id: `${stage.id}-${player.id}`,
      tournamentId: tournament.id,
      categoryId: stage.category_id,
      playerId: player.id,
      status: "Confirmada",
    })),
    matches: [],
    brackets: {},
  };
}

async function persistGeneratedStage(tournamentId, categoryId, db, bracket, stage, options = {}) {
  const client = ensureSupabaseDataClient();
  const payload = buildPayload(db, bracket, stage, options);
  const { data: rpcData, error } = await client.rpc("persist_tournament_stage", {
    p_tournament_id: tournamentId,
    p_category_id: categoryId,
    p_payload: payload,
  });
  if (error) {
    logSupabaseDataError("persist tournament stage", error);
    throw createDataError("No pudimos persistir la fase generada.", { cause: error });
  }
  return applyDbIdsToBracket(payload.bracketData, rpcData);
}

function setsFromRow(row) {
  return [...(row.match_sets || [])]
    .sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0))
    .map((set) => ({
      playerAScore: Number(set.player1_score || 0),
      playerBScore: Number(set.player2_score || 0),
      type: set.set_type || "set",
    }));
}

function buildZoneStandings(zone, zoneMatches, playersById) {
  const rows = (zone.zone_players || []).map((item) => {
    const player = playersById.get(item.player_id) || item.players;
    return {
      playerId: item.player_id,
      id: item.player_id,
      playerName: fullName(player),
      fullName: fullName(player),
      ranking: item.seed_order || 9999,
      played: 0,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      position: 0,
      qualified: false,
    };
  });
  const byId = new Map(rows.map((row) => [row.playerId, row]));
  zoneMatches
    .filter((match) => match.status === "finished" && match.winner_id)
    .forEach((match) => {
      const rowA = byId.get(match.player1_id);
      const rowB = byId.get(match.player2_id);
      if (!rowA || !rowB) return;
      rowA.played += 1;
      rowB.played += 1;
      if (match.winner_id === match.player1_id) {
        rowA.wins += 1;
        rowB.losses += 1;
      } else {
        rowB.wins += 1;
        rowA.losses += 1;
      }
      setsFromRow(match).forEach((set) => {
        rowA.gamesWon += set.playerAScore;
        rowA.gamesLost += set.playerBScore;
        rowB.gamesWon += set.playerBScore;
        rowB.gamesLost += set.playerAScore;
        if (set.playerAScore > set.playerBScore) {
          rowA.setsWon += 1;
          rowB.setsLost += 1;
        } else {
          rowB.setsWon += 1;
          rowA.setsLost += 1;
        }
      });
    });
  rows.sort((a, b) =>
    b.wins - a.wins
    || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)
    || (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost)
    || a.ranking - b.ranking
  );
  rows.forEach((row, index) => {
    row.position = index + 1;
    row.zonePoints = row.wins;
  });
  return rows;
}

async function loadPersistedVirtualDb(tournamentId, categoryId) {
  const client = ensureSupabaseDataClient();
  const { tournament, stage } = await fetchStageSeed(tournamentId, categoryId);
  const { data, error } = await client
    .from("tournament_categories")
    .select(persistedStageSelect)
    .eq("tournament_id", tournamentId)
    .eq("category_id", categoryId)
    .maybeSingle();
  if (error) {
    logSupabaseDataError("load persisted stage", error);
    throw createDataError("No pudimos cargar la fase persistida.", { cause: error });
  }
  const participants = await fetchParticipants(tournamentId, stage);
  const db = buildVirtualDb({ tournament, stage, players: participants });
  const playersById = new Map(participants.map((player) => [player.id, player]));
  const bracket = cloneJson(data?.brackets?.[0]?.bracket_data || {});
  bracket.zones = (data?.zones || []).map((zone) => {
    const zoneMatches = (data?.matches || []).filter((match) => match.zone_id === zone.id);
    const standings = buildZoneStandings(zone, zoneMatches, playersById);
    return {
      id: zone.id,
      name: zone.name,
      qualifiers: zone.qualifiers_count,
      players: (zone.zone_players || []).map((item) => fullName(playersById.get(item.player_id) || item.players)),
      playerIds: (zone.zone_players || []).map((item) => item.player_id),
      size: (zone.zone_players || []).length,
      status: zone.status,
      standings,
    };
  });
  db.matches = (data?.matches || []).map((match) => ({
    id: match.metadata?.temporaryId || match.id,
    tournamentId,
    categoryId,
    round: match.round_name,
    phase: match.phase,
    playerAId: match.player1_id,
    playerBId: match.player2_id,
    playerA: fullName(playersById.get(match.player1_id)),
    playerB: match.result_type === "BYE" ? "BYE" : fullName(playersById.get(match.player2_id)),
    status: match.status === "finished" ? "Finalizado" : "Pendiente",
    result: match.result_text,
    resultDetail: match.result_detail,
    sets: setsFromRow(match),
    winnerId: match.winner_id,
    loserId: match.loser_id,
    preliminaryScore: match.result_detail?.preliminaryScore,
    loserPreliminaryScore: match.result_detail?.loserPreliminaryScore,
  }));
  return { db, tournament: db.tournaments[0], stage: db.tournaments[0].categoryStages[0], bracket };
}

export const tournamentStageService = {
  async generateDirectEliminationStage(tournamentId, categoryId) {
    return this.generateStage(tournamentId, categoryId);
  },

  async generatePreliminaryStage(tournamentId, categoryId) {
    return this.generateStage(tournamentId, categoryId);
  },

  async generateZoneStage(tournamentId, categoryId) {
    return this.generateStage(tournamentId, categoryId);
  },

  async generateStage(tournamentId, categoryId) {
    const { tournament, stage } = await fetchStageSeed(tournamentId, categoryId);
    const players = await fetchParticipants(tournamentId, stage);
    const db = buildVirtualDb({ tournament, stage, players });
    const virtualStage = db.tournaments[0].categoryStages[0];
    validateFormat(virtualStage);

    if (virtualStage.format === "Preliminar") {
      const persisted = await loadPersistedVirtualDb(tournamentId, categoryId);
      const preliminaries = persisted.db.matches.filter((match) => match.phase === "Preliminar");
      const canBuildMain = preliminaries.length > 0 && preliminaries.every((match) => match.status === "Finalizado" && match.winnerId);
      if (canBuildMain) {
        const bracketFromPreliminaries = buildPreliminaryBracketFromResults(persisted.db, persisted.tournament, categoryId);
        if (bracketFromPreliminaries) {
          return persistGeneratedStage(tournamentId, categoryId, persisted.db, bracketFromPreliminaries, persisted.stage, {
            allowFinishedPreliminaries: true,
          });
        }
      }
    }

    const bracket = generateCategoryBracketInDb(db, tournamentId, categoryId);
    if (!bracket) throw createDataError("No pudimos generar la estructura deportiva.");
    return persistGeneratedStage(tournamentId, categoryId, db, bracket, virtualStage);
  },

  async generateAllCategoryStages(tournamentId) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.from("tournament_categories").select("id, category_id").eq("tournament_id", tournamentId);
    if (error) {
      logSupabaseDataError("stage categories list", error);
      throw createDataError("No pudimos cargar las categorias del torneo.", { cause: error });
    }
    const generated = [];
    for (const row of data || []) {
      const participants = await getTournamentCategoryParticipants(row.id, { categoryId: row.category_id, withRanking: false });
      if (!participants.length) continue;
      generated.push(await this.generateStage(tournamentId, row.category_id));
    }
    return generated;
  },

  async updateZoneQualifiers(tournamentId, categoryId, zoneId, qualifiers) {
    const client = ensureSupabaseDataClient();
    const value = Number(qualifiers);
    if (![1, 2].includes(value)) throw createDataError("La cantidad de clasificados por zona debe ser 1 o 2.");
    const { data: stage, error: stageError } = await client
      .from("tournament_categories")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("category_id", categoryId)
      .maybeSingle();
    if (stageError) {
      logSupabaseDataError("zone qualifiers stage", stageError);
      throw createDataError("No pudimos actualizar clasificados por zona.", { cause: stageError });
    }
    if (!stage?.id) throw createDataError("No encontramos la categoria del torneo.");
    const { data: bracket, error: bracketError } = await client
      .from("brackets")
      .select("id, bracket_data")
      .eq("tournament_id", tournamentId)
      .eq("tournament_category_id", stage.id)
      .maybeSingle();
    if (bracketError) {
      logSupabaseDataError("zone qualifiers bracket", bracketError);
      throw createDataError("No pudimos actualizar clasificados por zona.", { cause: bracketError });
    }
    const data = cloneJson(bracket?.bracket_data || {});
    const zone = (data.zones || []).find((item) => item.id === zoneId || item.tempId === zoneId);
    if (!zone) throw createDataError("No encontramos la zona.");
    zone.qualifiers = value;
    data.rounds = [];
    data.zoneGeneratedAt = null;
    const { error } = await client.from("brackets").update({ bracket_data: data }).eq("id", bracket.id);
    if (error) {
      logSupabaseDataError("zone qualifiers bracket update", error);
      throw createDataError("No pudimos actualizar clasificados por zona.", { cause: error });
    }
    const zoneDbId = zone.id || zoneId;
    const { error: zoneError } = await client.from("zones").update({ qualifiers_count: value, status: "pending" }).eq("id", zoneDbId);
    if (zoneError) {
      logSupabaseDataError("zone qualifiers row update", zoneError);
      throw createDataError("No pudimos actualizar la zona.", { cause: zoneError });
    }
    return data;
  },

  async generateZoneEliminationStage(tournamentId, categoryId) {
    const { db, tournament, stage, bracket } = await loadPersistedVirtualDb(tournamentId, categoryId);
    if (stage.format !== "Zonas") throw createDataError("La categoria no utiliza formato Zonas.");
    const result = buildZoneEliminationBracket(db, tournament, stage, bracket);
    if (!result?.ok) return result;
    const persistedBracket = await persistGeneratedStage(tournamentId, categoryId, db, result.bracket, stage);
    return { ...result, bracket: persistedBracket };
  },

  async loadTournamentCategoryStage(tournamentId, categoryId) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("tournament_categories")
      .select(persistedStageSelect)
      .eq("tournament_id", tournamentId)
      .eq("category_id", categoryId)
      .maybeSingle();
    if (error) {
      logSupabaseDataError("load tournament category stage", error);
      throw createDataError("No pudimos cargar la fase.", { cause: error });
    }
    return data;
  },

  async lockStage(tournamentCategoryId) {
    const client = ensureSupabaseDataClient();
    const { error } = await client
      .from("tournament_categories")
      .update({ stage_status: "locked", locked_at: new Date().toISOString() })
      .eq("id", tournamentCategoryId);
    if (error) {
      logSupabaseDataError("lock stage", error);
      throw createDataError("No pudimos bloquear la fase.", { cause: error });
    }
    return true;
  },

  async finalizeStage(tournamentCategoryId) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("finalize_tournament_category", {
      p_tournament_category_id: tournamentCategoryId,
    });
    if (error) {
      logSupabaseDataError("finalize tournament category", error);
      throw createDataError("No pudimos finalizar la categoria.", { cause: error });
    }
    return data;
  },
};
