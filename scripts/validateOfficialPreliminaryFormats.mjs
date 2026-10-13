import assert from "node:assert/strict";

import {
  buildPreliminaryBracketFromResults,
  generateCategoryBracketInDb,
} from "../src/domain/tournament-generation/core.js";

const EXPECTATIONS = {
  8: { preBye: 0, prelim: 4, post: "ALL_TO_MAIN", postBye: 0, access: 0, accessRound: null, next: "Cuartos" },
  9: { preBye: 1, prelim: 4, post: "TOP_ALL_BY_PERFORMANCE", postBye: 6, access: 1, accessRound: "8vos", next: "Cuartos" },
  10: { preBye: 0, prelim: 5, post: "TOP_ALL_BY_PERFORMANCE", postBye: 6, access: 2, accessRound: "8vos", next: "Cuartos" },
  11: { preBye: 1, prelim: 5, post: "TOP_ALL_BY_PERFORMANCE", postBye: 4, access: 3, accessRound: "8vos", next: "Cuartos" },
  12: { preBye: 0, prelim: 6, post: "TOP_ALL_BY_PERFORMANCE", postBye: 4, access: 4, accessRound: "8vos", next: "Cuartos" },
  13: { preBye: 1, prelim: 6, post: "TOP_ALL_BY_PERFORMANCE", postBye: 2, access: 5, accessRound: "8vos", next: "Cuartos" },
  14: { preBye: 0, prelim: 7, post: "TOP_ALL_BY_PERFORMANCE", postBye: 2, access: 6, accessRound: "8vos", next: "Cuartos" },
  15: { preBye: 1, prelim: 7, post: "ALL_TO_ACCESS", postBye: 0, access: 7, accessRound: "8vos", next: "Cuartos" },
  16: { preBye: 0, prelim: 8, post: "ALL_TO_MAIN", postBye: 0, access: 0, accessRound: null, next: "8vos" },
  17: { preBye: 1, prelim: 8, post: "WINNERS_AND_TOP_LOSERS", postBye: 14, access: 1, accessRound: "16avos", next: "8vos" },
  18: { preBye: 0, prelim: 9, post: "WINNERS_AND_TOP_LOSERS", postBye: 14, access: 2, accessRound: "16avos", next: "8vos" },
  19: { preBye: 1, prelim: 9, post: "WINNERS_AND_TOP_LOSERS", postBye: 12, access: 3, accessRound: "16avos", next: "8vos" },
  20: { preBye: 0, prelim: 10, post: "WINNERS_AND_TOP_LOSERS", postBye: 12, access: 4, accessRound: "16avos", next: "8vos" },
  21: { preBye: 1, prelim: 10, post: "WINNERS_AND_TOP_LOSERS", postBye: 10, access: 5, accessRound: "16avos", next: "8vos" },
  22: { preBye: 0, prelim: 11, post: "TOP_ALL_BY_PERFORMANCE", postBye: 10, access: 6, accessRound: "16avos", next: "8vos" },
  23: { preBye: 1, prelim: 11, post: "TOP_ALL_BY_PERFORMANCE", postBye: 8, access: 7, accessRound: "16avos", next: "8vos" },
  24: { preBye: 0, prelim: 12, post: "TOP_ALL_BY_PERFORMANCE", postBye: 8, access: 8, accessRound: "16avos", next: "8vos" },
  25: { preBye: 1, prelim: 12, post: "TOP_WINNERS", postBye: 6, access: 9, accessRound: "16avos", next: "8vos" },
  26: { preBye: 0, prelim: 13, post: "TOP_ALL_BY_PERFORMANCE", postBye: 6, access: 10, accessRound: "16avos", next: "8vos" },
  27: { preBye: 1, prelim: 13, post: "TOP_ALL_BY_PERFORMANCE", postBye: 4, access: 11, accessRound: "16avos", next: "8vos" },
  28: { preBye: 0, prelim: 14, post: "TOP_GENERAL_RANKING", postBye: 4, access: 12, accessRound: "16avos", next: "8vos" },
  29: { preBye: 1, prelim: 14, post: "TOP_ALL_BY_PERFORMANCE", postBye: 2, access: 13, accessRound: "16avos", next: "8vos" },
  30: { preBye: 0, prelim: 15, post: "SPECIAL_30", postBye: 0, access: 15, accessRound: "16avos", next: "8vos", classifier: 1 },
  31: { preBye: 1, prelim: 15, post: "ALL_TO_ACCESS", postBye: 0, access: 15, accessRound: "16avos", next: "8vos" },
  32: { preBye: 0, prelim: 16, post: "ALL_TO_MAIN", postBye: 0, access: 0, accessRound: null, next: "16avos" },
  33: { preBye: 1, prelim: 16, post: "TOP_ALL_BY_PERFORMANCE", postBye: 30, access: 1, accessRound: "32avos", next: "16avos" },
  34: { preBye: 0, prelim: 17, post: "TOP_ALL_BY_PERFORMANCE", postBye: 30, access: 2, accessRound: "32avos", next: "16avos" },
  35: { preBye: 1, prelim: 17, post: "TOP_ALL_BY_PERFORMANCE", postBye: 28, access: 3, accessRound: "32avos", next: "16avos" },
  36: { preBye: 0, prelim: 18, post: "TOP_ALL_BY_PERFORMANCE", postBye: 28, access: 4, accessRound: "32avos", next: "16avos" },
  37: { preBye: 1, prelim: 18, post: "WINNERS_AND_TOP_LOSERS", postBye: 26, access: 5, accessRound: "32avos", next: "16avos" },
  38: { preBye: 0, prelim: 19, post: "WINNERS_AND_TOP_LOSERS", postBye: 26, access: 6, accessRound: "32avos", next: "16avos" },
  39: { preBye: 1, prelim: 19, post: "WINNERS_AND_TOP_LOSERS", postBye: 24, access: 7, accessRound: "32avos", next: "16avos" },
  40: { preBye: 0, prelim: 20, post: "WINNERS_AND_TOP_LOSERS", postBye: 24, access: 8, accessRound: "32avos", next: "16avos" },
  41: { preBye: 1, prelim: 20, post: "WINNERS_AND_TOP_LOSERS", postBye: 22, access: 9, accessRound: "32avos", next: "16avos" },
  42: { preBye: 0, prelim: 21, post: "WINNERS_AND_TOP_LOSERS", postBye: 22, access: 10, accessRound: "32avos", next: "16avos" },
  43: { preBye: 1, prelim: 21, post: "TOP_WINNERS", postBye: 20, access: 11, accessRound: "32avos", next: "16avos" },
  44: { preBye: 0, prelim: 22, post: "TOP_WINNERS", postBye: 20, access: 12, accessRound: "32avos", next: "16avos" },
  45: { preBye: 1, prelim: 22, post: "TOP_WINNERS", postBye: 18, access: 13, accessRound: "32avos", next: "16avos" },
  46: { preBye: 0, prelim: 23, post: "TOP_WINNERS", postBye: 18, access: 14, accessRound: "32avos", next: "16avos" },
  47: { preBye: 1, prelim: 23, post: "TOP_WINNERS", postBye: 16, access: 15, accessRound: "32avos", next: "16avos" },
  48: { preBye: 0, prelim: 24, post: "TOP_WINNERS", postBye: 16, access: 16, accessRound: "32avos", next: "16avos" },
};

