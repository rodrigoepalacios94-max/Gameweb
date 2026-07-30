import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";
import { getZoneBracketValidation, getZoneMainRoundNames, getZoneValidationMessage, normalizeZoneQualifierCount, orderZoneQualifiersForBracket, pairZoneAccessPlayers, proposeZoneDistribution, resolveZoneQualifiers } from "../utils/zoneFormat";
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

function createByeMatch(db, tournament, stage, player, roundName, index) {
  const id = createMockId("match");
  const match = {
    id,
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    tournament: tournament.name,
    category: stage.categoryName,
    round: roundName,
    phase: "BYE",
    playerAId: player.id,
    playerA: player.fullName,
    playerAAvatar: player.avatar,
    playerBId: null,
    playerB: "BYE",
    playerBAvatar: null,
    opponentId: null,
    opponent: "BYE",
    opponentAvatar: null,
    date: "",
    time: "No programable",
    court: "No programable",
    status: "Finalizado",
    attendanceStatus: {},
    result: "6-0 / 6-0",
    resultDetail: { type: "BYE", source: "Ranking General", note: "Victoria administrativa por BYE." },
    sets: [{ playerA: 6, playerB: 0 }, { playerA: 6, playerB: 0 }],
    winnerId: player.id,
    loserId: null,
    pointsEarned: 0,
    discipline: { claims: [], confirmedFaults: [] },
    bye: true,
    byeSource: "Ranking General",
    connectionNote: `BYE ${index + 1} por Ranking General`,
  };
  db.matches.push(match);
  return match;
}

function largestStandardDraw(count) {
  return [...STANDARD_DRAWS].reverse().find((size) => size <= count) || 4;
}

function nextMainRoundNames(drawSize) {
  if (drawSize >= 32) return ["16avos", "Octavos", "Cuartos", "Semifinal", "Final"];
  if (drawSize === 16) return ["8vos", "Cuartos", "Semifinal", "Final"];
  if (drawSize === 8) return ["Cuartos", "Semifinal", "Final"];
  if (drawSize === 4) return ["Semifinal", "Final"];
  return ["Final"];
}

function previousAccessRoundName(baseDrawSize) {
  if (baseDrawSize >= 32) return "32avos";
  if (baseDrawSize === 16) return "16avos";
  if (baseDrawSize === 8) return "8vos";
  if (baseDrawSize === 4) return "Cuartos";
  return "Ronda de acceso";
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
  const accessMatchCount = Math.max(0, players.length - baseDrawSize);
  const previousPlayersCount = accessMatchCount * 2;
  const previousPlayers = previousPlayersCount ? sorted.slice(-previousPlayersCount) : [];
  const directPlayers = previousPlayersCount ? sorted.slice(0, sorted.length - previousPlayersCount) : sorted;
  const rounds = [];
  const previousWinnerSlots = [];
  const accessRoundName = previousAccessRoundName(baseDrawSize);
  const directByes = previousPlayersCount
    ? directPlayers.map((player, index) => {
        const match = createByeMatch(db, tournament, stage, player, accessRoundName, index);
        return {
          playerId: player.id,
          player: player.fullName,
          source: "Ranking General",
          score: "6-0 / 6-0",
          matchId: match.id,
        };
      })
    : [];

  if (previousPlayers.length) {
    const previousMatches = [];
    for (let index = 0; index < previousPlayers.length; index += 2) {
      previousMatches.push(makeBracketMatch(`${stage.categoryId}-${accessRoundName}-${previousMatches.length + 1}`, previousPlayers[index], previousPlayers[index + 1], {
        connectionNote: "Primera instancia para completar la llave con BYE por Ranking General",
      }));
      previousWinnerSlots.push(`Ganador ${accessRoundName} ${previousMatches.length}`);
    }
    const previousRound = { id: `${stage.categoryId}-${accessRoundName}`, name: accessRoundName, matches: previousMatches };
    previousRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, previousRound, match, index));
    rounds.push(previousRound);
  }

  const mainEntrants = [...directPlayers.map((player) => ({ ...player, testNote: "BYE por Ranking General" })), ...previousWinnerSlots];
  const mainRoundNames = nextMainRoundNames(baseDrawSize);
  const firstMainRound = makePairedRound(stage, "main-1", mainRoundNames[0], mainEntrants, "Cuadro principal de eliminacion directa");
  firstMainRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, firstMainRound, match, index));
  rounds.push(firstMainRound, ...buildFutureRounds(stage, baseDrawSize));
  return { rounds, directByes };
}

