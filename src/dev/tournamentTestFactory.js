import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";
import { buildPreliminaryBracketFromResults } from "../services/tournamentCategoryService";

const TEST_CATEGORY_ID = "cat-m4";
const TEST_CATEGORY_NAME = "4a Masculino";
const TEST_BOT_COUNTS = [34, 16, 24, 20, 23, 12, 18, 10];
const BOT_AVATAR = "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=240&q=80";

function botName(index) {
  return `Bot ${String(index).padStart(2, "0")}`;
}

function makeBot(index, categoryId = TEST_CATEGORY_ID, categoryName = TEST_CATEGORY_NAME, globalIndex = index) {
  const padded = String(index).padStart(2, "0");
  const safeCategory = categoryId.replace(/[^a-z0-9]/gi, "-");
  return {
    id: `test-bot-${safeCategory}-${padded}`,
    firstName: "Bot",
    lastName: padded,
    fullName: botName(index),
    dni: `BOT-${safeCategory}-${padded}`,
    birthDate: "1994-01-01",
    gender: "Masculino",
    phone: "-",
    email: `bot-${safeCategory}-${padded}@game.test`,
    categoryId,
    categoryName,
    ranking: globalIndex,
    points: 1000 - globalIndex * 7,
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
    categoryId: TEST_CATEGORY_ID,
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
    { result: "6-0 / 6-1", sets: [{ type: "set", playerAScore: 6, playerBScore: 0, a: 6, b: 0 }, { type: "set", playerAScore: 6, playerBScore: 1, a: 6, b: 1 }], score: 95 },
    { result: "6-2 / 6-2", sets: [{ type: "set", playerAScore: 6, playerBScore: 2, a: 6, b: 2 }, { type: "set", playerAScore: 6, playerBScore: 2, a: 6, b: 2 }], score: 88 },
    { result: "6-3 / 6-4", sets: [{ type: "set", playerAScore: 6, playerBScore: 3, a: 6, b: 3 }, { type: "set", playerAScore: 6, playerBScore: 4, a: 6, b: 4 }], score: 80 },
    { result: "7-5 / 6-4", sets: [{ type: "set", playerAScore: 7, playerBScore: 5, a: 7, b: 5 }, { type: "set", playerAScore: 6, playerBScore: 4, a: 6, b: 4 }], score: 73 },
    { result: "4-6 / 6-3 / 10-8", sets: [{ type: "set", playerAScore: 4, playerBScore: 6, a: 4, b: 6 }, { type: "set", playerAScore: 6, playerBScore: 3, a: 6, b: 3 }, { type: "super_tiebreak", playerAScore: 10, playerBScore: 8, a: 10, b: 8, superTieBreak: true }], score: 66 },
  ];
  return profiles[index % profiles.length];
}

function deterministicShuffle(items) {
  return [...items].sort((a, b) => ((a.ranking * 17) % 31) - ((b.ranking * 17) % 31));
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
    playerANote: playerA?.testNote,
    playerBNote: playerB?.testNote,
    score: extra.score || "Pendiente",
    winner: extra.winner || null,
    matchId: extra.matchId || null,
    connectionNote: extra.connectionNote,
    isDevTest: true,
  };
}

function makeResultDetail(score, winnerId, loserId) {
  return {
    sets: score.sets,
    winnerId,
    loserId,
    playerASets: score.sets.filter((set) => set.playerAScore > set.playerBScore).length,
    playerBSets: score.sets.filter((set) => set.playerBScore > set.playerAScore).length,
  };
}

function createBracketMatchRecord(db, tournament, round, bracketMatch, index) {
  if (bracketMatch.matchId || !bracketMatch.playerAId || !bracketMatch.playerBId) return null;
  if (bracketMatch.playerA.startsWith("Ganador") || bracketMatch.playerB.startsWith("Ganador") || bracketMatch.playerB === "A definir") return null;
  const match = {
    id: `test-${round.id}-${tournament.id}-${index + 1}`,
    tournamentId: tournament.id,
    tournament: tournament.name,
    categoryId: TEST_CATEGORY_ID,
    category: TEST_CATEGORY_NAME,
    round: round.name,
    phase: "Cuadro principal",
    playerAId: bracketMatch.playerAId,
    playerA: bracketMatch.playerA,
    playerAAvatar: bracketMatch.playerAAvatar || BOT_AVATAR,
    playerBId: bracketMatch.playerBId,
    playerB: bracketMatch.playerB,
    playerBAvatar: bracketMatch.playerBAvatar || BOT_AVATAR,
    opponentId: bracketMatch.playerBId,
    opponent: bracketMatch.playerB,
    opponentAvatar: bracketMatch.playerBAvatar || BOT_AVATAR,
    date: tournament.startDate,
    time: "A definir",
    court: "A definir",
    status: "Pendiente",
    result: null,
    resultDetail: null,
    sets: [],
    winnerId: null,
    loserId: null,
    pointsEarned: 0,
    discipline: { claims: [], confirmedFaults: [] },
    isDevTest: true,
  };
  db.matches.push(match);
  bracketMatch.matchId = match.id;
  return match;
}

