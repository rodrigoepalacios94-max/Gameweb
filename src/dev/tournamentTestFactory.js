import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";

const TEST_CATEGORY_ID = "cat-m4";
const TEST_CATEGORY_NAME = "4a Masculino";
const BOT_AVATAR = "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=240&q=80";

function botName(index) {
  return `Bot ${String(index).padStart(2, "0")}`;
}

function makeBot(index) {
  return {
    id: `test-bot-${String(index).padStart(2, "0")}`,
    firstName: "Bot",
    lastName: String(index).padStart(2, "0"),
    fullName: botName(index),
    dni: `BOT-${String(index).padStart(4, "0")}`,
    birthDate: "1994-01-01",
    gender: "Masculino",
    phone: "-",
    email: `bot${String(index).padStart(2, "0")}@game.test`,
    categoryId: TEST_CATEGORY_ID,
    categoryName: TEST_CATEGORY_NAME,
    ranking: index,
    points: 1000 - index * 7,
    avatar: BOT_AVATAR,
    status: "Activo",
    discipline: { faults: 0, limit: 3, status: "Sin sanciones" },
    isBot: true,
    isDevTestBot: true,
  };
}

function pairPreliminaries(players) {
  return Array.from({ length: 17 }, (_, index) => [players[index], players[index + 17]]);
}

function createPreliminaryMatch(tournament, pair, index) {
  const [playerA, playerB] = pair;
  const day = index < 9 ? "2026-08-08" : "2026-08-09";
  const times = index < 9 ? tournament.schedule?.saturday || ["10:00"] : tournament.schedule?.sunday || ["09:00"];
  const courtNumber = index < 9 ? (index % 3) + 1 : (index % 4) + 1;
  return {
    id: `test-prelim-${tournament.id}-${index + 1}`,
    tournamentId: tournament.id,
    tournament: tournament.name,
    category: TEST_CATEGORY_NAME,
    round: "Preliminar",
    phase: "Preliminar",
    playerAId: playerA.id,
    playerA: playerA.fullName,
    playerAAvatar: playerA.avatar,
    playerBId: playerB.id,
    playerB: playerB.fullName,
    playerBAvatar: playerB.avatar,
    opponentId: playerB.id,
    opponent: playerB.fullName,
    opponentAvatar: playerB.avatar,
    date: day,
    time: times[index % times.length],
    court: `Cancha ${courtNumber}`,
    status: "Programado",
    result: null,
    sets: [],
    winnerId: null,
    pointsEarned: 0,
    discipline: { claims: [], confirmedFaults: [] },
    isDevTest: true,
  };
}

function scoreFor(index) {
  const profiles = [
    { result: "6-0 / 6-1", sets: [{ a: 6, b: 0 }, { a: 6, b: 1 }], score: 95 },
    { result: "6-2 / 6-2", sets: [{ a: 6, b: 2 }, { a: 6, b: 2 }], score: 88 },
    { result: "6-3 / 6-4", sets: [{ a: 6, b: 3 }, { a: 6, b: 4 }], score: 80 },
    { result: "7-5 / 6-4", sets: [{ a: 7, b: 5 }, { a: 6, b: 4 }], score: 73 },
    { result: "4-6 / 6-3 / 10-8", sets: [{ a: 4, b: 6 }, { a: 6, b: 3 }, { a: 10, b: 8, superTieBreak: true }], score: 66 },
  ];
  return profiles[index % profiles.length];
}

function deterministicShuffle(items) {
  return [...items].sort((a, b) => ((a.ranking * 17) % 31) - ((b.ranking * 17) % 31));
}

function makeBracketMatch(id, playerA, playerB, extra = {}) {
  return {
    id,
    playerA: playerA?.fullName || playerA || "A definir",
    playerB: playerB?.fullName || playerB || "A definir",
    playerANote: playerA?.testNote,
    playerBNote: playerB?.testNote,
    score: extra.score || "Pendiente",
    winner: extra.winner || null,
    matchId: extra.matchId || null,
    connectionNote: extra.connectionNote,
    isDevTest: true,
  };
}

function buildFutureRound(id, name, count) {
  return {
    id,
    name,
    matches: Array.from({ length: count }, (_, index) => makeBracketMatch(`${id}-${index + 1}`, `Ganador ${name} ${index + 1}`, "A definir")),
  };
}

