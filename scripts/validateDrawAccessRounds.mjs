import assert from "node:assert/strict";

import {
  buildPreliminaryBracketFromResults,
  generateCategoryBracketInDb,
} from "../src/domain/tournament-generation/core.js";
import { buildTournamentStagePayload } from "../src/domain/tournament-generation/stagePayload.js";

function player(index) {
  return {
    id: `player-${index}`,
    firstName: "Jugador",
    lastName: String(index),
    fullName: `Jugador ${index}`,
    ranking: index,
    avatar: "",
  };
}

function buildDb(count) {
  const players = Array.from({ length: count }, (_, index) => player(index + 1));
  return {
    tournaments: [{
      id: "tournament-draw-access",
      name: "Draw Access Cup",
      matchFormat: null,
      categories: ["category-draw-access"],
      categoryStages: [{
        id: "stage-draw-access",
        tournamentId: "tournament-draw-access",
        categoryId: "category-draw-access",
        categoryName: `${count} Categoria`,
        status: "Formato confirmado",
        format: "Preliminar",
        formatStatus: "confirmed",
        formatDecision: "manual",
        recommendedFormat: "Preliminar",
        matchFormat: null,
        participants: players.map((item) => item.id),
        inscriptionsCount: players.length,
        bracketKey: "tournament-draw-access::category-draw-access",
      }],
      participants: players.map((item) => item.id),
    }],
    categories: [{ id: "category-draw-access", name: "Categoria", branch: "Masculino", level: 1 }],
    players,
    enrollments: players.map((item) => ({
      tournamentId: "tournament-draw-access",
      categoryId: "category-draw-access",
      playerId: item.id,
      status: "Aceptada",
    })),
    matches: [],
    matchConnections: [],
    brackets: {},
  };
}

function finishPreliminaries(db) {
  db.matches
    .filter((match) => match.phase === "Preliminar")
    .forEach((match) => {
      match.status = "Finalizado";
      match.winnerId = match.playerAId;
      match.result = "6-0 / 6-0";
      match.sets = [{ playerA: 6, playerB: 0 }, { playerA: 6, playerB: 0 }];
    });
}

function assertOfficialPreliminaryAccess(count, expected) {
  const db = buildDb(count);
  const bracket = generateCategoryBracketInDb(db, "tournament-draw-access", "category-draw-access");
  assert.notEqual(bracket.preliminarySummary?.accessDraw, true, `${count}: no debe usar access draw generico`);
  assert.equal(bracket.preliminaries.filter((match) => match.matchId && !match.bye).length, expected.preliminaries, `${count}: preliminares oficiales`);
  assert.equal(bracket.preliminaries.filter((match) => match.bye).length, expected.preliminaryByes, `${count}: BYE previo por Ranking General`);
  assert.equal(bracket.rounds[0].name, expected.accessRoundName, `${count}: ronda adicional placeholder`);
  assert.equal(bracket.rounds[0].matches.length, expected.accessMatches, `${count}: partidos de ronda adicional`);

  const incomplete = buildPreliminaryBracketFromResults(db, db.tournaments[0], "category-draw-access");
  assert.equal(incomplete, null, `${count}: no debe resolver con preliminares incompletas`);

  finishPreliminaries(db);
  const resolved = buildPreliminaryBracketFromResults(db, db.tournaments[0], "category-draw-access");
  assert.ok(resolved, `${count}: resuelve cuando todo el universo esta completo`);
  assert.equal(resolved.preliminarySummary.accessMatches, expected.accessMatches, `${count}: mantiene access post-preliminar`);
  assert.equal(resolved.preliminarySummary.directEntrants, expected.directEntrants, `${count}: directos segun docs/formatos.md`);

  const payload = buildTournamentStagePayload(db, resolved, db.tournaments[0].categoryStages[0], { allowFinishedPreliminaries: true });
  const accessRound = resolved.rounds[0];
  const accessMatchIds = new Set((accessRound.matches || []).map((match) => match.matchId || match.id));
  const firstRoundConnections = payload.connections.filter((connection) => accessMatchIds.has(connection.parentTempId));
  assert.equal(firstRoundConnections.length, expected.accessMatches, `${count}: los ganadores de access conectan a la siguiente llave`);
}

assertOfficialPreliminaryAccess(14, {
  preliminaries: 7,
  preliminaryByes: 0,
  accessRoundName: "8vos",
  accessMatches: 6,
  directEntrants: 2,
});

assertOfficialPreliminaryAccess(22, {
  preliminaries: 11,
  preliminaryByes: 0,
  accessRoundName: "16avos",
  accessMatches: 6,
  directEntrants: 10,
});

assertOfficialPreliminaryAccess(18, {
  preliminaries: 9,
  preliminaryByes: 0,
  accessRoundName: "16avos",
  accessMatches: 2,
  directEntrants: 14,
});

console.log("validateDrawAccessRounds: PASS");
