import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";
import { mockRequest } from "./serviceUtils";

export const TOURNAMENT_FORMATS = ["Preliminar", "Zonas", "Eliminacion Directa"];

export function getCategoryLabel(category) {
  if (!category) return "Categoria";
  return `${category.name} ${category.branch}`;
}

function bracketKey(tournamentId, categoryId) {
  return `${tournamentId}::${categoryId}`;
}

function getCategoryById(db, categoryId) {
  return db.categories.find((category) => category.id === categoryId) || null;
}

function getPlayerById(db, playerId) {
  return db.players.find((player) => player.id === playerId) || null;
}

function enrollmentParticipants(db, tournamentId, categoryId) {
  return db.enrollments
    .filter((enrollment) => enrollment.tournamentId === tournamentId && enrollment.categoryId === categoryId && enrollment.status !== "Rechazada")
    .map((enrollment) => enrollment.playerId);
}

function legacyParticipants(db, tournament, categoryId) {
  return (tournament.participants || [])
    .map((playerId) => getPlayerById(db, playerId))
    .filter((player) => player?.categoryId === categoryId)
    .map((player) => player.id);
}

export function ensureTournamentCategoryStages(db, tournament) {
  if (!tournament) return [];
  const categories = tournament.categories || [];
  const existingStages = tournament.categoryStages || [];
  const existingByCategory = new Map(existingStages.map((stage) => [stage.categoryId, stage]));

  tournament.categoryStages = categories.map((categoryId, index) => {
    const category = getCategoryById(db, categoryId);
    const enrolled = enrollmentParticipants(db, tournament.id, categoryId);
    const legacy = legacyParticipants(db, tournament, categoryId);
    const participantIds = [...new Set([...(existingByCategory.get(categoryId)?.participants || []), ...enrolled, ...legacy])];
    const previous = existingByCategory.get(categoryId) || {};

    return {
      id: previous.id || `${tournament.id}-${categoryId}`,
      tournamentId: tournament.id,
      categoryId,
      categoryName: previous.categoryName || getCategoryLabel(category),
      status: previous.status || tournament.status,
      format: previous.format || (index === 0 ? tournament.type : "Eliminacion Directa"),
      matchFormat: previous.matchFormat || tournament.matchFormat || DEFAULT_MATCH_FORMAT,
      participants: participantIds,
      inscriptionsCount: participantIds.length,
      zonesConfig: previous.zonesConfig || { zones: 2, qualifiers: 2, distribution: "Manual posterior" },
      bracketKey: previous.bracketKey || bracketKey(tournament.id, categoryId),
      progress: previous.progress || null,
    };
  });

  return tournament.categoryStages;
}

function makeBracketMatch(id, playerA, playerB, extra = {}) {
  return {
    id,
    playerAId: playerA?.id,
    playerBId: playerB?.id,
    playerAAvatar: playerA?.avatar,
    playerBAvatar: playerB?.avatar,
    playerA: playerA?.fullName || playerA || "A definir",
    playerB: playerB?.fullName || playerB || "A definir",
    score: extra.score || "Pendiente",
    winner: extra.winner || null,
    matchId: extra.matchId || null,
    bye: Boolean(extra.bye),
    connectionNote: extra.connectionNote,
  };
}

