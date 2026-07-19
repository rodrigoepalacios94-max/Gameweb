import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";
import { mockRequest } from "./serviceUtils";

export const TOURNAMENT_FORMATS = ["Preliminar", "Zonas", "Eliminacion Directa"];
const STANDARD_DRAWS = [4, 8, 16, 32, 64];

export function recommendTournamentFormat(participantCount = 0) {
  const count = Number(participantCount || 0);
  if (count <= 0) return null;
  if ([8, 16, 32].includes(count)) return "Eliminacion Directa";
  if (count >= 30 && count <= 48) return "Preliminar";
  if (count % 2 !== 0) return "Zonas";
  if ([12, 20, 24, 28].includes(count)) return "Zonas";
  if (count >= 10 && count < 30) return "Zonas";
  return "Eliminacion Directa";
}

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

  tournament.categoryStages = categories.map((categoryId) => {
    const category = getCategoryById(db, categoryId);
    const enrolled = enrollmentParticipants(db, tournament.id, categoryId);
    const legacy = legacyParticipants(db, tournament, categoryId);
    const participantIds = [...new Set([...(existingByCategory.get(categoryId)?.participants || []), ...enrolled, ...legacy])];
    const previous = existingByCategory.get(categoryId) || {};
    const recommendedFormat = participantIds.length ? recommendTournamentFormat(participantIds.length) : null;
    const formatStatus = previous.formatStatus || (participantIds.length ? (previous.format ? "confirmed" : "pending") : "empty");
    const status = previous.status || (participantIds.length ? (formatStatus === "confirmed" ? "Formato confirmado" : "Formato pendiente") : "Sin inscriptos");

    return {
      id: previous.id || `${tournament.id}-${categoryId}`,
      tournamentId: tournament.id,
      categoryId,
      categoryName: previous.categoryName || getCategoryLabel(category),
      status,
      format: previous.format || "",
      formatStatus,
      formatDecision: previous.formatDecision || (formatStatus === "confirmed" ? "legacy" : "pending"),
      recommendedFormat: previous.recommendedFormat || recommendedFormat,
      matchFormat: previous.matchFormat || tournament.matchFormat || DEFAULT_MATCH_FORMAT,
      participants: participantIds,
      inscriptionsCount: participantIds.length,
      zonesConfig: previous.zonesConfig || null,
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
    playerANote: playerA?.testNote || extra.playerANote,
    playerBNote: playerB?.testNote || extra.playerBNote,
    score: extra.score || "Pendiente",
    winner: extra.winner || null,
    matchId: extra.matchId || null,
    bye: Boolean(extra.bye),
    connectionNote: extra.connectionNote,
  };
}

function createMatchFromBracket(db, tournament, stage, round, bracketMatch, index, phase = "Cuadro principal") {
  if (!bracketMatch.playerAId || !bracketMatch.playerBId || bracketMatch.bye || bracketMatch.matchId) return null;
  const id = createMockId("match");
  const match = {
    id,
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    tournament: tournament.name,
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
  };
  db.matches.push(match);
  bracketMatch.matchId = id;
  bracketMatch.connectionNote = bracketMatch.connectionNote || `Partido ${index + 1} de ${round.name}`;
  return match;
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

function makePairedRound(stage, roundId, roundName, entrants, connectionNote) {
  const slots = placeSeededEntrants(entrants, entrants.length);
  const matches = [];
  for (let index = 0; index < slots.length; index += 2) {
    matches.push(makeBracketMatch(`${stage.categoryId}-${roundId}-${matches.length + 1}`, slots[index], slots[index + 1], { connectionNote }));
  }
  return { id: `${stage.categoryId}-${roundId}`, name: roundName, matches };
}

function buildFutureRounds(stage, drawSize, firstRoundIndex = 1) {
  const names = nextMainRoundNames(drawSize).slice(firstRoundIndex);
  let matchCount = drawSize / 4;
  return names.map((name, roundOffset) => {
    const count = Math.max(1, matchCount / (2 ** roundOffset));
    return {
      id: `${stage.categoryId}-${name.toLowerCase()}-${roundOffset + 1}`,
      name,
      matches: Array.from({ length: count }, (_, index) => makeBracketMatch(`${stage.categoryId}-${name}-${index + 1}`, `Ganador ${name} ${index + 1}`, "A definir")),
    };
  });
}

function buildDirectElimination(db, tournament, stage, players) {
  const sorted = sortByRanking(players);
  const baseDrawSize = players.length <= 4 ? Math.max(2, players.length) : largestStandardDraw(players.length);
  const hasPreviousRound = players.length > baseDrawSize;
  const previousPlayersCount = hasPreviousRound ? (players.length - baseDrawSize) * 2 : 0;
  const previousPlayers = hasPreviousRound ? sorted.slice(-previousPlayersCount) : [];
  const directPlayers = hasPreviousRound ? sorted.slice(0, sorted.length - previousPlayersCount) : sorted;
  const rounds = [];
  const previousWinnerSlots = [];

  if (hasPreviousRound) {
    const previousMatches = [];
    for (let index = 0; index < previousPlayers.length; index += 2) {
      previousMatches.push(makeBracketMatch(`${stage.categoryId}-32avos-${previousMatches.length + 1}`, previousPlayers[index], previousPlayers[index + 1], {
        connectionNote: "Ronda previa para completar el cuadro base sin byes masivos",
      }));
      previousWinnerSlots.push(`Ganador 32avos ${previousMatches.length}`);
    }
    const previousRound = { id: `${stage.categoryId}-32avos`, name: "32avos", matches: previousMatches };
    previousRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, previousRound, match, index));
    rounds.push(previousRound);
  }

  const mainEntrants = [...directPlayers, ...previousWinnerSlots];
  const mainRoundNames = nextMainRoundNames(baseDrawSize);
  const firstMainRound = makePairedRound(stage, "main-1", mainRoundNames[0], mainEntrants, "Cuadro principal de eliminacion directa");
  firstMainRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, firstMainRound, match, index));
  rounds.push(firstMainRound, ...buildFutureRounds(stage, baseDrawSize));
  return rounds;
}

