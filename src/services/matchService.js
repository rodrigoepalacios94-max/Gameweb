import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { DEFAULT_MATCH_FORMAT, formatResultSets, getSetsToWin, isDecidingSuperTiebreak, normalizeMatchFormat } from "../utils/matchFormat";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";
import { buildPreliminaryBracketFromResults, ensureTournamentCategoryStages } from "./tournamentCategoryService";

function getTournament(db, tournamentId) {
  return db.tournaments.find((tournament) => tournament.id === tournamentId) || null;
}

function withTournamentFormat(db, match) {
  if (!match) return null;
  const tournament = getTournament(db, match.tournamentId);
  const categoryStage = tournament ? ensureTournamentCategoryStages(db, tournament).find((stage) => stage.categoryId === match.categoryId) : null;
  return {
    ...match,
    matchFormat: normalizeMatchFormat(categoryStage?.matchFormat || tournament?.matchFormat || match.matchFormat || DEFAULT_MATCH_FORMAT),
  };
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

function getCompletedSets(sets = [], matchFormat = DEFAULT_MATCH_FORMAT) {
  return sets
    .filter((set) => set.playerAScore !== "" && set.playerAScore != null && set.playerBScore !== "" && set.playerBScore != null)
    .map((set, index) => normalizeScoreSet(set, index, matchFormat));
}

function calculateRelaxedSetScore(sets = []) {
  return sets.reduce((score, set) => {
    if (!Number.isFinite(set.playerAScore) || !Number.isFinite(set.playerBScore) || set.playerAScore === set.playerBScore) return score;
    if (set.playerAScore > set.playerBScore) return { ...score, playerASets: score.playerASets + 1 };
    return { ...score, playerBSets: score.playerBSets + 1 };
  }, { playerASets: 0, playerBSets: 0 });
}

function buildEarlyFinishResult(target, sets, matchFormat, earlyFinishReason, manualWinnerId) {
  const completedSets = getCompletedSets(sets, matchFormat);
  const strictResult = calculateMatchWinner({ ...target, sets: completedSets, matchFormat });
  const relaxedScore = calculateRelaxedSetScore(completedSets);
  const selectedWinnerId = strictResult.valid ? strictResult.winnerId : manualWinnerId;
  const validWinnerIds = [target.playerAId, target.playerBId];

  if (!earlyFinishReason?.trim()) {
    throw new Error("Indica el motivo de finalizacion anticipada.");
  }
  if (!validWinnerIds.includes(selectedWinnerId)) {
    throw new Error("Selecciona el ganador del partido finalizado anticipadamente.");
  }

  return {
    valid: true,
    completedEarly: true,
    earlyFinishReason: earlyFinishReason.trim(),
    manualWinnerId: strictResult.valid ? null : selectedWinnerId,
    sets: completedSets,
    playerASets: strictResult.valid ? strictResult.playerASets : relaxedScore.playerASets,
    playerBSets: strictResult.valid ? strictResult.playerBSets : relaxedScore.playerBSets,
    winnerId: selectedWinnerId,
    loserId: selectedWinnerId === target.playerAId ? target.playerBId : target.playerAId,
  };
}

function playerPayload(match, side) {
  return side === "A"
    ? { id: match.playerAId, name: match.playerA, avatar: match.playerAAvatar }
    : { id: match.playerBId, name: match.playerB, avatar: match.playerBAvatar };
}

function winnerPayload(match) {
  if (match.winnerId === match.playerAId) return playerPayload(match, "A");
  if (match.winnerId === match.playerBId) return playerPayload(match, "B");
  return null;
}

function updateBracketMatchFromMatch(bracketMatch, match) {
  bracketMatch.matchId = match.id;
  bracketMatch.playerA = match.playerA;
  bracketMatch.playerB = match.playerB;
  bracketMatch.playerAId = match.playerAId;
  bracketMatch.playerBId = match.playerBId;
  bracketMatch.score = match.result || "Pendiente";
  bracketMatch.winner = match.winnerId === match.playerAId ? match.playerA : match.winnerId === match.playerBId ? match.playerB : null;
  bracketMatch.walkover = match.status === "W.O." || match.status === "Doble W.O.";
  bracketMatch.doubleWalkover = match.status === "Doble W.O.";
}

function assignPlayerToBracketSlot(bracketMatch, side, player) {
  if (!player) return;
  if (side === "A") {
    bracketMatch.playerA = player.name;
    bracketMatch.playerAId = player.id;
    bracketMatch.playerAAvatar = player.avatar;
  } else {
    bracketMatch.playerB = player.name;
    bracketMatch.playerBId = player.id;
    bracketMatch.playerBAvatar = player.avatar;
  }
}

function createMatchFromBracket(db, tournament, round, bracketMatch) {
  if (bracketMatch.matchId || (!bracketMatch.playerAId && !bracketMatch.playerBId) || bracketMatch.playerB === "BYE") return null;
  const categoryStage = ensureTournamentCategoryStages(db, tournament).find((stage) => stage.categoryName === tournament.playerCategoryName || stage.categoryId === bracketMatch.categoryId) || ensureTournamentCategoryStages(db, tournament)[0];
  const id = createMockId("match");
  const match = {
    id,
    tournamentId: tournament.id,
    tournament: tournament.name,
    categoryId: categoryStage?.categoryId || tournament.playerCategoryId,
    category: categoryStage?.categoryName || tournament.playerCategoryName,
    round: round.name,
    phase: round.name === "Preliminar" ? "Preliminar" : "Cuadro principal",
    playerAId: bracketMatch.playerAId,
    playerA: bracketMatch.playerA || "A definir",
    playerAAvatar: bracketMatch.playerAAvatar,
    playerBId: bracketMatch.playerBId,
    playerB: bracketMatch.playerBId ? bracketMatch.playerB : "A definir",
    playerBAvatar: bracketMatch.playerBAvatar,
    opponentId: bracketMatch.playerBId || null,
    opponent: bracketMatch.playerBId ? bracketMatch.playerB : "A definir",
    opponentAvatar: bracketMatch.playerBAvatar,
    date: tournament.startDate,
    time: "A definir",
    court: "A definir",
    status: "Pendiente de asistencia",
    attendanceStatus: {
      ...(bracketMatch.playerAId ? { [bracketMatch.playerAId]: "Pendiente" } : {}),
      ...(bracketMatch.playerBId ? { [bracketMatch.playerBId]: "Pendiente" } : {}),
    },
    result: null,
    resultDetail: null,
    sets: [],
    winnerId: null,
    loserId: null,
    pointsEarned: 0,
    discipline: { claims: [], confirmedFaults: [] },
    isDevTest: Boolean(tournament.isDevTest),
  };
  db.matches.push(match);
  bracketMatch.matchId = id;
  return match;
}

function syncExistingMatchFromBracket(db, bracketMatch) {
  if (!bracketMatch.matchId) return null;
  const target = db.matches.find((item) => item.id === bracketMatch.matchId);
  if (!target) return null;
  const previousPlayerIds = [target.playerAId, target.playerBId].filter(Boolean);
  Object.assign(target, {
    playerAId: bracketMatch.playerAId,
    playerA: bracketMatch.playerA || "A definir",
    playerAAvatar: bracketMatch.playerAAvatar,
    playerBId: bracketMatch.playerBId,
    playerB: bracketMatch.playerBId ? bracketMatch.playerB : "A definir",
    playerBAvatar: bracketMatch.playerBAvatar,
    opponentId: bracketMatch.playerBId || null,
    opponent: bracketMatch.playerBId ? bracketMatch.playerB : "A definir",
    opponentAvatar: bracketMatch.playerBAvatar,
  });
  const currentPlayerIds = [target.playerAId, target.playerBId].filter(Boolean);
  target.attendanceStatus = {
    ...(target.attendanceStatus || {}),
    ...Object.fromEntries(currentPlayerIds.filter((playerId) => !previousPlayerIds.includes(playerId)).map((playerId) => [playerId, "Pendiente"])),
  };
  if (target.status === "Pendiente" && currentPlayerIds.length) target.status = "Pendiente de asistencia";
  return target;
}

function clearDownstreamIfNeeded(nextMatch, winner) {
  if (!winner) return;
  if (nextMatch.winner && nextMatch.winner !== winner.name) {
    nextMatch.score = "Pendiente";
    nextMatch.winner = null;
    nextMatch.walkover = false;
    nextMatch.doubleWalkover = false;
  }
}

function advanceBracketWinner(db, match) {
  const tournament = getTournament(db, match.tournamentId);
  const categoryStage = tournament ? ensureTournamentCategoryStages(db, tournament).find((stage) => stage.categoryId === match.categoryId) : null;
  const bracket = db.brackets[categoryStage?.bracketKey] || db.brackets[match.tournamentId];
  if (!bracket || !tournament) return;

  bracket.preliminaries = (bracket.preliminaries || []).map((preliminary) => {
    if (preliminary.matchId !== match.id) return preliminary;
    return {
      ...preliminary,
      status: match.status,
      result: match.result,
      winner: match.winnerId === match.playerAId ? match.playerA : match.winnerId === match.playerBId ? match.playerB : null,
    };
  });

  const rounds = bracket.rounds || [];
  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    const round = rounds[roundIndex];
    const matchIndex = round.matches.findIndex((item) => item.matchId === match.id);
    if (matchIndex < 0) continue;

    const bracketMatch = round.matches[matchIndex];
    updateBracketMatchFromMatch(bracketMatch, match);

    const winner = winnerPayload(match);
    if (!winner) return;

    const nextRound = rounds[roundIndex + 1];
    if (!nextRound) return;

    const isRoundOf32 = round.id?.includes("32") || round.name?.includes("32");
    const nextMatchIndex = isRoundOf32 && nextRound.matches.length > 1
      ? matchIndex === 0 ? 0 : nextRound.matches.length - 1
      : Math.floor(matchIndex / 2);
    const nextMatch = nextRound.matches[nextMatchIndex];
    if (!nextMatch) return;

    const targetSide = isRoundOf32 ? "B" : matchIndex % 2 === 0 ? "A" : "B";
    assignPlayerToBracketSlot(nextMatch, targetSide, winner);
    clearDownstreamIfNeeded(nextMatch, winner);
    nextMatch.categoryId = match.categoryId;
    if (nextMatch.matchId) {
      syncExistingMatchFromBracket(db, nextMatch);
      return;
    }
    createMatchFromBracket(db, tournament, nextRound, nextMatch);
    return;
  }
}