function buildFutureRound(id, name, count) {
  return {
    id,
    name,
    matches: Array.from({ length: count }, (_, index) => makeBracketMatch(`${id}-${index + 1}`, `Ganador ${name} ${index + 1}`, "A definir")),
  };
}

export function buildDevTestBracketFromPreliminaries(db, tournament, prelimMatches) {
  const winners = [];
  const losers = [];

  prelimMatches.forEach((match, index) => {
    const winner = {
      id: match.winnerId,
      fullName: match.winnerId === match.playerAId ? match.playerA : match.playerB,
      avatar: match.winnerId === match.playerAId ? match.playerAAvatar : match.playerBAvatar,
      ranking: Number(match.winnerId?.replace(/\D/g, "")) || index + 1,
      preliminaryScore: match.preliminaryScore,
      testNote: "Ganador preliminar",
    };
    const loser = {
      id: match.winnerId === match.playerAId ? match.playerBId : match.playerAId,
      fullName: match.winnerId === match.playerAId ? match.playerB : match.playerA,
      avatar: match.winnerId === match.playerAId ? match.playerBAvatar : match.playerAAvatar,
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

  const roundOf32 = {
    id: "round-32",
    name: "32avos",
    matches: [
      makeBracketMatch("test-32-1", worstLosers[0], worstLosers[1], { connectionNote: "El ganador cruza con el mejor ganador de preliminar." }),
      makeBracketMatch("test-32-2", worstLosers[2], worstLosers[3], { connectionNote: "El ganador cruza con el segundo mejor ganador de preliminar." }),
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
    makeBracketMatch("test-16-1", bestWinners[0], "Ganador 32avos 1", { connectionNote: "Mejor ganador vs ganador 32avos 1" }),
    ...winnerLoserMatches.slice(0, 7),
    ...winnerLoserMatches.slice(7),
    makeBracketMatch("test-16-15", worstWinners[0], worstWinners[1], { connectionNote: "Dos peores ganadores entre si" }),
    makeBracketMatch("test-16-16", bestWinners[1], "Ganador 32avos 2", { connectionNote: "Segundo mejor ganador vs ganador 32avos 2" }),
  ];

  const bracket = {
    tournamentId: tournament.id,
    categoryId: TEST_CATEGORY_ID,
    category: TEST_CATEGORY_NAME,
    isDevTest: true,
    testSummary: {
      winners,
      losers,
      directLosers,
      worstLosers,
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

  bracket.rounds.forEach((round) => {
    round.matches.forEach((match, index) => createBracketMatchRecord(db, tournament, round, match, index));
  });

  return bracket;
}

export function isTestTournamentName(name = "") {
  return name.trim().toLowerCase() === "prueba";
}

export function create34PlayerTestTournament(payload) {
  return mutateMockData((db) => {
    const selectedCategoryIds = payload.categories?.length ? payload.categories : [TEST_CATEGORY_ID];
    const categoryStages = [];
    const allBots = [];
    const enrollments = [];
    let globalBotIndex = 1;

    selectedCategoryIds.forEach((categoryId, categoryIndex) => {
      const category = db.categories.find((item) => item.id === categoryId);
      const categoryName = category ? `${category.name} ${category.branch}` : categoryId;
      const botCount = TEST_BOT_COUNTS[categoryIndex % TEST_BOT_COUNTS.length];
      const bots = Array.from({ length: botCount }, (_, index) => {
        const bot = makeBot(index + 1, categoryId, categoryName, globalBotIndex);
        globalBotIndex += 1;
        return bot;
      });
      allBots.push(...bots);
      categoryStages.push({
        categoryId,
        categoryName,
        format: "",
        recommendedFormat: null,
        formatStatus: "pending",
        formatDecision: "pending",
        participants: bots.map((bot) => bot.id),
        inscriptionsCount: bots.length,
        bracketKey: `${payload.id || "dev"}::${categoryId}`,
        status: "Formato pendiente",
      });
      enrollments.push(...bots.map((bot) => ({
        id: `test-reg-${payload.id || "dev"}-${bot.id}`,
        tournamentId: payload.id || "dev",
        playerId: bot.id,
        categoryId,
        categoryName,
        status: "Confirmada",
        date: payload.startDate,
        payment: "DEV TEST",
        isDevTest: true,
      })));
    });

    const existingPlayers = new Set(db.players.map((player) => player.id));
    allBots.forEach((bot) => {
      if (!existingPlayers.has(bot.id)) db.players.push(bot);
    });

    const tournament = {
      id: createMockId("test-tour"),
      scoringSystem: payload.scoringSystem || "GAME 1000",
      matchFormat: payload.matchFormat || DEFAULT_MATCH_FORMAT,
      price: Number(payload.price || 0),
      categories: selectedCategoryIds,
      categoryStages,
      playerCategoryId: selectedCategoryIds[0],
      playerCategoryName: categoryStages[0]?.categoryName,
      courts: ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4"],
      isDevTest: true,
      ...payload,
      status: "Inscripciones abiertas",
      categories: selectedCategoryIds,
      categoryStages,
      playerCategoryId: selectedCategoryIds[0],
      playerCategoryName: categoryStages[0]?.categoryName,
      participants: allBots.map((bot) => bot.id),
      phases: ["Formato pendiente"],
      name: payload.name.trim(),
    };

    db.tournaments.push(tournament);
    tournament.categoryStages.forEach((stage) => {
      stage.bracketKey = `${tournament.id}::${stage.categoryId}`;
    });
    db.enrollments.push(...enrollments.map((enrollment) => ({
      ...enrollment,
      id: `test-reg-${tournament.id}-${enrollment.playerId}`,
      tournamentId: tournament.id,
    })));
    return tournament;
  });
}

function simulateCategoryPreliminaries(db, tournament, categoryId) {
  const prelimMatches = db.matches
    .filter((match) => match.tournamentId === tournament.id && match.categoryId === categoryId && match.phase === "Preliminar")
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  prelimMatches.forEach((match, index) => {
    const winnerIsA = index % 2 === 0;
    const score = scoreFor(index);
    Object.assign(match, {
      status: "Finalizado",
      result: score.result,
      resultDetail: makeResultDetail(
        score,
        winnerIsA ? match.playerAId : match.playerBId,
        winnerIsA ? match.playerBId : match.playerAId,
      ),
      sets: score.sets,
      winnerId: winnerIsA ? match.playerAId : match.playerBId,
      loserId: winnerIsA ? match.playerBId : match.playerAId,
      preliminaryScore: score.score - index,
      loserPreliminaryScore: score.score - 28 - index,
    });
  });

  const stage = tournament.categoryStages?.find((item) => item.categoryId === categoryId);
  const bracket = buildPreliminaryBracketFromResults(db, tournament, categoryId) || db.brackets[stage?.bracketKey] || db.brackets[`${tournament.id}::${categoryId}`];
  if (stage) stage.status = "Preliminares simuladas";
  tournament.testSimulationStatus = "Simulado";
  return { tournament, bracket, simulatedPreliminaries: prelimMatches.length };
}

export function simulatePreliminaryResults(tournamentId, categoryId = null) {
  return mutateMockData((db) => {
    const tournament = db.tournaments.find((item) => item.id === tournamentId);
    if (!tournament?.isDevTest) return null;
    if (categoryId) return simulateCategoryPreliminaries(db, tournament, categoryId);

    const categoryIds = [...new Set(db.matches
      .filter((match) => match.tournamentId === tournamentId && match.phase === "Preliminar")
      .map((match) => match.categoryId))];
    const results = categoryIds.map((itemCategoryId) => simulateCategoryPreliminaries(db, tournament, itemCategoryId));
    tournament.testSimulationStatus = "Simulado";
    tournament.phases = ["Preliminar", "32avos", "16avos", "Octavos", "Cuartos", "Semifinal", "Final"];
    return { tournament, results };
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