function buildPreliminaries(db, tournament, stage, players) {
  const sorted = sortByRanking(players);
  const pairs = [];
  for (let index = 0; index < sorted.length; index += 2) {
    pairs.push([sorted[index], sorted[index + 1]]);
  }

  return pairs.map(([playerA, playerB], index) => {
    if (!playerB) {
      return {
        playerA: playerA.fullName,
        playerB: "A definir",
        status: "Clasifica directo",
        result: "Sin rival preliminar",
        winner: playerA.fullName,
      };
    }
    const bracketMatch = makeBracketMatch(`${stage.categoryId}-pre-${index + 1}`, playerA, playerB);
    const round = { id: `${stage.categoryId}-preliminar`, name: "Preliminar" };
    const match = createMatchFromBracket(db, tournament, stage, round, bracketMatch, index, "Preliminar");
    return {
      matchId: match?.id,
      playerA: playerA.fullName,
      playerB: playerB.fullName,
      status: match?.status || "Pendiente",
    };
  });
}

function buildPreliminarySkeletonRounds(stage, participantCount) {
  const baseDrawSize = largestStandardDraw(participantCount);
  const previousMatchCount = participantCount > baseDrawSize ? participantCount - baseDrawSize : 0;
  const rounds = [];

  if (previousMatchCount > 0) {
    rounds.push({
      id: `${stage.categoryId}-32avos`,
      name: "32avos",
      matches: Array.from({ length: previousMatchCount }, (_, index) => makeBracketMatch(`${stage.categoryId}-pre-32-${index + 1}`, `Peor perdedor ${index * 2 + 1}`, `Peor perdedor ${index * 2 + 2}`, {
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
        score: "A programar",
        connectionNote: "Cruce pendiente del ranking preliminar",
      })),
    });
    matchCount = Math.max(1, matchCount / 2);
  });

  return rounds;
}

function getPreliminaryPerformance(match, playerId) {
  if (match.winnerId === playerId) return match.preliminaryScore ?? 0;
  return match.loserPreliminaryScore ?? -999;
}

