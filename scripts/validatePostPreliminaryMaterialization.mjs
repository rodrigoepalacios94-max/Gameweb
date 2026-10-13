import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildPreliminaryBracketFromResults,
  generateCategoryBracketInDb,
} from "../src/domain/tournament-generation/core.js";

const migration = readFileSync("supabase/migrations/20260921120000_deferred_preliminary_result_flow.sql", "utf8");

function player(index, categoryId = "category-post-prelim") {
  return {
    id: `player-${index}`,
    firstName: "Jugador",
    lastName: String(index),
    fullName: `Jugador ${index}`,
    ranking: index,
    categoryId,
    avatar: "",
  };
}

function buildDb(count) {
  const players = Array.from({ length: count }, (_, index) => player(index + 1));
  return {
    tournaments: [{
      id: "tournament-post-prelim",
      name: "Post Preliminary Cup",
      categories: ["category-post-prelim"],
      categoryStages: [{
        id: "stage-post-prelim",
        tournamentId: "tournament-post-prelim",
        categoryId: "category-post-prelim",
        categoryName: "Categoria Post Preliminar",
        format: "Preliminar",
        formatStatus: "confirmed",
        status: "Formato confirmado",
        participants: players.map((item) => item.id),
        inscriptionsCount: players.length,
        bracketKey: "tournament-post-prelim::category-post-prelim",
      }],
      participants: players.map((item) => item.id),
    }],
    categories: [{ id: "category-post-prelim", name: "Categoria", branch: "Masculino", level: 1 }],
    players,
    enrollments: [],
    matches: [],
    matchConnections: [],
    brackets: {},
  };
}

function finishMatch(match, index, { walkover = false } = {}) {
  const winnerIsA = index % 2 === 0;
  match.status = "Finalizado";
  match.winnerId = winnerIsA ? match.playerAId : match.playerBId;
  match.loserId = winnerIsA ? match.playerBId : match.playerAId;
  match.resultType = walkover ? "WO" : "NORMAL";
  match.resultDetail = walkover ? { type: "WO" } : { type: "NORMAL" };
  match.result = walkover ? "W.O." : (winnerIsA ? "6-3 / 6-4" : "3-6 / 4-6");
  match.sets = walkover
    ? []
    : winnerIsA
      ? [{ playerA: 6, playerB: 3 }, { playerA: 6, playerB: 4 }]
      : [{ playerA: 3, playerB: 6 }, { playerA: 4, playerB: 6 }];
}

function resolvedBracketFor(count, finishedCount, options = {}) {
  const db = buildDb(count);
  generateCategoryBracketInDb(db, "tournament-post-prelim", "category-post-prelim");
  const preliminaries = db.matches
    .filter((match) => match.phase === "Preliminar" && !match.bye)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  preliminaries.slice(0, finishedCount).forEach((match, index) => finishMatch(match, index, {
    walkover: options.walkoverLast && index === finishedCount - 1,
  }));
  return {
    db,
    preliminaries,
    resolved: buildPreliminaryBracketFromResults(db, db.tournaments[0], "category-post-prelim"),
  };
}

function compareSpecial30LosersCanonical(a, b) {
  return a.administrativePenalty - b.administrativePenalty
    || b.setsDiff - a.setsDiff
    || b.gamesDiff - a.gamesDiff
    || a.rankingSeed - b.rankingSeed
    || a.playerId.localeCompare(b.playerId);
}

function compareSpecial30LosersGamesOnly(a, b) {
  return b.gamesDiff - a.gamesDiff || a.playerId.localeCompare(b.playerId);
}

