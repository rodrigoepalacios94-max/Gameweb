import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";
import { ZONE_MAX_QUALIFIERS_PER_ZONE, getZoneBracketValidation, getZoneValidationMessage, orderZoneQualifiersForBracket, pairZoneAccessPlayers } from "../utils/zoneFormat";
import { buildEliminationStructureWithAccess, TORNEO_GAME_CATEGORIES } from "./torneoGameFixture";

export const ZONES_TOURNAMENT_ID = "torneo-pruebas-zonas";
export const ZONES_TOURNAMENT_NAME = "Torneo de Pruebas - Zonas";

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

function bracketKey(tournamentId, categoryId) {
  return `${tournamentId}::${categoryId}`;
}

function zoneSizesFor(count) {
  for (let fours = 0; fours <= Math.ceil(count / 4); fours += 1) {
    const rest = count - fours * 4;
    if (rest >= 0 && rest % 3 === 0) {
      return [...Array.from({ length: rest / 3 }, () => 3), ...Array.from({ length: fours }, () => 4)];
    }
  }
  return [];
}

function qualifierCounts(sizes, target) {
  const counts = sizes.map(() => 1);
  let remaining = target - counts.length;
  let cursor = 0;
  while (remaining > 0) {
    const index = cursor % sizes.length;
    if (counts[index] < sizes[index]) {
      counts[index] += 1;
      remaining -= 1;
    }
    cursor += 1;
    if (cursor > sizes.length * 8 && remaining > 0) break;
  }
  return counts;
}