export function buildPreliminaryBracketFromResults(db, tournament, categoryId) {
  const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
  if (!stage) return null;
  const prelimMatches = db.matches
    .filter((match) => match.tournamentId === tournament.id && match.categoryId === categoryId && match.phase === "Preliminar")
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (!prelimMatches.length || prelimMatches.some((match) => match.status !== "Finalizado" || !match.winnerId)) return null;

  const winners = prelimMatches.map((match, index) => {
    const winnerIsA = match.winnerId === match.playerAId;
    return {
      id: match.winnerId,
      fullName: winnerIsA ? match.playerA : match.playerB,
      avatar: winnerIsA ? match.playerAAvatar : match.playerBAvatar,
      ranking: getPlayerById(db, match.winnerId)?.ranking || index + 1,
      preliminaryScore: getPreliminaryPerformance(match, match.winnerId),
      testNote: "Ganador preliminar",
    };
  }).sort((a, b) => b.preliminaryScore - a.preliminaryScore || a.ranking - b.ranking);

  const losers = prelimMatches.map((match, index) => {
    const loserId = match.winnerId === match.playerAId ? match.playerBId : match.playerAId;
    return {
      id: loserId,
      fullName: match.winnerId === match.playerAId ? match.playerB : match.playerA,
      avatar: match.winnerId === match.playerAId ? match.playerBAvatar : match.playerAAvatar,
      ranking: getPlayerById(db, loserId)?.ranking || index + winners.length + 1,
      preliminaryScore: getPreliminaryPerformance(match, loserId),
      testNote: "Perdedor clasificado",
    };
  }).sort((a, b) => b.preliminaryScore - a.preliminaryScore || a.ranking - b.ranking);

  const baseDrawSize = largestStandardDraw(winners.length + losers.length);
  const previousMatchCount = Math.max(0, winners.length + losers.length - baseDrawSize);
  const bestWinners = winners.slice(0, previousMatchCount || 2);
  const worstWinners = winners.slice(-(previousMatchCount || 2));
  const directWinners = winners.slice(previousMatchCount || 2, Math.max(previousMatchCount || 2, winners.length - (previousMatchCount || 2)));
  const directLosersCount = Math.max(0, baseDrawSize - directWinners.length - bestWinners.length - worstWinners.length - previousMatchCount);
  const directLosers = losers.slice(0, directLosersCount);
  const worstLosers = losers.slice(directLosersCount, directLosersCount + previousMatchCount * 2);

  const rounds = [];
  if (previousMatchCount) {
    const round32 = {
      id: `${stage.categoryId}-32avos`,
      name: "32avos",
      matches: Array.from({ length: previousMatchCount }, (_, index) => makeBracketMatch(`${stage.categoryId}-32avos-${index + 1}`, worstLosers[index * 2], worstLosers[index * 2 + 1], {
        connectionNote: "Los peores perdedores definen los ultimos lugares del cuadro",
      })),
    };
    round32.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, round32, match, index));
    rounds.push(round32);
  }

  const round16Matches = [
    ...bestWinners.slice(0, previousMatchCount).map((winner, index) => makeBracketMatch(`${stage.categoryId}-16-best-${index + 1}`, winner, `Ganador 32avos ${index + 1}`, {
      connectionNote: "Mejor ganador vs ganador de 32avos",
    })),
    ...directWinners.map((winner, index) => makeBracketMatch(`${stage.categoryId}-16-cross-${index + 1}`, winner, directLosers[index], {
      connectionNote: "Ganador preliminar vs perdedor clasificado",
    })),
    ...worstWinners.reduce((pairs, winner, index) => {
      if (index % 2 === 0) pairs.push([winner, worstWinners[index + 1]]);
      return pairs;
    }, []).map((pair, index) => makeBracketMatch(`${stage.categoryId}-16-worst-${index + 1}`, pair[0], pair[1], {
      connectionNote: "Peores ganadores entre si",
    })),
  ].slice(0, baseDrawSize / 2);

  while (round16Matches.length < baseDrawSize / 2) {
    const next = round16Matches.length + 1;
    round16Matches.push(makeBracketMatch(`${stage.categoryId}-16-fill-${next}`, `Clasificado ${next * 2 - 1}`, `Clasificado ${next * 2}`, { score: "A programar" }));
  }

  const firstMainRoundName = nextMainRoundNames(baseDrawSize)[0];
  const firstMainRound = { id: `${stage.categoryId}-main-preliminar`, name: firstMainRoundName, matches: round16Matches };
  firstMainRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, firstMainRound, match, index));
  rounds.push(firstMainRound, ...buildFutureRounds(stage, baseDrawSize));

  const bracket = {
    tournamentId: tournament.id,
    categoryId,
    category: stage.categoryName,
    format: "Preliminar",
    preliminaries: prelimMatches.map((match) => ({
      matchId: match.id,
      playerA: match.playerA,
      playerB: match.playerB,
      status: match.status,
      result: match.result,
      winner: match.winnerId === match.playerAId ? match.playerA : match.playerB,
    })),
    preliminarySummary: {
      winners: winners.length,
      losers: losers.length,
      directLosers: directLosers.length,
      previousRoundPlayers: worstLosers.length,
      mainDrawSize: baseDrawSize,
    },
    zones: [],
    rounds,
  };

  db.brackets[stage.bracketKey] = bracket;
  db.brackets[`${tournament.id}::${categoryId}`] = bracket;
  if (tournament.playerCategoryId === categoryId) db.brackets[tournament.id] = bracket;
  stage.status = "Cuadro generado";
  return bracket;
}

