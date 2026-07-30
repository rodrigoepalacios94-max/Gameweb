import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";
import { getZoneBracketValidation } from "../utils/zoneFormat";
import { buildEliminationStructureWithAccess, TORNEO_GAME_CATEGORIES } from "./torneoGameFixture";

export const DIRECT_ELIMINATION_TOURNAMENT_ID = "torneo-pruebas-eliminacion-directa";
export const DIRECT_ELIMINATION_TOURNAMENT_NAME = "Torneo de Pruebas - Eliminación Directa";

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

function bracketKey(tournamentId, categoryId) {
  return `${tournamentId}::${categoryId}`;
}

function playerForRanking(baseFixture, ranking) {
  const player = baseFixture.players.find((item) => item.id === ranking.playerId);
  return {
    ...player,
    categoryId: ranking.categoryId,
    categoryName: ranking.categoryName,
    ranking: ranking.position,
    points: ranking.points,
    seed: Boolean(ranking.seed),
    ascended: Boolean(ranking.ascended),
  };
}

function rankedPlayersForCategory(baseFixture, categoryId) {
  return baseFixture.rankings
    .filter((entry) => entry.categoryId === categoryId)
    .sort((a, b) => a.position - b.position)
    .map((entry) => playerForRanking(baseFixture, entry));
}

function makeEnrollment(tournamentId, category, player, index) {
  return {
    id: `direct-enroll-${category.categoryId}-${pad(index + 1)}`,
    tournamentId,
    playerId: player.id,
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    status: "Confirmada",
    paymentStatus: "Pagado",
    requestedAt: "2026-10-01T10:00:00.000Z",
    confirmedAt: "2026-10-01T11:00:00.000Z",
    isDevTest: true,
  };
}

function makeStage(tournamentId, category, participants, plan) {
  return {
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    recommendedFormat: "Eliminacion Directa",
    format: "Eliminacion Directa",
    formatStatus: "Confirmado",
    status: "Finalizado",
    inscriptionsCount: category.participantCount,
    participantCount: category.participantCount,
    participants: participants.map((player) => player.id),
    bracketKey: bracketKey(tournamentId, category.categoryId),
    matchIdPrefix: `${tournamentId}-${category.categoryId}`,
    matchFormat: DEFAULT_MATCH_FORMAT,
    directEliminationPlan: plan,
  };
}

function getChampionForCategory(players, count) {
  if (count === 10) return players.find((player) => player.ranking === 8) || players[0];
  if (count === 13) return players.find((player) => player.id === "player-prueba-c") || players.find((player) => player.ranking === 9) || players[0];
  if (count === 24) return players.find((player) => player.id === "player-1") || players.find((player) => player.ranking === 12) || players[0];
  if (count === 30) return players.find((player) => player.ranking === 17) || players[0];
  if (count === 33) return players.find((player) => player.id === "player-1") || players.find((player) => player.ranking === 2) || players[0];
  if (count === 41) return players.find((player) => player.id === "player-prueba-b") || players.find((player) => player.ranking === 18) || players[0];
  if (count % 8 === 0) return players[0];
  if (count % 5 === 0) return players.find((player) => player.ranking === Math.ceil(count / 2)) || players[0];
  if (count % 3 === 0) return players.find((player) => player.ranking === 3) || players[0];
  return players.find((player) => player.ranking === 2) || players[0];
}

function pairAccessPlayers(accessPlayers) {
  const ordered = [...accessPlayers].sort((a, b) => a.ranking - b.ranking);
  const pairs = [];
  while (ordered.length >= 2) {
    pairs.push([ordered.shift(), ordered.pop()]);
  }
  return pairs;
}

