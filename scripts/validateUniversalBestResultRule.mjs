import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calculateMatchWinner } from "../src/utils/matchWinner.js";
import {
  bestResultPerformanceScore,
  compareBestResultMetrics,
  gameWinRatio,
  performanceMetricsFromSets,
} from "../src/utils/bestResultPerformance.js";

const migrationPath = "supabase/migrations/20261005120000_universal_best_result_performance.sql";
const migration = readFileSync(migrationPath, "utf8");
const core = readFileSync("src/domain/tournament-generation/core.js", "utf8");
const zoneFormat = readFileSync("src/utils/zoneFormat.js", "utf8");
const stagePayload = readFileSync("src/domain/tournament-generation/stagePayload.js", "utf8");
const tournamentStageService = readFileSync("src/services/tournamentStageService.js", "utf8");

function assertOrder(description, players, expectedIds) {
  const actual = [...players].sort(compareBestResultMetrics).map((player) => player.id);
  assert.deepEqual(actual, expectedIds, description);
}

assertOrder(
  "sets won is the primary best-result criterion even if old set diff favored another player",
  [
    { id: "A", setsWon: 4, setsLost: 4, gamesWon: 24, gamesLost: 30, ranking: 99 },
    { id: "B", setsWon: 3, setsLost: 0, gamesWon: 18, gamesLost: 3, ranking: 1 },
  ],
  ["A", "B"],
);

assertOrder(
  "games win percentage breaks equal sets won, not absolute game diff",
  [
    { id: "A", setsWon: 2, gamesWon: 6, gamesLost: 4, ranking: 99 },
    { id: "B", setsWon: 2, gamesWon: 20, gamesLost: 15, ranking: 1 },
  ],
  ["A", "B"],
);

assertOrder(
  "general ranking breaks exact sporting metric ties",
  [
    { id: "A", setsWon: 2, gamesWon: 12, gamesLost: 8, ranking: 9 },
    { id: "B", setsWon: 2, gamesWon: 12, gamesLost: 8, ranking: 3 },
  ],
  ["B", "A"],
);

const stbSets = [
  { playerAScore: 6, playerBScore: 4, type: "set" },
  { playerAScore: 3, playerBScore: 6, type: "set" },
  { playerAScore: 10, playerBScore: 7, type: "super_tiebreak" },
];
const playerAMetrics = performanceMetricsFromSets(stbSets, { isPlayerA: true });
const playerBMetrics = performanceMetricsFromSets(stbSets, { isPlayerA: false });
assert.deepEqual(playerAMetrics, { setsWon: 1, setsLost: 1, gamesWon: 9, gamesLost: 10 }, "STB is excluded from player A performance stats");
assert.deepEqual(playerBMetrics, { setsWon: 1, setsLost: 1, gamesWon: 10, gamesLost: 9 }, "STB is excluded from player B performance stats");

const winner = calculateMatchWinner({
  playerAId: "A",
  playerBId: "B",
  sets: stbSets,
  matchFormat: {
    bestOfSets: 2,
    gamesPerSet: 6,
    useSuperTiebreak: true,
    superTiebreakInDecidingSet: true,
  },
});
assert.equal(winner.valid, true, "STB still defines the match winner");
assert.equal(winner.winnerId, "A", "STB winner is preserved for result semantics");

assert.equal(gameWinRatio({ gamesWon: 6, gamesLost: 4 }), 0.6, "gameWinRatio computes won / total games");
assert.equal(bestResultPerformanceScore({ setsWon: 2, gamesWon: 6, gamesLost: 4 }), 2000.6, "performance score follows sets won plus game win ratio");

assert.match(core, /compareBestResultMetrics/, "core preliminary ordering uses the universal best-result comparator");
assert.doesNotMatch(
  core.slice(core.indexOf("function comparePreliminaryPerformance"), core.indexOf("function placeSeededEntrants")),
  /setsDiff|gamesDiff/,
  "core preliminary comparator must not use setsDiff/gamesDiff",
);
assert.match(stagePayload, /bestResultPerformanceScore/, "stage payload performance score uses the universal metric");
assert.match(zoneFormat, /setsWon/, "zone comparator uses sets won");
assert.match(zoneFormat, /compareGamePercentage/, "zone comparator uses games win percentage");
assert.doesNotMatch(
  zoneFormat.slice(zoneFormat.indexOf("export function compareZonePerformance"), zoneFormat.indexOf("function compareStandingPerformance")),
  /setsDiff|gamesDiff/,
  "zone performance comparator must not use setsDiff/gamesDiff",
);
assert.match(tournamentStageService, /filter\(isPerformanceSet\)/, "zone standings exclude super tie-break from performance stats");
assert.match(tournamentStageService, /compareGameWinPercentage/, "zone standings sort by games win percentage");

assert.match(migration, /create or replace function public\.game_best_result_games_win_percentage/, "SQL helper for games win percentage exists");
assert.match(migration, /coalesce\(ms\.set_type, 'set'\) <> 'super_tiebreak'/, "SQL excludes super tie-break sets from performance aggregates");
assert.match(migration, /sets_won desc, public\.game_best_result_games_win_percentage/g, "SQL ranking orders by sets won then games win percentage");
assert.doesNotMatch(migration, /sets_diff desc,\s*games_diff desc/i, "SQL must not order by sets_diff then games_diff");
assert.doesNotMatch(migration, /\(sets_won - sets_lost\) desc/i, "SQL must not order by set difference");
assert.doesNotMatch(migration, /\(games_won - games_lost\) desc/i, "SQL must not order by game difference");
assert.doesNotMatch(migration, /options\.start_time|v_slot\.start_time/, "unrelated weekly slot-time regression must not reappear");

console.log("UNIVERSAL_BEST_RESULT_RULE: PASS");