function buildDb(count) {
  const playerIds = Array.from({ length: count }, (_, index) => `p-${index + 1}`);
  return {
    tournaments: [{
      id: "t-official",
      name: "Official",
      categories: ["c-official"],
      categoryStages: [{
        id: "s-official",
        tournamentId: "t-official",
        categoryId: "c-official",
        categoryName: "Categoria",
        format: "Preliminar",
        formatStatus: "confirmed",
        participants: playerIds,
        bracketKey: "t-official::c-official",
      }],
    }],
    categories: [{ id: "c-official", name: "Categoria" }],
    players: playerIds.map((id, index) => ({ id, fullName: `Jugador ${index + 1}`, ranking: index + 1 })),
    enrollments: playerIds.map((playerId) => ({
      tournamentId: "t-official",
      categoryId: "c-official",
      playerId,
      status: "Aceptada",
    })),
    matches: [],
    matchConnections: [],
    brackets: {},
  };
}

function finishPreliminaries(db, variant = "normal") {
  const preliminaries = db.matches.filter((match) => match.phase === "Preliminar");
  const ordered = variant === "reverse" ? [...preliminaries].reverse() : preliminaries;
  ordered.forEach((match, index) => {
    const usePlayerB = variant === "alternate" ? index % 2 === 0 : true;
    const winnerId = usePlayerB ? match.playerBId : match.playerAId;
    if (!winnerId) return;
    match.status = "Finalizado";
    match.winnerId = winnerId;
    match.result = usePlayerB ? "0-6 / 0-6" : "6-0 / 6-0";
    match.sets = usePlayerB
      ? [{ playerA: 0, playerB: 6 }, { playerA: 0, playerB: 6 }]
      : [{ playerA: 6, playerB: 0 }, { playerA: 6, playerB: 0 }];
  });
}