function buildSimulatedBracket(tournamentId, prelimMatches) {
  const winners = [];
  const losers = [];

  prelimMatches.forEach((match, index) => {
    const winner = {
      id: match.winnerId,
      fullName: match.winnerId === match.playerAId ? match.playerA : match.playerB,
      ranking: Number(match.winnerId?.replace(/\D/g, "")) || index + 1,
      preliminaryScore: match.preliminaryScore,
      testNote: "Ganador preliminar",
    };
    const loser = {
      id: match.winnerId === match.playerAId ? match.playerBId : match.playerAId,
      fullName: match.winnerId === match.playerAId ? match.playerB : match.playerA,
      ranking: Number((match.winnerId === match.playerAId ? match.playerBId : match.playerAId)?.replace(/\D/g, "")) || index + 18,
      preliminaryScore: match.loserPreliminaryScore,
      testNote: "Perdedor clasificado",
    };
    winners.push(winner);
    losers.push(loser);
  });

  winners.sort((a, b) => b.preliminaryScore - a.preliminaryScore || a.ranking - b.ranking);
  losers.sort((a, b) => b.preliminaryScore - a.preliminaryScore || a.ranking - b.ranking);

  const bestWinners = winners.slice(0, 2);
  const middleWinners = winners.slice(2, 15);
  const worstWinners = winners.slice(15);
  const directLosers = losers.slice(0, 13);
  const worstLosers = losers.slice(13);

  const roundOf32Winners = [worstLosers[0], worstLosers[2]].map((player, index) => ({
    ...player,
    testNote: `Ganador 32avos ${index + 1}`,
  }));

  const roundOf32 = {
    id: "round-32",
    name: "32avos",
    matches: [
      makeBracketMatch("test-32-1", worstLosers[0], worstLosers[1], {
        score: "6-3 / 6-4",
        winner: worstLosers[0]?.fullName,
        connectionNote: "El ganador cruza con el mejor ganador de preliminar.",
      }),
      makeBracketMatch("test-32-2", worstLosers[2], worstLosers[3], {
        score: "7-5 / 6-4",
        winner: worstLosers[2]?.fullName,
        connectionNote: "El ganador cruza con el segundo mejor ganador de preliminar.",
      }),
    ],
  };

  const shuffledLosers = deterministicShuffle(directLosers);
  const winnerLoserMatches = middleWinners.map((winner, index) =>
    makeBracketMatch(`test-16-${index + 2}`, winner, shuffledLosers[index], { connectionNote: "Sorteo ganador vs perdedor clasificado" }),
  );
  const seedTwoIndex = winnerLoserMatches.findIndex((match) => match.playerA === "Bot 02" || match.playerB === "Bot 02");
  if (seedTwoIndex >= 0 && seedTwoIndex < 7) {
    const bottomHalfIndex = Math.min(7, winnerLoserMatches.length - 1);
    [winnerLoserMatches[seedTwoIndex], winnerLoserMatches[bottomHalfIndex]] = [winnerLoserMatches[bottomHalfIndex], winnerLoserMatches[seedTwoIndex]];
  }
  const roundOf16Matches = [
    makeBracketMatch("test-16-1", bestWinners[0], roundOf32Winners[0], { connectionNote: "Mejor ganador vs ganador 32avos 1" }),
    ...winnerLoserMatches.slice(0, 7),
    ...winnerLoserMatches.slice(7),
    makeBracketMatch("test-16-15", worstWinners[0], worstWinners[1], { connectionNote: "Dos peores ganadores entre si" }),
    makeBracketMatch("test-16-16", bestWinners[1], roundOf32Winners[1], { connectionNote: "Segundo mejor ganador vs ganador 32avos 2" }),
  ];

  return {
    tournamentId,
    category: TEST_CATEGORY_NAME,
    isDevTest: true,
    testSummary: {
      winners,
      losers,
      directLosers,
      worstLosers,
      roundOf32Winners,
      finalDrawSize: 32,
      roundOf16Matches: 16,
    },
    preliminaries: prelimMatches.map((match) => ({
      matchId: match.id,
      playerA: match.playerA,
      playerB: match.playerB,
      status: match.status,
      result: match.result,
      winner: match.winnerId === match.playerAId ? match.playerA : match.playerB,
    })),
    rounds: [
      roundOf32,
      { id: "round-16", name: "16avos", matches: roundOf16Matches },
      buildFutureRound("octavos", "Octavos", 8),
      buildFutureRound("cuartos", "Cuartos", 4),
      buildFutureRound("semifinal", "Semifinal", 2),
      buildFutureRound("final", "Final", 1),
    ],
  };
}

