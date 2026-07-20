import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";

export const TORNEO_GAME_ID = "torneo-game";

const BOT_AVATAR = "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=240&q=80";
const STANDARD_DRAWS = [4, 8, 16, 32, 64];

export const TORNEO_GAME_CATEGORIES = [
  { categoryId: "cat-m5", categoryName: "5ta Masculina", shortPrefix: "5M", participantCount: 25, format: "Zonas" },
  { categoryId: "cat-m3", categoryName: "3ra Masculina", shortPrefix: "3M", participantCount: 20, format: "Eliminacion Directa" },
  { categoryId: "cat-m6", categoryName: "6ta Masculina", shortPrefix: "6M", participantCount: 29, format: "Preliminar" },
  { categoryId: "cat-m4", categoryName: "4ta Masculina", shortPrefix: "4M", participantCount: 36, format: "Preliminar" },
];

function bracketKey(tournamentId, categoryId) {
  return `${tournamentId}::${categoryId}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function largestStandardDraw(count) {
  return [...STANDARD_DRAWS].reverse().find((size) => size <= count) || 4;
}

function nextMainRoundNames(drawSize) {
  if (drawSize >= 32) return ["16avos", "Octavos", "Cuartos", "Semifinal", "Final"];
  if (drawSize === 16) return ["16avos", "Cuartos", "Semifinal", "Final"];
  if (drawSize === 8) return ["Cuartos", "Semifinal", "Final"];
  if (drawSize === 4) return ["Semifinal", "Final"];
  return ["Final"];
}

function sortByRanking(players) {
  return [...players].sort((a, b) => (a.ranking || 9999) - (b.ranking || 9999));
}

function makePlayer(categoryConfig, index) {
  const number = pad(index);
  const id = categoryConfig.categoryId === "cat-m4" && index === 1
    ? "player-1"
    : `game-${categoryConfig.shortPrefix.toLowerCase()}-bot-${number}`;
  return {
    id,
    firstName: categoryConfig.shortPrefix,
    lastName: `Bot ${number}`,
    fullName: `${categoryConfig.shortPrefix} Bot ${number}`,
    dni: `GAME-${categoryConfig.shortPrefix}-${number}`,
    birthDate: "1994-01-01",
    gender: "Masculino",
    phone: "-",
    email: `${categoryConfig.shortPrefix.toLowerCase()}-bot-${number}@game.test`,
    categoryId: categoryConfig.categoryId,
    categoryName: categoryConfig.categoryName,
    ranking: index,
    points: 1200 - index * 9,
    status: "Activo",
    avatar: BOT_AVATAR,
    stats: { played: 0, wins: 0, losses: 0, tournaments: 1 },
    discipline: { faults: 0, limit: 3, status: "Sin sanciones" },
    isBot: true,
    isDevTestBot: true,
  };
}

function makeBracketMatch(id, playerA, playerB, extra = {}) {
  return {
    id,
    categoryId: extra.categoryId,
    playerAId: playerA?.id || null,
    playerBId: playerB?.id || null,
    playerAAvatar: playerA?.avatar,
    playerBAvatar: playerB?.avatar,
    playerA: playerA?.fullName || playerA || "A definir",
    playerB: playerB?.fullName || playerB || "A definir",
    playerANote: extra.playerANote,
    playerBNote: extra.playerBNote,
    score: extra.score || "Pendiente",
    winner: extra.winner || null,
    matchId: extra.matchId || null,
    bye: Boolean(extra.bye),
    connectionNote: extra.connectionNote,
  };
}

function createMatch(state, tournament, stage, round, phase, bracketMatch, index) {
  if (!bracketMatch.playerAId || !bracketMatch.playerBId || bracketMatch.matchId || bracketMatch.bye) return null;
  const id = `game-match-${stage.categoryId}-${phase.toLowerCase().replace(/\s+/g, "-")}-${round.id}-${index + 1}`;
  const match = {
    id,
    tournamentId: tournament.id,
    tournament: tournament.name,
    categoryId: stage.categoryId,
    category: stage.categoryName,
    round: round.name,
    phase,
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
    isDevTest: true,
  };
  state.matches.push(match);
  state.matchAvailability.push(
    {
      matchId: id,
      tournamentId: tournament.id,
      categoryId: stage.categoryId,
      playerId: bracketMatch.playerAId,
      confirmed: true,
      unavailableSlots: [],
      submittedAt: "2026-08-01T10:00:00.000Z",
    },
    {
      matchId: id,
      tournamentId: tournament.id,
      categoryId: stage.categoryId,
      playerId: bracketMatch.playerBId,
      confirmed: true,
      unavailableSlots: [],
      submittedAt: "2026-08-01T10:00:00.000Z",
    },
  );
  bracketMatch.matchId = id;
  return match;
}

function placeSeededEntrants(entrants, drawSize) {
  const slots = Array.from({ length: drawSize }, () => null);
  const rankedPlayers = sortByRanking(entrants.filter((entrant) => entrant?.id));
  const seedPositions = [0, drawSize - 1, Math.floor(drawSize / 2), Math.floor(drawSize / 2) - 1];

  rankedPlayers.slice(0, 4).forEach((player, index) => {
    slots[seedPositions[index]] = player;
  });

  const placedIds = new Set(slots.filter((slot) => slot?.id).map((slot) => slot.id));
  const remaining = [
    ...sortByRanking(entrants.filter((entrant) => entrant?.id && !placedIds.has(entrant.id))),
    ...entrants.filter((entrant) => !entrant?.id),
  ];

  slots.forEach((slot, index) => {
    if (!slot) slots[index] = remaining.shift() || "A definir";
  });

  return slots;
}

function pairedRound(stage, roundId, roundName, entrants, connectionNote) {
  const slots = placeSeededEntrants(entrants, entrants.length);
  const matches = [];
  for (let index = 0; index < slots.length; index += 2) {
    matches.push(makeBracketMatch(`${stage.categoryId}-${roundId}-${matches.length + 1}`, slots[index], slots[index + 1], {
      categoryId: stage.categoryId,
      connectionNote,
    }));
  }
  return { id: `${stage.categoryId}-${roundId}`, name: roundName, matches };
}

function futureRounds(stage, drawSize, firstRoundIndex = 1) {
  const names = nextMainRoundNames(drawSize).slice(firstRoundIndex);
  let matchCount = drawSize / 4;
  return names.map((name, roundOffset) => {
    const count = Math.max(1, matchCount / (2 ** roundOffset));
    return {
      id: `${stage.categoryId}-${name.toLowerCase()}-${roundOffset + 1}`,
      name,
      matches: Array.from({ length: count }, (_, index) => makeBracketMatch(`${stage.categoryId}-${name}-${index + 1}`, `Ganador ${name} ${index + 1}`, "A definir", {
        categoryId: stage.categoryId,
      })),
    };
  });
}

export function buildZonesStructure(state, tournament, stage, players) {
  const sorted = sortByRanking(players);
  const distribution = [4, 4, 4, 4, 3, 3, 3];
  const zones = [];
  let cursor = 0;

  distribution.forEach((size, index) => {
    const zonePlayers = sorted.slice(cursor, cursor + size);
    cursor += size;
    const zone = {
      id: `${stage.categoryId}-zone-${index + 1}`,
      name: `Zona ${String.fromCharCode(65 + index)}`,
      qualifiers: 0,
      players: zonePlayers.map((player) => player.fullName),
      playerIds: zonePlayers.map((player) => player.id),
      size,
      status: "Pendiente de clasificacion",
    };
    zones.push(zone);
    for (let a = 0; a < zonePlayers.length; a += 1) {
      for (let b = a + 1; b < zonePlayers.length; b += 1) {
        const bracketMatch = makeBracketMatch(`${zone.id}-match-${a + 1}-${b + 1}`, zonePlayers[a], zonePlayers[b], {
          categoryId: stage.categoryId,
          connectionNote: `${zone.name}: todos contra todos`,
        });
        createMatch(state, tournament, stage, { id: zone.id, name: zone.name }, "Zonas", bracketMatch, state.matches.length);
      }
    }
  });

  return {
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    category: stage.categoryName,
    format: "Zonas",
    phaseStatus: "Zonas en juego",
    zones,
    zoneDistribution: distribution,
    zoneClassificationStatus: "Pendiente de definicion para 25 jugadores",
    preliminaries: [],
    preliminarySummary: null,
    rounds: [],
  };
}

export function buildDirectElimination(state, tournament, stage, players) {
  const sorted = sortByRanking(players);
  const baseDrawSize = largestStandardDraw(sorted.length);
  const previousPlayersCount = sorted.length > baseDrawSize ? (sorted.length - baseDrawSize) * 2 : 0;
  const previousPlayers = previousPlayersCount ? sorted.slice(-previousPlayersCount) : [];
  const directPlayers = previousPlayersCount ? sorted.slice(0, sorted.length - previousPlayersCount) : sorted;
  const previousWinnerSlots = [];
  const rounds = [];

  if (previousPlayers.length) {
    const previousMatches = [];
    for (let index = 0; index < previousPlayers.length; index += 2) {
      previousMatches.push(makeBracketMatch(`${stage.categoryId}-32avos-${previousMatches.length + 1}`, previousPlayers[index], previousPlayers[index + 1], {
        categoryId: stage.categoryId,
        connectionNote: "Ronda previa para completar el cuadro base sin byes masivos",
      }));
      previousWinnerSlots.push(`Ganador 32avos ${previousMatches.length}`);
    }
    const previousRound = { id: `${stage.categoryId}-32avos`, name: "32avos", matches: previousMatches };
    previousRound.matches.forEach((match, index) => createMatch(state, tournament, stage, previousRound, "Cuadro principal", match, index));
    rounds.push(previousRound);
  }

  const mainEntrants = [...directPlayers, ...previousWinnerSlots];
  const mainRoundNames = nextMainRoundNames(baseDrawSize);
  const firstMainRound = pairedRound(stage, "main-1", mainRoundNames[0], mainEntrants, "Cuadro principal de eliminacion directa");
  firstMainRound.matches.forEach((match, index) => createMatch(state, tournament, stage, firstMainRound, "Cuadro principal", match, index));
  rounds.push(firstMainRound, ...futureRounds(stage, baseDrawSize));

  return {
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    category: stage.categoryName,
    format: "Eliminacion Directa",
    preliminaries: [],
    preliminarySummary: null,
    zones: [],
    zoneDistribution: [],
    rounds,
  };
}

function buildPreliminarySkeleton(stage, participantCount) {
  const baseDrawSize = largestStandardDraw(participantCount);
  const previousMatchCount = Math.max(0, participantCount - baseDrawSize);
  const rounds = [];

  if (previousMatchCount) {
    rounds.push({
      id: `${stage.categoryId}-32avos`,
      name: "32avos",
      matches: Array.from({ length: previousMatchCount }, (_, index) => makeBracketMatch(`${stage.categoryId}-pre-32-${index + 1}`, `Peor perdedor ${index * 2 + 1}`, `Peor perdedor ${index * 2 + 2}`, {
        categoryId: stage.categoryId,
        score: "Pendiente",
        connectionNote: "Se completa al cerrar el ranking preliminar",
      })),
    });
  }

  const names = nextMainRoundNames(baseDrawSize);
  let matchCount = baseDrawSize / 2;
  names.forEach((name, roundIndex) => {
    rounds.push({
      id: `${stage.categoryId}-pre-main-${roundIndex + 1}`,
      name,
      matches: Array.from({ length: matchCount }, (_, index) => makeBracketMatch(`${stage.categoryId}-pre-${name}-${index + 1}`, `Clasificado ${index * 2 + 1}`, `Clasificado ${index * 2 + 2}`, {
        categoryId: stage.categoryId,
        score: "A programar",
        connectionNote: "Cruce pendiente del ranking preliminar de la categoria",
      })),
    });
    matchCount = Math.max(1, matchCount / 2);
  });

  return rounds;
}

export function buildPreliminaryStructure(state, tournament, stage, players) {
  const sorted = sortByRanking(players);
  const preliminaryBye = sorted.length % 2 === 1 ? sorted[0] : null;
  const playablePlayers = preliminaryBye ? sorted.slice(1) : sorted;
  const preliminaries = [];

  if (preliminaryBye) {
    preliminaries.push({
      playerA: preliminaryBye.fullName,
      playerB: "BYE",
      status: "Bye preliminar",
      result: "Clasifica directo por ranking de categoria",
      winner: preliminaryBye.fullName,
      bye: true,
      byePlayerId: preliminaryBye.id,
    });
  }

  for (let index = 0; index < playablePlayers.length; index += 2) {
    const playerA = playablePlayers[index];
    const playerB = playablePlayers[index + 1];
    const bracketMatch = makeBracketMatch(`${stage.categoryId}-pre-${index / 2 + 1}`, playerA, playerB, {
      categoryId: stage.categoryId,
      connectionNote: "Preliminar de categoria",
    });
    const round = { id: `${stage.categoryId}-preliminar`, name: "Preliminar" };
    const match = createMatch(state, tournament, stage, round, "Preliminar", bracketMatch, preliminaries.length);
    preliminaries.push({
      matchId: match?.id,
      playerA: playerA.fullName,
      playerB: playerB.fullName,
      status: match?.status || "Pendiente",
    });
  }

  return {
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    category: stage.categoryName,
    format: "Preliminar",
    preliminaries,
    preliminarySummary: {
      participants: sorted.length,
      preliminaryByes: preliminaryBye ? 1 : 0,
      preliminaryByePlayerId: preliminaryBye?.id || null,
      preliminaryByePlayer: preliminaryBye?.fullName || null,
      preliminaries: preliminaries.filter((match) => match.matchId).length,
      mainDrawSize: largestStandardDraw(sorted.length),
    },
    zones: [],
    zoneDistribution: [],
    rounds: buildPreliminarySkeleton(stage, sorted.length),
  };
}

function makeStage(tournamentId, categoryConfig, participants) {
  return {
    id: `${tournamentId}-${categoryConfig.categoryId}`,
    tournamentId,
    categoryId: categoryConfig.categoryId,
    categoryName: categoryConfig.categoryName,
    status: "Cuadro generado",
    format: categoryConfig.format,
    formatStatus: "confirmed",
    formatDecision: "dev-fixture",
    recommendedFormat: categoryConfig.format,
    matchFormat: DEFAULT_MATCH_FORMAT,
    participants: participants.map((player) => player.id),
    inscriptionsCount: participants.length,
    zonesConfig: categoryConfig.format === "Zonas" ? { zones: 7, qualifiers: 0, distribution: [4, 4, 4, 4, 3, 3, 3] } : null,
    bracketKey: bracketKey(tournamentId, categoryConfig.categoryId),
    progress: { totalMatches: 0, completedMatches: 0 },
  };
}

export function createTorneoGameFixture(overrides = {}) {
  const state = {
    players: [],
    tournaments: [],
    brackets: {},
    matches: [],
    rankings: [],
    rankingMovements: [],
    enrollments: [],
    schedule: [],
    matchAvailability: [],
  };
  const tournamentId = overrides.id || TORNEO_GAME_ID;
  const playersByCategory = new Map();

  TORNEO_GAME_CATEGORIES.forEach((categoryConfig) => {
    const players = Array.from({ length: categoryConfig.participantCount }, (_, index) => makePlayer(categoryConfig, index + 1));
    playersByCategory.set(categoryConfig.categoryId, players);
    state.players.push(...players);
    state.rankings.push(...players.map((player, index) => ({
      categoryId: categoryConfig.categoryId,
      playerId: player.id,
      position: index + 1,
      points: player.points,
    })));
    state.enrollments.push(...players.map((player) => ({
      id: `game-reg-${tournamentId}-${player.id}`,
      tournamentId,
      playerId: player.id,
      categoryId: categoryConfig.categoryId,
      categoryName: categoryConfig.categoryName,
      status: "Confirmada",
      date: "2026-08-01",
      payment: "DEV TEST",
      isDevTest: true,
    })));
  });

  const categoryStages = TORNEO_GAME_CATEGORIES.map((categoryConfig) => makeStage(tournamentId, categoryConfig, playersByCategory.get(categoryConfig.categoryId)));
  const tournament = {
    id: tournamentId,
    name: overrides.name || "Torneo GAME",
    description: "Fixture DEV aislado para validar arquitectura deportiva por categoria.",
    startDate: "2026-08-08",
    semifinalsDate: "2026-08-15",
    finalsDate: "2026-08-16",
    status: "En juego",
    type: "Formato por categoria",
    scoringSystemId: "score-game-1000",
    scoringSystem: "GAME 1000",
    matchFormat: DEFAULT_MATCH_FORMAT,
    price: 0,
    schedule: { saturday: ["09:00", "12:00", "16:00"], sunday: ["09:00", "12:00", "16:00"] },
    courtCapacity: { saturday: 3, sunday: 4 },
    categories: TORNEO_GAME_CATEGORIES.map((categoryConfig) => categoryConfig.categoryId),
    categoryStages,
    playerCategoryId: "cat-m5",
    playerCategoryName: "5ta Masculina",
    courts: ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4"],
    registrationStatus: "Inscripto",
    playerTournamentStatus: "Inscripto",
    phases: ["Zonas", "Preliminar", "Cuadro principal"],
    participants: state.players.map((player) => player.id),
    isDevTest: true,
    isTorneoGameFixture: true,
  };
  state.tournaments.push(tournament);

  categoryStages.forEach((stage) => {
    const categoryConfig = TORNEO_GAME_CATEGORIES.find((item) => item.categoryId === stage.categoryId);
    const players = playersByCategory.get(stage.categoryId);
    let bracket = null;
    if (categoryConfig.format === "Zonas") bracket = buildZonesStructure(state, tournament, stage, players);
    if (categoryConfig.format === "Eliminacion Directa") bracket = buildDirectElimination(state, tournament, stage, players);
    if (categoryConfig.format === "Preliminar") bracket = buildPreliminaryStructure(state, tournament, stage, players);
    state.brackets[stage.bracketKey] = bracket;
    stage.progress = {
      totalMatches: state.matches.filter((match) => match.tournamentId === tournamentId && match.categoryId === stage.categoryId).length,
      completedMatches: 0,
    };
  });

  return state;
}

export function getTorneoGameDiagnostics(db, tournamentId = TORNEO_GAME_ID) {
  const tournament = db.tournaments.find((item) => item.id === tournamentId);
  const stages = tournament?.categoryStages || [];
  const categoryDiagnostics = stages.map((stage) => {
    const bracket = db.brackets[stage.bracketKey] || null;
    const participants = stage.participants || [];
    const matches = db.matches.filter((match) => match.tournamentId === tournamentId && match.categoryId === stage.categoryId);
    const preliminaries = bracket?.preliminaries || [];
    return {
      categoryId: stage.categoryId,
      categoryName: stage.categoryName,
      format: stage.format,
      bracketKey: stage.bracketKey,
      participantCount: participants.length,
      uniqueParticipantCount: new Set(participants).size,
      matchCount: matches.length,
      matchesHaveCorrectCategoryId: matches.every((match) => match.categoryId === stage.categoryId),
      zoneDistribution: bracket?.zoneDistribution || [],
      zoneTotal: (bracket?.zoneDistribution || []).reduce((total, size) => total + size, 0),
      zonesHaveValidSize: (bracket?.zoneDistribution || []).every((size) => size >= 3 && size <= 4),
      preliminaryByeCount: preliminaries.filter((match) => match.bye).length,
      preliminaryByePlayer: bracket?.preliminarySummary?.preliminaryByePlayer || null,
      preliminaryMatchCount: preliminaries.filter((match) => match.matchId).length,
      rounds: (bracket?.rounds || []).map((round) => ({ name: round.name, matches: round.matches.length })),
    };
  });
  const allParticipants = stages.flatMap((stage) => stage.participants || []);
  const bracketKeys = stages.map((stage) => stage.bracketKey);

  return {
    tournamentId,
    tournamentName: tournament?.name || null,
    categoryStageCount: stages.length,
    categories: categoryDiagnostics,
    bracketKeysAreDistinct: new Set(bracketKeys).size === bracketKeys.length,
    participantsAreDistinct: new Set(allParticipants).size === allParticipants.length,
    noGlobalBracket: !db.brackets[tournamentId],
    playerIdsSharedAcrossCategories: allParticipants.filter((playerId, index) => allParticipants.indexOf(playerId) !== index),
  };
}