export function proposeZoneDistribution(participantCount = 0) {
  const count = Number(participantCount || 0);
  if (count <= 0) return [];
  if (count <= 4) return [count];
  let zoneCount = Math.max(1, Math.round(count / 3.5));
  while (Math.ceil(count / zoneCount) > 4) zoneCount += 1;
  while (zoneCount > 1 && Math.floor(count / zoneCount) < 3) zoneCount -= 1;
  const base = Math.floor(count / zoneCount);
  const remainder = count % zoneCount;
  return Array.from({ length: zoneCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function buildZones(db, tournament, stage, players) {
  const sorted = sortByRanking(players);
  const distribution = proposeZoneDistribution(sorted.length);
  let cursor = 0;
  const zones = distribution.map((size, index) => {
    const zonePlayers = sorted.slice(cursor, cursor + size);
    cursor += size;
    return {
      id: `${stage.categoryId}-zone-${index + 1}`,
      name: `Zona ${String.fromCharCode(65 + index)}`,
      qualifiers: stage.zonesConfig?.qualifiers || 1,
      players: zonePlayers.map((player) => player.fullName),
      size,
    };
  });

  zones.forEach((zone, zoneIndex) => {
    const zonePlayers = sorted.slice(
      distribution.slice(0, zoneIndex).reduce((total, size) => total + size, 0),
      distribution.slice(0, zoneIndex + 1).reduce((total, size) => total + size, 0),
    );
    for (let a = 0; a < zonePlayers.length; a += 1) {
      for (let b = a + 1; b < zonePlayers.length; b += 1) {
        const bracketMatch = makeBracketMatch(`${zone.id}-match-${a}-${b}`, zonePlayers[a], zonePlayers[b], {
          connectionNote: `${zone.name}: todos contra todos`,
        });
        createMatchFromBracket(db, tournament, stage, { id: zone.id, name: zone.name }, bracketMatch, b, "Zonas");
      }
    }
  });

  return zones;
}

function buildZoneFinalSkeleton(stage, zones) {
  const qualifierCount = zones.reduce((total, zone) => total + zone.qualifiers, 0);
  const drawSize = STANDARD_DRAWS.find((size) => size >= qualifierCount) || 64;
  const names = nextMainRoundNames(drawSize);
  let matchCount = drawSize / 2;
  return names.map((name, roundIndex) => {
    const round = {
      id: `${stage.categoryId}-zones-${roundIndex + 1}`,
      name,
      matches: Array.from({ length: matchCount }, (_, index) => makeBracketMatch(`${stage.categoryId}-zones-${name}-${index + 1}`, `Clasificado ${index * 2 + 1}`, `Clasificado ${index * 2 + 2}`, {
        score: "A programar",
        connectionNote: "Fase final pendiente de clasificacion de zonas",
      })),
    };
    matchCount = Math.max(1, matchCount / 2);
    return round;
  });
}

export function generateCategoryBracketInDb(db, tournamentId, categoryId) {
  const tournament = db.tournaments.find((item) => item.id === tournamentId);
  if (!tournament) return null;
  const stages = ensureTournamentCategoryStages(db, tournament);
  const stage = stages.find((item) => item.categoryId === categoryId);
  if (!stage) return null;
  if (!stage.participants?.length) {
    stage.status = "Sin inscriptos";
    stage.formatStatus = "empty";
    return null;
  }
  if (stage.formatStatus && stage.formatStatus !== "confirmed") return null;
  if (!TOURNAMENT_FORMATS.includes(stage.format)) return null;

  db.matches = db.matches.filter((match) => !(match.tournamentId === tournamentId && match.categoryId === categoryId && !match.result));
  const players = stage.participants.map((playerId) => getPlayerById(db, playerId)).filter(Boolean);
  const bracket = {
    tournamentId,
    categoryId,
    category: stage.categoryName,
    format: stage.format,
    preliminaries: [],
    preliminarySummary: null,
    zones: [],
    zoneDistribution: [],
    rounds: [],
  };

  if (stage.format === "Preliminar") {
    bracket.preliminaries = buildPreliminaries(db, tournament, stage, players);
    bracket.rounds = buildPreliminarySkeletonRounds(stage, players.length);
    bracket.preliminarySummary = {
      participants: players.length,
      preliminaries: bracket.preliminaries.filter((match) => match.matchId).length,
      mainDrawSize: largestStandardDraw(players.length),
    };
  } else if (stage.format === "Zonas") {
    bracket.zones = buildZones(db, tournament, stage, players);
    bracket.zoneDistribution = bracket.zones.map((zone) => zone.size);
    stage.zonesConfig = {
      zones: bracket.zones.length,
      qualifiers: bracket.zones[0]?.qualifiers || 1,
      distribution: bracket.zoneDistribution,
    };
    bracket.rounds = buildZoneFinalSkeleton(stage, bracket.zones);
  } else {
    bracket.rounds = buildDirectElimination(db, tournament, stage, players);
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
      const stages = ensureTournamentCategoryStages(db, tournament);
      tournament.status = "Inscripciones cerradas";
      tournament.registrationClosedBy = actor;
      stages.forEach((stage) => {
        stage.inscriptionsCount = stage.participants?.length || 0;
        stage.recommendedFormat = recommendTournamentFormat(stage.inscriptionsCount);
        if (!stage.inscriptionsCount) {
          stage.status = "Sin inscriptos";
          stage.formatStatus = "empty";
          stage.format = "";
          stage.formatDecision = "empty";
          return;
        }
        if (stage.formatStatus !== "confirmed") {
          stage.format = stage.format || stage.recommendedFormat;
          stage.status = "Formato sugerido";
          stage.formatStatus = "suggested";
          stage.formatDecision = "suggested";
        }
      });
      return tournament;
    }), "No pudimos cerrar inscripciones.");
  },
  async updateCategoryFormat(tournamentId, categoryId, format) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament || !TOURNAMENT_FORMATS.includes(format)) return null;
      if (tournament.status === "Inscripciones abiertas") return null;
      const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
      if (!stage) return null;
      stage.format = format;
      stage.formatDecision = format === stage.recommendedFormat ? "suggested" : "manual";
      if (stage.formatStatus === "pending") stage.formatStatus = "suggested";
      if (stage.status === "Formato pendiente") stage.status = "Formato sugerido";
      return stage;
    }), "No pudimos actualizar formato por categoria.");
  },
  async confirmCategoryFormat(tournamentId, categoryId, format) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament || !TOURNAMENT_FORMATS.includes(format)) return null;
      if (tournament.status === "Inscripciones abiertas") return null;
      const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
      if (!stage) return null;
      if (!stage.inscriptionsCount) {
        stage.status = "Sin inscriptos";
        stage.formatStatus = "empty";
        return stage;
      }
      stage.format = format;
      stage.recommendedFormat = stage.recommendedFormat || recommendTournamentFormat(stage.inscriptionsCount);
      stage.formatDecision = format === stage.recommendedFormat ? "suggested" : "manual";
      stage.formatStatus = "confirmed";
      stage.status = "Formato confirmado";
      generateCategoryBracketInDb(db, tournamentId, categoryId);
      return stage;
    }), "No pudimos confirmar formato por categoria.");
  },
  async confirmAllCategoryFormats(tournamentId) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return [];
      if (tournament.status === "Inscripciones abiertas") return [];
      return ensureTournamentCategoryStages(db, tournament).map((stage) => {
        const format = stage.format || stage.recommendedFormat || recommendTournamentFormat(stage.inscriptionsCount);
        if (!format) {
          stage.status = "Sin inscriptos";
          stage.formatStatus = "empty";
          return stage;
        }
        stage.format = format;
        stage.recommendedFormat = stage.recommendedFormat || recommendTournamentFormat(stage.inscriptionsCount);
        stage.formatDecision = format === stage.recommendedFormat ? "suggested" : "manual";
        stage.formatStatus = "confirmed";
        stage.status = "Formato confirmado";
        generateCategoryBracketInDb(db, tournamentId, stage.categoryId);
        return stage;
      });
    }), "No pudimos confirmar formatos por categoria.");
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