function realPlayersInRound(round) {
  return (round?.matches || [])
    .flatMap((match) => [match.playerA, match.playerB])
    .filter((value) => value && !String(value).startsWith("Ganador ") && !String(value).startsWith("Clasificado "));
}

function assertSkeleton(count, expected) {
  const db = buildDb(count);
  const bracket = generateCategoryBracketInDb(db, "t-official", "c-official");
  assert.notEqual(bracket.preliminarySummary?.supported, false, `${count}: debe estar soportado`);
  assert.equal(bracket.preliminaries.filter((match) => match.bye).length, expected.preBye, `${count}: BYE previo`);
  assert.equal(bracket.preliminaries.filter((match) => match.matchId && !match.bye).length, expected.prelim, `${count}: preliminares jugables`);
  assert.equal(bracket.preliminarySummary.postRule, expected.post, `${count}: regla post preliminar`);
  if (expected.accessRound) {
    assert.equal(bracket.rounds[0].name, expected.accessRound, `${count}: ronda adicional`);
    assert.equal(bracket.rounds[0].matches.length, expected.access, `${count}: partidos ronda adicional`);
  } else {
    assert.equal(bracket.rounds[0].name, expected.next, `${count}: siguiente llave`);
  }
  if (expected.classifier) {
    assert.equal(bracket.rounds[1].name, "Clasificatorio", `${count}: clasificador especial`);
    assert.equal(bracket.rounds[1].matches.length, expected.classifier, `${count}: partido clasificador`);
  }
  return db;
}

function assertResolved(count, expected, variant = "normal") {
  const db = assertSkeleton(count, expected);
  finishPreliminaries(db, variant);
  const resolved = buildPreliminaryBracketFromResults(db, db.tournaments[0], "c-official");
  assert.ok(resolved, `${count}: debe resolver con preliminares completas`);
  assert.equal(resolved.preliminarySummary.postRule, expected.post, `${count}: postRule resuelto`);
  assert.equal(resolved.preliminarySummary.accessMatches, expected.access, `${count}: access resuelto`);
  const expectedDirectEntrants = expected.post === "ALL_TO_MAIN" ? count : expected.postBye;
  assert.equal(resolved.preliminarySummary.directEntrants, expectedDirectEntrants, `${count}: directos post preliminar`);
  if (expected.accessRound) {
    assert.equal(resolved.rounds[0].name, expected.accessRound, `${count}: ronda adicional resuelta`);
    assert.equal(resolved.rounds[0].matches.length, expected.access, `${count}: partidos access resueltos`);
  }
  if (expected.classifier) {
    assert.equal(resolved.rounds[1].name, "Clasificatorio", `${count}: clasificador resuelto`);
  }
  return resolved;
}

