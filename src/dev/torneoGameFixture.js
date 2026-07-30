import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";

export const TORNEO_GAME_ID = "torneo-pruebas-preliminares";
export const TORNEO_GAME_NAME = "Torneo de Pruebas - Preliminares";

const BOT_AVATAR = "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=240&q=80";
const PLAYER_A_ID = "player-1";
const PLAYER_B_ID = "player-prueba-b";
const PLAYER_C_ID = "player-prueba-c";
const STANDARD_DRAWS = [8, 16, 32];
const BYE_LOSS_COUNTS = new Set([25, 27, 29, 31, 35]);
const RANK_ONE_EARLY_EXIT_COUNTS = new Set([24, 25, 26, 28, 30]);

export const TORNEO_GAME_CATEGORIES = Array.from({ length: 41 }, (_, index) => {
  const count = index + 8;
  return {
    categoryId: `cat-pre-${count}`,
    categoryName: `${count} jugadores`,
    shortPrefix: `${count}J`,
    participantCount: count,
    format: "Preliminar",
  };
});

const SPECIAL_RANKINGS = {
  "cat-pre-13": {
    [PLAYER_C_ID]: { position: 9, points: 730, note: "Sorpresa ante mejor ranking" },
  },
  "cat-pre-20": {
    [PLAYER_B_ID]: { position: 3, points: 1460, note: "Cabeza de serie" },
  },
  "cat-pre-24": {
    [PLAYER_A_ID]: { position: 12, points: 820, note: "Ranking intermedio" },
  },
  "cat-pre-27": {
    [PLAYER_C_ID]: { position: 14, points: 760, note: "Llega a instancia final" },
  },
  "cat-pre-32": {
    [PLAYER_A_ID]: { position: 32, points: 0, ascended: true, note: "Ascenso reciente, 0 puntos" },
  },
  "cat-pre-33": {
    [PLAYER_A_ID]: { position: 2, points: 1680, previousPosition: 3, previousPoints: 1510, note: "Ranking alto" },
  },
  "cat-pre-36": {
    [PLAYER_C_ID]: { position: 7, points: 1110, note: "Derrota temprana" },
  },
  "cat-pre-41": {
    [PLAYER_B_ID]: { position: 18, points: 700, note: "No cabeza de serie" },
  },
};

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

function bracketKey(tournamentId, categoryId) {
  return `${tournamentId}::${categoryId}`;
}

function categoryIdForCount(count) {
  return `cat-pre-${count}`;
}

function largestStandardDraw(count) {
  return [...STANDARD_DRAWS].reverse().find((size) => size <= count) || 8;
}

function accessRoundName(drawSize) {
  if (drawSize === 32) return "32avos";
  if (drawSize === 16) return "16avos";
  return "8vos";
}

function mainRoundNames(drawSize) {
  if (drawSize === 32) return ["16avos", "8vos", "Cuartos", "Semifinal", "Final"];
  if (drawSize === 16) return ["8vos", "Cuartos", "Semifinal", "Final"];
  return ["Cuartos", "Semifinal", "Final"];
}

function makeCategory(count) {
  return {
    id: categoryIdForCount(count),
    name: `${count} jugadores`,
    branch: "",
    level: count,
    status: "Activa",
    isDevPreliminaryFixture: true,
  };
}

function makeSharedPlayer(id, firstName, lastName, email) {
  return {
    id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    dni: id === PLAYER_A_ID ? "PRUEBA-A" : id === PLAYER_B_ID ? "PRUEBA-B" : "PRUEBA-C",
    birthDate: "1992-05-14",
    gender: "Masculino",
    phone: "-",
    email,
    categoryId: "cat-pre-32",
    categoryName: "32 jugadores",
    ranking: null,
    points: 0,
    status: "Activo",
    avatar: BOT_AVATAR,
    stats: { played: 0, wins: 0, losses: 0, tournaments: 1 },
    discipline: { faults: 0, limit: 3, status: "Sin sanciones" },
    categoryHistory: [],
    categoryRankings: [],
    isDevTestPlayer: true,
  };
}

function createPlayerPool() {
  const players = [
    makeSharedPlayer(PLAYER_A_ID, "Jugador", "Prueba A", "jugador.prueba.a@game.test"),
    makeSharedPlayer(PLAYER_B_ID, "Jugador", "Prueba B", "jugador.prueba.b@game.test"),
    makeSharedPlayer(PLAYER_C_ID, "Jugador", "Prueba C", "jugador.prueba.c@game.test"),
  ];

  for (let index = 1; index <= 120; index += 1) {
    const number = pad(index, 3);
    players.push({
      id: `player-dev-${number}`,
      firstName: "Bot",
      lastName: `P${number}`,
      fullName: `Bot P${number}`,
      dni: `DEV-${number}`,
      birthDate: "1994-01-01",
      gender: "Masculino",
      phone: "-",
      email: `bot.preliminar.${number}@game.test`,
      categoryId: "cat-pre-8",
      categoryName: "8 jugadores",
      ranking: null,
      points: 0,
      status: "Activo",
      avatar: BOT_AVATAR,
      stats: { played: 0, wins: 0, losses: 0, tournaments: 1 },
      discipline: { faults: 0, limit: 3, status: "Sin sanciones" },
      categoryHistory: [],
      categoryRankings: [],
      isBot: true,
      isDevTestBot: true,
    });
  }
  return players;
}

function rankingPoints(count, position, override = {}) {
  if (override.points != null) return override.points;
  return Math.max(20, 1850 - position * 29 - (count % 6) * 7);
}

function getSeedCount(count) {
  return Math.min(4, count);
}

function getChampionPosition(count) {
  if (count === 24) return 10;
  if (count === 27) return 14;
  if (count === 33) return 2;
  if (count <= 15) return 1;
  if (count <= 23) return 2 + ((count - 16) % 4);
  if (count <= 31) return Math.ceil(count / 2);
  return [6, 9, 12, 15, 18, 5, 11, 16][(count - 34 + 800) % 8] || 7;
}

function getPlayerById(players, playerId) {
  return players.find((player) => player.id === playerId);
}

function buildRankedPlayersForCategory(config, pool) {
  const count = config.participantCount;
  const special = SPECIAL_RANKINGS[config.categoryId] || {};
  const slots = Array.from({ length: count }, () => null);
  Object.entries(special).forEach(([playerId, settings]) => {
    slots[settings.position - 1] = getPlayerById(pool, playerId);
  });

  let cursor = count * 7;
  for (let index = 0; index < slots.length; index += 1) {
    if (slots[index]) continue;
    let candidate = null;
    while (!candidate || slots.some((slot) => slot?.id === candidate.id)) {
      candidate = pool[3 + (cursor % (pool.length - 3))];
      cursor += 1;
    }
    slots[index] = candidate;
  }

  return slots.map((player, index) => {
    const position = index + 1;
    const override = special[player.id] || {};
    const points = rankingPoints(count, position, override);
    return {
      ...player,
      categoryId: config.categoryId,
      categoryName: config.categoryName,
      ranking: position,
      points,
      seed: position <= getSeedCount(count) && points > 0,
      ascended: Boolean(override.ascended),
      specialNote: override.note || null,
    };
  });
}