function buildDirectCategory(state, baseFixture, tournament, category) {
  const players = rankedPlayersForCategory(baseFixture, category.categoryId).slice(0, category.participantCount);
  const validation = getZoneBracketValidation(category.participantCount);
  const directPlayers = players.slice(0, validation.directPlayers);
  const accessPlayers = players.slice(validation.directPlayers);
  const accessPairs = pairAccessPlayers(accessPlayers);
  const champion = getChampionForCategory(players, category.participantCount);
  const plan = {
    total: category.participantCount,
    target: validation.target,
    directPlayers: validation.directPlayers,
    accessPlayers: validation.accessPlayers,
    accessMatches: validation.accessMatches,
    accessRoundName: validation.accessRoundName,
    directRoundName: validation.directRoundName,
  };
  const stage = makeStage(tournament.id, category, players, plan);
  players.forEach((player, index) => state.enrollments.push(makeEnrollment(tournament.id, category, player, index)));
  const elimination = buildEliminationStructureWithAccess(state, tournament, stage, {
    baseDrawSize: validation.target,
    directEntrants: directPlayers,
    accessPairs,
    accessRoundName: validation.accessRoundName,
    champion,
  });
  const bracket = {
    id: stage.bracketKey,
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    categoryName: stage.categoryName,
    format: "Eliminacion Directa",
    participantCount: category.participantCount,
    baseDrawSize: validation.target,
    directEliminationPlan: plan,
    directByes: directPlayers.map((player) => ({
      playerId: player.id,
      playerName: player.fullName,
      ranking: player.ranking,
      targetRound: validation.directRoundName,
    })),
    accessPlayers: accessPlayers.map((player) => ({
      playerId: player.id,
      playerName: player.fullName,
      ranking: player.ranking,
      accessRound: validation.accessRoundName,
    })),
    accessPairings: accessPairs.map(([playerA, playerB], index) => ({
      index: index + 1,
      playerAId: playerA.id,
      playerA: playerA.fullName,
      playerARanking: playerA.ranking,
      playerBId: playerB.id,
      playerB: playerB.fullName,
      playerBRanking: playerB.ranking,
    })),
    preliminaries: [],
    zones: [],
    rounds: elimination.rounds,
    champion: elimination.champion,
    runnerUp: elimination.runnerUp,
    subchampion: elimination.subchampion,
    completed: true,
    playerRuns: elimination.playerRuns,
  };
  return { stage, bracket };
}

export function createDirectEliminationTournamentFixture(baseFixture, overrides = {}) {
  const tournamentId = overrides.id || DIRECT_ELIMINATION_TOURNAMENT_ID;
  const tournament = {
    id: tournamentId,
    name: overrides.name?.trim() || DIRECT_ELIMINATION_TOURNAMENT_NAME,
    type: "GAME 1000",
    scoringSystem: "GAME 1000",
    status: "Finalizado",
    registrationStatus: "Finalizado",
    description: "Fixture DEV masivo para validar formato Eliminacion Directa entre 8 y 48 jugadores.",
    startDate: "2026-10-05",
    endDate: "2026-10-19",
    semifinalsDate: "2026-10-17",
    finalsDate: "2026-10-19",
    price: 18000,
    categories: TORNEO_GAME_CATEGORIES.map((category) => category.categoryId),
    participants: [],
    phases: ["32avos", "16avos", "8vos", "Cuartos", "Semifinal", "Final"],
    courts: ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4", "Cancha 5", "Cancha 6"],
    categoryStages: [],
    playerCategoryId: "cat-pre-32",
    playerCategoryName: "32 jugadores",
    matchFormat: DEFAULT_MATCH_FORMAT,
    isDevTest: true,
    isDirectEliminationFixture: true,
    testSimulationStatus: "Fixture de eliminacion directa finalizado deterministico",
  };
  const state = {
    tournaments: [tournament],
    brackets: {},
    matches: [],
    enrollments: [],
    matchAvailability: [],
  };

  TORNEO_GAME_CATEGORIES.forEach((category) => {
    const { stage, bracket } = buildDirectCategory(state, baseFixture, tournament, category);
    tournament.categoryStages.push(stage);
    state.brackets[stage.bracketKey] = bracket;
  });
  tournament.participants = [...new Set(tournament.categoryStages.flatMap((stage) => stage.participants))];
  state.brackets[tournament.id] = state.brackets[tournament.categoryStages[0].bracketKey];
  const existingFixture = overrides.existingFixture || {};
  state.diagnostics = validateDirectEliminationTournamentFixture({
    ...baseFixture,
    tournaments: [...baseFixture.tournaments, ...(existingFixture.tournaments || []), tournament],
    brackets: { ...baseFixture.brackets, ...(existingFixture.brackets || {}), ...state.brackets },
    matches: [...baseFixture.matches, ...(existingFixture.matches || []), ...state.matches],
    enrollments: [...baseFixture.enrollments, ...(existingFixture.enrollments || []), ...state.enrollments],
  }, tournamentId);
  if (!state.diagnostics.ok && typeof console !== "undefined") {
    console.error("Fixture DEV Eliminacion Directa invalido", state.diagnostics.errors);
  }
  return state;
}

