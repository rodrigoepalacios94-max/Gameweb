import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildPreliminaryBracketFromResults,
  generateCategoryBracketInDb,
  getOfficialPreliminaryRule,
} from "../src/domain/tournament-generation/core.js";
import { buildTournamentStagePayload } from "../src/domain/tournament-generation/stagePayload.js";

const EXPECTED = {
  8: { preByes: 0, preliminaries: 4, rule: "ALL_TO_MAIN", directWinners: 4, directLosers: 4, directByes: 0, directAny: 8, accessMatches: 0, accessRound: null, mainRound: "Cuartos", mainDrawSize: 8 },
  9: { preByes: 1, preliminaries: 4, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 6, directByes: 1, accessMatches: 1, accessRound: "8vos", mainRound: "Cuartos", mainDrawSize: 8 },
  10: { preByes: 0, preliminaries: 5, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 6, directByes: 0, accessMatches: 2, accessRound: "8vos", mainRound: "Cuartos", mainDrawSize: 8 },
  11: { preByes: 1, preliminaries: 5, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 4, directByes: 1, accessMatches: 3, accessRound: "8vos", mainRound: "Cuartos", mainDrawSize: 8 },
  12: { preByes: 0, preliminaries: 6, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 4, directByes: 0, accessMatches: 4, accessRound: "8vos", mainRound: "Cuartos", mainDrawSize: 8 },
  13: { preByes: 1, preliminaries: 6, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 2, directByes: 1, accessMatches: 5, accessRound: "8vos", mainRound: "Cuartos", mainDrawSize: 8 },
  14: { preByes: 0, preliminaries: 7, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 2, directByes: 0, accessMatches: 6, accessRound: "8vos", mainRound: "Cuartos", mainDrawSize: 8 },
  15: { preByes: 1, preliminaries: 7, rule: "ALL_TO_ACCESS", directAny: 0, directByes: 1, accessMatches: 7, accessRound: "8vos", mainRound: "Cuartos", mainDrawSize: 8 },
  16: { preByes: 0, preliminaries: 8, rule: "ALL_TO_MAIN", directWinners: 8, directLosers: 8, directByes: 0, directAny: 16, accessMatches: 0, accessRound: null, mainRound: "8vos", mainDrawSize: 16 },
  17: { preByes: 1, preliminaries: 8, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 8, directLosers: 6, directByes: 1, accessMatches: 1, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  18: { preByes: 0, preliminaries: 9, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 9, directLosers: 5, directByes: 0, accessMatches: 2, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  19: { preByes: 1, preliminaries: 9, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 9, directLosers: 3, directByes: 1, accessMatches: 3, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  20: { preByes: 0, preliminaries: 10, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 10, directLosers: 2, directByes: 0, accessMatches: 4, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  21: { preByes: 1, preliminaries: 10, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 10, directLosers: 0, directByes: 1, accessMatches: 5, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  22: { preByes: 0, preliminaries: 11, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 10, directByes: 0, accessMatches: 6, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  23: { preByes: 1, preliminaries: 11, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 8, directByes: 1, accessMatches: 7, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  24: { preByes: 0, preliminaries: 12, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 8, directByes: 0, accessMatches: 8, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  25: { preByes: 1, preliminaries: 12, rule: "TOP_WINNERS", directWinners: 6, directLosers: 0, directByes: 1, accessMatches: 9, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  26: { preByes: 0, preliminaries: 13, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 6, directByes: 0, accessMatches: 10, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  27: { preByes: 1, preliminaries: 13, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 4, directByes: 1, accessMatches: 11, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  28: { preByes: 0, preliminaries: 14, rule: "TOP_GENERAL_RANKING", directAny: 4, directByes: 0, accessMatches: 12, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  29: { preByes: 1, preliminaries: 14, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 2, directByes: 1, accessMatches: 13, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  30: { preByes: 0, preliminaries: 15, rule: "SPECIAL_30", directAny: 0, directByes: 0, accessMatches: 15, classifierMatches: 1, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  31: { preByes: 1, preliminaries: 15, rule: "ALL_TO_ACCESS", directAny: 0, directByes: 1, accessMatches: 15, accessRound: "16avos", mainRound: "8vos", mainDrawSize: 16 },
  32: { preByes: 0, preliminaries: 16, rule: "ALL_TO_MAIN", directWinners: 16, directLosers: 16, directByes: 0, directAny: 32, accessMatches: 0, accessRound: null, mainRound: "16avos", mainDrawSize: 32 },
  33: { preByes: 1, preliminaries: 16, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 30, directByes: 1, accessMatches: 1, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  34: { preByes: 0, preliminaries: 17, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 30, directByes: 0, accessMatches: 2, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  35: { preByes: 1, preliminaries: 17, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 28, directByes: 1, accessMatches: 3, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  36: { preByes: 0, preliminaries: 18, rule: "TOP_ALL_BY_PERFORMANCE", directAny: 28, directByes: 0, accessMatches: 4, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  37: { preByes: 1, preliminaries: 18, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 18, directLosers: 8, directByes: 1, accessMatches: 5, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  38: { preByes: 0, preliminaries: 19, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 19, directLosers: 7, directByes: 0, accessMatches: 6, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  39: { preByes: 1, preliminaries: 19, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 19, directLosers: 5, directByes: 1, accessMatches: 7, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  40: { preByes: 0, preliminaries: 20, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 20, directLosers: 4, directByes: 0, accessMatches: 8, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  41: { preByes: 1, preliminaries: 20, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 20, directLosers: 2, directByes: 1, accessMatches: 9, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  42: { preByes: 0, preliminaries: 21, rule: "WINNERS_AND_TOP_LOSERS", directWinners: 21, directLosers: 1, directByes: 0, accessMatches: 10, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  43: { preByes: 1, preliminaries: 21, rule: "TOP_WINNERS", directWinners: 20, directLosers: 0, directByes: 1, accessMatches: 11, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  44: { preByes: 0, preliminaries: 22, rule: "TOP_WINNERS", directWinners: 20, directLosers: 0, directByes: 0, accessMatches: 12, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  45: { preByes: 1, preliminaries: 22, rule: "TOP_WINNERS", directWinners: 18, directLosers: 0, directByes: 1, accessMatches: 13, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  46: { preByes: 0, preliminaries: 23, rule: "TOP_WINNERS", directWinners: 18, directLosers: 0, directByes: 0, accessMatches: 14, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  47: { preByes: 1, preliminaries: 23, rule: "TOP_WINNERS", directWinners: 16, directLosers: 0, directByes: 1, accessMatches: 15, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
  48: { preByes: 0, preliminaries: 24, rule: "TOP_WINNERS", directWinners: 16, directLosers: 0, directByes: 0, accessMatches: 16, accessRound: "32avos", mainRound: "16avos", mainDrawSize: 32 },
};

function buildDb(count) {
  const playerIds = Array.from({ length: count }, (_, index) => `p-${String(index + 1).padStart(2, "0")}`);
  return {
    tournaments: [{
      id: "t-official-structures",
      name: "Official Structures",
      categories: ["c-official-structures"],
      categoryStages: [{
        id: "s-official-structures",
        tournamentId: "t-official-structures",
        categoryId: "c-official-structures",
        categoryName: "Categoria",
        format: "Preliminar",
        formatStatus: "confirmed",
        participants: playerIds,
        bracketKey: "t-official-structures::c-official-structures",
      }],
    }],
    categories: [{ id: "c-official-structures", name: "Categoria" }],
    players: playerIds.map((id, index) => ({ id, fullName: `Jugador ${index + 1}`, ranking: index + 1 })),
    enrollments: playerIds.map((playerId) => ({
      tournamentId: "t-official-structures",
      categoryId: "c-official-structures",
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
      match.result = winnerIsA ? "6-0 / 6-1" : "1-6 / 0-6";
      match.sets = winnerIsA
        ? [{ playerA: 6, playerB: 0 }, { playerA: 6, playerB: 1 }]
        : [{ playerA: 1, playerB: 6 }, { playerA: 0, playerB: 6 }];
    });
}

function round(bracket, name) {
  return (bracket.rounds || []).find((item) => item.name === name);
}

function semanticRule(rule) {
  if (rule.rule === "WINNERS_AND_TOP_LOSERS") {
    return `${rule.directWinners} ganadores directos + ${rule.directLosers} mejores perdedores directos; ${rule.accessMatches * 2} perdedores a ${rule.accessRound}`;
  }
  if (rule.rule === "TOP_WINNERS") {
    return `${rule.directWinners} mejores ganadores directos; restantes a ${rule.accessRound}`;
  }
  if (rule.rule === "TOP_GENERAL_RANKING") {
    return `${rule.directAny} BYE por Ranking General; restantes por rendimiento a ${rule.accessRound}`;
  }
  if (rule.rule === "TOP_ALL_BY_PERFORMANCE") {
    return `${rule.directAny} mejores por rendimiento preliminar directos; restantes a ${rule.accessRound}`;
  }
  if (rule.rule === "ALL_TO_MAIN") return "todos al cuadro principal";
  if (rule.rule === "ALL_TO_ACCESS") return "todos a ronda de acceso";
  if (rule.rule === "SPECIAL_30") return "15 16avos + clasificador de mejores perdedores de 16avos";
  return rule.rule;
}

function extractSqlRules() {
  const sql = readFileSync("supabase/migrations/20260921120000_deferred_preliminary_result_flow.sql", "utf8");
  const rules = new Map();
  const pattern = /when\s+(\d+)\s+then\s+'([^']+)'::jsonb/g;
  let match;
  while ((match = pattern.exec(sql))) {
    rules.set(Number(match[1]), JSON.parse(match[2]));
  }
  return rules;
}

function assertRuleTables(count, expected, sqlRules) {
  const core = getOfficialPreliminaryRule(count);
  assert.ok(core, `${count}: core must expose an official preliminary rule`);
  const sql = sqlRules.get(count);
  assert.ok(sql, `${count}: SQL must expose an official preliminary rule`);
  assert.equal(core.preliminaryMatches, expected.preliminaries, `${count}: core preliminary matches`);
  assert.equal(core.preGeneralByes, expected.preByes, `${count}: core pre-general byes`);
  assert.equal(core.postRule, expected.rule, `${count}: core post rule`);
  assert.equal(core.accessMatches, expected.accessMatches, `${count}: core access matches`);
  assert.equal(core.mainDrawSize, expected.mainDrawSize, `${count}: core main draw size`);
  assert.equal(sql.postRule, expected.rule, `${count}: SQL post rule`);
  assert.equal(Number(sql.accessMatches || 0), expected.accessMatches, `${count}: SQL access matches`);
  assert.equal(Number(sql.mainDrawSize || 0), expected.mainDrawSize, `${count}: SQL main draw size`);
}

function assertGeneratedStructure(count, expected) {
  const db = buildDb(count);
  const skeleton = generateCategoryBracketInDb(db, "t-official-structures", "c-official-structures");
  const playablePreliminaries = (skeleton.preliminaries || []).filter((match) => match.matchId && !match.bye);
  const preByes = (skeleton.preliminaries || []).filter((match) => match.bye);
  assert.equal(playablePreliminaries.length, expected.preliminaries, `${count}: skeleton preliminaries`);
  assert.equal(preByes.length, expected.preByes, `${count}: skeleton pre-byes`);
  if (expected.accessMatches) {
    assert.equal(round(skeleton, expected.accessRound)?.matches?.length || 0, expected.accessMatches, `${count}: skeleton access round`);
  }
  assert.equal(round(skeleton, expected.mainRound)?.matches?.length || 0, expected.mainDrawSize / 2, `${count}: skeleton main round`);

  finishPreliminaries(db);
  const resolved = buildPreliminaryBracketFromResults(db, db.tournaments[0], "c-official-structures");
  assert.ok(resolved, `${count}: resolved bracket`);
  assert.equal(resolved.preliminarySummary.accessMatches, expected.accessMatches, `${count}: resolved access matches`);
  assert.equal(resolved.preliminarySummary.mainDrawSize, expected.mainDrawSize, `${count}: resolved draw size`);
  assert.equal(round(resolved, expected.mainRound)?.matches?.length || 0, expected.mainDrawSize / 2, `${count}: resolved main round`);
  if (expected.accessMatches) {
    assert.equal(round(resolved, expected.accessRound)?.matches?.length || 0, expected.accessMatches, `${count}: resolved access round`);
  }
  if (expected.rule === "WINNERS_AND_TOP_LOSERS") {
    assert.equal(resolved.preliminarySummary.directWinners, expected.directWinners, `${count}: winners direct`);
    assert.equal(resolved.preliminarySummary.directLosers, expected.directLosers, `${count}: best losers direct`);
    assert.equal(resolved.preliminarySummary.accessPlayers, expected.accessMatches * 2, `${count}: remaining losers to access`);
  }
  if (expected.rule === "TOP_WINNERS") {
    assert.equal(resolved.preliminarySummary.directWinners, expected.directWinners, `${count}: top winners direct`);
  }
  if (expected.rule === "TOP_ALL_BY_PERFORMANCE" || expected.rule === "TOP_GENERAL_RANKING") {
    assert.equal(resolved.preliminarySummary.directEntrants, expected.directAny, `${count}: direct by performance/general ranking`);
  }

  const payload = buildTournamentStagePayload(db, resolved, db.tournaments[0].categoryStages[0], { allowFinishedPreliminaries: true });
  const accessIds = new Set((round(resolved, expected.accessRound)?.matches || []).map((match) => match.matchId || match.id));
  const accessConnections = payload.connections.filter((connection) => accessIds.has(connection.parentTempId));
  assert.equal(accessConnections.length, expected.accessMatches, `${count}: access winners connected to main round`);
  return { skeleton, resolved };
}

function labelsForRound(bracket, roundName) {
  return (round(bracket, roundName)?.matches || [])
    .flatMap((match) => [match.playerA, match.playerB])
    .filter(Boolean)
    .map(String);
}

function assertLabelCount(labels, prefix, expected, count) {
  const actual = labels.filter((label) => label.startsWith(prefix)).length;
  assert.equal(actual, expected, `${count}: ${prefix} labels`);
}

function assertExplicitSemantics(count, expected, skeleton) {
  const mainLabels = labelsForRound(skeleton, expected.mainRound);
  const accessLabels = expected.accessRound ? labelsForRound(skeleton, expected.accessRound) : [];
  if (expected.rule === "WINNERS_AND_TOP_LOSERS") {
    assertLabelCount(mainLabels, "Ganador preliminar", expected.directWinners, count);
    assertLabelCount(mainLabels, "Mejor perdedor", expected.directLosers, count);
    assertLabelCount(mainLabels, `Ganador ${expected.accessRound}`, expected.accessMatches, count);
    assertLabelCount(accessLabels, "Perdedor clasificado", expected.accessMatches * 2, count);
  }
  if (expected.rule === "TOP_ALL_BY_PERFORMANCE") {
    assertLabelCount(mainLabels, "Mejor rendimiento preliminar", expected.directAny, count);
    assertLabelCount(mainLabels, `Ganador ${expected.accessRound}`, expected.accessMatches, count);
    assertLabelCount(accessLabels, "Perdedor clasificado", expected.accessMatches * 2, count);
  }
}

function assertRepairMigration() {
  const sql = readFileSync("supabase/migrations/20260921210000_repair_legacy_post_preliminary_structures.sql", "utf8");
  for (const categoryId of [
    "c71a275c-2a1b-4da3-8155-bbc6a5b197a1",
    "3cd79a57-5e58-4a3a-a05e-38535ed6feec",
    "aafdc14b-4f08-4db7-b2f7-bd1ebdc0e8dc",
  ]) {
    assert.ok(sql.includes(categoryId), `repair migration targets ${categoryId}`);
  }
  assert.ok(sql.includes("officialPostPreliminaryStructures20260921"), "repair marker present");
  assert.ok(sql.includes("POST_PRELIMINARY_REPAIR_POST_PRELIMINARY_ACTIVITY_FOUND"), "repair fails closed on post-preliminary activity");
  assert.ok(sql.includes("POST_PRELIMINARY_REPAIR_STAGE_OR_BRACKET_CLOSED"), "repair fails closed on closed bracket/category");
  assert.ok(sql.includes("game_ensure_match_connection"), "repair creates access progression through canonical connection helper");
  assert.ok(sql.includes("game_refresh_post_preliminary_bracket_data"), "repair refreshes bracket UI data from real matches");
  assert.ok(sql.includes("'3cd79a57-5e58-4a3a-a05e-38535ed6feec'::uuid,\n          20::integer,\n          10::integer,\n          '16avos'::text,\n          4::integer,\n          '8vos'::text"), "20-player repair creates 4 16avos before 8vos");
}

const sqlRules = extractSqlRules();
const rows = [];
const mismatches = [];

for (const count of [5, 6, 7]) {
  const core = getOfficialPreliminaryRule(count);
  if (core) mismatches.push(`${count}: docs/formatos.md has no official rule, but core supports it`);
  rows.push({ COUNT: count, OFICIAL: "unsupported", CORE_JS: core ? "MISMATCH" : "MATCH", SQL: "n/a", UI: "n/a", RESULTADO: core ? "MISMATCH" : "MATCH" });
}

for (const [countText, expected] of Object.entries(EXPECTED)) {
  const count = Number(countText);
  try {
    assertRuleTables(count, expected, sqlRules);
    const { skeleton } = assertGeneratedStructure(count, expected);
    if ([14, 20, 22, 17, 18, 19, 21, 37, 38, 39, 40, 41, 42].includes(count)) {
      assertExplicitSemantics(count, expected, skeleton);
    }
    const initialMain = round(skeleton, expected.mainRound);
    const initialLabels = (initialMain?.matches || []).flatMap((match) => [match.playerA, match.playerB]).filter(Boolean);
    const winnerLoserLabelMismatch = expected.rule === "WINNERS_AND_TOP_LOSERS"
      && initialLabels.filter((label) => /^Mejor perdedor/.test(String(label))).length > expected.directLosers;
    if (winnerLoserLabelMismatch) {
      mismatches.push(`${count}: skeleton UI labels direct winner slots as best-losers before materialization`);
    }
    rows.push({
      COUNT: count,
      OFICIAL: semanticRule(expected),
      CORE_JS: "MATCH",
      SQL: "MATCH",
      UI: winnerLoserLabelMismatch ? "MISMATCH_LABELS" : "MATCH",
      RESULTADO: winnerLoserLabelMismatch ? "MISMATCH" : "MATCH",
    });
  } catch (error) {
    mismatches.push(`${count}: ${error.message}`);
    rows.push({
      COUNT: count,
      OFICIAL: semanticRule(expected),
      CORE_JS: "MISMATCH",
      SQL: "MISMATCH",
      UI: "UNKNOWN",
      RESULTADO: "MISMATCH",
    });
  }
}

try {
  assertRepairMigration();
} catch (error) {
  mismatches.push(`repair migration: ${error.message}`);
}

console.table(rows);
if (mismatches.length) {
  console.error("validateOfficialTournamentStructures: BUGS_FOUND");
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  process.exitCode = 1;
} else {
  console.log("validateOfficialTournamentStructures: PASS");
}