function targetQualifierTotal(count) {
  const sizes = zoneSizesFor(count);
  const maxQualifiers = sizes.length * ZONE_MAX_QUALIFIERS_PER_ZONE;
  if (maxQualifiers < 8) return maxQualifiers;
  const target = getZoneBracketValidation(count).target;
  if (maxQualifiers < target) return maxQualifiers;
  if (maxQualifiers === target) return target;
  return Math.min(maxQualifiers, target + Math.max(1, Math.floor((maxQualifiers - target) / 2)));
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

function distributeZones(players, sizes) {
  const zones = sizes.map((size, index) => ({
    id: `zone-${index + 1}`,
    name: `Zona ${String.fromCharCode(65 + index)}`,
    size,
    players: [],
  }));
  const seeds = players.slice(0, zones.length);
  seeds.forEach((player, index) => zones[index].players.push(player));
  const rest = players.slice(zones.length);
  rest.forEach((player, index) => {
    const forwardZone = index % zones.length;
    const reverseZone = zones.length - 1 - (index % zones.length);
    const zone = zones[index % 2 === 0 ? reverseZone : forwardZone];
    if (zone.players.length < zone.size) zone.players.push(player);
    else zones.find((item) => item.players.length < item.size)?.players.push(player);
  });
  return zones;
}

function getZoneMatchups(players) {
  const matchups = [];
  for (let a = 0; a < players.length; a += 1) {
    for (let b = a + 1; b < players.length; b += 1) {
      matchups.push([players[a], players[b]]);
    }
  }
  return matchups;
}

function scoreTextFor(winnerSide, variant = 0) {
  const templates = [
    [[6, 3], [6, 4]],
    [[6, 1], [6, 2]],
    [[4, 6], [6, 3], [10, 8]],
    [[7, 5], [6, 4]],
    [[6, 0], [6, 1]],
  ];
  const sets = templates[variant % templates.length].map(([winner, loser], index) => {
    const type = index === 2 ? "super_tiebreak" : "set";
    return winnerSide === "A"
      ? { type, playerAScore: winner, playerBScore: loser, a: winner, b: loser, superTieBreak: type === "super_tiebreak" }
      : { type, playerAScore: loser, playerBScore: winner, a: loser, b: winner, superTieBreak: type === "super_tiebreak" };
  });
  return {
    text: sets.map((set) => `${set.playerAScore}-${set.playerBScore}`).join(" / "),
    sets,
  };
}

function chooseZoneWinner(playerA, playerB, categoryCount, zoneIndex, matchIndex) {
  if ((categoryCount + zoneIndex) % 7 === 0) {
    const order = matchIndex % 3;
    if (order === 0) return playerA.ranking < playerB.ranking ? playerA : playerB;
    if (order === 1) return playerA.ranking > playerB.ranking ? playerA : playerB;
  }
  if ((categoryCount + zoneIndex + matchIndex) % 5 === 0) {
    return playerA.ranking > playerB.ranking ? playerA : playerB;
  }
  return playerA.ranking < playerB.ranking ? playerA : playerB;
}

function createZoneMatch(state, tournament, stage, zone, zoneIndex, playerA, playerB, winner, matchIndex) {
  const id = `zone-match-${stage.categoryId}-${pad(zoneIndex + 1)}-${pad(matchIndex + 1)}`;
  const winnerSide = winner.id === playerA.id ? "A" : "B";
  const loser = winner.id === playerA.id ? playerB : playerA;
  const score = scoreTextFor(winnerSide, stage.participantCount + zoneIndex + matchIndex);
  const match = {
    id,
    tournamentId: tournament.id,
    tournament: tournament.name,
    categoryId: stage.categoryId,
    category: stage.categoryName,
    zoneId: zone.id,
    zoneName: zone.name,
    round: zone.name,
    phase: "Zonas",
    playerAId: playerA.id,
    playerA: playerA.fullName,
    playerAAvatar: playerA.avatar,
    playerBId: playerB.id,
    playerB: playerB.fullName,
    playerBAvatar: playerB.avatar,
    opponentId: playerB.id,
    opponent: playerB.fullName,
    opponentAvatar: playerB.avatar,
    date: "2026-09-05",
    time: "10:00",
    court: `Cancha ${1 + ((zoneIndex + matchIndex) % 6)}`,
    status: "Finalizado",
    attendanceStatus: { [playerA.id]: "Presente", [playerB.id]: "Presente" },
    result: score.text,
    resultDetail: { sets: score.sets, winnerId: winner.id, loserId: loser.id },
    sets: score.sets,
    winnerId: winner.id,
    loserId: loser.id,
    pointsEarned: 15,
    discipline: { claims: [], confirmedFaults: [] },
    isDevTest: true,
  };
  state.matches.push(match);
  return match;
}

function buildStandings(zone, qualifiers) {
  const table = zone.players.map((player) => ({
    playerId: player.id,
    playerName: player.fullName,
    ranking: player.ranking,
    played: 0,
    wins: 0,
    losses: 0,
    setsWon: 0,
    setsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
    position: 0,
    qualified: false,
    tiebreakApplied: false,
  }));
  const byId = new Map(table.map((row) => [row.playerId, row]));
  zone.matches.forEach((match) => {
    const rowA = byId.get(match.playerAId);
    const rowB = byId.get(match.playerBId);
    rowA.played += 1;
    rowB.played += 1;
    if (match.winnerId === match.playerAId) {
      rowA.wins += 1;
      rowB.losses += 1;
    } else {
      rowB.wins += 1;
      rowA.losses += 1;
    }
    match.sets.forEach((set) => {
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
  table.sort((a, b) =>
    b.wins - a.wins
    || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)
    || (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost)
    || a.ranking - b.ranking,
  );
  const tieGroups = new Map();
  table.forEach((row) => {
    const key = `${row.wins}`;
    tieGroups.set(key, [...(tieGroups.get(key) || []), row]);
  });
  tieGroups.forEach((group) => {
    const positions = group.map((row) => table.indexOf(row) + 1);
    const affectsCutoff = Math.min(...positions) <= qualifiers && Math.max(...positions) > qualifiers;
    if (group.length > 1 && affectsCutoff) group.forEach((row) => { row.tiebreakApplied = true; });
  });
  table.forEach((row, index) => {
    row.position = index + 1;
    row.qualified = index < qualifiers;
  });
  return table;
}

function makeEnrollment(tournamentId, category, player, index) {
  return {
    id: `zones-enroll-${category.categoryId}-${pad(index + 1)}`,
    tournamentId,
    playerId: player.id,
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    status: "Confirmada",
    paymentStatus: "Pagado",
    requestedAt: "2026-09-01T10:00:00.000Z",
    confirmedAt: "2026-09-01T11:00:00.000Z",
    isDevTest: true,
  };
}

function makeStage(tournamentId, category, participants, zones, validation) {
  return {
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    recommendedFormat: "Zonas",
    format: "Zonas",
    formatStatus: "Confirmado",
    status: "Finalizado",
    inscriptionsCount: category.participantCount,
    participantCount: category.participantCount,
    participants: participants.map((player) => player.id),
    bracketKey: bracketKey(tournamentId, category.categoryId),
    matchIdPrefix: `${tournamentId}-${category.categoryId}`,
    matchFormat: DEFAULT_MATCH_FORMAT,
    zonesConfig: {
      zones: zones.length,
      target: validation.target,
      distribution: zones.map((zone) => zone.size),
      zoneQualifiers: Object.fromEntries(zones.map((zone) => [zone.id, zone.qualifiers])),
      accessPlan: {
        total: validation.total,
        target: validation.target,
        directPlayers: validation.directPlayers,
        accessPlayers: validation.accessPlayers,
        accessMatches: validation.accessMatches,
        accessRoundName: validation.accessRoundName,
        directRoundName: validation.directRoundName,
      },
    },
  };
}

function buildZoneCategory(state, baseFixture, tournament, category) {
  const rankedPlayers = rankedPlayersForCategory(baseFixture, category.categoryId).slice(0, category.participantCount);
  const sizes = zoneSizesFor(category.participantCount);
  const totalQualifiers = targetQualifierTotal(category.participantCount);
  const validation = getZoneBracketValidation(totalQualifiers);
  const qualifiersByZone = qualifierCounts(sizes, totalQualifiers);
  const zones = distributeZones(rankedPlayers, sizes).map((zone, index) => ({
    ...zone,
    qualifiers: qualifiersByZone[index],
  }));
  const stage = makeStage(tournament.id, category, rankedPlayers, zones, validation);
  rankedPlayers.forEach((player, index) => state.enrollments.push(makeEnrollment(tournament.id, category, player, index)));

  zones.forEach((zone, zoneIndex) => {
    const matchups = getZoneMatchups(zone.players);
    zone.matches = matchups.map(([playerA, playerB], matchIndex) => {
      const winner = chooseZoneWinner(playerA, playerB, category.participantCount, zoneIndex, matchIndex);
      const match = createZoneMatch(state, tournament, stage, zone, zoneIndex, playerA, playerB, winner, matchIndex);
      return {
        id: match.id,
        matchId: match.id,
        playerA: match.playerA,
        playerB: match.playerB,
        playerAId: match.playerAId,
        playerBId: match.playerBId,
        status: "Finalizado",
        score: match.result,
        result: match.result,
        sets: match.sets,
        winner: winner.fullName,
        winnerId: winner.id,
      };
    });
    zone.players = zone.players.map((player) => player.fullName);
    zone.standings = buildStandings({ ...zone, players: rankedPlayers.filter((player) => zone.players.includes(player.fullName)) }, zone.qualifiers);
  });

  const qualifiers = zones.flatMap((zone) =>
    zone.standings
      .filter((row) => row.qualified)
      .map((row) => {
        const player = rankedPlayers.find((item) => item.id === row.playerId);
        const forceInevitableAccessCase = category.participantCount === 13 && zone.id === "zone-1" && row.position === 2;
        return {
          ...player,
          zoneId: zone.id,
          zoneName: zone.name,
          zoneSize: zone.size,
          zonePosition: row.position,
          played: row.played,
          wins: forceInevitableAccessCase ? -1 : row.wins,
          losses: row.losses,
          setsWon: row.setsWon,
          setsLost: row.setsLost,
          gamesWon: forceInevitableAccessCase ? 0 : row.gamesWon,
          gamesLost: row.gamesLost,
          testNote: `${zone.name} #${row.position}`,
        };
      }),
  );
  const orderedQualifiers = orderZoneQualifiersForBracket(qualifiers);
  const directQualifiers = validation.valid ? orderedQualifiers.slice(0, validation.directPlayers) : [];
  const accessQualifiers = validation.valid ? orderedQualifiers.slice(validation.directPlayers) : [];
  const accessPairing = validation.valid ? pairZoneAccessPlayers(accessQualifiers) : { pairs: [], sameZonePairs: 0, avoidedSameZone: true };
  const champion = validation.valid ? orderedQualifiers[(category.participantCount * 3) % orderedQualifiers.length] || orderedQualifiers[0] : null;
  const elimination = validation.valid
    ? buildEliminationStructureWithAccess(state, tournament, stage, {
        baseDrawSize: validation.target,
        directEntrants: directQualifiers,
        accessPairs: accessPairing.pairs,
        accessRoundName: validation.accessRoundName,
        champion,
      })
    : { rounds: [], champion: null, runnerUp: null, subchampion: null, playerRuns: {} };
  const bracket = {
    id: stage.bracketKey,
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    categoryName: stage.categoryName,
    format: "Zonas",
    participantCount: category.participantCount,
    baseDrawSize: validation.target,
    zoneDistribution: sizes,
    zoneValidation: validation,
    zoneClassificationStatus: getZoneValidationMessage(validation),
    zoneAccessPlan: {
      total: validation.total,
      target: validation.target,
      directPlayers: validation.directPlayers,
      accessPlayers: validation.accessPlayers,
      accessMatches: validation.accessMatches,
      accessRoundName: validation.accessRoundName,
      directRoundName: validation.directRoundName,
      sameZoneAccessPairs: accessPairing.sameZonePairs,
      avoidedSameZone: accessPairing.avoidedSameZone,
    },
    zones,
    qualifiers: orderedQualifiers.map((player, index) => ({
      playerId: player.id,
      playerName: player.fullName,
      zoneId: player.zoneId,
      zoneName: player.zoneName,
      zoneSize: player.zoneSize,
      zonePosition: player.zonePosition,
      ranking: player.ranking,
      sportOrder: index + 1,
      entryPath: index < validation.directPlayers ? "direct" : "access",
    })),
    directQualifiers: directQualifiers.map((player) => player.id),
    accessQualifiers: accessQualifiers.map((player) => player.id),
    accessPairings: accessPairing.pairs.map(([playerA, playerB], index) => ({
      index: index + 1,
      playerAId: playerA.id,
      playerA: playerA.fullName,
      playerAZoneId: playerA.zoneId,
      playerBId: playerB.id,
      playerB: playerB.fullName,
      playerBZoneId: playerB.zoneId,
      sameZone: playerA.zoneId === playerB.zoneId,
    })),
    rounds: elimination.rounds,
    champion: elimination.champion,
    runnerUp: elimination.runnerUp,
    subchampion: elimination.subchampion,
    completed: true,
    playerRuns: elimination.playerRuns,
  };
  return { stage, bracket };
}

export function createZonesTournamentFixture(baseFixture, overrides = {}) {
  const tournamentId = overrides.id || ZONES_TOURNAMENT_ID;
  const tournament = {
    id: tournamentId,
    name: overrides.name?.trim() || ZONES_TOURNAMENT_NAME,
    type: "GAME 1000",
    scoringSystem: "GAME 1000",
    status: "Finalizado",
    registrationStatus: "Finalizado",
    description: "Fixture DEV masivo para validar formato Zonas entre 8 y 48 jugadores.",
    startDate: "2026-09-05",
    endDate: "2026-09-21",
    semifinalsDate: "2026-09-19",
    finalsDate: "2026-09-21",
    price: 18000,
    categories: TORNEO_GAME_CATEGORIES.map((category) => category.categoryId),
    participants: [],
    phases: ["Zonas", "32avos", "16avos", "8vos", "Cuartos", "Semifinal", "Final"],
    courts: ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4", "Cancha 5", "Cancha 6"],
    categoryStages: [],
    playerCategoryId: "cat-pre-32",
    playerCategoryName: "32 jugadores",
    matchFormat: DEFAULT_MATCH_FORMAT,
    isDevTest: true,
    isZonesFixture: true,
    testSimulationStatus: "Fixture de zonas finalizado deterministico",
  };
  const state = {
    tournaments: [tournament],
    brackets: {},
    matches: [],
    enrollments: [],
    matchAvailability: [],
  };

  TORNEO_GAME_CATEGORIES.forEach((category) => {
    const { stage, bracket } = buildZoneCategory(state, baseFixture, tournament, category);
    tournament.categoryStages.push(stage);
    state.brackets[stage.bracketKey] = bracket;
  });
  tournament.participants = [...new Set(tournament.categoryStages.flatMap((stage) => stage.participants))];
  state.brackets[tournament.id] = state.brackets[tournament.categoryStages[0].bracketKey];
  state.diagnostics = validateZonesTournamentFixture({
    ...baseFixture,
    tournaments: [...baseFixture.tournaments, tournament],
    brackets: { ...baseFixture.brackets, ...state.brackets },
    matches: [...baseFixture.matches, ...state.matches],
    enrollments: [...baseFixture.enrollments, ...state.enrollments],
  }, tournamentId);
  if (!state.diagnostics.ok && typeof console !== "undefined") {
    console.error("Fixture DEV Zonas invalido", state.diagnostics.errors);
  }
  return state;
}

export function validateZonesTournamentFixture(db, tournamentId = ZONES_TOURNAMENT_ID) {
  const errors = [];
  const tournament = db.tournaments.find((item) => item.id === tournamentId);
  const prelim = db.tournaments.find((item) => item.name === "Torneo de Pruebas - Preliminares");
  if (!prelim) errors.push("No existe el torneo de Preliminares.");
  if (!tournament) errors.push("No existe el torneo de Zonas.");
  if (!tournament) return { ok: false, errors };

  const drawDistribution = { 8: 0, 16: 0, 32: 0 };
  let zoneCount = 0;
  let zonesOf3 = 0;
  let zonesOf4 = 0;
  let zoneMatches = 0;
  let bracketMatches = 0;
  const playerIds = new Set(db.players?.map((player) => player.id) || []);

  TORNEO_GAME_CATEGORIES.forEach((category) => {
    const stage = tournament.categoryStages.find((item) => item.categoryId === category.categoryId);
    const bracket = db.brackets[bracketKey(tournament.id, category.categoryId)];
    if (!stage || !bracket) {
      errors.push(`${category.categoryName}: falta stage o bracket.`);
      return;
    }
    if ((stage.participants || []).length !== category.participantCount) errors.push(`${category.categoryName}: cantidad de inscriptos invalida.`);
    const zonePlayerIds = new Set();
    bracket.zones.forEach((zone) => {
      zoneCount += 1;
      if (zone.size === 3) zonesOf3 += 1;
      else if (zone.size === 4) zonesOf4 += 1;
      else errors.push(`${category.categoryName} ${zone.name}: zona de tamano ${zone.size}.`);
      if (![1, 2].includes(Number(zone.qualifiers))) errors.push(`${category.categoryName} ${zone.name}: clasifican ${zone.qualifiers}, debe ser 1 o 2.`);
      if (zone.players.length !== zone.size) errors.push(`${category.categoryName} ${zone.name}: cantidad de jugadores no coincide.`);
      zone.players.forEach((playerName) => {
        if (zonePlayerIds.has(playerName)) errors.push(`${category.categoryName} ${zone.name}: jugador repetido ${playerName}.`);
        zonePlayerIds.add(playerName);
      });
      const expectedMatches = zone.size * (zone.size - 1) / 2;
      if (zone.matches.length !== expectedMatches) errors.push(`${category.categoryName} ${zone.name}: partidos ${zone.matches.length}, esperados ${expectedMatches}.`);
      zoneMatches += zone.matches.length;
      if (zone.matches.some((match) => match.status !== "Finalizado" || !match.winnerId)) errors.push(`${category.categoryName} ${zone.name}: hay partidos sin finalizar.`);
      if ((zone.standings || []).filter((row) => row.qualified).length !== zone.qualifiers) errors.push(`${category.categoryName} ${zone.name}: clasificados incoherentes.`);
    });
    if (zonePlayerIds.size !== category.participantCount) errors.push(`${category.categoryName}: jugadores de zona no coinciden con inscriptos.`);
    const qualifierCount = (bracket.qualifiers || []).length;
    const validation = getZoneBracketValidation(qualifierCount);
    if (new Set((bracket.qualifiers || []).map((item) => item.playerId)).size !== qualifierCount) errors.push(`${category.categoryName}: clasificados duplicados.`);
    if (validation.valid) {
      if ((bracket.directQualifiers || []).length !== validation.directPlayers) errors.push(`${category.categoryName}: directos ${bracket.directQualifiers?.length || 0}, esperados ${validation.directPlayers}.`);
      if ((bracket.accessQualifiers || []).length !== validation.accessPlayers) errors.push(`${category.categoryName}: acceso ${bracket.accessQualifiers?.length || 0}, esperados ${validation.accessPlayers}.`);
      if ((bracket.accessPairings || []).length !== validation.accessMatches) errors.push(`${category.categoryName}: partidos de acceso ${bracket.accessPairings?.length || 0}, esperados ${validation.accessMatches}.`);
      const firstAccessRound = validation.accessRoundName ? bracket.rounds?.find((round) => round.name === validation.accessRoundName) : null;
      if (validation.accessMatches && firstAccessRound?.matches?.length !== validation.accessMatches) errors.push(`${category.categoryName}: ronda ${validation.accessRoundName} invalida.`);
      if (!validation.accessMatches && bracket.rounds?.[0]?.matches?.length !== validation.target / 2) errors.push(`${category.categoryName}: llave perfecta no inicia con ${validation.target / 2} partidos.`);
      if (!bracket.champion) errors.push(`${category.categoryName}: falta campeon.`);
      drawDistribution[validation.target] += 1;
    }
    bracketMatches += (bracket.rounds || []).reduce((total, round) => total + round.matches.length, 0);
    stage.participants.forEach((playerId) => {
      if (!playerIds.has(playerId)) errors.push(`${category.categoryName}: jugador inexistente ${playerId}.`);
    });
  });

  const playerAInZones = db.enrollments.filter((item) => item.tournamentId === tournamentId && item.playerId === "player-1");
  const playerAInPrelim = db.enrollments.filter((item) => item.tournamentId === prelim?.id && item.playerId === "player-1");
  if (!playerAInZones.length || !playerAInPrelim.length) errors.push("Jugador Prueba A no aparece en ambos torneos.");

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      tournaments: db.tournaments.length,
      categories: tournament.categoryStages.length,
      enrollments: db.enrollments.filter((item) => item.tournamentId === tournamentId).length,
      zones: zoneCount,
      zonesOf3,
      zonesOf4,
      zoneMatches,
      bracketMatches,
      drawDistribution,
      playerACategories: playerAInZones.map((item) => item.categoryName),
    },
  };
}