function createMatchFromBracket(db, tournament, stage, round, bracketMatch, index) {
  if (!bracketMatch.playerAId || !bracketMatch.playerBId || bracketMatch.bye || bracketMatch.matchId) return null;
  const id = createMockId("match");
  const match = {
    id,
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    tournament: tournament.name,
    category: stage.categoryName,
    round: round.name,
    phase: round.name === "Preliminar" ? "Preliminar" : stage.format === "Zonas" ? "Zonas" : "Cuadro principal",
    playerAId: bracketMatch.playerAId,
    playerA: bracketMatch.playerA,
    playerAAvatar: bracketMatch.playerAAvatar,
    playerBId: bracketMatch.playerBId,
    playerB: bracketMatch.playerB,
    playerBAvatar: bracketMatch.playerBAvatar,
    opponentId: bracketMatch.playerBId,
    opponent: bracketMatch.playerB,
    opponentAvatar: bracketMatch.playerBAvatar,
    date: "",
    time: "A definir",
    court: "A definir",
    status: "Pendiente de asistencia",
    attendanceStatus: {
      [bracketMatch.playerAId]: "Pendiente",
      [bracketMatch.playerBId]: "Pendiente",
    },
    result: null,
    resultDetail: null,
    sets: [],
    winnerId: null,
    loserId: null,
    pointsEarned: 0,
    discipline: { claims: [], confirmedFaults: [] },
  };
  db.matches.push(match);
  bracketMatch.matchId = id;
  bracketMatch.connectionNote = bracketMatch.connectionNote || `Partido ${index + 1} de ${round.name}`;
  return match;
}

function nextPowerOfTwo(value) {
  if (value <= 2) return 2;
  return 2 ** Math.ceil(Math.log2(value));
}

function buildEliminationRounds(db, tournament, stage, players) {
  const drawSize = nextPowerOfTwo(players.length);
  const firstRoundCount = Math.max(1, drawSize / 2);
  const seeded = [...players].sort((a, b) => (a.ranking || 999) - (b.ranking || 999));
  const slots = Array.from({ length: drawSize }, (_, index) => seeded[index] || null);
  const firstMatches = [];
  for (let index = 0; index < firstRoundCount; index += 1) {
    const playerA = slots[index];
    const playerB = slots[drawSize - 1 - index];
    firstMatches.push(makeBracketMatch(`${stage.categoryId}-r1-${index + 1}`, playerA, playerB || "BYE", {
      bye: !playerB,
      score: playerB ? "Pendiente" : "BYE",
      winner: !playerB ? playerA?.fullName : null,
      connectionNote: "Cuadro independiente por categoria",
    }));
  }

  const roundNames = ["Octavos", "Cuartos", "Semifinal", "Final"];
  const firstRoundName = firstRoundCount >= 16 ? "16avos" : firstRoundCount >= 8 ? "Octavos" : firstRoundCount >= 4 ? "Cuartos" : firstRoundCount >= 2 ? "Semifinal" : "Final";
  const rounds = [{ id: `${stage.categoryId}-main-1`, name: firstRoundName, matches: firstMatches }];
  let nextCount = Math.floor(firstRoundCount / 2);
  let roundIndex = Math.max(0, roundNames.indexOf(firstRoundName) + 1);
  while (nextCount >= 1) {
    const name = roundNames[roundIndex] || `Ronda ${rounds.length + 1}`;
    rounds.push({
      id: `${stage.categoryId}-main-${rounds.length + 1}`,
      name,
      matches: Array.from({ length: nextCount }, (_, index) => makeBracketMatch(`${stage.categoryId}-${name}-${index + 1}`, `Ganador ${name} ${index + 1}`, "A definir")),
    });
    nextCount = Math.floor(nextCount / 2);
    roundIndex += 1;
  }

  rounds[0].matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, rounds[0], match, index));
  return rounds;
}

function buildPreliminaries(db, tournament, stage, players) {
  const pairs = [];
  for (let index = 0; index < players.length; index += 2) {
    pairs.push([players[index], players[index + 1]]);
  }
  const preliminaries = pairs.map(([playerA, playerB], index) => {
    if (!playerB) {
      return {
        playerA: playerA.fullName,
        playerB: "BYE",
        status: "BYE",
        result: "Clasifica directo",
        winner: playerA.fullName,
      };
    }
    const bracketMatch = makeBracketMatch(`${stage.categoryId}-pre-${index + 1}`, playerA, playerB);
    const round = { id: `${stage.categoryId}-preliminar`, name: "Preliminar" };
    const match = createMatchFromBracket(db, tournament, stage, round, bracketMatch, index);
    return {
      matchId: match?.id,
      playerA: playerA.fullName,
      playerB: playerB.fullName,
      status: match?.status || "Pendiente",
    };
  });
  return preliminaries;
}