const special30LoserFixture = [
  {
    playerId: "00000000-0000-0000-0000-000000000001",
    administrativePenalty: 1,
    setsDiff: 2,
    gamesDiff: 18,
    rankingSeed: 1,
  },
  {
    playerId: "00000000-0000-0000-0000-000000000002",
    administrativePenalty: 0,
    setsDiff: 1,
    gamesDiff: 8,
    rankingSeed: 9,
  },
  {
    playerId: "00000000-0000-0000-0000-000000000003",
    administrativePenalty: 0,
    setsDiff: 2,
    gamesDiff: 3,
    rankingSeed: 8,
  },
  {
    playerId: "00000000-0000-0000-0000-000000000004",
    administrativePenalty: 0,
    setsDiff: 2,
    gamesDiff: 3,
    rankingSeed: 7,
  },
  {
    playerId: "00000000-0000-0000-0000-000000000005",
    administrativePenalty: 0,
    setsDiff: 2,
    gamesDiff: 3,
    rankingSeed: 7,
  },
  {
    playerId: "00000000-0000-0000-0000-000000000006",
    administrativePenalty: 0,
    setsDiff: 2,
    gamesDiff: 4,
    rankingSeed: 99,
  },
];

const canonicalSpecial30Losers = [...special30LoserFixture].sort(compareSpecial30LosersCanonical).map((item) => item.playerId);
const gamesOnlySpecial30Losers = [...special30LoserFixture].sort(compareSpecial30LosersGamesOnly).map((item) => item.playerId);

assert.notDeepEqual(
  gamesOnlySpecial30Losers.slice(0, 2),
  canonicalSpecial30Losers.slice(0, 2),
  "30 gate fixture must catch games-diff-only ranking as a different result",
);
assert.deepEqual(
  canonicalSpecial30Losers.slice(0, 2),
  [
    "00000000-0000-0000-0000-000000000006",
    "00000000-0000-0000-0000-000000000004",
  ],
  "30 gate uses admin penalty, sets diff, games diff, ranking seed, player id",
);

function assertGate(count, expected) {
  const { preliminaries } = resolvedBracketFor(count, 0);
  assert.equal(preliminaries.length, expected.preliminaries, `${count}: preliminary count`);

  for (const finished of [0, 1, expected.preliminaries - 1].filter((value, index, list) => value >= 0 && list.indexOf(value) === index)) {
    const { resolved } = resolvedBracketFor(count, finished);
    assert.equal(resolved, null, `${count}: ${finished}/${expected.preliminaries} must not materialize`);
  }

  const { resolved } = resolvedBracketFor(count, expected.preliminaries);
  assert.ok(resolved, `${count}: N/N materializes`);
  assert.equal(resolved.preliminarySummary.accessMatches, expected.accessMatches, `${count}: access matches`);
  assert.equal(resolved.preliminarySummary.directEntrants, expected.directEntrants, `${count}: direct entrants`);
  assert.equal(resolved.rounds[0].name, expected.firstRound, `${count}: first post-preliminary round`);

  const withWalkover = resolvedBracketFor(count, expected.preliminaries, { walkoverLast: true }).resolved;
  assert.ok(withWalkover, `${count}: W.O. counts as a resolved preliminary result`);
}

assertGate(14, { preliminaries: 7, directEntrants: 2, accessMatches: 6, firstRound: "8vos" });
assertGate(22, { preliminaries: 11, directEntrants: 10, accessMatches: 6, firstRound: "16avos" });

const special30Partial = resolvedBracketFor(30, 14).resolved;
assert.equal(special30Partial, null, "30: 14/15 preliminaries must not materialize gate 1");
const special30 = resolvedBracketFor(30, 15).resolved;
assert.ok(special30, "30: 15/15 preliminaries materialize gate 1");
assert.equal(special30.preliminarySummary.postRule, "SPECIAL_30", "30: special rule is preserved");
assert.equal(special30.preliminarySummary.accessMatches, 15, "30: creates fifteen 16avos");
assert.equal(special30.rounds[0].name, "16avos", "30: gate 1 first round is 16avos");
assert.equal(special30.rounds[1].name, "Clasificatorio", "30: classifier skeleton exists after 16avos gate");

