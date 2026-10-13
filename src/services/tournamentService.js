import { canPlayerRegisterInCategory } from "../utils/categoryRules";
import { DEFAULT_MATCH_FORMAT, formatResultSets, normalizeMatchFormat } from "../utils/matchFormat";
import { hasRealSportingResult } from "../utils/sportingResults";
import { auditService } from "./auditService";
import { categoryService } from "./categoryService";
import { emailService } from "./emailService";
import { playerService } from "./playerService";
import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";
import { getPublicTournamentCategoryParticipants, getTournamentCategoryParticipants, tournamentStageService } from "./tournamentStageService";
import { schedulingService } from "./schedulingService";
import { recommendTournamentFormat, TOURNAMENT_FORMATS } from "./tournamentCategoryService";
import { countParticipantsByTournamentCategory } from "../utils/tournamentParticipantCounts";

function isOpenTournament(tournament) {
  return tournament?.status === "Inscripciones abiertas";
}

function tournamentDateValue(tournament) {
  const date = tournament?.startDate || tournament?.finalsDate || tournament?.createdAt || "";
  const value = Date.parse(`${date}T12:00:00`);
  return Number.isNaN(value) ? 0 : value;
}

function createdDateValue(tournament) {
  const value = Date.parse(tournament?.createdAt || tournament?.created_at || "");
  return Number.isNaN(value) ? 0 : value;
}

function sortTournamentsNewestFirst(tournaments = []) {
  return [...tournaments].sort((a, b) =>
    tournamentDateValue(b) - tournamentDateValue(a) ||
    createdDateValue(b) - createdDateValue(a) ||
    String(b.id || b.name).localeCompare(String(a.id || a.name), undefined, { numeric: true }),
  );
}

function playerFullName(player) {
  return `${player?.first_name || player?.firstName || ""} ${player?.last_name || player?.lastName || ""}`.trim();
}

function formatPreliminarySchedule(match) {
  if (!match?.scheduled_at) return "";
  const date = new Date(match.scheduled_at);
  if (Number.isNaN(date.getTime())) return "";
  const dateLabel = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
  return [dateLabel, timeLabel, match.court].filter(Boolean).join(" · ");
}

function matchStatusLabel(match, fallback = "") {
  if (match?.status === "finished") return "Finalizado";
  if (match?.status === "in_progress") return "En juego";
  if (match?.status === "scheduled") return "Programado";
  if (match?.player1_id && match?.player2_id) return "Pendiente";
  return fallback || "Pendiente";
}

function orderedSets(sets = []) {
  return [...sets]
    .sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0))
    .map((set) => ({
      playerAScore: Number(set.player1_score || 0),
      playerBScore: Number(set.player2_score || 0),
      type: set.set_type || "set",
    }));
}

function matchResultLabel(match) {
  if (match?.result_text) return match.result_text;
  const sets = orderedSets(match?.match_sets || []);
  return sets.length ? formatResultSets(sets) : "";
}

function mapMatchPlayerNames(rows = []) {
  return new Map((rows || []).map((row) => [row.match_id || row.matchId, {
    matchId: row.match_id || row.matchId,
    player1Id: row.player1_id || row.player1Id || null,
    player1Name: row.player1_name || row.player1Name || "",
    player2Id: row.player2_id || row.player2Id || null,
    player2Name: row.player2_name || row.player2Name || "",
  }]).filter(([matchId]) => Boolean(matchId)));
}

async function fetchTournamentMatchPlayerNames(client, tournamentId, categoryId = null) {
  const { data, error } = await client.rpc("game_get_tournament_match_player_names", {
    p_tournament_id: tournamentId,
    p_category_id: categoryId,
  });
  if (error) {
    logSupabaseDataError("tournament match player names", error);
    throw createDataError("No pudimos cargar los nombres del cuadro.", { cause: error });
  }
  return mapMatchPlayerNames(data || []);
}

function nameForMatchSide(namesByMatchId, matchId, side, fallbackPlayer = null, fallbackName = "") {
  const names = namesByMatchId?.get(matchId);
  const rpcName = side === "A" ? names?.player1Name : names?.player2Name;
  if (rpcName) return rpcName;
  const joinedName = playerFullName(fallbackPlayer);
  if (joinedName) return joinedName;
  return fallbackName || "";
}

function winnerNameForMatch(namesByMatchId, match, fallbackWinner = "") {
  if (!match?.winner_id) return fallbackWinner || null;
  const names = namesByMatchId?.get(match.id);
  if (match.winner_id === match.player1_id) return names?.player1Name || playerFullName(match.player1) || fallbackWinner || null;
  if (match.winner_id === match.player2_id) return names?.player2Name || playerFullName(match.player2) || fallbackWinner || null;
  return fallbackWinner || null;
}

function bracketRoundMatchIds(bracket) {
  return [...new Set((bracket?.rounds || [])
    .flatMap((round) => round.matches || [])
    .map((match) => match.matchId)
    .filter(Boolean))];
}

async function enrichBracketPreliminaries(client, bracket, tournamentCategoryId, namesByMatchId = new Map()) {
  if (!bracket?.preliminaries?.length || !tournamentCategoryId) return bracket;
  const matchIds = bracket.preliminaries.map((match) => match.matchId).filter(Boolean);
  if (!matchIds.length) return bracket;
  const { data, error } = await client
    .from("matches")
    .select(`
      id,
      status,
      scheduled_at,
      court,
      player1_id,
      player2_id,
      winner_id,
      result_type,
      result_text,
      player1:player1_id (
        first_name,
        last_name
      ),
      player2:player2_id (
        first_name,
        last_name
      )
    `)
    .eq("tournament_category_id", tournamentCategoryId)
    .in("id", matchIds);
  if (error) {
    logSupabaseDataError("tournament bracket preliminaries enrichment", error);
    return bracket;
  }
  const matchesById = new Map((data || []).map((match) => [match.id, match]));
  return {
    ...bracket,
    preliminaries: bracket.preliminaries.map((preliminary) => {
      const match = matchesById.get(preliminary.matchId);
      if (!match?.player1_id || !match?.player2_id) return preliminary;
      const playerA = nameForMatchSide(namesByMatchId, match.id, "A", match.player1, preliminary.playerA);
      const playerB = match.result_type === "BYE" ? "BYE" : nameForMatchSide(namesByMatchId, match.id, "B", match.player2, preliminary.playerB);
      const scheduleLabel = formatPreliminarySchedule(match);
      return {
        ...preliminary,
        playerA,
        playerB,
        status: matchStatusLabel(match, preliminary.status),
        winner: preliminary.winner || winnerNameForMatch(namesByMatchId, match),
        result: match.result_text || preliminary.result || scheduleLabel,
        scheduledAt: match.scheduled_at || preliminary.scheduledAt || null,
        court: match.court || preliminary.court || null,
        scheduleLabel,
      };
    }),
  };
}

async function enrichBracketZoneMatches(client, bracket, tournamentCategoryId, namesByMatchId = new Map()) {
  if (!bracket?.zones?.length || !tournamentCategoryId) return bracket;
  const { data, error } = await client
    .from("matches")
    .select(`
      id,
      zone_id,
      phase,
      round_name,
      bracket_slot,
      status,
      player1_id,
      player2_id,
      winner_id,
      result_type,
      result_text,
      result_detail,
      player1:player1_id (
        first_name,
        last_name
      ),
      player2:player2_id (
        first_name,
        last_name
      ),
      match_sets (
        set_number,
        player1_score,
        player2_score,
        set_type
      )
    `)
    .eq("tournament_category_id", tournamentCategoryId)
    .eq("phase", "Zonas");
  if (error) {
    logSupabaseDataError("tournament bracket zone matches enrichment", error);
    return bracket;
  }

  const matchesByZoneId = new Map();
  const matchesByZoneName = new Map();
  (data || [])
    .sort((a, b) =>
      String(a.round_name || "").localeCompare(String(b.round_name || ""), undefined, { numeric: true }) ||
      Number(a.bracket_slot || 0) - Number(b.bracket_slot || 0) ||
      String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
    )
    .forEach((match) => {
      const zoneMatches = matchesByZoneId.get(match.zone_id) || [];
      zoneMatches.push(match);
      matchesByZoneId.set(match.zone_id, zoneMatches);
      const namedMatches = matchesByZoneName.get(match.round_name) || [];
      namedMatches.push(match);
      matchesByZoneName.set(match.round_name, namedMatches);
    });

  return {
    ...bracket,
    zones: bracket.zones.map((zone) => {
      const zoneMatches = matchesByZoneId.get(zone.id) || matchesByZoneId.get(zone.tempId) || matchesByZoneName.get(zone.name) || [];
      if (!zoneMatches.length) return zone;
      return {
        ...zone,
        matches: zoneMatches.map((match) => ({
          id: match.id,
          playerAId: match.player1_id,
          playerA: match.player1_id ? nameForMatchSide(namesByMatchId, match.id, "A", match.player1, "A definir") : "A definir",
          playerBId: match.player2_id,
          playerB: match.result_type === "BYE"
            ? "BYE"
            : match.player2_id
              ? nameForMatchSide(namesByMatchId, match.id, "B", match.player2, "A definir")
              : "A definir",
          status: match.result_type === "WO"
            ? "W.O."
            : match.result_type === "DOUBLE_WO"
              ? "Doble W.O."
              : matchStatusLabel(match, "Pendiente"),
          result: matchResultLabel(match),
          winnerId: match.winner_id || null,
          resultType: match.result_type || "NORMAL",
          resultDetail: match.result_detail || {},
        })),
      };
    }),
  };
}