function buildPreliminaries(db, tournament, stage, players) {
  const sorted = sortByRanking(players);
  const preliminaryBye = sorted.length % 2 === 1 ? sorted[0] : null;
  const playablePlayers = preliminaryBye ? sorted.slice(1) : sorted;
  const pairs = [];
  for (let index = 0; index < playablePlayers.length; index += 2) {
    pairs.push([playablePlayers[index], playablePlayers[index + 1]]);
  }

  const byeEntry = preliminaryBye ? [{
    playerA: preliminaryBye.fullName,
    playerB: "BYE",
    status: "Bye preliminar",
    result: "Clasifica directo por ranking de categoria",
    winner: preliminaryBye.fullName,
    bye: true,
    byePlayerId: preliminaryBye.id,
  }] : [];

  return [
    ...byeEntry,
    ...pairs.map(([playerA, playerB], index) => {
      const bracketMatch = makeBracketMatch(`${stage.categoryId}-pre-${index + 1}`, playerA, playerB);
      const round = { id: `${stage.categoryId}-preliminar`, name: "Preliminar" };
      const match = createMatchFromBracket(db, tournament, stage, round, bracketMatch, index, "Preliminar");
      return {
        matchId: match?.id,
        playerA: playerA.fullName,
        playerB: playerB.fullName,
        status: match?.status || "Pendiente",
      };
    }),
  ];
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
  stage.status = "Cuadro generado";
  return bracket;
}