function calculatePreliminaryPerformance(result, winnerId, match) {
  const winnerGames = result.sets.reduce((total, set) => total + (winnerId === match.playerAId ? set.playerAScore : set.playerBScore), 0);
  const loserGames = result.sets.reduce((total, set) => total + (winnerId === match.playerAId ? set.playerBScore : set.playerAScore), 0);
  const setsWon = winnerId === match.playerAId ? result.playerASets : result.playerBSets;
  return {
    preliminaryScore: setsWon * 40 + winnerGames - loserGames,
    loserPreliminaryScore: loserGames - winnerGames,
  };
}

function maybeBuildPreliminaryBracket(db, match) {
  const tournament = getTournament(db, match.tournamentId);
  const categoryStage = tournament ? ensureTournamentCategoryStages(db, tournament).find((stage) => stage.categoryId === match.categoryId) : null;
  if (!tournament || categoryStage?.format !== "Preliminar") return;
  const preliminaries = db.matches
    .filter((item) => item.tournamentId === match.tournamentId && item.categoryId === match.categoryId && item.phase === "Preliminar")
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (!preliminaries.length || preliminaries.some((item) => item.status !== "Finalizado" || !item.winnerId)) return;
  buildPreliminaryBracketFromResults(db, tournament, match.categoryId);
  tournament.phases = ["Preliminar", "32avos", "16avos", "Octavos", "Cuartos", "Semifinal", "Final"];
}