async function enrichBracketRoundMatches(client, bracket, tournamentCategoryId, namesByMatchId = new Map()) {
  const matchIds = bracketRoundMatchIds(bracket);
  if (!matchIds.length || !tournamentCategoryId) return bracket;
  const { data, error } = await client
    .from("matches")
    .select(`
      id,
      status,
      scheduled_at,
      court,
      player1_id,
      player2_id,
      winner_id,
      result_type,
      result_text,
      result_detail,
      match_sets (
        set_number,
        player1_score,
        player2_score,
        set_type
      )
    `)
    .eq("tournament_category_id", tournamentCategoryId)
    .in("id", matchIds);
  if (error) {
    logSupabaseDataError("tournament bracket round matches enrichment", error);
    return bracket;
  }
  const matchesById = new Map((data || []).map((match) => [match.id, match]));
  return {
    ...bracket,
    rounds: (bracket.rounds || []).map((round) => ({
      ...round,
      matches: (round.matches || []).map((bracketMatch) => {
        const match = matchesById.get(bracketMatch.matchId);
        if (!match) return bracketMatch;
        const playerAId = match.player1_id || bracketMatch.playerAId || null;
        const playerBId = match.player2_id || bracketMatch.playerBId || null;
        const playerA = playerAId
          ? nameForMatchSide(namesByMatchId, match.id, "A", null, bracketMatch.playerA)
          : bracketMatch.playerA;
        const playerB = match.result_type === "BYE"
          ? "BYE"
          : playerBId
            ? nameForMatchSide(namesByMatchId, match.id, "B", null, bracketMatch.playerB)
            : bracketMatch.playerB;
        return {
          ...bracketMatch,
          playerAId,
          playerBId,
          playerA,
          playerB,
          winner: winnerNameForMatch(namesByMatchId, match, bracketMatch.winner),
          score: matchResultLabel(match) || bracketMatch.score,
          result: matchResultLabel(match) || bracketMatch.result,
          status: matchStatusLabel(match, bracketMatch.status),
          scheduledAt: match.scheduled_at || bracketMatch.scheduledAt || null,
          court: match.court || bracketMatch.court || null,
          walkover: match.result_type === "WO" || bracketMatch.walkover,
          doubleWalkover: match.result_type === "DOUBLE_WO" || bracketMatch.doubleWalkover,
          bye: match.result_type === "BYE" || bracketMatch.bye,
        };
      }),
    })),
  };
}

function playerHasTournamentRelation(db, tournament, playerId) {
  if (!tournament || !playerId) return false;
  if ((tournament.participants || []).includes(playerId)) return true;
  if (db.enrollments.some((enrollment) => enrollment.tournamentId === tournament.id && enrollment.playerId === playerId && enrollment.status !== "Rechazada")) return true;
  return db.matches.some((match) => match.tournamentId === tournament.id && (match.playerAId === playerId || match.playerBId === playerId));
}

function playerCanRegisterInOpenTournament(db, tournament, playerId) {
  if (!isOpenTournament(tournament)) return false;
  const player = db.players.find((item) => item.id === playerId);
  const playerCategory = db.categories.find((category) => category.id === player?.categoryId);
  if (!player || player.status?.includes("Bloqueado")) return false;
  return (tournament.categories || []).some((categoryId) => {
    const category = db.categories.find((item) => item.id === categoryId);
    const alreadyRegistered = db.enrollments.some(
      (enrollment) =>
        enrollment.tournamentId === tournament.id &&
        enrollment.playerId === playerId &&
        enrollment.categoryId === categoryId &&
        enrollment.status !== "Rechazada",
    );
    return category?.status === "Activa" && !alreadyRegistered && canPlayerRegisterInCategory(playerCategory, category);
  });
}

const tournamentSelect = `
  id,
  name,
  description,
  start_date,
  end_date,
  registration_close_date,
  semifinals_date,
  finals_date,
  status,
  price_per_category,
  scoring_system_id,
  match_format,
  schedule,
  court_capacity,
  courts,
  phases,
  metadata,
  finalized_at,
  created_at,
  updated_at
`;

const tournamentListBaseSelect = `
  id,
  name,
  status,
  start_date,
  end_date
`;

const playerTournamentListSelect = `
  id,
  name,
  description,
  start_date,
  end_date,
  registration_close_date,
  semifinals_date,
  finals_date,
  status,
  price_per_category,
  created_at,
  updated_at
`;

const ADMIN_TOURNAMENT_LIST_SELECT = "id,name,status,start_date,end_date";

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
  created_at,
  updated_at,
  categories:category_id (
    id,
    name,
    branch,
    level,
    is_active
  )