function buildZones(db, tournament, stage, players) {
  const sorted = sortByRanking(players);
  const distribution = proposeZoneDistribution(sorted.length);
  let cursor = 0;
  const zones = distribution.map((size, index) => {
    const zonePlayers = sorted.slice(cursor, cursor + size);
    const zoneId = `${stage.categoryId}-zone-${index + 1}`;
    const configuredQualifiers = stage.zonesConfig?.zoneQualifiers?.[zoneId] ?? stage.zonesConfig?.qualifiers;
    cursor += size;
    return {
      id: zoneId,
      name: `Zona ${String.fromCharCode(65 + index)}`,
      qualifiers: normalizeZoneQualifierCount(configuredQualifiers || 1),
      players: zonePlayers.map((player) => player.fullName),
      playerIds: zonePlayers.map((player) => player.id),
      size,
      status: "Pendiente de clasificacion",
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

function applyZoneValidation(bracket) {
  (bracket?.zones || []).forEach((zone) => {
    zone.qualifiers = normalizeZoneQualifierCount(zone.qualifiers || 1);
  });
  const validation = getZoneBracketValidation((bracket?.zones || []).reduce((total, zone) => total + Number(zone.qualifiers || 0), 0));
  bracket.zoneValidation = validation;
  bracket.zoneClassificationStatus = getZoneValidationMessage(validation);
  return validation;
}

function getZonePlayerObjects(db, zone) {
  if (zone.playerIds?.length) {
    return zone.playerIds.map((playerId) => getPlayerById(db, playerId)).filter(Boolean);
  }
  return (zone.players || []).map((player, index) => ({
    id: null,
    fullName: player,
    ranking: index + 1,
  }));
}

function getZoneStandings(db, zone) {
  if (zone.standings?.length) {
    return zone.standings.map((standing) => {
      const player = standing.playerId ? getPlayerById(db, standing.playerId) : null;
      return {
        ...player,
        id: standing.playerId || player?.id,
        fullName: standing.playerName || player?.fullName,
        zonePoints: standing.zonePoints ?? standing.points ?? standing.wins ?? 0,
        wins: standing.wins ?? 0,
        played: standing.played ?? 0,
        setsWon: standing.setsWon ?? 0,
        setsLost: standing.setsLost ?? 0,
        setsDiff: standing.setsDiff ?? standing.setDifference ?? (Number(standing.setsWon || 0) - Number(standing.setsLost || 0)),
        gamesWon: standing.gamesWon ?? 0,
        gamesLost: standing.gamesLost ?? 0,
        gamesDiff: standing.gamesDiff ?? standing.gameDifference ?? (Number(standing.gamesWon || 0) - Number(standing.gamesLost || 0)),
        ranking: standing.ranking ?? player?.ranking ?? 9999,
        position: standing.position,
      };
    });
  }
  return getZonePlayerObjects(db, zone).map((player) => ({
    ...player,
    zonePoints: player.zonePoints ?? 0,
    wins: player.wins ?? 0,
    played: player.played ?? 0,
    setsWon: player.setsWon ?? 0,
    setsLost: player.setsLost ?? 0,
    setsDiff: player.setsDiff ?? 0,
    gamesWon: player.gamesWon ?? 0,
    gamesLost: player.gamesLost ?? 0,
    gamesDiff: player.gamesDiff ?? 0,
    ranking: player.ranking ?? 9999,
    position: player.position,
  }));
}

export function buildZoneEliminationBracket(db, tournament, stage, bracket) {
  const validation = applyZoneValidation(bracket);
  if (!validation.valid) {
    bracket.rounds = [];
    stage.status = "Zonas en juego";
    return { ok: false, bracket, validation, message: bracket.zoneClassificationStatus };
  }

  const zoneResolutions = (bracket.zones || []).map((zone) => ({
    zoneId: zone.id,
    zoneName: zone.name,
    zoneSize: zone.size,
    ...resolveZoneQualifiers(getZoneStandings(db, zone), Number(zone.qualifiers || 0)),
  }));
  const qualifiers = zoneResolutions.flatMap((resolution) =>
    resolution.qualifiers.map((player) => ({
      ...player,
      zoneId: resolution.zoneId,
      zoneName: resolution.zoneName,
      zoneSize: resolution.zoneSize,
      zonePosition: player.position,
      testNote: `Clasificado ${resolution.zoneName}`,
    }))
  );
  bracket.zoneResolutions = zoneResolutions.map((resolution) => ({
    zoneId: resolution.zoneId,
    zoneName: resolution.zoneName,
    usedRankingGeneral: resolution.usedRankingGeneral,
    tiebreaks: resolution.tiebreaks,
    qualifiers: resolution.qualifiers.map((player) => ({
      playerId: player.id,
      player: player.fullName || player.name || player.player,
      ranking: player.ranking,
    })),
  }));
  const orderedQualifiers = orderZoneQualifiersForBracket(qualifiers);
  const directQualifiers = orderedQualifiers.slice(0, validation.directPlayers);
  const accessQualifiers = orderedQualifiers.slice(validation.directPlayers);
  const accessPairing = pairZoneAccessPlayers(accessQualifiers);
  const entrants = [
    ...directQualifiers,
    ...accessPairing.pairs.map((_, index) => `Ganador ${validation.accessRoundName} ${index + 1}`),
  ];
  const roundNames = getZoneMainRoundNames(validation.target);
  db.matches = db.matches.filter((match) => !(match.tournamentId === tournament.id && match.categoryId === stage.categoryId && match.phase === "Cuadro principal" && !match.result));
  const accessRound = validation.accessMatches ? {
    id: `${stage.categoryId}-zones-access`,
    name: validation.accessRoundName,
    matches: accessPairing.pairs.map(([playerA, playerB], index) => makeBracketMatch(`${stage.categoryId}-zones-access-${index + 1}`, playerA, playerB, {
      connectionNote: "Ronda de acceso generada desde clasificados de zonas",
    })),
  } : null;
  if (accessRound) {
    accessRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, accessRound, match, index));
  }
  const firstRound = makePairedRound(stage, "zones-main-1", roundNames[0], entrants, "Fase final generada desde zonas");
  firstRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, firstRound, match, index));
  bracket.rounds = [
    ...(accessRound ? [accessRound] : []),
    firstRound,
    ...roundNames.slice(1).map((name, roundOffset) => {
    const matchCount = Math.max(1, validation.target / (2 ** (roundOffset + 2)));
    return {
      id: `${stage.categoryId}-zones-${name.toLowerCase()}-${roundOffset + 2}`,
      name,
      matches: Array.from({ length: matchCount }, (_, index) => makeBracketMatch(`${stage.categoryId}-zones-${name}-${index + 1}`, `Ganador ${name} ${index + 1}`, "A definir", {
        score: "A programar",
        connectionNote: "Cruce pendiente de la fase final de zonas",
      })),
    };
  })];
  bracket.qualifiers = orderedQualifiers.map((player, index) => ({
    playerId: player.id,
    playerName: player.fullName || player.name || player.player,
    zoneId: player.zoneId,
    zoneName: player.zoneName,
    zoneSize: player.zoneSize,
    zonePosition: player.zonePosition,
    ranking: player.ranking,
    sportOrder: index + 1,
    entryPath: index < validation.directPlayers ? "direct" : "access",
  }));
  bracket.zoneAccessPlan = {
    total: validation.total,
    target: validation.target,
    directPlayers: validation.directPlayers,
    accessPlayers: validation.accessPlayers,
    accessMatches: validation.accessMatches,
    accessRoundName: validation.accessRoundName,
    directRoundName: validation.directRoundName,
    sameZoneAccessPairs: accessPairing.sameZonePairs,
    avoidedSameZone: accessPairing.avoidedSameZone,
  };
  bracket.zoneGeneratedAt = new Date().toISOString();
  stage.status = "Cuadro generado";
  return { ok: true, bracket, validation, message: bracket.zoneClassificationStatus };
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
      preliminaryByes: bracket.preliminaries.filter((match) => match.bye).length,
      preliminaryByePlayer: bracket.preliminaries.find((match) => match.bye)?.winner || null,
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
    applyZoneValidation(bracket);
    stage.status = "Zonas en juego";
  } else {
    const directElimination = buildDirectElimination(db, tournament, stage, players);
    bracket.rounds = directElimination.rounds;
    bracket.directByes = directElimination.directByes;
  }

  db.brackets[stage.bracketKey] = bracket;
  if (stage.format !== "Zonas") stage.status = "Cuadro generado";
  stage.progress = {
    totalMatches: bracket.rounds.reduce((total, round) => total + round.matches.length, 0) + bracket.preliminaries.length + (bracket.directByes?.length || 0),
    completedMatches: bracket.directByes?.length || 0,
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
  async updateZoneQualifiers(tournamentId, categoryId, zoneId, qualifiers) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return null;
      const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
      const bracket = stage ? db.brackets[stage.bracketKey] : null;
      const zone = bracket?.zones?.find((item) => item.id === zoneId);
      const value = Number(qualifiers);
      if (!stage || !bracket || !zone || ![1, 2].includes(value)) return null;
      zone.qualifiers = value;
      stage.zonesConfig = {
        ...(stage.zonesConfig || {}),
        zones: bracket.zones.length,
        distribution: bracket.zoneDistribution || bracket.zones.map((item) => item.size),
        zoneQualifiers: {
          ...(stage.zonesConfig?.zoneQualifiers || {}),
          [zoneId]: value,
        },
      };
      bracket.rounds = [];
      bracket.zoneGeneratedAt = null;
      stage.status = "Zonas en juego";
      applyZoneValidation(bracket);
      return bracket;
    }), "No pudimos actualizar clasificados por zona.");
  },
  async generateZoneEliminationBracket(tournamentId, categoryId) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return null;
      const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
      const bracket = stage ? db.brackets[stage.bracketKey] : null;
      if (!stage || !bracket || stage.format !== "Zonas") return null;
      return buildZoneEliminationBracket(db, tournament, stage, bracket);
    }), "No pudimos generar la llave desde zonas.");
  },
  async generateAllCategoryBrackets(tournamentId) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return [];
      return ensureTournamentCategoryStages(db, tournament).map((stage) => generateCategoryBracketInDb(db, tournamentId, stage.categoryId));
    }), "No pudimos generar cuadros por categoria.");
  },
};