for (const count of [8, 18, 33, 36, 42, 43, 48]) {
  const preliminaries = Math.floor(count / 2);
  const { resolved } = resolvedBracketFor(count, preliminaries);
  assert.ok(resolved, `${count}: official post-preliminary structure resolves at N/N`);
  assert.ok(resolved.preliminarySummary.supported !== false, `${count}: official rule is supported`);
}

assert.match(migration, /create or replace function public\.game_materialize_post_preliminary_for_category/, "SQL adds backend materializer");
assert.match(migration, /perform public\.game_materialize_post_preliminary_for_category\(v_parent\.tournament_category_id\)/, "advance_winner triggers post-preliminary materialization");
assert.match(migration, /pg_advisory_xact_lock/, "materializer uses transaction-scoped concurrency lock");
assert.match(migration, /postPreliminaryMaterialization.+completed/s, "materializer persists deterministic completion marker");
assert.match(migration, /POST_PRELIMINARY_LEGACY_CONFLICT/, "legacy activity fails closed");
assert.match(migration, /public\.game_ensure_match_connection/, "connections are idempotent and conflict checked");
assert.match(migration, /game_materialize_special30_classifier_if_ready/, "30-player second gate is implemented");
assert.match(migration, /ss\.administrative_penalty asc,\s*\(ss\.sets_won - ss\.sets_lost\) desc,\s*\(ss\.games_won - ss\.games_lost\) desc,\s*ss\.ranking_seed asc,\s*ss\.player_id asc/s, "30-player second gate uses canonical loser comparator");
assert.doesNotMatch(migration, /order by perf\.games_diff desc,\s*m\.loser_id asc/i, "30-player second gate must not use games-diff-only comparator");
assert.match(migration, /lower\(coalesce\(m\.phase, ''\)\) = 'bye'/, "SQL includes preliminary BYE players in odd official counts");
assert.match(migration, /'BYE Ranking General'/, "SQL carries preliminary BYE players as direct entrants");
assert.doesNotMatch(migration, /delete from public\.matches[^;]*tournament_category_id = v_stage\.id/is, "post-preliminary materialization must not delete category matches");
assert.doesNotMatch(migration, /delete from public\.brackets[^;]*tournament_category_id = v_stage\.id/is, "post-preliminary materialization must not recreate brackets");
assert.match(migration, /create or replace function public\.advance_winner\(p_parent_match_id uuid\)[\s\S]*?security definer[\s\S]*?set search_path = public/, "advance_winner is SECURITY DEFINER with explicit search_path for private helper calls");
assert.match(migration, /if auth\.role\(\) <> 'service_role' and not public\.is_admin\(\) then\s*raise exception 'ADVANCE_WINNER_FORBIDDEN';\s*end if;/, "advance_winner has an explicit admin/service-role guard before work");
assert.match(migration, /revoke execute on function public\.game_materialize_post_preliminary_for_category\(uuid\) from authenticated;/, "post-preliminary materializer is not directly executable by authenticated");
assert.match(migration, /revoke execute on function public\.game_materialize_special30_classifier_if_ready\(uuid\) from authenticated;/, "special 30 materializer is not directly executable by authenticated");
assert.doesNotMatch(migration, /grant execute on function public\.game_materialize_post_preliminary_for_category\(uuid\) to authenticated/i, "post-preliminary materializer has no authenticated grant");
assert.doesNotMatch(migration, /grant execute on function public\.game_materialize_special30_classifier_if_ready\(uuid\) to authenticated/i, "special 30 materializer has no authenticated grant");
assert.match(migration, /revoke execute on function public\.game_materialize_post_preliminary_for_category\(uuid\) from public, anon;/, "post-preliminary materializer revokes PUBLIC/anon");
assert.match(migration, /revoke execute on function public\.game_materialize_special30_classifier_if_ready\(uuid\) from public, anon;/, "special 30 materializer revokes PUBLIC/anon");
assert.match(migration, /grant execute on function public\.advance_winner\(uuid\) to authenticated, service_role;/, "legitimate advance_winner API remains callable");

console.log("validatePostPreliminaryMaterialization: PASS");