`;

const statusToDb = {
  "Inscripciones abiertas": "open",
  "Inscripciones cerradas": "closed",
  "En juego": "in_progress",
  Finalizado: "finished",
  Cancelado: "cancelled",
};

const statusFromDb = {
  open: "Inscripciones abiertas",
  closed: "Inscripciones cerradas",
  in_progress: "En juego",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

function mapDbCategory(row) {
  const category = row?.categories || row;
  if (!category) return null;
  return {
    id: category.id,
    name: category.name,
    branch: category.branch || "Masculino",
    level: Number(category.level || 1),
    status: category.is_active ? "Activa" : "Inactiva",
    isActive: Boolean(category.is_active),
  };
}

function mapStage(row) {
  if (!row) return null;
  const category = mapDbCategory(row);
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    categoryId: row.category_id,
    categoryName: category ? `${category.name} ${category.branch}` : "",
    format: row.format || "",
    recommendedFormat: row.recommended_format || "",
    formatStatus: row.format_status || "pending",
    formatDecision: row.format_decision || "",
    matchFormat: row.match_format || DEFAULT_MATCH_FORMAT,
    status: row.status || "Formato pendiente",
    stageStatus: row.stage_status || "draft",
    generatedAt: row.generated_at,
    lockedAt: row.locked_at,
    rankingAwardedAt: row.ranking_awarded_at,
    participants: row.metadata?.participants || [],
    inscriptionsCount: Number(row.metadata?.inscriptionsCount || 0),
    bracketKey: row.metadata?.bracketKey || `${row.tournament_id}::${row.category_id}`,
    metadata: row.metadata || {},
    category,
  };
}

function withTournamentLoadMeta(error, meta) {
  return {
    ...error,
    table: meta.table || null,
    select: meta.select || null,
    filter: meta.filter || null,
  };
}

function formatTournamentServiceError(error, meta = {}) {
  return {
    table: meta.table || error.table || null,
    select: meta.select || error.select || null,
    filters: meta.filter || error.filter || null,
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
    status: error.status || null,
    stack: error.stack || null,
  };
}

function logAdminTournamentsLoadError(error, meta = {}) {
  if (!error) return;
  console.error("[GAME Tournaments] optional load warning", formatTournamentServiceError(error, meta));
}

function logAdminTournamentCreateError(error, meta = {}) {
  const dev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
  if (!dev || !error) return;
  console.error("[GAME Admin] create tournament error", {
    table: meta.table || error.table || null,
    select: meta.select || error.select || null,
    filters: meta.filter || error.filter || null,
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
    status: error.status || null,
  });
}

function logAdminTournamentDetailError(error, meta = {}) {
  const dev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
  if (!dev || !error) return;
  console.error("[GAME Admin] tournament detail load error", {
    table: meta.table || error.table || null,
    select: meta.select || error.select || null,
    filters: meta.filter || error.filter || null,
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
    status: error.status || null,
  });
}

function logTournamentDeleteError(error, meta = {}) {
  const dev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
  if (!dev || !error) return;
  console.error("[GAME Admin] tournament delete error", {
    table: meta.table || error.table || null,
    select: meta.select || error.select || null,
    filters: meta.filter || error.filter || null,
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
    status: error.status || null,
  });
}

function tournamentDeleteError(error, meta = {}) {
  const loggedError = withTournamentLoadMeta(error, meta);
  logSupabaseDataError("tournament delete", loggedError);
  logTournamentDeleteError(loggedError, meta);
  return createDataError("No pudimos eliminar el torneo. Intentá nuevamente.", { cause: loggedError });
}

async function selectDependencyIds(client, table, column, value, { select = "id", filter = `${column} eq ${value}` } = {}) {
  const { data, error } = await client.from(table).select(select).eq(column, value);
  if (error) throw tournamentDeleteError(error, { table, select, filter });
  return (data || []).map((row) => row.id).filter(Boolean);
}

async function deleteByEq(client, table, column, value) {
  const { error } = await client.from(table).delete().eq(column, value);
  if (error) throw tournamentDeleteError(error, { table, filter: `${column} eq ${value}` });
}

async function deleteByIn(client, table, column, values = []) {
  const ids = [...new Set(values.filter(Boolean))];
  if (!ids.length) return;
  const { error } = await client.from(table).delete().in(column, ids);
  if (error) throw tournamentDeleteError(error, { table, filter: `${column} in (${ids.join(",")})` });
}

function dateValue(date) {
  const value = Date.parse(`${date || ""}T12:00:00`);
  return Number.isNaN(value) ? null : value;
}

function validateTournamentDates(payload = {}) {
  const startDate = payload.startDate || payload.start_date;
  const endDate = payload.endDate || payload.end_date || payload.finalsDate || payload.finals_date;
  if (!startDate || !endDate) return;
  const startValue = dateValue(startDate);
  const endValue = dateValue(endDate);
  if (startValue !== null && endValue !== null && endValue < startValue) {
    throw createDataError("La fecha de finalizacion no puede ser anterior a la fecha de inicio del torneo.");
  }
}

function toDateInputValue(date) {
  if (!date) return "";
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

function previousDateValue(date) {
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return date || "";
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}

function normalizeTournamentDateUpdate(payload = {}) {
  const startDate = toDateInputValue(payload.startDate || payload.start_date);
  const endDate = toDateInputValue(payload.endDate || payload.end_date || payload.finalsDate || payload.finals_date);
  validateTournamentDates({ startDate, endDate });
  const semifinalsDate = endDate && startDate && dateValue(endDate) > dateValue(startDate)
    ? previousDateValue(endDate)
    : endDate;
  return {
    startDate,
    endDate,
    semifinalsDate,
    finalsDate: endDate,
  };
}

function hasTournamentStartedMatch(match) {
  if (match?.result_type === "BYE") return false;
  return ["finished", "in_progress", "standby"].includes(match?.status) || Boolean(match?.winner_id);
}

function matchFormatsEqual(left, right) {
  return JSON.stringify(normalizeMatchFormat(left || DEFAULT_MATCH_FORMAT)) === JSON.stringify(normalizeMatchFormat(right || DEFAULT_MATCH_FORMAT));
}

function validateMatchFormatUpdate(format) {
  const normalized = normalizeMatchFormat(format || DEFAULT_MATCH_FORMAT);
  if (!Number.isInteger(normalized.bestOfSets) || normalized.bestOfSets < 1 || normalized.bestOfSets > 5) {
    throw createDataError("La cantidad de sets debe estar entre 1 y 5.");
  }
  if (!Number.isInteger(normalized.gamesPerSet) || normalized.gamesPerSet < 1) {
    throw createDataError("Los games por set deben ser un numero valido.");
  }
  return normalized;
}

function normalizeParticipantIds(playerIds = []) {
  return [...new Set((playerIds || []).filter(Boolean).map(String))].sort();
}

function participantSignature(playerIds = []) {
  return normalizeParticipantIds(playerIds).join("|");
}

function stageBaselineParticipantIds(stage) {
  const snapshot = stage?.metadata?.reopenParticipantSnapshot;
  if (Array.isArray(snapshot?.participantIds)) return snapshot.participantIds;
  if (Array.isArray(stage?.metadata?.participants)) return stage.metadata.participants;
  if (Array.isArray(stage?.participants)) return stage.participants;
  return [];
}

function hasExceptionalRegenerationAuthorization(stage) {
  const authorization = stage?.metadata?.exceptionalRegeneration;
  return Boolean(authorization?.enabled && !authorization?.consumedAt);
}

async function fetchParticipantSignaturesForStageIds(stageIds = []) {
  const ids = [...new Set(stageIds.filter(Boolean))];
  const empty = new Map(ids.map((id) => [id, { participantIds: [], signature: "", count: 0 }]));
  if (!ids.length) return empty;
  const client = ensureSupabaseDataClient();
  const selectParticipantRows = `
      player_id,
      status,
      registration_categories!inner (
        tournament_category_id,
        status
      )
    `;
  const { data, error } = await client
    .from("registrations")
    .select(selectParticipantRows)
    .in("registration_categories.tournament_category_id", ids);
  if (error) {
    const loggedError = withTournamentLoadMeta(error, {
      table: "registrations",
      select: selectParticipantRows,
      filter: `registration_categories.tournament_category_id in (${ids.join(",")})`,
    });
    logSupabaseDataError("tournament category participant signatures", loggedError);
    throw createDataError("No pudimos validar cambios de participantes.", { cause: loggedError });
  }

  const byStage = new Map(ids.map((id) => [id, new Set()]));
  (data || []).forEach((registration) => {
    if (!registration?.player_id || registration.status === "cancelled") return;
    (registration.registration_categories || []).forEach((item) => {
      if (!item?.tournament_category_id || item.status === "cancelled") return;
      if (!byStage.has(item.tournament_category_id)) return;
      byStage.get(item.tournament_category_id).add(registration.player_id);
    });
  });

  return new Map([...byStage.entries()].map(([stageId, idsSet]) => {
    const participantIds = normalizeParticipantIds([...idsSet]);
    return [stageId, {
      participantIds,
      signature: participantSignature(participantIds),
      count: participantIds.length,
    }];
  }));
}

async function attachScoringSystems(rows = [], { optional = false } = {}) {
  const scoringIds = [...new Set(rows.map((row) => row.scoring_system_id).filter(Boolean))];
  if (!scoringIds.length) return rows;
  const client = ensureSupabaseDataClient();
  const selectScoringSystems = "id, name";
  const { data, error } = await client
    .from("scoring_systems")
    .select(selectScoringSystems)
    .in("id", scoringIds);
  if (error) {
    const meta = {
      table: "scoring_systems",
      select: selectScoringSystems,
      filter: `id in (${scoringIds.join(",")})`,
    };
    const loggedError = withTournamentLoadMeta(error, meta);
    if (optional) {
      logAdminTournamentsLoadError(loggedError);
      return rows;
    }
    logSupabaseDataError("tournament scoring systems", loggedError);
    throw createDataError("No pudimos cargar el sistema de puntaje del torneo.", { cause: loggedError });
  }
  const scoringById = new Map((data || []).map((item) => [item.id, item]));
  return rows.map((row) => ({
    ...row,
    scoring_systems: scoringById.get(row.scoring_system_id) || null,
  }));
}

async function attachParticipantCounts(stages = [], { optional = false } = {}) {
  const stageIds = stages.map((stage) => stage.id).filter(Boolean);
  if (!stageIds.length) return stages;
  const client = ensureSupabaseDataClient();
  const selectParticipantCounts = `
      player_id,
      status,
      registration_categories!inner (
        tournament_category_id,
        status
      )
    `;
  const { data, error } = await client
    .from("registrations")
    .select(selectParticipantCounts)
    .in("registration_categories.tournament_category_id", stageIds);
  if (error) {
    const meta = {
      table: "registrations",
      select: selectParticipantCounts,
      filter: `registration_categories.tournament_category_id in (${stageIds.join(",")})`,
    };
    const loggedError = withTournamentLoadMeta(error, meta);
    if (optional) {
      logAdminTournamentsLoadError(loggedError);
      return stages;
    }
    logSupabaseDataError("tournament category participant counts", loggedError);
    throw createDataError("No pudimos cargar las cantidades de participantes.", { cause: loggedError });
  }
  const counts = countParticipantsByTournamentCategory(data || [], stageIds);
  return stages.map((stage) => {
    const participantCount = Number(counts.get(stage.id) || 0);
    return {
      ...stage,
      inscriptionsCount: participantCount,
      recommendedFormat: stage.recommendedFormat || recommendTournamentFormat(participantCount) || "",
      formatStatus: participantCount ? stage.formatStatus : "empty",
      status: participantCount ? stage.status : "Sin inscriptos",
    };
  });
}

async function countUniqueTournamentPlayers(tournamentId) {
  if (!tournamentId) return 0;
  const client = ensureSupabaseDataClient();
  const selectUniquePlayerIds = "player_id";
  const { data, error } = await client
    .from("registrations")
    .select(selectUniquePlayerIds)
    .eq("tournament_id", tournamentId)
    .neq("status", "cancelled");
  if (error) {
    const loggedError = withTournamentLoadMeta(error, {
      table: "registrations",
      select: selectUniquePlayerIds,
      filter: `tournament_id eq ${tournamentId}, status neq cancelled`,
    });
    logSupabaseDataError("tournament unique player count", loggedError);
    throw createDataError("No pudimos contar los jugadores inscriptos.", { cause: loggedError });
  }
  return new Set((data || []).map((row) => row.player_id).filter(Boolean)).size;
}

async function getStagesForTournaments(tournamentIds = [], { optional = false } = {}) {
  const ids = [...new Set(tournamentIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const client = ensureSupabaseDataClient();
  const { data, error } = await client.from("tournament_categories").select(stageSelect).in("tournament_id", ids);
  if (error) {
    const meta = {
      table: "tournament_categories",
      select: stageSelect,
      filter: `tournament_id in (${ids.join(",")})`,
    };
    const loggedError = withTournamentLoadMeta(error, meta);
    if (optional) {
      logAdminTournamentsLoadError(loggedError);
      return new Map();
    }
    logSupabaseDataError("tournament categories list", loggedError);
    throw createDataError("No pudimos cargar las categorias del torneo.", { cause: loggedError });
  }
  const stages = await attachParticipantCounts((data || []).map(mapStage).filter(Boolean), { optional });
  const map = new Map();
  stages.forEach((stage) => {
    map.set(stage.tournamentId, [...(map.get(stage.tournamentId) || []), stage]);
  });
  return map;
}

async function fetchTournamentListRows() {
  const client = ensureSupabaseDataClient();
  const { data: baseRows, error: baseError } = await client
    .from("tournaments")
    .select(tournamentListBaseSelect)
    .order("start_date", { ascending: false });

  if (baseError) {
    const loggedError = withTournamentLoadMeta(baseError, {
      table: "tournaments",
      select: tournamentListBaseSelect,
      filter: "order start_date desc",
    });
    throw createDataError("No pudimos cargar los torneos.", { cause: loggedError });
  }

  const ids = (baseRows || []).map((row) => row.id).filter(Boolean);
  if (!ids.length) return [];

  const { data: enrichedRows, error: enrichedError } = await client
    .from("tournaments")
    .select(tournamentSelect)
    .in("id", ids);

  if (enrichedError) {
    logAdminTournamentsLoadError(withTournamentLoadMeta(enrichedError, {
      table: "tournaments",
      select: tournamentSelect,
      filter: `id in (${ids.join(",")})`,
    }));
    return baseRows || [];
  }

  const enrichedById = new Map((enrichedRows || []).map((row) => [row.id, row]));
  return (baseRows || []).map((baseRow) => ({
    ...baseRow,
    ...(enrichedById.get(baseRow.id) || {}),
  }));
}

async function fetchPlayerTournamentRows({ enrolledTournamentIds = [], includeOpen = true } = {}) {
  const client = ensureSupabaseDataClient();
  const [openResult, enrolledResult] = await Promise.all([
    includeOpen
      ? client
        .from("tournaments")
        .select(playerTournamentListSelect)
        .eq("status", "open")
        .order("start_date", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    enrolledTournamentIds.length
      ? client
        .from("tournaments")
        .select(playerTournamentListSelect)
        .in("id", enrolledTournamentIds)
        .order("start_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (openResult.error) {
    const loggedError = withTournamentLoadMeta(openResult.error, {
      table: "tournaments",
      select: playerTournamentListSelect,
      filter: "status eq open",
    });
    logSupabaseDataError("player visible tournaments open", loggedError);
    throw createDataError("No pudimos cargar los torneos disponibles.", { cause: loggedError });
  }
  if (enrolledResult.error) {
    const loggedError = withTournamentLoadMeta(enrolledResult.error, {
      table: "tournaments",
      select: playerTournamentListSelect,
      filter: `id in (${enrolledTournamentIds.join(",")})`,
    });
    logSupabaseDataError("player visible tournaments enrolled", loggedError);
    throw createDataError("No pudimos cargar tus torneos.", { cause: loggedError });
  }

  const byId = new Map();
  [...(openResult.data || []), ...(enrolledResult.data || [])].forEach((row) => {
    if (row?.id) byId.set(row.id, row);
  });
  return sortTournamentsNewestFirst([...byId.values()]);
}

async function fetchPlayerTournamentRelations(playerId) {
  if (!playerId) return [];
  const client = ensureSupabaseDataClient();
  const { data, error } = await client
    .from("registrations")
    .select("tournament_id")
    .eq("player_id", playerId)
    .neq("status", "cancelled");
  if (error) {
    logSupabaseDataError("player visible tournament relations", error);
    throw createDataError("No pudimos cargar tus torneos.", { cause: error });
  }
  return [...new Set((data || []).map((row) => row.tournament_id).filter(Boolean))];
}

function mapTournament(row, stages = []) {
  if (!row) return null;
  const categoryIds = stages.map((stage) => stage.categoryId);
  const firstStage = stages[0] || null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    registrationCloseDate: row.registration_close_date || "",
    semifinalsDate: row.semifinals_date || "",
    finalsDate: row.finals_date || "",
    status: statusFromDb[row.status] || row.status,
    price: Number(row.price_per_category || 0),
    scoringSystemId: row.scoring_system_id,
    scoringSystem: row.scoring_systems?.name || row.metadata?.scoringSystem || "",
    type: row.scoring_systems?.name || row.metadata?.type || "",
    matchFormat: row.match_format || DEFAULT_MATCH_FORMAT,
    schedule: row.schedule || {},
    courtCapacity: row.court_capacity || {},
    courts: row.courts || [],
    phases: row.phases || [],
    categories: categoryIds,
    categoryStages: stages,
    playerCategoryId: firstStage?.categoryId || null,
    playerCategoryName: firstStage?.categoryName || "",
    participants: row.metadata?.participants || [],
    finalizedAt: row.finalized_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdminTournamentListRow(row) {
  return {
    id: row.id,
    name: row.name || "Torneo sin nombre",
    status: statusFromDb[row.status] || row.status || "Sin estado",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    description: "",
    type: "",
    scoringSystem: "",
    price: 0,
    categories: [],
    categoryStages: [],
    participants: [],
  };
}

export async function getAdminTournamentList() {
  const client = ensureSupabaseDataClient();
  const { data, error } = await client
    .from("tournaments")
    .select(ADMIN_TOURNAMENT_LIST_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(mapAdminTournamentListRow);
}

function mapTournamentPayload(payload = {}) {
  return {
    name: String(payload.name || "").trim(),
    description: String(payload.description || "").trim() || null,
    start_date: payload.startDate || payload.start_date,
    end_date: payload.endDate || payload.end_date || null,
    registration_close_date: payload.registrationCloseDate || payload.registration_close_date || null,
    semifinals_date: payload.semifinalsDate || payload.semifinals_date || null,
    finals_date: payload.finalsDate || payload.finals_date || null,
    status: statusToDb[payload.status] || payload.status || "open",
    price_per_category: Number(payload.price || payload.pricePerCategory || payload.price_per_category || 0),
    scoring_system_id: payload.scoringSystemId || payload.scoring_system_id || null,
    match_format: payload.matchFormat || DEFAULT_MATCH_FORMAT,
    schedule: payload.schedule || {},
    court_capacity: payload.courtCapacity || {},
    courts: payload.courts || [],
    phases: payload.phases || [],
    metadata: {
      type: payload.type || payload.scoringSystem || "",
      scoringSystem: payload.scoringSystem || "",
      participants: payload.participants || [],
    },
  };
}

function mapTournamentUpdates(payload = {}) {
  const mapped = {};
  if ("name" in payload) mapped.name = String(payload.name || "").trim();
  if ("description" in payload) mapped.description = String(payload.description || "").trim() || null;
  if ("startDate" in payload || "start_date" in payload) mapped.start_date = payload.startDate || payload.start_date;
  if ("endDate" in payload || "end_date" in payload) mapped.end_date = payload.endDate || payload.end_date || null;
  if ("registrationCloseDate" in payload || "registration_close_date" in payload) mapped.registration_close_date = payload.registrationCloseDate || payload.registration_close_date || null;
  if ("semifinalsDate" in payload || "semifinals_date" in payload) mapped.semifinals_date = payload.semifinalsDate || payload.semifinals_date || null;
  if ("finalsDate" in payload || "finals_date" in payload) mapped.finals_date = payload.finalsDate || payload.finals_date || null;
  if ("status" in payload) mapped.status = statusToDb[payload.status] || payload.status;
  if ("price" in payload || "pricePerCategory" in payload || "price_per_category" in payload) {
    mapped.price_per_category = Number(payload.price || payload.pricePerCategory || payload.price_per_category || 0);
  }
  if ("scoringSystemId" in payload || "scoring_system_id" in payload) mapped.scoring_system_id = payload.scoringSystemId || payload.scoring_system_id || null;
  if ("matchFormat" in payload) mapped.match_format = payload.matchFormat || DEFAULT_MATCH_FORMAT;
  if ("schedule" in payload) mapped.schedule = payload.schedule || {};
  if ("courtCapacity" in payload) mapped.court_capacity = payload.courtCapacity || {};
  if ("courts" in payload) mapped.courts = payload.courts || [];
  if ("phases" in payload) mapped.phases = payload.phases || [];
  return mapped;
}

async function fetchTournament(id) {
  const client = ensureSupabaseDataClient();
  const { data, error } = await client.from("tournaments").select(tournamentSelect).eq("id", id).maybeSingle();
  if (error) {
    const loggedError = withTournamentLoadMeta(error, {
      table: "tournaments",
      select: tournamentSelect,
      filter: `id eq ${id}`,
    });
    logSupabaseDataError("tournament by id", loggedError);
    logAdminTournamentDetailError(loggedError);
    throw createDataError("No pudimos cargar el torneo.", { cause: loggedError });
  }
  if (!data) return null;
  const stages = await getStagesForTournaments([id], { optional: true });
  const [tournament] = await attachScoringSystems([data], { optional: true });
  return mapTournament(tournament, stages.get(id) || []);
}

export const tournamentService = {
  async getTournaments() {
    const tournamentRows = await attachScoringSystems(await fetchTournamentListRows(), { optional: true });
    const stages = await getStagesForTournaments(tournamentRows.map((item) => item.id), { optional: true });
    return sortTournamentsNewestFirst(tournamentRows.map((row) => mapTournament(row, stages.get(row.id) || [])));
  },
  async getVisibleTournamentsForPlayer(playerId, { currentPlayer = null } = {}) {
    const enrolledTournamentIds = await fetchPlayerTournamentRelations(playerId);
    const player = currentPlayer || await playerService.getPlayerById(playerId, { includeBenefits: false, includeDiscipline: false, includeRankings: false });
    if (!player) return [];
    const includeOpen = Boolean(player.categoryId && player.category && !player.status?.includes("Bloqueado"));
    const tournamentRows = await fetchPlayerTournamentRows({ enrolledTournamentIds, includeOpen });
    const enrolled = new Set();
    enrolledTournamentIds.forEach((tournamentId) => enrolled.add(tournamentId));
    const stages = await getStagesForTournaments(tournamentRows.map((item) => item.id), { optional: true });
    const tournaments = tournamentRows.map((row) => mapTournament(row, stages.get(row.id) || []));
    const playerCategory = player.category || null;
    return tournaments.filter((tournament) => {
      if (enrolled.has(tournament.id)) return true;
      if (!isOpenTournament(tournament) || player.status?.includes("Bloqueado")) return false;
      return tournament.categoryStages.some((stage) => stage.category?.isActive && canPlayerRegisterInCategory(playerCategory, stage.category));
    });
  },
  async canPlayerAccessTournament(id, playerId) {
    const tournaments = await this.getVisibleTournamentsForPlayer(playerId);
    return tournaments.some((tournament) => tournament.id === id);
  },
  async getPlayerTournamentById(id, playerId, options = {}) {
    const canAccess = await this.getVisibleTournamentsForPlayer(playerId, options)
      .then((tournaments) => tournaments.some((tournament) => tournament.id === id));
    if (!canAccess) return null;
    return fetchTournament(id);
  },
  async getTournamentById(id) {
    return fetchTournament(id);
  },
  async getUniquePlayerCount(id) {
    return countUniqueTournamentPlayers(id);
  },
  async getTournamentBracket(id, categoryId = null) {
    const client = ensureSupabaseDataClient();
    let tournamentCategoryId = null;
    if (categoryId) {
      const { data: stage, error: stageError } = await client
        .from("tournament_categories")
        .select("id")
        .eq("tournament_id", id)
        .eq("category_id", categoryId)
        .maybeSingle();
      if (stageError) {
        logSupabaseDataError("tournament bracket stage lookup", stageError);
        throw createDataError("No pudimos cargar el cuadro.", { cause: stageError });
      }
      tournamentCategoryId = stage?.id || null;
      if (!tournamentCategoryId) return null;
    }
    let query = client
      .from("brackets")
      .select(`
        id,
        tournament_id,
        tournament_category_id,
        format,
        size,
        status,
        champion_player_id,
        runner_up_player_id,
        bracket_data,
        tournament_categories:tournament_category_id (
          category_id
        ),
        champion:champion_player_id (
          id,
          first_name,
          last_name
        )
      `)
      .eq("tournament_id", id);
    if (tournamentCategoryId) query = query.eq("tournament_category_id", tournamentCategoryId);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      logSupabaseDataError("tournament bracket", error);
      throw createDataError("No pudimos cargar el cuadro.", { cause: error });
    }
    if (!data) return null;
    const matchNamesById = await fetchTournamentMatchPlayerNames(client, id, categoryId || data.tournament_categories?.category_id || data.tournament_category_id);
    const preliminaryBracket = await enrichBracketPreliminaries(client, data.bracket_data || {}, data.tournament_category_id, matchNamesById);
    const zoneBracket = await enrichBracketZoneMatches(client, preliminaryBracket, data.tournament_category_id, matchNamesById);
    const bracket = await enrichBracketRoundMatches(client, zoneBracket, data.tournament_category_id, matchNamesById);
    const championName = `${data.champion?.first_name || ""} ${data.champion?.last_name || ""}`.trim();
    return {
      ...bracket,
      id: data.id,
      tournamentId: data.tournament_id,
      tournamentCategoryId: data.tournament_category_id,
      format: bracket.format || data.format,
      status: data.status,
      championPlayerId: data.champion_player_id,
      runnerUpPlayerId: data.runner_up_player_id,
      champion: bracket.champion || championName || null,
    };
  },
  async getTournamentParticipants(id, categoryId = null, options = {}) {
    const client = ensureSupabaseDataClient();
    if (categoryId) {
      const { data: stage, error: stageError } = await client
        .from("tournament_categories")
        .select("id, category_id")
        .eq("tournament_id", id)
        .eq("category_id", categoryId)
        .maybeSingle();
      if (stageError) {
        logSupabaseDataError("tournament participants stage lookup", stageError);
        throw createDataError("No pudimos cargar los participantes.", { cause: stageError });
      }
      if (!stage?.id) return [];
      return getTournamentCategoryParticipants(stage.id, { categoryId: stage.category_id, ...options });
    }
    const stages = await this.getTournamentCategoryStages(id);
    const rows = await Promise.all(stages.map((stage) => getTournamentCategoryParticipants(stage.id, { categoryId: stage.categoryId, ...options })));
    const seen = new Set();
    return rows.flat().filter((player) => {
      if (!player?.id || seen.has(player.id)) return false;
      seen.add(player.id);
      return true;
    });
  },
  async getPublicTournamentParticipants(id, categoryId = null) {
    if (!categoryId) return [];
    const client = ensureSupabaseDataClient();
    const { data: stage, error: stageError } = await client
      .from("tournament_categories")
      .select("id, category_id")
      .eq("tournament_id", id)
      .eq("category_id", categoryId)
      .maybeSingle();
    if (stageError) {
      logSupabaseDataError("public tournament participants stage lookup", {
        ...stageError,
        table: "tournament_categories",
        select: "id, category_id",
        filter: `tournament_id eq ${id}, category_id eq ${categoryId}`,
      });
      throw createDataError("No pudimos cargar los participantes.", { cause: stageError });
    }
    if (!stage?.id) return [];
    return getPublicTournamentCategoryParticipants(stage.id, { categoryId: stage.category_id });
  },
  async getTournamentCategories(id) {
    const stages = await this.getTournamentCategoryStages(id);
    return stages.map((stage) => stage.category).filter(Boolean);
  },
  async getTournamentCategoryStages(id) {
    const stages = await getStagesForTournaments([id], { optional: true });
    return stages.get(id) || [];
  },
  async createTournament(payload, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    validateTournamentDates(payload);
    const { data, error } = await client.from("tournaments").insert(mapTournamentPayload(payload)).select(tournamentSelect).single();
    if (error) {
      const loggedError = withTournamentLoadMeta(error, {
        table: "tournaments",
        select: tournamentSelect,
        filter: "insert tournament",
      });
      logSupabaseDataError("tournament create", loggedError);
      logAdminTournamentCreateError(loggedError);
      throw createDataError("No pudimos crear el torneo.", { cause: error });
    }
    const tournamentId = data.id;
    const categoryIds = [...new Set(payload.categories || [])];
    try {
      if (categoryIds.length) {
        const rows = categoryIds.map((categoryId) => {
          const stage = (payload.categoryStages || []).find((item) => item.categoryId === categoryId) || {};
          return {
            tournament_id: tournamentId,
            category_id: categoryId,
            format: stage.format || null,
            recommended_format: stage.recommendedFormat || stage.recommended_format || null,
            format_status: stage.formatStatus || "pending",
            format_decision: stage.formatDecision || null,
            match_format: stage.matchFormat || payload.matchFormat || DEFAULT_MATCH_FORMAT,
            status: stage.status || "Formato pendiente",
            metadata: {
              participants: stage.participants || [],
              inscriptionsCount: stage.inscriptionsCount || 0,
              bracketKey: stage.bracketKey || `${tournamentId}::${categoryId}`,
            },
          };
        });
        const { error: categoryError } = await client.from("tournament_categories").insert(rows);
        if (categoryError) {
          const loggedError = withTournamentLoadMeta(categoryError, {
            table: "tournament_categories",
            select: "insert tournament category rows",
            filter: `tournament_id eq ${tournamentId}`,
          });
          logSupabaseDataError("tournament categories create", loggedError);
          logAdminTournamentCreateError(loggedError);
          throw createDataError("No pudimos asociar categorias al torneo.", { cause: loggedError });
        }
      }
    } catch (createError) {
      const { error: rollbackError } = await client.from("tournaments").delete().eq("id", tournamentId);
      if (rollbackError) logAdminTournamentCreateError(rollbackError, { table: "tournaments", filter: `rollback id eq ${tournamentId}` });
      throw createError;
    }
    const tournament = await fetchTournament(tournamentId);
    await auditService.record({
      action: "create_tournament",
      entityType: "tournament",
      entityId: tournament.id,
      description: `Torneo creado: ${tournament.name}`,
      actor,
    });
    if (tournament.status === "Inscripciones abiertas") {
      const { error: emailQueueError } = await client.rpc("game_enqueue_tournament_open_emails", { p_tournament_id: tournament.id });
      if (emailQueueError) logSupabaseDataError("tournament open email queue", emailQueueError);
      emailService.processQueuedGameEmails("tournament_open");
    }
    return tournament;
  },
  async updateTournament(id, updates, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    validateTournamentDates(updates);
    const { error } = await client.from("tournaments").update(mapTournamentUpdates(updates)).eq("id", id);
    if (error) {
      logSupabaseDataError("tournament update", error);
      throw createDataError("No pudimos actualizar el torneo.", { cause: error });
    }
    const tournament = await fetchTournament(id);
    await auditService.record({
      action: "update_tournament",
      entityType: "tournament",
      entityId: id,
      description: "Torneo actualizado.",
      actor,
    });
    return tournament;
  },
  async updateTournamentMatchFormat(id, matchFormat, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const normalized = validateMatchFormatUpdate(matchFormat);
    const tournament = await fetchTournament(id);
    if (!tournament) throw createDataError("No encontramos el torneo.");
    if (matchFormatsEqual(tournament.matchFormat, normalized)) return tournament;

    const { data: matches, error: matchesError } = await client
      .from("matches")
      .select(`
        id,
        status,
        result_type,
        winner_id,
        loser_id,
        result_text,
        result_detail,
        match_sets (
          id
        )
      `)
      .eq("tournament_id", id);
    if (matchesError) {
      logSupabaseDataError("tournament match format result check", matchesError);
      throw createDataError("No pudimos validar si el formato puede modificarse.", { cause: matchesError });
    }
    const sportingResults = (matches || []).filter(hasRealSportingResult);
    if (sportingResults.length) {
      throw createDataError("No se puede cambiar el formato porque ya hay resultados deportivos cargados.");
    }

    const { error: categoryError } = await client
      .from("tournament_categories")
      .update({ match_format: normalized })
      .eq("tournament_id", id);
    if (categoryError) {
      logSupabaseDataError("tournament category match format update", categoryError);
      throw createDataError("No pudimos actualizar el formato de las categorias.", { cause: categoryError });
    }

    const { error: tournamentError } = await client
      .from("tournaments")
      .update({ match_format: normalized })
      .eq("id", id);
    if (tournamentError) {
      logSupabaseDataError("tournament match format update", tournamentError);
      throw createDataError("No pudimos actualizar el formato del torneo.", { cause: tournamentError });
    }

    await auditService.record({
      action: "update_tournament_match_format",
      entityType: "tournament",
      entityId: id,
      description: "Formato de partidos actualizado sin regenerar estructura deportiva.",
      actor,
    });
    return fetchTournament(id);
  },
  async canEditTournamentDates(id) {
    const tournament = await fetchTournament(id);
    if (!tournament) return { ok: false, reason: "No encontramos el torneo." };
    if (["Finalizado", "Cancelado", "En juego"].includes(tournament.status)) {
      return { ok: false, reason: "Las fechas no pueden modificarse una vez iniciado el torneo." };
    }
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("matches")
      .select("id, status, result_type, winner_id")
      .eq("tournament_id", id);
    if (error) {
      logSupabaseDataError("tournament date edit match check", error);
      throw createDataError("No pudimos validar si las fechas pueden modificarse.", { cause: error });
    }
    if ((data || []).some(hasTournamentStartedMatch)) {
      return { ok: false, reason: "Las fechas no pueden modificarse una vez iniciado el torneo." };
    }
    return { ok: true, tournament };
  },
  async updateTournamentDates(id, updates, actor = "admin-1") {
    const validation = await this.canEditTournamentDates(id);
    if (!validation.ok) throw createDataError(validation.reason);
    const dates = normalizeTournamentDateUpdate(updates);
    if (!dates.startDate || !dates.endDate) {
      throw createDataError("Completá fecha de inicio y fecha final del torneo.");
    }
    const tournament = await this.updateTournament(id, dates, actor);
    await schedulingService.clearTournamentScheduleForDateEdit(id);
    const schedule = await schedulingService.recalculateSchedule(id, {
      preserveScheduled: false,
      startOffsetWeeks: 0,
      slotFilter: (slot) => slot.date >= dates.startDate && slot.date <= dates.endDate,
    });
    await auditService.record({
      action: "update_tournament_dates",
      entityType: "tournament",
      entityId: id,
      description: `Fechas actualizadas: ${dates.startDate} a ${dates.endDate}.`,
      actor,
    });
    return { tournament, schedule };
  },
  async closeRegistrations(id, actor = "admin-1") {
    const tournament = await this.updateTournament(id, { status: "Inscripciones cerradas" }, actor);
    const stages = await this.getTournamentCategoryStages(id);
    const signatures = await fetchParticipantSignaturesForStageIds(stages.map((stage) => stage.id));
    const changedStages = stages.filter((stage) => {
      if (stage.formatStatus !== "confirmed") return false;
      const currentSignature = signatures.get(stage.id)?.signature || "";
      const baselineSignature = participantSignature(stageBaselineParticipantIds(stage));
      return currentSignature !== baselineSignature;
    });
    const client = ensureSupabaseDataClient();

    await Promise.all(stages.map(async (stage) => {
      const current = signatures.get(stage.id) || { participantIds: [], signature: "", count: 0 };
      const participantChanged = changedStages.some((item) => item.id === stage.id);
      const metadata = {
        ...(stage.metadata || {}),
        participants: current.participantIds,
        inscriptionsCount: current.count,
        participantSignature: current.signature,
        participantSignatureUpdatedAt: new Date().toISOString(),
        reopenParticipantSnapshot: null,
        regenerationRequired: participantChanged,
        regenerationMarkedAt: participantChanged ? new Date().toISOString() : null,
        regenerationReason: participantChanged ? "participant_list_changed_after_reopen" : null,
      };
      const { error } = await client
        .from("tournament_categories")
        .update(participantChanged
          ? { stage_status: "dirty", status: "Pendiente de regeneracion", metadata }
          : {
            stage_status: stage.stageStatus,
            status: stage.status,
            metadata,
          })
        .eq("id", stage.id);
      if (error) {
        logSupabaseDataError("stage participant signature update after close", error);
        throw createDataError("No pudimos actualizar el estado de las categorias.", { cause: error });
      }
    }));

    if (!changedStages.length) return tournament;

    await auditService.record({
      action: "mark_weekly_generation_required",
      entityType: "tournament",
      entityId: id,
      description: "Categorias marcadas para generacion en el cierre semanal por cambio real de participantes.",
      actor,
    });
    return {
      ...(await fetchTournament(id)),
      regenerationResult: {
        pendingWeeklyGeneration: changedStages.length,
        generatedStages: 0,
        scheduledCount: 0,
        unscheduledCount: 0,
      },
    };
  },
  async canReopenRegistrations(id) {
    const tournament = await fetchTournament(id);
    if (!tournament) return { ok: false, reason: "No encontramos el torneo." };
    if (["Finalizado", "Cancelado", "En juego"].includes(tournament.status)) {
      return { ok: false, reason: "El torneo ya no esta en una etapa precompetitiva." };
    }
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("matches")
      .select("id, status, result_type, winner_id")
      .eq("tournament_id", id);
    if (error) {
      logSupabaseDataError("reopen registrations match check", error);
      throw createDataError("No pudimos validar si el torneo puede reabrirse.", { cause: error });
    }
    const hasPlayedMatches = (data || []).some((match) => {
      if (match.result_type === "BYE") return false;
      return ["finished", "in_progress", "standby"].includes(match.status) || Boolean(match.winner_id);
    });
    if (hasPlayedMatches) {
      return { ok: false, reason: "No se puede reabrir porque ya existen partidos jugados." };
    }
    return { ok: true, tournament };
  },
  async reopenRegistrations(id, actor = "admin-1") {
    const validation = await this.canReopenRegistrations(id);
    if (!validation.ok) throw createDataError(validation.reason);
    const client = ensureSupabaseDataClient();
    const stages = await this.getTournamentCategoryStages(id);
    const signatures = await fetchParticipantSignaturesForStageIds(stages.map((stage) => stage.id));
    const { error: tournamentError } = await client
      .from("tournaments")
      .update({ status: "open" })
      .eq("id", id);
    if (tournamentError) {
      logSupabaseDataError("tournament reopen registrations", tournamentError);
      throw createDataError("No pudimos reabrir inscripciones.", { cause: tournamentError });
    }
    for (const stage of stages) {
      const current = signatures.get(stage.id) || { participantIds: [], signature: "", count: 0 };
      const metadata = {
        ...(stage.metadata || {}),
        participants: current.participantIds,
        inscriptionsCount: current.count,
        participantSignature: current.signature,
        reopenParticipantSnapshot: {
          participantIds: current.participantIds,
          signature: current.signature,
          count: current.count,
          capturedAt: new Date().toISOString(),
        },
        regenerationRequired: false,
        regenerationMarkedAt: null,
        regenerationReason: null,
      };
      const { error: stageError } = await client
        .from("tournament_categories")
        .update({ metadata })
        .eq("id", stage.id);
      if (stageError) {
        logSupabaseDataError("stage participant snapshot after reopen", stageError);
        throw createDataError("No pudimos registrar el estado de participantes.", { cause: stageError });
      }
    }
    await auditService.record({
      action: "reopen_registrations",
      entityType: "tournament",
      entityId: id,
      description: "Inscripciones reabiertas antes del inicio de competencia.",
      actor,
    });
    emailService.processQueuedGameEmails("tournament_reopen");
    return fetchTournament(id);
  },
  async updateCategoryFormat(id, categoryId, format) {
    const client = ensureSupabaseDataClient();
    const { error } = await client
      .from("tournament_categories")
      .update({ format, format_status: "updated", status: "Formato actualizado" })
      .eq("tournament_id", id)
      .eq("category_id", categoryId);
    if (error) {
      logSupabaseDataError("tournament category format update", error);
      throw createDataError("No pudimos actualizar el formato.", { cause: error });
    }
    return fetchTournament(id);
  },
  async confirmCategoryFormat(id, categoryId, format) {
    const client = ensureSupabaseDataClient();
    const { error } = await client
      .from("tournament_categories")
      .update({ format, format_status: "confirmed", format_decision: "confirmed", status: "Formato confirmado" })
      .eq("tournament_id", id)
      .eq("category_id", categoryId);
    if (error) {
      logSupabaseDataError("tournament category format confirm", error);
      throw createDataError("No pudimos confirmar el formato.", { cause: error });
    }
    return fetchTournament(id);
  },
  async confirmAllCategoryFormats(id) {
    const client = ensureSupabaseDataClient();
    const stages = await this.getTournamentCategoryStages(id);
    const activeStages = stages.filter((stage) => Number(stage.inscriptionsCount || 0) > 0);
    const missingFormat = activeStages.find((stage) => !TOURNAMENT_FORMATS.includes(stage.format || stage.recommendedFormat || ""));
    if (missingFormat) {
      throw createDataError(`La categoria ${missingFormat.categoryName} no tiene un formato valido para confirmar.`);
    }
    const generated = [];
    const skipped = stages.filter((stage) => !Number(stage.inscriptionsCount || 0)).map((stage) => stage.categoryName);

    for (const stage of stages) {
      if (!Number(stage.inscriptionsCount || 0)) {
        const { error: emptyError } = await client
          .from("tournament_categories")
          .update({ format_status: "empty", format_decision: "empty", status: "Sin inscriptos" })
          .eq("id", stage.id);
        if (emptyError) {
          logSupabaseDataError("empty tournament category format", emptyError);
          throw createDataError("No pudimos marcar categorias sin inscriptos.", { cause: emptyError });
        }
        continue;
      }

      const format = stage.format || stage.recommendedFormat;
      const { error } = await client
        .from("tournament_categories")
        .update({ format, format_status: "confirmed", format_decision: "confirmed", status: "Formato confirmado" })
        .eq("id", stage.id);
      if (error) {
        logSupabaseDataError("tournament category formats confirm all", error);
        throw createDataError("No pudimos confirmar los formatos.", { cause: error });
      }
      generated.push(stage.categoryName);
    }

    const tournament = await fetchTournament(id);
    return {
      tournament,
      generatedCategories: generated,
      skippedCategories: skipped,
      generatedStages: 0,
      schedule: null,
      pendingWeeklyGeneration: generated.length,
    };
  },
  async generateCategoryBracket(id, categoryId) {
    return tournamentStageService.generateStage(id, categoryId);
  },
  async generatePendingWeeklyStagesAndSchedule(id, { schedulingContext = null, actor = "weekly_closure", scheduleAfterGeneration = true } = {}) {
    const stages = await this.getTournamentCategoryStages(id);
    const client = ensureSupabaseDataClient();
    const [
      { data: bracketRows, error: bracketError },
      { data: zoneRows, error: zoneError },
      { data: matchRows, error: matchError },
    ] = await Promise.all([
      client
        .from("brackets")
        .select("tournament_category_id")
        .eq("tournament_id", id),
      client
        .from("zones")
        .select("tournament_category_id")
        .eq("tournament_id", id),
      client
        .from("matches")
        .select("tournament_category_id")
        .eq("tournament_id", id),
    ]);
    if (bracketError) {
      logSupabaseDataError("weekly generation bracket lookup", bracketError);
      throw createDataError("No pudimos revisar estructuras generadas.", { cause: bracketError });
    }
    if (zoneError) {
      logSupabaseDataError("weekly generation zones lookup", zoneError);
      throw createDataError("No pudimos revisar zonas generadas.", { cause: zoneError });
    }
    if (matchError) {
      logSupabaseDataError("weekly generation matches lookup", matchError);
      throw createDataError("No pudimos revisar partidos generados.", { cause: matchError });
    }
    const generatedStageIds = new Set([
      ...(bracketRows || []).map((row) => row.tournament_category_id).filter(Boolean),
      ...(zoneRows || []).map((row) => row.tournament_category_id).filter(Boolean),
      ...(matchRows || []).map((row) => row.tournament_category_id).filter(Boolean),
    ]);
    const pendingStages = stages.filter((stage) =>
      stage.formatStatus === "confirmed" &&
      stage.inscriptionsCount > 0 &&
      !generatedStageIds.has(stage.id)
    );
    if (!pendingStages.length) {
      const schedule = scheduleAfterGeneration ? await schedulingService.scheduleGeneratedMatches(id) : null;
      return { generatedStages: 0, schedule };
    }

    const generated = await tournamentStageService.generateAllCategoryStages(id, {
      categoryIds: pendingStages.map((stage) => stage.categoryId),
      schedulingContext,
    });

    await Promise.all(pendingStages.map(async (stage) => {
      const metadata = {
        ...(stage.metadata || {}),
        regenerationRequired: false,
        regenerationMarkedAt: null,
        regenerationReason: null,
        lastWeeklySportingGenerationAt: new Date().toISOString(),
      };
      const { error } = await client
        .from("tournament_categories")
        .update({ stage_status: "generated", metadata })
        .eq("id", stage.id);
      if (error) {
        logSupabaseDataError("weekly generation clean stage", error);
        throw createDataError("No pudimos confirmar la generacion semanal.", { cause: error });
      }
    }));

    const schedule = scheduleAfterGeneration ? await schedulingService.scheduleGeneratedMatches(id) : null;
    await auditService.record({
      action: "weekly_sporting_generation",
      entityType: "tournament",
      entityId: id,
      description: "Estructura deportiva generada en cierre semanal usando compatibilidad de disponibilidad como desempate.",
      actor,
    });
    return {
      generatedStages: generated.length,
      schedule,
    };
  },
  async closeWeeklySchedule(id, { weekStart, force = false, actor = "weekly_closure" } = {}) {
    if (!weekStart) throw createDataError("Falta la semana para cerrar la programacion.");
    const schedulingContext = await schedulingService.buildWeeklyGenerationContext(id, { weekStart });
    const generation = await this.generatePendingWeeklyStagesAndSchedule(id, {
      schedulingContext,
      actor,
      scheduleAfterGeneration: false,
    });
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("game_close_weekly_schedule", {
      p_tournament_id: id,
      p_week_start: weekStart,
      p_force: force,
    });
    if (error) {
      logSupabaseDataError("weekly schedule closure", error);
      throw createDataError("No pudimos cerrar la programacion semanal.", { cause: error });
    }
    return {
      ...generation,
      closure: data,
      contextSummary: {
        weekStart,
        physicalSlots: schedulingContext.slots.length,
        playerAvailabilityResponses: schedulingContext.availabilityByPlayer.size,
      },
    };
  },
  async regenerateCategoryBracket(id, categoryId, actor = "admin-1") {
    const stages = await this.getTournamentCategoryStages(id);
    const stage = stages.find((item) => item.categoryId === categoryId);
    if (!stage) throw createDataError("No encontramos la categoria del torneo.");
    if (!hasExceptionalRegenerationAuthorization(stage)) {
      throw createDataError("La regeneracion manual requiere una autorizacion excepcional activa.", {
        code: "MANUAL_REGENERATION_NOT_AUTHORIZED",
      });
    }
    const authorization = stage.metadata.exceptionalRegeneration;
    const result = await tournamentStageService.regenerateCategoryStage(id, categoryId);
    await auditService.record({
      action: "manual_category_regeneration",
      entityType: "tournament_category",
      entityId: stage.id,
      description: authorization.reason || "Regeneracion manual excepcional.",
      actor,
    });
    return result;
  },
  async updateZoneQualifiers(id, categoryId, zoneId, qualifiers) {
    return tournamentStageService.updateZoneQualifiers(id, categoryId, zoneId, qualifiers);
  },
  async generateZoneEliminationBracket(id, categoryId, options = {}) {
    return tournamentStageService.generateZoneEliminationStage(id, categoryId, options);
  },
  async resolveZoneEliminationBracket(id, categoryId, options = {}) {
    return tournamentStageService.resolveZoneEliminationStageSlots(id, categoryId, options);
  },
  async generateAllCategoryBrackets(id) {
    return tournamentStageService.generateAllCategoryStages(id);
  },
  async cancelTournament(id, actor = "admin-1") {
    return this.updateTournament(id, { status: "Cancelado" }, actor);
  },
  async deleteOpenTournament(id, actor = "admin-1") {
    const tournament = await fetchTournament(id);
    if (!tournament) return null;
    if (!isOpenTournament(tournament)) {
      throw createDataError("Solo se pueden eliminar torneos con inscripciones abiertas.");
    }
    const client = ensureSupabaseDataClient();
    const tournamentCategoryIds = await selectDependencyIds(client, "tournament_categories", "tournament_id", id);
    const registrationIds = await selectDependencyIds(client, "registrations", "tournament_id", id);
    const matchIds = await selectDependencyIds(client, "matches", "tournament_id", id);
    const zoneIds = await selectDependencyIds(client, "zones", "tournament_id", id);

    await deleteByIn(client, "match_connections", "parent_match_id", matchIds);
    await deleteByIn(client, "match_connections", "child_match_id", matchIds);
    await deleteByIn(client, "match_sets", "match_id", matchIds);
    await deleteByIn(client, "match_availability_responses", "match_id", matchIds);
    await deleteByEq(client, "player_discipline_faults", "tournament_id", id);
    await deleteByIn(client, "player_discipline_faults", "match_id", matchIds);
    await deleteByEq(client, "discipline_claims", "tournament_id", id);
    await deleteByEq(client, "player_tournament_expulsions", "tournament_id", id);
    await deleteByEq(client, "ranking_award_batches", "tournament_id", id);
    await deleteByEq(client, "preliminary_rankings", "tournament_id", id);
    await deleteByEq(client, "matches", "tournament_id", id);
    await deleteByIn(client, "zone_players", "zone_id", zoneIds);
    await deleteByEq(client, "zones", "tournament_id", id);
    await deleteByEq(client, "brackets", "tournament_id", id);
    await deleteByEq(client, "payments", "tournament_id", id);
    await deleteByIn(client, "registration_categories", "registration_id", registrationIds);
    await deleteByIn(client, "registration_categories", "tournament_category_id", tournamentCategoryIds);
    await deleteByEq(client, "registrations", "tournament_id", id);
    await deleteByEq(client, "tournament_categories", "tournament_id", id);
    await deleteByEq(client, "tournaments", "id", id);

    await auditService.record({
      action: "delete_open_tournament",
      entityType: "tournament",
      entityId: id,
      description: `Torneo eliminado: ${tournament.name}`,
      actor,
    });
    return { id: tournament.id, name: tournament.name };
  },
  async finalizeTournament(id, { pendingCount = 0 } = {}, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const { error } = await client
      .from("tournaments")
      .update({ status: "finished", finalized_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      logSupabaseDataError("tournament finalize", error);
      throw createDataError("No pudimos finalizar el torneo.", { cause: error });
    }
    const tournament = await fetchTournament(id);
    await auditService.record({
      action: "finalize_tournament",
      entityType: "tournament",
      entityId: id,
      description: pendingCount ? `Torneo finalizado con ${pendingCount} partidos pendientes.` : "Torneo finalizado sin partidos pendientes.",
      actor,
    });
    emailService.processQueuedGameEmails("tournament_finished");
    return tournament;
  },
};
