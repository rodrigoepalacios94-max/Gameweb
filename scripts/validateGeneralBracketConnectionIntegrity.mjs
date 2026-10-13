import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildPreliminaryBracketFromResults,
  generateCategoryBracketInDb,
  getOfficialPreliminaryRule,
} from "../src/domain/tournament-generation/core.js";
import { buildTournamentStagePayload } from "../src/domain/tournament-generation/stagePayload.js";

function buildDb(count) {
  const playerIds = Array.from({ length: count }, (_, index) => `p-${String(index + 1).padStart(2, "0")}`);
  return {
    tournaments: [{
      id: "t-general-bracket-integrity",
      name: "General Bracket Integrity",
      categories: ["c-general-bracket-integrity"],
      categoryStages: [{
        id: "s-general-bracket-integrity",
        tournamentId: "t-general-bracket-integrity",
        categoryId: "c-general-bracket-integrity",
        categoryName: "Categoria",
        format: "Preliminar",
        formatStatus: "confirmed",
        participants: playerIds,
        bracketKey: "t-general-bracket-integrity::c-general-bracket-integrity",
      }],
    }],
    categories: [{ id: "c-general-bracket-integrity", name: "Categoria" }],
    players: playerIds.map((id, index) => ({ id, fullName: `Jugador ${index + 1}`, ranking: index + 1 })),
    enrollments: playerIds.map((playerId) => ({
      tournamentId: "t-general-bracket-integrity",
      categoryId: "c-general-bracket-integrity",
      playerId,
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
    .forEach((match, index) => {
      const winnerIsA = index % 2 === 0;
      match.status = "Finalizado";
      match.winnerId = winnerIsA ? match.playerAId : match.playerBId;
      match.result = winnerIsA ? "6-1 / 6-2" : "2-6 / 1-6";
      match.sets = winnerIsA
        ? [{ playerA: 6, playerB: 1 }, { playerA: 6, playerB: 2 }]
        : [{ playerA: 2, playerB: 6 }, { playerA: 1, playerB: 6 }];
    });
}

function stage() {
  return {
    id: "s-general-bracket-integrity",
    tournamentId: "t-general-bracket-integrity",
    categoryId: "c-general-bracket-integrity",
    categoryName: "Categoria",
    format: "Preliminar",
    participants: [],
    inscriptionsCount: 0,
    bracketKey: "t-general-bracket-integrity::c-general-bracket-integrity",
  };
}

function expectPayloadError(bracket, code) {
  assert.throws(
    () => buildTournamentStagePayload({ matches: [] }, bracket, stage(), { allowFinishedPreliminaries: true }),
    (error) => error?.code === code,
    `expected payload error ${code}`,
  );
}

function matchTempId(round, match, index) {
  return match.matchId || ["round", round.id || round.name, match.id || index + 1].join("::");
}

function mapRoundMatches(bracket) {
  const result = new Map();
  (bracket.rounds || []).forEach((round) => {
    (round.matches || []).forEach((match, index) => {
      result.set(matchTempId(round, match, index), { round, match, index });
    });
  });
  return result;
}

function assertConnectionIntegrity(bracket, payload, count) {
  const roundMatches = mapRoundMatches(bracket);
  const officialRule = getOfficialPreliminaryRule(count);
  const accessRoundName = officialRule?.accessRoundName;
  const directMainSlots = Number(officialRule?.mainDrawSize || 0) - Number(officialRule?.accessMatches || 0);
  const accessWinnersShouldMeetWaitingPlayers = Number(officialRule?.accessMatches || 0) > 0
    && directMainSlots >= Number(officialRule?.accessMatches || 0);
  const seenParents = new Set();
  const seenChildSlots = new Set();
  for (const connection of payload.connections) {
    assert.ok(!seenParents.has(connection.parentTempId), `${count}: parent connected twice ${connection.parentTempId}`);
    seenParents.add(connection.parentTempId);
    const childSlotKey = `${connection.childTempId}:${connection.childSlot}`;
    assert.ok(!seenChildSlots.has(childSlotKey), `${count}: duplicate child slot ${childSlotKey}`);
    seenChildSlots.add(childSlotKey);

    const parent = roundMatches.get(connection.parentTempId);
    const child = roundMatches.get(connection.childTempId);
    assert.ok(parent, `${count}: parent temp id exists`);
    assert.ok(child, `${count}: child temp id exists`);
    assert.notEqual(connection.parentTempId, connection.childTempId, `${count}: no self connection`);
    const expectedLabel = `Ganador ${parent.round.name} ${parent.index + 1}`;
    const childLabel = connection.childSlot === 1 ? child.match.playerA : child.match.playerB;
    const opponentLabel = connection.childSlot === 1 ? child.match.playerB : child.match.playerA;
    const childPlayerId = connection.childSlot === 1 ? child.match.playerAId : child.match.playerBId;
    assert.equal(childLabel, expectedLabel, `${count}: connection must target explicit winner placeholder`);
    assert.equal(childPlayerId || null, null, `${count}: connection must not target occupied player slot`);
    if (accessWinnersShouldMeetWaitingPlayers && parent.round.name === accessRoundName) {
      assert.ok(
        !String(opponentLabel || "").startsWith(`Ganador ${accessRoundName} `),
        `${count}: access winner must face a waiting player, not another ${accessRoundName} winner`,
      );
      const sourceSide = parent.index < Math.ceil((parent.round.matches || []).length / 2) ? "left" : "right";
      const targetSide = child.index < Math.ceil((child.round.matches || []).length / 2) ? "left" : "right";
      assert.equal(targetSide, sourceSide, `${count}: access connection must stay in the same bracket half`);
    }
  }
}

const invalidFullChild = {
  category: "Bug",
  rounds: [
    { id: "round16", name: "16avos", matches: [{ id: "a1", playerA: "Jugador 1", playerB: "Jugador 2", playerAId: "p1", playerBId: "p2" }] },
    { id: "octavos", name: "8vos", matches: [{ id: "b1", playerA: "Jugador 3", playerB: "Jugador 4", playerAId: "p3", playerBId: "p4" }] },
  ],
};
expectPayloadError(invalidFullChild, "OVERFILLED_MATCH_CONNECTION_SLOT");

const invalidConcreteLabel = {
  category: "Bug",
  rounds: [
    { id: "round16", name: "16avos", matches: [{ id: "a1", playerA: "Jugador 1", playerB: "Jugador 2", playerAId: "p1", playerBId: "p2" }] },
    { id: "octavos", name: "8vos", matches: [{ id: "b1", playerA: "Jugador 3", playerB: "A definir" }] },
  ],
};
expectPayloadError(invalidConcreteLabel, "OVERFILLED_MATCH_CONNECTION_LABEL");

const orphanProgression = {
  category: "Bug",
  rounds: [
    { id: "round16", name: "16avos", matches: [{ id: "a1", playerA: "Jugador 1", playerB: "Jugador 2", playerAId: "p1", playerBId: "p2" }] },
    { id: "octavos", name: "8vos", matches: [] },
  ],
};
expectPayloadError(orphanProgression, "ORPHAN_MATCH_PROGRESSION");

const invalidOccupiedWinnerSlot = {
  category: "Bug",
  rounds: [
    { id: "round16", name: "16avos", matches: [{ id: "a1", playerA: "Jugador 1", playerB: "Jugador 2", playerAId: "p1", playerBId: "p2" }] },
    { id: "octavos", name: "8vos", matches: [{ id: "b1", playerA: "Ganador 16avos 1", playerB: "Jugador 4", playerAId: "p3", playerBId: "p4" }] },
  ],
};
expectPayloadError(invalidOccupiedWinnerSlot, "OVERFILLED_MATCH_CONNECTION_SLOT");

for (let count = 8; count <= 48; count += 1) {
  const db = buildDb(count);
  const skeleton = generateCategoryBracketInDb(db, "t-general-bracket-integrity", "c-general-bracket-integrity");
  if (skeleton.preliminarySummary?.supported === false) continue;
  finishPreliminaries(db);
  const resolved = buildPreliminaryBracketFromResults(db, db.tournaments[0], "c-general-bracket-integrity");
  assert.ok(resolved, `${count}: resolved bracket`);
  const payload = buildTournamentStagePayload(db, resolved, db.tournaments[0].categoryStages[0], { allowFinishedPreliminaries: true });
  assertConnectionIntegrity(resolved, payload, count);
}

const bracketComponent = readFileSync("src/components/brackets/TournamentBracket.jsx", "utf8");
assert.ok(bracketComponent.includes("function buildLabelConnections"), "bracket UI derives lines from explicit winner labels");
assert.ok(bracketComponent.includes(": labelConnections;"), "bracket UI uses label-derived connections when explicit persisted links are absent");
assert.ok(!bracketComponent.includes("...buildSideConnections(leftVisual"), "bracket UI must not draw positional fallback lines");
assert.ok(bracketComponent.includes("isBracketConnectionRenderable"), "bracket UI rejects cross-half non-final connections");
assert.ok(bracketComponent.includes("__sourceIndex"), "bracket UI preserves original round index after left/right split");

const migration = readFileSync("supabase/migrations/20261005130000_general_bracket_connection_integrity.sql", "utf8");
assert.ok(migration.includes("POST_PRELIMINARY_CONNECTION_SLOT_OCCUPIED"), "SQL helper rejects occupied child slots");
assert.ok(migration.includes("POST_PRELIMINARY_CONNECTION_SCOPE_MISMATCH"), "SQL helper rejects cross category/tournament connections");
assert.ok(migration.includes("p_child_slot not in (1, 2)"), "SQL helper validates child slot");
assert.ok(!/grant\s+execute\s+on\s+function\s+public\.game_ensure_match_connection[\s\S]*authenticated/i.test(migration), "SQL helper remains private from authenticated users");

console.info("validateGeneralBracketConnectionIntegrity: PASS", {
  counts: "8-48",
  overfilledSlots: "blocked",
  orphanProgression: "blocked",
  visualConnections: "label-derived",
});