function applyFinalResult(db, id, payload, actor, action) {
  const target = db.matches.find((item) => item.id === id);
  if (!target) return null;
  const tournament = getTournament(db, target.tournamentId);
  const matchFormat = normalizeMatchFormat(tournament?.matchFormat || DEFAULT_MATCH_FORMAT);
  const {
    sets = [],
    completedEarly = false,
    earlyFinishReason = "",
    manualWinnerId = null,
  } = Array.isArray(payload) ? { sets: payload } : payload || {};
  const result = completedEarly
    ? buildEarlyFinishResult(target, sets, matchFormat, earlyFinishReason, manualWinnerId)
    : calculateMatchWinner({ ...target, sets, matchFormat });
  if (!result.valid) {
    throw new Error(result.error);
  }

  const resultText = result.sets.length ? formatResultSets(result.sets) : "Finalizacion anticipada";
  Object.assign(target, {
    status: "Finalizado",
    result: resultText,
    resultDetail: {
      sets: result.sets,
      winnerId: result.winnerId,
      loserId: result.loserId,
      playerASets: result.playerASets,
      playerBSets: result.playerBSets,
      completedEarly: Boolean(result.completedEarly),
      earlyFinishReason: result.earlyFinishReason || null,
      manualWinnerId: result.manualWinnerId || null,
    },
    sets: result.sets,
    winnerId: result.winnerId,
    loserId: result.loserId,
    completedEarly: Boolean(result.completedEarly),
    earlyFinishReason: result.earlyFinishReason || null,
    walkoverPlayerId: null,
  });
  if (target.phase === "Preliminar") {
    Object.assign(target, calculatePreliminaryPerformance(result, result.winnerId, target));
  }
  advanceBracketWinner(db, target);
    maybeBuildPreliminaryBracket(db, target);
  return { match: target, action, actor };
}