function createEnrollment(tournamentId, config, player, index) {
  return {
    id: `enroll-${config.categoryId}-${pad(index + 1, 2)}`,
    tournamentId,
    playerId: player.id,
    categoryId: config.categoryId,
    categoryName: config.categoryName,
    status: "Confirmada",
    paymentStatus: "Pagado",
    requestedAt: "2026-08-01T10:00:00.000Z",
    confirmedAt: "2026-08-01T11:00:00.000Z",
    isDevTest: true,
  };
}

function scoreTextFor(winnerSide, variant = 0) {
  const templates = [
    [[6, 0], [6, 1]],
    [[6, 2], [6, 2]],
    [[6, 3], [6, 4]],
    [[7, 5], [6, 4]],
    [[4, 6], [6, 3], [10, 8]],
  ];
  const winnerSets = templates[variant % templates.length];
  const sets = winnerSets.map(([winner, loser], index) => {
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

function createPhysicalMatch(state, tournament, stage, roundName, phase, playerA, playerB, winner, matchNumber, variant) {
  const matchScope = stage.matchIdPrefix || stage.categoryId;
  const id = `match-${matchScope}-${phase.toLowerCase().replace(/\s+/g, "-")}-${roundName.toLowerCase().replace(/\s+/g, "-")}-${pad(matchNumber, 2)}`;
  const winnerSide = winner.id === playerA.id ? "A" : "B";
  const score = scoreTextFor(winnerSide, variant);
  const loser = winner.id === playerA.id ? playerB : playerA;
  const match = {
    id,
    tournamentId: tournament.id,
    tournament: tournament.name,
    categoryId: stage.categoryId,
    category: stage.categoryName,
    round: roundName,
    phase,
    playerAId: playerA.id,
    playerA: playerA.fullName,
    playerAAvatar: playerA.avatar,
    playerBId: playerB.id,
    playerB: playerB.fullName,
    playerBAvatar: playerB.avatar,
    opponentId: playerB.id,
    opponent: playerB.fullName,
    opponentAvatar: playerB.avatar,
    date: "2026-08-10",
    time: "10:00",
    court: `Cancha ${1 + (matchNumber % 6)}`,
    status: "Finalizado",
    attendanceStatus: {
      [playerA.id]: "Presente",
      [playerB.id]: "Presente",
    },
    result: score.text,
    resultDetail: {
      sets: score.sets,
      winnerId: winner.id,
      loserId: loser.id,
      playerASets: winnerSide === "A" ? 2 : score.sets.length === 3 ? 1 : 0,
      playerBSets: winnerSide === "B" ? 2 : score.sets.length === 3 ? 1 : 0,
      completedEarly: false,
    },
    sets: score.sets,
    winnerId: winner.id,
    loserId: loser.id,
    pointsEarned: phase === "Preliminar" ? 20 : 40,
    discipline: { claims: [], confirmedFaults: [] },
    isDevTest: true,
  };
  state.matches.push(match);
  state.matchAvailability.push(
    {
      matchId: id,
      tournamentId: tournament.id,
      categoryId: stage.categoryId,
      playerId: playerA.id,
      confirmed: true,
      unavailableSlots: [],
      submittedAt: "2026-08-04T10:00:00.000Z",
    },
    {
      matchId: id,
      tournamentId: tournament.id,
      categoryId: stage.categoryId,
      playerId: playerB.id,
      confirmed: true,
      unavailableSlots: [],
      submittedAt: "2026-08-04T10:00:00.000Z",
    },
  );
  return match;
}

function createByeMatch(state, tournament, stage, player) {
  const id = `match-${stage.categoryId}-bye-01`;
  const match = {
    id,
    tournamentId: tournament.id,
    tournament: tournament.name,
    categoryId: stage.categoryId,
    category: stage.categoryName,
    round: "Preliminar",
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
    date: "2026-08-10",
    time: "No programable",
    court: "No programable",
    status: "Finalizado",
    attendanceStatus: {},
    result: "6-0 / 6-0",
    resultDetail: { type: "BYE", source: "Ranking General", note: "Victoria administrativa por BYE." },
    sets: [{ playerAScore: 6, playerBScore: 0, a: 6, b: 0 }, { playerAScore: 6, playerBScore: 0, a: 6, b: 0 }],
    winnerId: player.id,
    loserId: null,
    pointsEarned: 0,
    discipline: { claims: [], confirmedFaults: [] },
    bye: true,
    byeSource: "Ranking General",
    isDevTest: true,
  };
  state.matches.push(match);
  return match;
}

function getLogicalSide(treeSlotStart, treeSlotSpan, baseDrawSize, roundName) {
  if (roundName === "Final") return "center";
  return treeSlotStart + treeSlotSpan / 2 <= baseDrawSize / 2 ? "left" : "right";
}

function makeBracketMatch(stage, roundName, index, playerA, playerB, match, winner, tree) {
  return {
    id: `${stage.categoryId}-${roundName.toLowerCase().replace(/\s+/g, "-")}-${pad(index + 1, 2)}`,
    categoryId: stage.categoryId,
    roundName,
    logicalSide: getLogicalSide(tree.treeSlotStart, tree.treeSlotSpan, tree.baseDrawSize, roundName),
    treeSlotStart: tree.treeSlotStart,
    treeSlotSpan: tree.treeSlotSpan,
    treeTopRatio: (tree.treeSlotStart + tree.treeSlotSpan / 2) / tree.baseDrawSize,
    treeRoundIndex: tree.treeRoundIndex,
    baseDrawSize: tree.baseDrawSize,
    playerAId: playerA.id,
    playerBId: playerB.id,
    playerAAvatar: playerA.avatar,
    playerBAvatar: playerB.avatar,
    playerA: playerA.fullName,
    playerB: playerB.fullName,
    playerANote: playerA.seed ? `CS${playerA.ranking}` : playerA.originPreliminary ? "Ganador preliminar" : null,
    playerBNote: playerB.seed ? `CS${playerB.ranking}` : playerB.originPreliminary ? "Ganador preliminar" : null,
    score: match.result,
    winner: winner.fullName,
    winnerId: winner.id,
    loserId: winner.id === playerA.id ? playerB.id : playerA.id,
    matchId: match.id,
    parentMatchIds: [playerA.sourceMatchId, playerB.sourceMatchId].filter(Boolean),
    parentSlots: [
      playerA.sourceMatchId ? { matchId: playerA.sourceMatchId, slot: "A" } : null,
      playerB.sourceMatchId ? { matchId: playerB.sourceMatchId, slot: "B" } : null,
    ].filter(Boolean),
    childMatchId: null,
    childBracketMatchId: null,
    childRoundName: null,
    childSlot: null,
    bye: false,
    connectionNote: `${roundName} - ${stage.categoryName}`,
  };
}

function linkParentToChild(parentEntrant, childBracketMatch, childSlot) {
  if (!parentEntrant?.sourceBracketMatch) return;
  parentEntrant.sourceBracketMatch.childMatchId = childBracketMatch.matchId;
  parentEntrant.sourceBracketMatch.childBracketMatchId = childBracketMatch.id;
  parentEntrant.sourceBracketMatch.childRoundName = childBracketMatch.roundName;
  parentEntrant.sourceBracketMatch.childSlot = childSlot;
}

function advanceEntrant(winner, sourceBracketMatch, originPlayers = []) {
  return {
    ...winner,
    originPreliminary: Boolean(winner.originPreliminary || originPlayers.some((player) => player.originPreliminary)),
    prelimBye: Boolean(winner.prelimBye),
    treeSlotStart: sourceBracketMatch.treeSlotStart,
    treeSlotSpan: sourceBracketMatch.treeSlotSpan,
    sourceMatchId: sourceBracketMatch.matchId,
    sourceBracketMatchId: sourceBracketMatch.id,
    sourceRoundName: sourceBracketMatch.roundName,
    sourceBracketMatch,
  };
}

function recordRun(run, playerA, playerB, winner, roundName) {
  [playerA, playerB].forEach((player) => {
    const current = run.get(player.id) || { played: 0, wins: 0, losses: 0, reached: "Inscripto" };
    current.played += 1;
    current.reached = roundName;
    if (winner.id === player.id) current.wins += 1;
    else current.losses += 1;
    run.set(player.id, current);
  });
}

function chooseByRanking(playerA, playerB, preferUpset) {
  const better = playerA.ranking <= playerB.ranking ? playerA : playerB;
  const worse = better.id === playerA.id ? playerB : playerA;
  return preferUpset ? worse : better;
}

function chooseWinner(playerA, playerB, context) {
  const { count, champion, roundName, phase, matchIndex, roundIndex, run } = context;
  const pair = [playerA, playerB];
  const championInMatch = pair.find((player) => player.id === champion.id);
  if (championInMatch) return championInMatch;

  const specialEarlyLoss = [
    { id: PLAYER_A_ID, counts: new Set([32]), maxPlayed: 0 },
    { id: PLAYER_B_ID, counts: new Set([41]), maxPlayed: 0 },
    { id: PLAYER_C_ID, counts: new Set([36]), maxPlayed: 0 },
  ];
  for (const rule of specialEarlyLoss) {
    const target = pair.find((player) => player.id === rule.id);
    if (target && rule.counts.has(count) && (run.get(target.id)?.played || 0) <= rule.maxPlayed) {
      return target.id === playerA.id ? playerB : playerA;
    }
  }

  const c13 = pair.find((player) => player.id === PLAYER_C_ID && count === 13);
  if (c13) return (run.get(c13.id)?.played || 0) === 0 ? c13 : c13.id === playerA.id ? playerB : playerA;

  const c27 = pair.find((player) => player.id === PLAYER_C_ID && count === 27);
  if (c27 && roundName !== "Final") return c27;

  const b20 = pair.find((player) => player.id === PLAYER_B_ID && count === 20);
  if (b20 && roundName !== "Final") return b20;

  const a24 = pair.find((player) => player.id === PLAYER_A_ID && count === 24);
  if (a24) return ["Cuartos", "Semifinal", "Final"].includes(roundName) ? (a24.id === playerA.id ? playerB : playerA) : a24;

  const rankOne = pair.find((player) => player.ranking === 1);
  if (rankOne && RANK_ONE_EARLY_EXIT_COUNTS.has(count) && (run.get(rankOne.id)?.played || 0) === 0) {
    return rankOne.id === playerA.id ? playerB : playerA;
  }

  const byePlayer = pair.find((player) => player.prelimBye);
  if (byePlayer && BYE_LOSS_COUNTS.has(count) && (run.get(byePlayer.id)?.played || 0) === 0) {
    return byePlayer.id === playerA.id ? playerB : playerA;
  }

  const preferUpset = (count + matchIndex + roundIndex + (phase === "Preliminar" ? 1 : 3)) % 5 === 0;
  return chooseByRanking(playerA, playerB, preferUpset);
}

function makePreliminaryPairs(rankedPlayers) {
  const seeds = rankedPlayers.filter((player) => player.seed);
  const others = rankedPlayers.filter((player) => !player.seed);
  const pairs = [];

  seeds.forEach((seed) => {
    const opponent = others.pop();
    if (opponent) pairs.push([seed, opponent]);
  });

  const remaining = [...others];
  while (remaining.length >= 2) {
    pairs.push([remaining.shift(), remaining.pop()]);
  }
  return pairs;
}

function pairEntrantsAvoidingSameSource(entrants) {
  const remaining = [...entrants];
  const pairs = [];
  while (remaining.length >= 2) {
    const playerA = remaining.shift();
    const opponentIndex = remaining.findIndex((candidate) => candidate.sourceMatchId !== playerA.sourceMatchId);
    const playerB = remaining.splice(opponentIndex >= 0 ? opponentIndex : 0, 1)[0];
    pairs.push([playerA, playerB]);
  }
  return pairs;
}

function avoidSameSourceFirstRoundPairs(slots) {
  const arranged = [...slots];
  for (let pass = 0; pass < arranged.length; pass += 1) {
    let changed = false;
    for (let index = 0; index < arranged.length; index += 2) {
      const playerA = arranged[index];
      const playerB = arranged[index + 1];
      if (!playerA?.sourceMatchId || playerA.sourceMatchId !== playerB?.sourceMatchId) continue;
      const swapIndex = arranged.findIndex((candidate, candidateIndex) => {
        if (candidateIndex === index || candidateIndex === index + 1) return false;
        return candidate?.sourceMatchId !== playerA.sourceMatchId;
      });
      if (swapIndex > -1) {
        [arranged[index + 1], arranged[swapIndex]] = [arranged[swapIndex], arranged[index + 1]];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return arranged;
}

function getAccessSlotIndex(index, accessMatchesCount, baseDrawSize) {
  const leftCount = Math.ceil(accessMatchesCount / 2);
  if (index < leftCount) return index;
  return baseDrawSize - 1 - (index - leftCount);
}

function placeSeededEntrants(entrants, drawSize, lockedSlots = new Map()) {
  const slots = Array.from({ length: drawSize }, () => null);
  const sorted = [...entrants].sort((a, b) => a.ranking - b.ranking);
  const seedPositions = [0, drawSize - 1, Math.floor(drawSize / 2), Math.floor(drawSize / 2) - 1];
  lockedSlots.forEach((entrant, index) => {
    slots[index] = entrant;
  });

  sorted.slice(0, 4).forEach((player, index) => {
    const seedPosition = seedPositions[index];
    if (!slots[seedPosition]) slots[seedPosition] = player;
  });

  const placedIds = new Set(slots.filter(Boolean).map((player) => player.id));
  const remaining = sorted.filter((player) => !placedIds.has(player.id));
  slots.forEach((slot, index) => {
    if (!slot) slots[index] = remaining.shift();
  });
  return avoidSameSourceFirstRoundPairs(slots);
}

function buildCompletedRounds(state, tournament, stage, initialSlots, champion, run, startMatchNumber = 1) {
  const drawSize = initialSlots.length;
  const roundNames = mainRoundNames(drawSize);
  const rounds = [];
  let currentEntrants = initialSlots;
  let matchNumber = startMatchNumber;

  roundNames.forEach((roundName, roundIndex) => {
    const matches = [];
    const winners = [];
    for (let index = 0; index < currentEntrants.length; index += 2) {
      const playerA = currentEntrants[index];
      const playerB = currentEntrants[index + 1];
      const winner = chooseWinner(playerA, playerB, {
        count: stage.participantCount,
        champion,
        roundName,
        phase: "Cuadro principal",
        matchIndex: index / 2,
        roundIndex,
        run,
      });
      const match = createPhysicalMatch(state, tournament, stage, roundName, "Cuadro principal", playerA, playerB, winner, matchNumber, stage.participantCount + matchNumber + roundIndex);
      recordRun(run, playerA, playerB, winner, roundName);
      const treeSlotStart = Math.min(playerA.treeSlotStart ?? index, playerB.treeSlotStart ?? index + 1);
      const treeSlotSpan = (playerA.treeSlotSpan || 1) + (playerB.treeSlotSpan || 1);
      const bracketMatch = makeBracketMatch(stage, roundName, index / 2, playerA, playerB, match, winner, {
        treeSlotStart,
        treeSlotSpan,
        treeRoundIndex: roundIndex + 1,
        baseDrawSize: drawSize,
      });
      linkParentToChild(playerA, bracketMatch, "A");
      linkParentToChild(playerB, bracketMatch, "B");
      matches.push(bracketMatch);
      winners.push(advanceEntrant(winner, bracketMatch, [playerA, playerB]));
      matchNumber += 1;
    }
    rounds.push({ id: `${stage.categoryId}-${roundName.toLowerCase().replace(/\s+/g, "-")}`, name: roundName, matches });
    currentEntrants = winners;
  });
  return { rounds, champion: currentEntrants[0], nextMatchNumber: matchNumber };
}

export function buildEliminationStructureFromEntrants(state, tournament, stage, entrants, options = {}) {
  const sortedEntrants = [...entrants].sort((a, b) => a.ranking - b.ranking || a.id.localeCompare(b.id));
  const drawSize = sortedEntrants.length;
  const champion = options.champion || sortedEntrants[Math.min(Math.floor(drawSize / 3), sortedEntrants.length - 1)] || sortedEntrants[0];
  const run = options.run || new Map();
  const mainSlots = placeSeededEntrants(sortedEntrants, drawSize).map((entrant, index) => ({
    ...entrant,
    treeSlotStart: index,
    treeSlotSpan: 1,
  }));
  const mainDraw = buildCompletedRounds(state, tournament, stage, mainSlots, champion, run, options.startMatchNumber || 1);
  const finalRound = mainDraw.rounds[mainDraw.rounds.length - 1];
  const finalMatch = finalRound?.matches?.[0];
  const runnerUpName = finalMatch?.winner === finalMatch?.playerA ? finalMatch?.playerB : finalMatch?.playerA;
  return {
    rounds: mainDraw.rounds,
    champion: finalMatch?.winner || mainDraw.champion?.fullName || null,
    runnerUp: runnerUpName || null,
    subchampion: runnerUpName || null,
    playerRuns: Object.fromEntries([...run.entries()]),
    nextMatchNumber: mainDraw.nextMatchNumber,
  };
}

export function buildEliminationStructureWithAccess(state, tournament, stage, options = {}) {
  const baseDrawSize = Number(options.baseDrawSize || 8);
  const directEntrants = [...(options.directEntrants || [])];
  const accessPairs = [...(options.accessPairs || [])];
  const accessRoundNameValue = options.accessRoundName || accessRoundName(baseDrawSize);
  const champion = options.champion || directEntrants[0] || accessPairs[0]?.[0] || null;
  const run = options.run || new Map();
  const lockedMainSlots = new Map();
  const rounds = [];
  let matchNumber = options.startMatchNumber || 1;

  if (accessPairs.length) {
    const matches = [];
    accessPairs.forEach(([playerA, playerB], index) => {
      const accessSlotIndex = getAccessSlotIndex(index, accessPairs.length, baseDrawSize);
      const winner = chooseWinner(playerA, playerB, {
        count: stage.participantCount,
        champion,
        roundName: accessRoundNameValue,
        phase: "Cuadro principal",
        matchIndex: index,
        roundIndex: 0,
        run,
      });
      const match = createPhysicalMatch(state, tournament, stage, accessRoundNameValue, "Cuadro principal", playerA, playerB, winner, matchNumber, stage.participantCount + matchNumber);
      recordRun(run, playerA, playerB, winner, accessRoundNameValue);
      const bracketMatch = makeBracketMatch(stage, accessRoundNameValue, index, playerA, playerB, match, winner, {
        treeSlotStart: accessSlotIndex,
        treeSlotSpan: 1,
        treeRoundIndex: 0,
        baseDrawSize,
      });
      matches.push(bracketMatch);
      lockedMainSlots.set(accessSlotIndex, advanceEntrant(winner, bracketMatch, [playerA, playerB]));
      matchNumber += 1;
    });
    rounds.push({ id: `${stage.categoryId}-${accessRoundNameValue.toLowerCase()}`, name: accessRoundNameValue, matches });
  }

  const mainSlots = placeSeededEntrants(directEntrants, baseDrawSize, lockedMainSlots);
  const preparedMainSlots = mainSlots.map((entrant, index) => {
    const prepared = { ...entrant, treeSlotStart: index, treeSlotSpan: 1 };
    if (prepared.sourceBracketMatch) {
      prepared.sourceBracketMatch.treeSlotStart = index;
      prepared.sourceBracketMatch.treeSlotSpan = 1;
      prepared.sourceBracketMatch.treeTopRatio = (index + 0.5) / baseDrawSize;
      prepared.sourceBracketMatch.logicalSide = getLogicalSide(index, 1, baseDrawSize, prepared.sourceBracketMatch.roundName);
      prepared.sourceBracketMatch.baseDrawSize = baseDrawSize;
    }
    return prepared;
  });
  const mainDraw = buildCompletedRounds(state, tournament, stage, preparedMainSlots, champion, run, matchNumber);
  rounds.push(...mainDraw.rounds);
  const finalRound = mainDraw.rounds[mainDraw.rounds.length - 1];
  const finalMatch = finalRound?.matches?.[0];
  const runnerUpName = finalMatch?.winner === finalMatch?.playerA ? finalMatch?.playerB : finalMatch?.playerA;

  return {
    rounds,
    champion: finalMatch?.winner || mainDraw.champion?.fullName || null,
    runnerUp: runnerUpName || null,
    subchampion: runnerUpName || null,
    playerRuns: Object.fromEntries([...run.entries()]),
    nextMatchNumber: mainDraw.nextMatchNumber,
  };
}

export function buildPreliminaryStructure(state, tournament, stage, players) {
  const count = stage.participantCount;
  const rankedPlayers = [...players].sort((a, b) => a.ranking - b.ranking);
  const champion = rankedPlayers.find((player) => player.ranking === getChampionPosition(count)) || rankedPlayers[0];
  const run = new Map();
  const preliminaries = [];
  const outcomes = [];
  let matchNumber = 1;

  const preliminaryBye = count % 2 === 1 ? rankedPlayers[0] : null;
  const pairedPlayers = preliminaryBye ? rankedPlayers.slice(1) : rankedPlayers;
  if (preliminaryBye) {
    const byePlayer = { ...preliminaryBye, prelimBye: true };
    const byeMatch = createByeMatch(state, tournament, stage, byePlayer);
    preliminaries.push({
      matchId: byeMatch.id,
      playerA: byePlayer.fullName,
      playerB: "BYE",
      status: "Finalizado",
      result: "6-0 / 6-0",
      winner: byePlayer.fullName,
      bye: true,
      byeSource: "Ranking General",
    });
    outcomes.push({
      ...byePlayer,
      preliminaryScore: 2000,
      preliminaryWon: true,
      prelimBye: true,
      sourceMatchId: byeMatch.id,
      sourceRoundName: "Preliminar",
      sourceType: "BYE",
    });
  }

  makePreliminaryPairs(pairedPlayers).forEach(([playerA, playerB], index) => {
    const winner = chooseWinner(playerA, playerB, {
      count,
      champion,
      roundName: "Preliminar",
      phase: "Preliminar",
      matchIndex: index,
      roundIndex: -1,
      run,
    });
    const loser = winner.id === playerA.id ? playerB : playerA;
    const match = createPhysicalMatch(state, tournament, stage, "Preliminar", "Preliminar", playerA, playerB, winner, matchNumber, count + index);
    recordRun(run, playerA, playerB, winner, "Preliminar");
    const winnerScore = 1200 + winner.ranking * -3 + index;
    const loserScore = 500 + loser.ranking * -2 - index;
    match.preliminaryScore = winnerScore;
    match.loserPreliminaryScore = loserScore;
    preliminaries.push({
      matchId: match.id,
      playerA: playerA.fullName,
      playerB: playerB.fullName,
      playerAId: playerA.id,
      playerBId: playerB.id,
      status: "Finalizado",
      result: match.result,
      winner: winner.fullName,
      seedVsSeed: playerA.seed && playerB.seed,
    });
    outcomes.push({
      ...winner,
      preliminaryScore: winnerScore,
      preliminaryWon: true,
      originPreliminary: true,
      sourceMatchId: match.id,
      sourceRoundName: "Preliminar",
      sourceType: "Preliminar",
    });
    outcomes.push({
      ...loser,
      preliminaryScore: loserScore,
      preliminaryWon: false,
      originPreliminary: true,
      sourceMatchId: match.id,
      sourceRoundName: "Preliminar",
      sourceType: "Preliminar",
    });
    matchNumber += 1;
  });

  const baseDrawSize = largestStandardDraw(count);
  const accessMatchesCount = Math.max(0, count - baseDrawSize);
  const sortedOutcomes = outcomes.sort((a, b) => b.preliminaryScore - a.preliminaryScore || a.ranking - b.ranking);
  const directEntrantsCount = baseDrawSize - accessMatchesCount;
  const directEntrants = sortedOutcomes.slice(0, directEntrantsCount);
  const accessEntrants = sortedOutcomes.slice(directEntrantsCount);
  const rounds = [];
  const lockedMainSlots = new Map();

  if (accessMatchesCount > 0) {
    const roundName = accessRoundName(baseDrawSize);
    const matches = [];
    pairEntrantsAvoidingSameSource(accessEntrants).forEach(([playerA, playerB], index) => {
      const accessSlotIndex = getAccessSlotIndex(index, accessMatchesCount, baseDrawSize);
      const winner = chooseWinner(playerA, playerB, {
        count,
        champion,
        roundName,
        phase: "Cuadro principal",
        matchIndex: index,
        roundIndex: 0,
        run,
      });
      const match = createPhysicalMatch(state, tournament, stage, roundName, "Cuadro principal", playerA, playerB, winner, matchNumber, count + matchNumber);
      recordRun(run, playerA, playerB, winner, roundName);
      const bracketMatch = makeBracketMatch(stage, roundName, index, playerA, playerB, match, winner, {
        treeSlotStart: accessSlotIndex,
        treeSlotSpan: 1,
        treeRoundIndex: 0,
        baseDrawSize,
      });
      matches.push(bracketMatch);
      lockedMainSlots.set(accessSlotIndex, advanceEntrant(winner, bracketMatch, [playerA, playerB]));
      matchNumber += 1;
    });
    rounds.push({ id: `${stage.categoryId}-${roundName.toLowerCase()}`, name: roundName, matches });
  }

  const mainSlots = accessMatchesCount > 0
    ? placeSeededEntrants(directEntrants, baseDrawSize, lockedMainSlots)
    : placeSeededEntrants(sortedOutcomes, baseDrawSize);
  const preparedMainSlots = mainSlots.map((entrant, index) => {
    const prepared = { ...entrant, treeSlotStart: index, treeSlotSpan: 1 };
    if (prepared.sourceBracketMatch) {
      prepared.sourceBracketMatch.treeSlotStart = index;
      prepared.sourceBracketMatch.treeSlotSpan = 1;
      prepared.sourceBracketMatch.treeTopRatio = (index + 0.5) / baseDrawSize;
      prepared.sourceBracketMatch.logicalSide = getLogicalSide(index, 1, baseDrawSize, prepared.sourceBracketMatch.roundName);
      prepared.sourceBracketMatch.baseDrawSize = baseDrawSize;
    }
    return prepared;
  });
  const mainDraw = buildCompletedRounds(state, tournament, stage, preparedMainSlots, champion, run, matchNumber);
  rounds.push(...mainDraw.rounds);
  const finalRound = mainDraw.rounds[mainDraw.rounds.length - 1];
  const finalMatch = finalRound?.matches?.[0];
  const runnerUpName = finalMatch?.winner === finalMatch?.playerA ? finalMatch?.playerB : finalMatch?.playerA;

  return {
    id: bracketKey(tournament.id, stage.categoryId),
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    categoryName: stage.categoryName,
    format: "Preliminar",
    participantCount: count,
    baseDrawSize,
    accessMatchesCount,
    seedCount: getSeedCount(count),
    preliminaryBye: preliminaryBye?.fullName || null,
    preliminaries,
    rounds,
    champion: finalMatch?.winner || mainDraw.champion?.fullName || null,
    runnerUp: runnerUpName || null,
    subchampion: runnerUpName || null,
    completed: true,
    playerRuns: Object.fromEntries([...run.entries()]),
  };
}

export function buildDirectElimination(state, tournament, stage, players) {
  return buildPreliminaryStructure(state, tournament, stage, players);
}

export function buildZonesStructure(state, tournament, stage, players) {
  return buildPreliminaryStructure(state, tournament, stage, players);
}

function makeStage(tournamentId, config, participants) {
  return {
    categoryId: config.categoryId,
    categoryName: config.categoryName,
    recommendedFormat: "Preliminar",
    format: "Preliminar",
    formatStatus: "Confirmado",
    status: "Finalizado",
    inscriptionsCount: config.participantCount,
    participantCount: config.participantCount,
    participants: participants.map((player) => player.id),
    bracketKey: bracketKey(tournamentId, config.categoryId),
    matchFormat: DEFAULT_MATCH_FORMAT,
  };
}

function attachCategoryRanking(player, entry) {
  if (!player.categoryRankings) player.categoryRankings = [];
  player.categoryRankings.push(entry);
  const shouldUsePrimary = player.id === PLAYER_A_ID
    ? entry.categoryId === "cat-pre-32"
    : player.id === PLAYER_B_ID
      ? entry.categoryId === "cat-pre-20"
      : player.id === PLAYER_C_ID
        ? entry.categoryId === "cat-pre-13"
        : player.ranking == null;
  if (shouldUsePrimary) {
    player.categoryId = entry.categoryId;
    player.categoryName = entry.categoryName;
    player.ranking = entry.position;
    player.points = entry.points;
  }
}

function updatePlayerStats(players, matches) {
  const byId = new Map(players.map((player) => [player.id, player]));
  matches.filter((match) => match.phase !== "BYE").forEach((match) => {
    [match.playerAId, match.playerBId].forEach((playerId) => {
      const player = byId.get(playerId);
      if (player) player.stats.played += 1;
    });
    const winner = byId.get(match.winnerId);
    const loser = byId.get(match.loserId);
    if (winner) winner.stats.wins += 1;
    if (loser) loser.stats.losses += 1;
  });
}

function summarizeFixture(state, validation) {
  const preliminaries = state.matches.filter((match) => match.phase === "Preliminar").length;
  const byes = state.matches.filter((match) => match.phase === "BYE").length;
  const bracketMatches = state.matches.filter((match) => match.phase === "Cuadro principal").length;
  return {
    tournamentId: state.tournaments[0]?.id,
    tournamentName: state.tournaments[0]?.name,
    players: state.players.length,
    categories: state.categories.length,
    enrollments: state.enrollments.length,
    preliminaryMatches: preliminaries,
    bracketMatches,
    byeMatches: byes,
    totalMatchesIncludingBye: state.matches.length,
    validation,
  };
}

function getResultForPlayer(bracket, playerId) {
  if (bracket.champion && bracket.rounds?.some((round) => round.name === "Final" && round.matches?.[0]?.winner)) {
    const final = bracket.rounds.find((round) => round.name === "Final")?.matches?.[0];
    if (final?.winner === final?.playerA && final.playerAId === playerId) return "Campeon";
    if (final?.winner === final?.playerB && final.playerBId === playerId) return "Campeon";
    if ([final?.playerAId, final?.playerBId].includes(playerId)) return "Finalista";
  }
  const run = bracket.playerRuns?.[playerId];
  if (!run) return "Inscripto";
  if (run.losses === 0 && bracket.preliminaryBye) return "BYE preliminar";
  return run.losses ? `Eliminado en ${run.reached}` : `Avanzo hasta ${run.reached}`;
}

export function createTorneoGameFixture(overrides = {}) {
  const tournamentId = overrides.id || TORNEO_GAME_ID;
  const tournamentName = overrides.name?.trim() || TORNEO_GAME_NAME;
  const players = createPlayerPool();
  const playerById = new Map(players.map((player) => [player.id, player]));
  const state = {
    players,
    categories: TORNEO_GAME_CATEGORIES.map((config) => makeCategory(config.participantCount)),
    tournaments: [],
    brackets: {},
    matches: [],
    rankings: [],
    previousSeasonRankings: [],
    rankingMovements: [],
    enrollments: [],
    schedule: [],
    matchAvailability: [],
  };
  const playersByCategory = new Map();

  TORNEO_GAME_CATEGORIES.forEach((config) => {
    const rankedPlayers = buildRankedPlayersForCategory(config, players);
    playersByCategory.set(config.categoryId, rankedPlayers);
    rankedPlayers.forEach((player, index) => {
      const rankingEntry = {
        id: `ranking-${config.categoryId}-${player.id}`,
        playerId: player.id,
        playerName: player.fullName,
        categoryId: config.categoryId,
        categoryName: config.categoryName,
        position: player.ranking,
        points: player.points,
        season: "2026",
        seed: player.seed,
        ascended: player.ascended,
      };
      state.rankings.push(rankingEntry);
      state.enrollments.push(createEnrollment(tournamentId, config, player, index));
      attachCategoryRanking(playerById.get(player.id), {
        tournamentId,
        tournamentName,
        categoryId: config.categoryId,
        categoryName: config.categoryName,
        position: player.ranking,
        points: player.points,
        seed: player.seed,
        ascended: player.ascended,
        note: player.specialNote,
      });
    });
  });

  state.previousSeasonRankings.push(
    { id: "prev-player-a-33", playerId: PLAYER_A_ID, playerName: "Jugador Prueba A", categoryId: "cat-pre-33", categoryName: "33 jugadores", position: 3, points: 1510, season: "2025" },
    { id: "prev-player-b-20", playerId: PLAYER_B_ID, playerName: "Jugador Prueba B", categoryId: "cat-pre-20", categoryName: "20 jugadores", position: 4, points: 1390, season: "2025" },
    { id: "prev-player-c-13", playerId: PLAYER_C_ID, playerName: "Jugador Prueba C", categoryId: "cat-pre-13", categoryName: "13 jugadores", position: 11, points: 610, season: "2025" },
  );

  const categoryStages = TORNEO_GAME_CATEGORIES.map((config) => makeStage(tournamentId, config, playersByCategory.get(config.categoryId)));
  const tournament = {
    id: tournamentId,
    name: tournamentName,
    type: "GAME 1000",
    scoringSystem: "GAME 1000",
    status: "Finalizado",
    registrationStatus: "Finalizado",
    description: "Fixture DEV masivo para validar formato Preliminares entre 8 y 48 jugadores.",
    startDate: "2026-08-10",
    endDate: "2026-08-24",
    semifinalsDate: "2026-08-22",
    finalsDate: "2026-08-24",
    price: 18000,
    categories: categoryStages.map((stage) => stage.categoryId),
    participants: [...new Set(categoryStages.flatMap((stage) => stage.participants))],
    phases: ["Preliminar", "32avos", "16avos", "8vos", "Cuartos", "Semifinal", "Final"],
    courts: ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4", "Cancha 5", "Cancha 6"],
    categoryStages,
    playerCategoryId: "cat-pre-32",
    playerCategoryName: "32 jugadores",
    matchFormat: DEFAULT_MATCH_FORMAT,
    isDevTest: true,
    testSimulationStatus: "Fixture finalizado deterministico",
  };
  state.tournaments.push(tournament);

  categoryStages.forEach((stage) => {
    const bracket = buildPreliminaryStructure(state, tournament, stage, playersByCategory.get(stage.categoryId));
    state.brackets[stage.bracketKey] = bracket;
  });
  state.brackets[tournament.id] = state.brackets[categoryStages[0].bracketKey];

  state.enrollments.forEach((enrollment) => {
    const bracket = state.brackets[bracketKey(tournamentId, enrollment.categoryId)];
    const player = playerById.get(enrollment.playerId);
    const entry = player?.categoryRankings?.find((item) => item.categoryId === enrollment.categoryId);
    if (entry && bracket) entry.resultSummary = getResultForPlayer(bracket, enrollment.playerId);
  });

  updatePlayerStats(state.players, state.matches);
  const validation = validateTorneoGameFixture(state, tournamentId);
  state.diagnostics = summarizeFixture(state, validation);
  if (!validation.ok && typeof console !== "undefined") {
    console.error("Fixture DEV Preliminares invalido", validation.errors);
  }
  return state;
}

export function validateTorneoGameFixture(db, tournamentId = TORNEO_GAME_ID) {
  const errors = [];
  const tournament = db.tournaments.find((item) => item.id === tournamentId);
  const expectedCounts = Array.from({ length: 41 }, (_, index) => index + 8);
  const categoryNames = new Set();

  if (!tournament) errors.push(`No existe el torneo ${tournamentId}.`);
  if (db.categories.length !== 41) errors.push(`Se esperaban 41 categorias y hay ${db.categories.length}.`);

  expectedCounts.forEach((count) => {
    const categoryId = categoryIdForCount(count);
    const category = db.categories.find((item) => item.id === categoryId);
    if (!category) errors.push(`Falta categoria ${count} jugadores.`);
    if (categoryNames.has(category?.name)) errors.push(`Categoria duplicada: ${category?.name}.`);
    if (category) categoryNames.add(category.name);

    const enrollments = db.enrollments.filter((item) => item.tournamentId === tournamentId && item.categoryId === categoryId);
    if (enrollments.length !== count) errors.push(`${count} jugadores: inscripciones ${enrollments.length}, esperadas ${count}.`);
    const enrollmentPlayerIds = enrollments.map((item) => item.playerId);
    if (new Set(enrollmentPlayerIds).size !== enrollmentPlayerIds.length) errors.push(`${count} jugadores: inscripciones duplicadas.`);
    enrollmentPlayerIds.forEach((playerId) => {
      if (!db.players.some((player) => player.id === playerId)) errors.push(`${count} jugadores: inscripcion apunta a jugador inexistente ${playerId}.`);
    });

    const rankings = db.rankings.filter((item) => item.categoryId === categoryId);
    if (rankings.length !== count) errors.push(`${count} jugadores: ranking ${rankings.length}, esperado ${count}.`);
    const positions = rankings.map((item) => item.position).sort((a, b) => a - b);
    positions.forEach((position, index) => {
      if (position !== index + 1) errors.push(`${count} jugadores: posicion de ranking invalida ${position}.`);
    });

    const bracket = db.brackets[bracketKey(tournamentId, categoryId)];
    if (!bracket) {
      errors.push(`${count} jugadores: falta llave.`);
      return;
    }
    if (bracket.participantCount !== count) errors.push(`${count} jugadores: participantCount de llave incorrecto.`);
    if (!bracket.champion) errors.push(`${count} jugadores: falta campeon.`);
    if ((bracket.preliminaries || []).some((match) => match.seedVsSeed)) errors.push(`${count} jugadores: preliminar enfrenta cabezas de serie.`);
    const baseDrawSize = largestStandardDraw(count);
    const firstMainRound = bracket.rounds?.find((round) => mainRoundNames(baseDrawSize).includes(round.name));
    if (!firstMainRound || firstMainRound.matches.length !== baseDrawSize / 2) errors.push(`${count} jugadores: llave objetivo ${baseDrawSize} invalida.`);
    validateBracketConnections(db, bracket, errors);
  });

  const playerAEntries = db.rankings.filter((entry) => entry.playerId === PLAYER_A_ID);
  const playerBEntries = db.rankings.filter((entry) => entry.playerId === PLAYER_B_ID);
  const playerCEntries = db.rankings.filter((entry) => entry.playerId === PLAYER_C_ID);
  if (playerAEntries.length < 3) errors.push("Jugador Prueba A no aparece en 3 categorias.");
  if (!playerAEntries.some((entry) => entry.points === 0)) errors.push("Jugador Prueba A no tiene categoria con 0 puntos.");
  if (playerBEntries.length < 2) errors.push("Jugador Prueba B no aparece en 2 categorias.");
  if (playerCEntries.length < 3) errors.push("Jugador Prueba C no aparece en 3 categorias.");

  db.matches.forEach((match) => {
    if (match.status !== "Finalizado") errors.push(`${match.id}: partido no finalizado.`);
    if (!match.winnerId) errors.push(`${match.id}: partido sin ganador.`);
    if (match.phase === "BYE" && (match.result !== "6-0 / 6-0" || match.resultDetail?.type !== "BYE")) errors.push(`${match.id}: BYE invalido.`);
  });

  const summary = {
    categories: db.categories.length,
    players: db.players.length,
    enrollments: db.enrollments.length,
    preliminaryMatches: db.matches.filter((match) => match.phase === "Preliminar").length,
    byeMatches: db.matches.filter((match) => match.phase === "BYE").length,
    bracketMatches: db.matches.filter((match) => match.phase === "Cuadro principal").length,
  };

  return {
    ok: errors.length === 0,
    errors,
    summary,
    variety: getTorneoGameVarietyReport(db, tournamentId),
  };
}

function validateBracketConnections(db, bracket, errors) {
  const physicalMatches = new Map(db.matches.map((match) => [match.id, match]));
  const bracketMatches = [];
  (bracket.rounds || []).forEach((round, roundIndex) => {
    (round.matches || []).forEach((match, matchIndex) => {
      bracketMatches.push({ ...match, roundIndex, matchIndex, roundName: round.name });
    });
  });
  const byMatchId = new Map(bracketMatches.map((match) => [match.matchId, match]));

  bracketMatches.forEach((origin) => {
    const physicalOrigin = physicalMatches.get(origin.matchId);
    if (!physicalOrigin?.winnerId) return;
    const isFinal = origin.roundIndex === (bracket.rounds || []).length - 1;
    if (isFinal) return;
    if (!origin.childMatchId || !origin.childSlot) {
      errors.push(`${bracket.categoryName}: ${origin.matchId} no tiene referencia explicita de partido hijo.`);
      return;
    }

    const expectedChild = byMatchId.get(origin.childMatchId);
    if (!expectedChild) {
      errors.push(`${bracket.categoryName}: ${origin.matchId} esperaba avanzar a ${origin.childMatchId}, pero ese partido no existe.`);
      return;
    }
    if (expectedChild.roundIndex !== origin.roundIndex + 1) {
      errors.push(`${bracket.categoryName}: ${origin.roundName} ${origin.matchId} salta a ${expectedChild.roundName} ${expectedChild.matchId}; debe ir a la ronda inmediata siguiente.`);
    }
    if (expectedChild.logicalSide !== "center" && origin.logicalSide !== expectedChild.logicalSide) {
      errors.push(`${bracket.categoryName}: ${origin.roundName} ${origin.matchId} sale de lado ${origin.logicalSide} y entra a ${expectedChild.logicalSide} en ${expectedChild.matchId}; esperado mismo lado antes de la final.`);
    }
    const originStart = origin.treeSlotStart;
    const originEnd = origin.treeSlotStart + origin.treeSlotSpan;
    const childStart = expectedChild.treeSlotStart;
    const childEnd = expectedChild.treeSlotStart + expectedChild.treeSlotSpan;
    if (originStart < childStart || originEnd > childEnd) {
      errors.push(`${bracket.categoryName}: ${origin.matchId} no cae dentro del rango visual de su hijo ${expectedChild.matchId}.`);
    }

    const childOccurrences = [expectedChild.playerAId, expectedChild.playerBId].filter((playerId) => playerId === physicalOrigin.winnerId).length;
    if (childOccurrences !== 1) {
      errors.push(`${bracket.categoryName}: ganador de ${origin.matchId} debia aparecer una vez en ${origin.childMatchId} y aparece ${childOccurrences}.`);
    }

    const actualSlotPlayerId = origin.childSlot === "A" ? expectedChild.playerAId : expectedChild.playerBId;
    if (actualSlotPlayerId !== physicalOrigin.winnerId) {
      const actualMatch = bracketMatches.find((candidate) => [candidate.playerAId, candidate.playerBId].includes(physicalOrigin.winnerId));
      errors.push(`${bracket.categoryName}: ganador de ${origin.matchId} debia ir a ${origin.childMatchId} slot ${origin.childSlot}, pero fue ubicado en ${actualMatch?.matchId || "ningun partido"}.`);
    }

    const wrongBranches = bracketMatches.filter((candidate) =>
      candidate.roundIndex === expectedChild.roundIndex
      && candidate.matchId !== expectedChild.matchId
      && [candidate.playerAId, candidate.playerBId].includes(physicalOrigin.winnerId),
    );
    wrongBranches.forEach((candidate) => {
      errors.push(`${bracket.categoryName}: ganador de ${origin.matchId} aparece tambien en rama no conectada ${candidate.matchId}; esperado ${origin.childMatchId}.`);
    });
  });

  bracketMatches.forEach((child) => {
    const distinctParents = new Set(child.parentMatchIds || []);
    if ((child.parentMatchIds || []).length !== distinctParents.size) {
      errors.push(`${bracket.categoryName}: ${child.matchId} recibe dos slots desde el mismo partido padre.`);
    }
    (child.parentSlots || []).forEach((parentSlot) => {
      const parent = byMatchId.get(parentSlot.matchId);
      if (!parent) return;
      const parentWinner = physicalMatches.get(parent.matchId)?.winnerId;
      const childPlayerId = parentSlot.slot === "A" ? child.playerAId : child.playerBId;
      if (parentWinner && childPlayerId !== parentWinner) {
        errors.push(`${bracket.categoryName}: ${child.matchId} recibe ${childPlayerId} en slot ${parentSlot.slot}, pero el padre ${parent.matchId} gano con ${parentWinner}.`);
      }
      if (parent.childMatchId !== child.matchId) {
        errors.push(`${bracket.categoryName}: ${child.matchId} declara padre ${parent.matchId}, pero ese padre apunta a ${parent.childMatchId || "ningun partido"}.`);
      }
    });
  });
}

export function getTorneoGameVarietyReport(db, tournamentId = TORNEO_GAME_ID) {
  const championRank1 = [];
  const championTop5 = [];
  const championMiddle = [];
  const rankOneEarlyExit = [];
  const byeLostFirst = [];
  const prelimDeepRun = [];

  TORNEO_GAME_CATEGORIES.forEach((config) => {
    const bracket = db.brackets[bracketKey(tournamentId, config.categoryId)];
    if (!bracket) return;
    const championEntry = db.rankings.find((entry) => entry.categoryId === config.categoryId && entry.playerName === bracket.champion);
    if (championEntry?.position === 1) championRank1.push(config.categoryName);
    if (championEntry?.position >= 2 && championEntry.position <= 5) championTop5.push(config.categoryName);
    if (championEntry?.position > 5 && championEntry.position <= Math.ceil(config.participantCount * 0.65)) championMiddle.push(config.categoryName);

    const rankOne = db.rankings.find((entry) => entry.categoryId === config.categoryId && entry.position === 1);
    const rankOneRun = rankOne ? bracket.playerRuns?.[rankOne.playerId] : null;
    if (rankOneRun?.played === 1 && rankOneRun.losses === 1) rankOneEarlyExit.push(config.categoryName);

    const byeMatch = db.matches.find((match) => match.categoryId === config.categoryId && match.phase === "BYE");
    const byeRun = byeMatch ? bracket.playerRuns?.[byeMatch.winnerId] : null;
    if (byeRun?.played === 1 && byeRun.losses === 1) byeLostFirst.push(config.categoryName);

    const semifinalOrFinalPlayers = new Set(
      (bracket.rounds || [])
        .filter((round) => ["Semifinal", "Final"].includes(round.name))
        .flatMap((round) => round.matches.flatMap((match) => [match.playerAId, match.playerBId])),
    );
    const fromPrelim = db.matches
      .filter((match) => match.categoryId === config.categoryId && match.phase === "Preliminar" && match.winnerId)
      .some((match) => semifinalOrFinalPlayers.has(match.winnerId));
    if (fromPrelim) prelimDeepRun.push(config.categoryName);
  });

  return {
    championRank1,
    championTop5,
    championMiddle,
    rankOneEarlyExit,
    byeLostFirst,
    prelimDeepRun,
  };
}

export function getTorneoGameDiagnostics(db, tournamentId = TORNEO_GAME_ID) {
  return validateTorneoGameFixture(db, tournamentId);
}