export function validateDirectEliminationTournamentFixture(db, tournamentId = DIRECT_ELIMINATION_TOURNAMENT_ID) {
  const errors = [];
  const tournament = db.tournaments.find((item) => item.id === tournamentId);
  if (!db.tournaments.some((item) => item.name === "Torneo de Pruebas - Preliminares")) errors.push("No existe Preliminares.");
  if (!db.tournaments.some((item) => item.name === "Torneo de Pruebas - Zonas")) errors.push("No existe Zonas.");
  if (!tournament) errors.push("No existe Eliminacion Directa.");
  if (!tournament) return { ok: false, errors };

  const playerIds = new Set(db.players?.map((player) => player.id) || []);
  const drawDistribution = { 8: 0, 16: 0, 32: 0 };
  let directByes = 0;
  let accessMatches = 0;
  let totalMatches = 0;
  const rankOneLost = [];
  const accessChampions = [];

  TORNEO_GAME_CATEGORIES.forEach((category) => {
    const bracket = db.brackets[bracketKey(tournament.id, category.categoryId)];
    const stage = tournament.categoryStages.find((item) => item.categoryId === category.categoryId);
    const validation = getZoneBracketValidation(category.participantCount);
    if (!stage || !bracket) {
      errors.push(`${category.categoryName}: falta stage o bracket.`);
      return;
    }
    if ((stage.participants || []).length !== category.participantCount) errors.push(`${category.categoryName}: Q invalido.`);
    stage.participants.forEach((playerId) => {
      if (!playerIds.has(playerId)) errors.push(`${category.categoryName}: jugador inexistente ${playerId}.`);
    });
    if (bracket.baseDrawSize !== validation.target) errors.push(`${category.categoryName}: B ${bracket.baseDrawSize}, esperado ${validation.target}.`);
    if ((bracket.directByes || []).length !== validation.directPlayers) errors.push(`${category.categoryName}: directos invalidos.`);
    if ((bracket.accessPlayers || []).length !== validation.accessPlayers) errors.push(`${category.categoryName}: jugadores acceso invalidos.`);
    if ((bracket.accessPairings || []).length !== validation.accessMatches) errors.push(`${category.categoryName}: partidos acceso invalidos.`);
    const directRankings = (bracket.directByes || []).map((player) => player.ranking).sort((a, b) => a - b);
    directRankings.forEach((ranking, index) => {
      if (ranking !== index + 1) errors.push(`${category.categoryName}: ranking ${ranking} recibio directo fuera de prioridad.`);
    });
    const finalRound = bracket.rounds?.[bracket.rounds.length - 1];
    const finalMatch = finalRound?.matches?.[0];
    if (!finalMatch?.winner || finalMatch.winner !== bracket.champion) errors.push(`${category.categoryName}: campeon no coincide con final.`);
    const rankOneRun = bracket.playerRuns?.[(bracket.directByes || []).find((player) => player.ranking === 1)?.playerId];
    if (rankOneRun?.losses) rankOneLost.push(category.categoryName);
    if ((bracket.accessPlayers || []).some((player) => player.playerName === bracket.champion)) accessChampions.push(category.categoryName);
    drawDistribution[validation.target] += 1;
    directByes += validation.directPlayers;
    accessMatches += validation.accessMatches;
    totalMatches += (bracket.rounds || []).reduce((total, round) => total + round.matches.length, 0);
  });

  const playerAEntries = db.enrollments.filter((item) => item.tournamentId === tournamentId && item.playerId === "player-1");
  if (!playerAEntries.length) errors.push("Jugador Prueba A no participa en Eliminacion Directa.");

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      tournaments: db.tournaments.length,
      categories: tournament.categoryStages.length,
      enrollments: db.enrollments.filter((item) => item.tournamentId === tournamentId).length,
      directByes,
      accessMatches,
      totalMatches,
      drawDistribution,
      playerACategories: playerAEntries.map((item) => item.categoryName),
      rankOneLost,
      accessChampions,
    },
  };
}