export const matchService = {
  async getMatches() {
    return mockRequest(() => readMockData((db) => db.matches.map((match) => withTournamentFormat(db, match))), "No pudimos cargar los partidos.");
  },
  async getPlayerMatches(playerId = "player-1") {
    return mockRequest(() =>
      readMockData((db) => db.matches.filter((match) => match.playerAId === playerId || match.playerBId === playerId).map((match) => withTournamentFormat(db, match))), "No pudimos cargar los partidos del jugador.");
  },
  async getMatchById(id) {
    return mockRequest(() => readMockData((db) => withTournamentFormat(db, db.matches.find((match) => match.id === id) || null)), "No pudimos cargar el partido.");
  },
  async getMatchesByPlayer(playerId) {
    return this.getPlayerMatches(playerId);
  },
  async getMatchesByTournament(tournamentId, categoryId = null) {
    return mockRequest(() => readMockData((db) =>
      db.matches
        .filter((match) => match.tournamentId === tournamentId)
        .filter((match) => !categoryId || match.categoryId === categoryId)
        .map((match) => withTournamentFormat(db, match))), "No pudimos cargar los partidos del torneo.");
  },
  async savePartialResult(id, { sets = [] }, actor = "admin-1") {
    return mockRequest(async () => {
      const match = mutateMockData((db) => {
        const target = db.matches.find((item) => item.id === id);
        if (!target) return null;
        const tournament = getTournament(db, target.tournamentId);
        const matchFormat = normalizeMatchFormat(tournament?.matchFormat || DEFAULT_MATCH_FORMAT);
        const normalizedSets = sets
          .filter((set) => set.playerAScore !== "" && set.playerBScore !== "")
          .map((set, index) => normalizeScoreSet(set, index, matchFormat));
        Object.assign(target, {
          status: "En juego",
          sets: normalizedSets,
          result: normalizedSets.length ? formatResultSets(normalizedSets) : null,
          resultDetail: { partial: true, sets: normalizedSets },
        });
        return withTournamentFormat(db, target);
      });
      await auditService.record({
        action: "save_partial_result",
        entityType: "match",
        entityId: id,
        description: "Resultado parcial guardado",
        actor,
      });
      return match;
    }, "No pudimos guardar el parcial.");
  },
  async finalizeMatch(id, payload = {}, actor = "admin-1") {
    return mockRequest(async () => {
      const applied = mutateMockData((db) => {
        const result = applyFinalResult(db, id, payload, actor, "finalize_match");
        return result ? withTournamentFormat(db, result.match) : null;
      });
      await auditService.record({
        action: "finalize_match",
        entityType: "match",
        entityId: id,
        description: "Resultado cargado",
        actor,
      });
      return applied;
    }, "No pudimos finalizar el partido.");
  },
  async editResult(id, payload = {}, actor = "admin-1") {
    return mockRequest(async () => {
      const applied = mutateMockData((db) => {
        const result = applyFinalResult(db, id, payload, actor, "edit_result");
        return result ? withTournamentFormat(db, result.match) : null;
      });
      await auditService.record({
        action: "edit_result",
        entityType: "match",
        entityId: id,
        description: "Resultado editado",
        actor,
      });
      return applied;
    }, "No pudimos editar el resultado.");
  },
  async saveResult(id, payload, actor = "admin-1") {
    return this.finalizeMatch(id, payload, actor);
  },
  async registerWalkover(id, { walkoverPlayerId = null, doubleWalkover = false }, actor = "admin-1") {
    return mockRequest(async () => {
      const match = mutateMockData((db) => {
        const target = db.matches.find((item) => item.id === id);
        if (!target) return null;
        const winnerId = doubleWalkover ? null : walkoverPlayerId === target.playerAId ? target.playerBId : target.playerAId;
        const loserId = doubleWalkover ? null : walkoverPlayerId;
        Object.assign(target, {
          status: doubleWalkover ? "Doble W.O." : "W.O.",
          result: doubleWalkover ? "Doble W.O. - pendiente de resolucion" : "Ganador por W.O.",
          resultDetail: doubleWalkover ? { doubleWalkover: true, pendingResolution: true } : { walkover: true, winnerId, loserId },
          sets: [],
          winnerId,
          loserId,
          walkoverPlayerId: doubleWalkover ? null : walkoverPlayerId,
          doubleWalkover,
        });
        advanceBracketWinner(db, target);
        return withTournamentFormat(db, target);
      });
      await auditService.record({
        action: doubleWalkover ? "register_double_walkover" : "register_walkover",
        entityType: "match",
        entityId: id,
        description: doubleWalkover ? "Doble W.O. registrado" : "W.O. registrado",
        actor,
      });
      return match;
    }, "No pudimos registrar el W.O.");
  },
  async rescheduleMatch(id, { date, time, court }, actor = "admin-1") {
    return mockRequest(async () => {
      const match = mutateMockData((db) => {
        const target = db.matches.find((item) => item.id === id);
        if (!target) return null;
        Object.assign(target, { date, time, court, status: "Reprogramado" });
        return withTournamentFormat(db, target);
      });
      await auditService.record({
        action: "reschedule_match",
        entityType: "match",
        entityId: id,
        description: "Partido reprogramado en mock.",
        actor,
      });
      return match;
    }, "No pudimos reprogramar el partido.");
  },
  calculateMatchWinner,
};