for (const [countText, expected] of Object.entries(EXPECTATIONS)) {
  const count = Number(countText);
  assertResolved(count, expected);
}

for (const count of [14, 18, 22, 30, 33, 34, 35, 36, 37, 42, 43, 44, 45, 46, 47, 48]) {
  const normal = assertResolved(count, EXPECTATIONS[count], "normal");
  const reverse = assertResolved(count, EXPECTATIONS[count], "reverse");
  const alternate = assertResolved(count, EXPECTATIONS[count], "alternate");
  assert.equal(normal.preliminarySummary.accessMatches, reverse.preliminarySummary.accessMatches, `${count}: orden inverso conserva estructura`);
  assert.equal(normal.preliminarySummary.accessMatches, alternate.preliminarySummary.accessMatches, `${count}: orden alternativo conserva estructura`);
}

for (const count of [14, 22]) {
  const db = assertSkeleton(count, EXPECTATIONS[count]);
  const p1Match = db.matches.find((match) => match.phase === "Preliminar" && [match.playerAId, match.playerBId].includes("p-1"));
  const lastId = `p-${count}`;
  const lastMatch = db.matches.find((match) => match.phase === "Preliminar" && [match.playerAId, match.playerBId].includes(lastId));
  db.matches.filter((match) => match.phase === "Preliminar").forEach((match) => {
    match.status = "Finalizado";
    match.winnerId = match.playerAId;
    match.result = "6-4 / 6-4";
    match.sets = [{ playerA: 6, playerB: 4 }, { playerA: 6, playerB: 4 }];
  });
  if (p1Match) {
    const p1IsA = p1Match.playerAId === "p-1";
    p1Match.winnerId = p1IsA ? p1Match.playerBId : p1Match.playerAId;
    p1Match.result = p1IsA ? "0-6 / 0-6" : "6-0 / 6-0";
    p1Match.sets = p1IsA
      ? [{ playerA: 0, playerB: 6 }, { playerA: 0, playerB: 6 }]
      : [{ playerA: 6, playerB: 0 }, { playerA: 6, playerB: 0 }];
  }
  if (lastMatch) {
    const lastIsA = lastMatch.playerAId === lastId;
    lastMatch.winnerId = lastId;
    lastMatch.result = lastIsA ? "6-0 / 6-0" : "0-6 / 0-6";
    lastMatch.sets = lastIsA
      ? [{ playerA: 6, playerB: 0 }, { playerA: 6, playerB: 0 }]
      : [{ playerA: 0, playerB: 6 }, { playerA: 0, playerB: 6 }];
  }
  const resolved = buildPreliminaryBracketFromResults(db, db.tournaments[0], "c-official");
  const directNames = realPlayersInRound(resolved.rounds.find((round) => round.name === EXPECTATIONS[count].next));
  assert.ok(directNames.includes(`Jugador ${count}`), `${count}: bajo ranking con gran rendimiento clasifica directo`);
  assert.ok(!directNames.includes("Jugador 1"), `${count}: ranking general alto no suplanta rendimiento preliminar`);
}

for (const count of [5, 6, 7]) {
  const db = buildDb(count);
  const bracket = generateCategoryBracketInDb(db, "t-official", "c-official");
  assert.equal(bracket.preliminarySummary.supported, false, `${count}: Preliminar no documentado debe invalidarse`);
}

console.table(Object.entries(EXPECTATIONS).map(([count, expected]) => ({
  COUNT: count,
  PRELIM: expected.prelim,
  "RANKING POST": expected.post,
  "BYE POST": expected.postBye,
  ACCESS: expected.access ? `${expected.access} ${expected.accessRound}` : "0",
  NEXT: expected.next,
  PASS: "PASS",
})));

console.log("validateOfficialPreliminaryFormats: PASS");