function buildZones(stage, players) {
  const zones = Array.from({ length: stage.zonesConfig?.zones || 2 }, (_, index) => ({
    id: `${stage.categoryId}-zone-${index + 1}`,
    name: `Zona ${String.fromCharCode(65 + index)}`,
    qualifiers: stage.zonesConfig?.qualifiers || 2,
    players: [],
  }));
  players.forEach((player, index) => zones[index % zones.length].players.push(player.fullName));
  return zones;
}

export function generateCategoryBracketInDb(db, tournamentId, categoryId) {
  const tournament = db.tournaments.find((item) => item.id === tournamentId);
  if (!tournament) return null;
  const stages = ensureTournamentCategoryStages(db, tournament);
  const stage = stages.find((item) => item.categoryId === categoryId);
  if (!stage) return null;

  db.matches = db.matches.filter((match) => !(match.tournamentId === tournamentId && match.categoryId === categoryId && !match.result));
  const players = stage.participants.map((playerId) => getPlayerById(db, playerId)).filter(Boolean);
  const bracket = {
    tournamentId,
    categoryId,
    category: stage.categoryName,
    format: stage.format,
    preliminaries: [],
    zones: [],
    rounds: [],
  };

  if (stage.format === "Preliminar") {
    bracket.preliminaries = buildPreliminaries(db, tournament, stage, players);
    const directPlayers = players.slice(0, Math.min(players.length, 8));
    bracket.rounds = buildEliminationRounds(db, tournament, stage, directPlayers);
  } else if (stage.format === "Zonas") {
    bracket.zones = buildZones(stage, players);
    bracket.rounds = buildEliminationRounds(db, tournament, stage, players.slice(0, Math.min(players.length, 8)));
  } else {
    bracket.rounds = buildEliminationRounds(db, tournament, stage, players);
  }

  db.brackets[stage.bracketKey] = bracket;
  if (!db.brackets[tournamentId] || db.brackets[tournamentId]?.categoryId === categoryId || tournament.playerCategoryId === categoryId) {
    db.brackets[tournamentId] = bracket;
  }
  stage.status = "Cuadro generado";
  stage.progress = {
    totalMatches: bracket.rounds.reduce((total, round) => total + round.matches.length, 0) + bracket.preliminaries.length,
    completedMatches: 0,
  };
  return bracket;
}

export const tournamentCategoryService = {
  async getCategoryStages(tournamentId) {
    return mockRequest(() => readMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      return ensureTournamentCategoryStages(db, tournament);
    }), "No pudimos cargar categorias del torneo.");
  },
  async closeRegistrations(tournamentId, actor = "admin-1") {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return null;
      ensureTournamentCategoryStages(db, tournament);
      tournament.status = "Inscripciones cerradas";
      tournament.registrationClosedBy = actor;
      return tournament;
    }), "No pudimos cerrar inscripciones.");
  },
  async updateCategoryFormat(tournamentId, categoryId, format) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament || !TOURNAMENT_FORMATS.includes(format)) return null;
      const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
      if (!stage) return null;
      stage.format = format;
      return stage;
    }), "No pudimos actualizar formato por categoria.");
  },
  async generateCategoryBracket(tournamentId, categoryId) {
    return mockRequest(() => mutateMockData((db) => generateCategoryBracketInDb(db, tournamentId, categoryId)), "No pudimos generar cuadro por categoria.");
  },
  async generateAllCategoryBrackets(tournamentId) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return [];
      return ensureTournamentCategoryStages(db, tournament).map((stage) => generateCategoryBracketInDb(db, tournamentId, stage.categoryId));
    }), "No pudimos generar cuadros por categoria.");
  },
};