export function isTestTournamentName(name = "") {
  return name.trim().toLowerCase() === "prueba";
}

export function create34PlayerTestTournament(payload) {
  return mutateMockData((db) => {
    const existingBots = new Set(db.players.map((player) => player.id));
    const bots = Array.from({ length: 34 }, (_, index) => makeBot(index + 1));
    bots.forEach((bot) => {
      if (!existingBots.has(bot.id)) db.players.push(bot);
    });

    const tournament = {
      id: createMockId("test-tour"),
      scoringSystem: payload.scoringSystem || "GAME 1000",
      price: Number(payload.price || 0),
      categories: [TEST_CATEGORY_ID],
      playerCategoryId: TEST_CATEGORY_ID,
      playerCategoryName: TEST_CATEGORY_NAME,
      courts: ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4"],
      isDevTest: true,
      ...payload,
      status: "En juego",
      participants: bots.map((bot) => bot.id),
      phases: ["Preliminar", "32avos", "Cuadro principal"],
      name: payload.name.trim(),
      type: "Preliminar",
    };

    db.tournaments.push(tournament);
    db.enrollments.push(...bots.map((bot) => ({
      id: `test-reg-${tournament.id}-${bot.id}`,
      tournamentId: tournament.id,
      playerId: bot.id,
      categoryId: TEST_CATEGORY_ID,
      categoryName: TEST_CATEGORY_NAME,
      status: "Confirmada",
      date: tournament.startDate,
      unavailableSlots: [],
      payment: "DEV TEST",
      isDevTest: true,
    })));

    const preliminaryMatches = pairPreliminaries(bots).map((pair, index) => createPreliminaryMatch(tournament, pair, index));
    db.matches.push(...preliminaryMatches);
    db.brackets[tournament.id] = {
      tournamentId: tournament.id,
      category: TEST_CATEGORY_NAME,
      isDevTest: true,
      preliminaries: preliminaryMatches.map((match) => ({
        matchId: match.id,
        playerA: match.playerA,
        playerB: match.playerB,
        status: "Programado",
      })),
      rounds: [],
    };
    return tournament;
  });
}

export function simulatePreliminaryResults(tournamentId) {
  return mutateMockData((db) => {
    const tournament = db.tournaments.find((item) => item.id === tournamentId);
    if (!tournament?.isDevTest) return null;

    const prelimMatches = db.matches
      .filter((match) => match.tournamentId === tournamentId && match.phase === "Preliminar")
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    prelimMatches.forEach((match, index) => {
      const winnerIsA = index < 16;
      const score = scoreFor(index);
      Object.assign(match, {
        status: "Finalizado",
        result: score.result,
        sets: score.sets,
        winnerId: winnerIsA ? match.playerAId : match.playerBId,
        preliminaryScore: score.score - index,
        loserPreliminaryScore: score.score - 28 - index,
      });
    });

    const bracket = buildSimulatedBracket(tournamentId, prelimMatches);
    db.brackets[tournamentId] = bracket;
    tournament.testSimulationStatus = "Simulado";
    tournament.phases = ["Preliminar", "32avos", "16avos", "Octavos", "Cuartos", "Semifinal", "Final"];
    return { tournament, bracket };
  });
}

export function getTestTournamentDiagnostics(tournamentId) {
  return readMockData((db) => {
    const tournament = db.tournaments.find((item) => item.id === tournamentId);
    const bots = db.players.filter((player) => player.isDevTestBot);
    const preliminaries = db.matches.filter((match) => match.tournamentId === tournamentId && match.phase === "Preliminar");
    const bracket = db.brackets[tournamentId];
    return {
      tournament,
      bots: bots.length,
      preliminaries: preliminaries.length,
      simulatedPreliminaries: preliminaries.filter((match) => match.status === "Finalizado").length,
      winners: bracket?.testSummary?.winners?.length || 0,
      losers: bracket?.testSummary?.losers?.length || 0,
      directLosers: bracket?.testSummary?.directLosers?.length || 0,
      roundOf32Players: bracket?.testSummary?.worstLosers?.length || 0,
      roundOf32Matches: bracket?.rounds?.find((round) => round.id === "round-32")?.matches?.length || 0,
      finalDrawSize: bracket?.testSummary?.finalDrawSize || 0,
      roundOf16Matches: bracket?.testSummary?.roundOf16Matches || 0,
    };
  });
}
