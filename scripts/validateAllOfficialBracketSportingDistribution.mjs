import assert from "node:assert/strict";
import {
  buildPreliminaryBracketFromResults,
  buildZoneEliminationBracket,
  generateCategoryBracketInDb,
  getOfficialPreliminaryRule,
} from "../src/domain/tournament-generation/core.js";
import { buildTournamentStagePayload } from "../src/domain/tournament-generation/stagePayload.js";
import { getZoneBracketValidation, getZoneMainRoundNames } from "../src/utils/zoneFormat.js";

const COUNTS = Array.from({ length: 44 }, (_, index) => index + 5);
const RANDOM_SEEDS = [101, 202, 303, 404, 505];
const RESULT_VARIANTS = ["favorites", "alternating", "upsets"];

const matrix = [];

function withSeed(seed, operation) {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    return operation();
  } finally {
    Math.random = original;
  }
}

function player(index, categoryId = "category-sporting") {
  return {
    id: `player-${String(index).padStart(2, "0")}`,
    firstName: "Jugador",
    lastName: String(index),
    fullName: `Jugador ${index}`,
    ranking: index,
    categoryId,
  };
}

function buildDb(count, format = "Preliminar") {
  const players = Array.from({ length: count }, (_, index) => player(index + 1));
  return {
    tournaments: [{
      id: "tournament-sporting",
      name: "Sporting Distribution",
      categories: ["category-sporting"],
      categoryStages: [{
        id: "stage-sporting",
        tournamentId: "tournament-sporting",
        categoryId: "category-sporting",
        categoryName: "Categoria Sporting",
        status: "Formato confirmado",
        format,
        formatStatus: "confirmed",
        participants: players.map((item) => item.id),
        inscriptionsCount: players.length,
        bracketKey: "tournament-sporting::category-sporting",
      }],
    }],
    categories: [{ id: "category-sporting", name: "Categoria", branch: "Masculino", level: 1 }],
    players,
    enrollments: players.map((item) => ({
      tournamentId: "tournament-sporting",
      categoryId: "category-sporting",
      playerId: item.id,
      status: "Aceptada",
    })),
    matches: [],
    matchConnections: [],
    brackets: {},
  };
}

function roundByName(bracket, name) {
  return (bracket.rounds || []).find((round) => round.name === name) || null;
}

function isIncomingFrom(roundName, value) {
  return new RegExp(`^Ganador\\s+${escapeRegExp(roundName)}\\s+\\d+$`, "i").test(String(value || "").trim());
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slotValues(match) {
  return [
    { label: match.playerA, playerId: match.playerAId || null },
    { label: match.playerB, playerId: match.playerBId || null },
  ];
}

function sideForMatch(index, total) {
  return index < Math.ceil(total / 2) ? "left" : "right";
}

function assertLabelReferencesResolve(bracket, context) {
  const rounds = bracket.rounds || [];
  const sources = new Map();
  rounds.forEach((round) => {
    (round.matches || []).forEach((match, index) => {
      sources.set(`${round.name}:${index + 1}`, match);
    });
  });
  rounds.forEach((round) => {
    (round.matches || []).forEach((match) => {
      for (const slot of slotValues(match)) {
        const reference = String(slot.label || "").match(/^Ganador\s+(.+?)\s+(\d+)$/i);
        if (!reference) continue;
        assert.ok(sources.has(`${reference[1]}:${Number(reference[2])}`), `${context}: unresolved winner reference ${slot.label}`);
      }
    });
  });
}

function assertFirstMainAccessDistribution(bracket, accessRoundName, mainRoundName, context) {
  if (!accessRoundName) return;
  const accessRound = roundByName(bracket, accessRoundName);
  const mainRound = roundByName(bracket, mainRoundName);
  assert.ok(accessRound, `${context}: access round ${accessRoundName} exists`);
  assert.ok(mainRound, `${context}: main round ${mainRoundName} exists`);

  const accessMatches = accessRound.matches || [];
  const mainMatches = mainRound.matches || [];
  const directSlots = Math.max(0, mainMatches.length * 2 - accessMatches.length);
  const occurrences = new Map();
  let incomingVsIncoming = 0;
  let directVsIncoming = 0;

  mainMatches.forEach((match, targetIndex) => {
    const slots = slotValues(match);
    assert.equal(slots.length, 2, `${context}: every match has exactly two sporting slots`);
    const incomingSlots = slots.filter((slot) => isIncomingFrom(accessRoundName, slot.label));
    incomingSlots.forEach((slot) => {
      occurrences.set(slot.label, { targetIndex, opponent: slots.find((other) => other !== slot) });
    });
    if (incomingSlots.length === 2) incomingVsIncoming += 1;
    if (incomingSlots.length === 1) directVsIncoming += 1;
    assert.ok(incomingSlots.length <= 2, `${context}: access winner slot overflow`);
  });

  for (let index = 1; index <= accessMatches.length; index += 1) {
    assert.ok(occurrences.has(`Ganador ${accessRoundName} ${index}`), `${context}: missing target for ${accessRoundName} winner ${index}`);
  }
  assert.equal(occurrences.size, accessMatches.length, `${context}: every access winner appears exactly once`);

  const unavoidableIncomingPairs = Math.max(0, (accessMatches.length - directSlots) / 2);
  assert.equal(incomingVsIncoming, unavoidableIncomingPairs, `${context}: incoming-vs-incoming pairs must be only the mathematically unavoidable amount`);
  assert.equal(directVsIncoming, Math.min(accessMatches.length, directSlots), `${context}: each available waiting slot must receive one access winner`);

  if (directSlots >= accessMatches.length) {
    for (let index = 1; index <= accessMatches.length; index += 1) {
      const sourceSide = sideForMatch(index - 1, accessMatches.length);
      const targetSide = sideForMatch(occurrences.get(`Ganador ${accessRoundName} ${index}`).targetIndex, mainMatches.length);
      assert.equal(targetSide, sourceSide, `${context}: ${accessRoundName} winner ${index} must remain in its bracket half`);
      assert.ok(
        !isIncomingFrom(accessRoundName, occurrences.get(`Ganador ${accessRoundName} ${index}`).opponent?.label),
        `${context}: access winner ${index} must face a waiting/direct entrant`,
      );
    }
  }
}

function matchSideInRound(round, playerId) {
  const index = (round?.matches || []).findIndex((match) => match.playerAId === playerId || match.playerBId === playerId);
  if (index < 0) return null;
  return sideForMatch(index, round.matches.length);
}

function assertTopSeedsOppositeWhenPresent(bracket, roundName, context) {
  const round = roundByName(bracket, roundName);
  const p1Side = matchSideInRound(round, "player-01");
  const p2Side = matchSideInRound(round, "player-02");
  if (p1Side && p2Side) {
    assert.notEqual(p1Side, p2Side, `${context}: ranking #1 and #2 must be in opposite halves when both are in ${roundName}`);
  }
}

function preliminaryPairs(db) {
  return db.matches
    .filter((match) => match.phase === "Preliminar" && match.playerAId && match.playerBId)
    .map((match) => new Set([match.playerAId, match.playerBId]));
}

function assertNoImmediatePreliminaryRematch(db, bracket, context) {
  const pairs = preliminaryPairs(db);
  const postPreliminaryRounds = (bracket.rounds || []).slice(0, 2);
  for (const round of postPreliminaryRounds) {
    for (const match of round.matches || []) {
      if (!match.playerAId || !match.playerBId) continue;
      const rematch = pairs.some((pair) => pair.has(match.playerAId) && pair.has(match.playerBId));
      assert.equal(rematch, false, `${context}: preliminary rivals must not be paired again immediately`);
    }
  }
}

function assertPreliminarySeedProtection(db, context) {
  const preliminaries = db.matches.filter((match) => match.phase === "Preliminar" && match.playerAId && match.playerBId);
  for (const match of preliminaries) {
    const rankingA = Number(match.playerAId.replace("player-", ""));
    const rankingB = Number(match.playerBId.replace("player-", ""));
    assert.ok(!(rankingA <= 4 && rankingB <= 4), `${context}: top seeds must not face each other in preliminaries`);
  }
}

function finishPreliminaries(db, variant) {
  db.matches
    .filter((match) => match.phase === "Preliminar" && match.playerAId && match.playerBId)
    .forEach((match, index) => {
      const rankingA = Number(match.playerAId.replace("player-", ""));
      const rankingB = Number(match.playerBId.replace("player-", ""));
      const winnerIsA = variant === "favorites"
        ? rankingA < rankingB
        : variant === "upsets"
          ? rankingA > rankingB
          : index % 2 === 0;
      match.status = "Finalizado";
      match.winnerId = winnerIsA ? match.playerAId : match.playerBId;
      match.loserId = winnerIsA ? match.playerBId : match.playerAId;
      match.result = winnerIsA ? "6-2 / 6-3" : "3-6 / 2-6";
      match.sets = winnerIsA
        ? [{ playerA: 6, playerB: 2 }, { playerA: 6, playerB: 3 }]
        : [{ playerA: 3, playerB: 6 }, { playerA: 2, playerB: 6 }];
    });
}

function assertPayloadProgresses(bracket, db, context) {
  const payload = buildTournamentStagePayload(db, bracket, db.tournaments[0].categoryStages[0], { allowFinishedPreliminaries: true, allowFinishedZones: true });
  const parents = new Set();
  const childSlots = new Set();
  for (const connection of payload.connections || []) {
    assert.ok(!parents.has(connection.parentTempId), `${context}: parent connected twice`);
    parents.add(connection.parentTempId);
    const slotKey = `${connection.childTempId}:${connection.childSlot}`;
    assert.ok(!childSlots.has(slotKey), `${context}: duplicate child slot`);
    childSlots.add(slotKey);
  }
}

function validatePreliminaryCount(count) {
  const official = getOfficialPreliminaryRule(count);
  if (!official) {
    const db = buildDb(count, "Preliminar");
    const bracket = generateCategoryBracketInDb(db, "tournament-sporting", "category-sporting");
    assert.equal(bracket.preliminarySummary?.supported, false, `${count}: undocumented preliminary count must fail closed`);
    return "REQUIRES_REVIEW";
  }

  for (const seed of RANDOM_SEEDS) {
    for (const variant of RESULT_VARIANTS) {
      const db = withSeed(seed, () => buildDb(count, "Preliminar"));
      const skeleton = withSeed(seed, () => generateCategoryBracketInDb(db, "tournament-sporting", "category-sporting"));
      assertPreliminarySeedProtection(db, `Preliminar ${count}/${seed}/${variant}`);
      assert.ok(skeleton, `Preliminar skeleton ${count}/${seed}`);
      finishPreliminaries(db, variant);
      const resolved = buildPreliminaryBracketFromResults(db, db.tournaments[0], "category-sporting");
      assert.ok(resolved, `Preliminar ${count}/${seed}/${variant}: resolved`);
      assertLabelReferencesResolve(resolved, `Preliminar resolved ${count}/${seed}/${variant}`);
      assertFirstMainAccessDistribution(resolved, official.accessRoundName, official.firstMainRoundName, `Preliminar ${count}/${seed}/${variant}`);
      assertTopSeedsOppositeWhenPresent(resolved, official.firstMainRoundName, `Preliminar ${count}/${seed}/${variant}`);
      assertNoImmediatePreliminaryRematch(db, resolved, `Preliminar ${count}/${seed}/${variant}`);
      assertPayloadProgresses(resolved, db, `Preliminar ${count}/${seed}/${variant}`);
    }
  }
  return "PASS";
}

function validateDirectEliminationCount(count) {
  for (const seed of RANDOM_SEEDS) {
    const db = withSeed(seed, () => buildDb(count, "Eliminacion Directa"));
    const bracket = withSeed(seed, () => generateCategoryBracketInDb(db, "tournament-sporting", "category-sporting"));
    assertLabelReferencesResolve(bracket, `Eliminacion Directa ${count}/${seed}`);
    const baseDrawSize = count <= 4 ? Math.max(2, count) : [64, 32, 16, 8, 4].find((size) => size <= count) || 4;
    const accessMatches = Math.max(0, count - baseDrawSize);
    const accessRoundName = accessMatches ? (baseDrawSize >= 32 ? "32avos" : baseDrawSize === 16 ? "16avos" : baseDrawSize === 8 ? "8vos" : "Cuartos") : null;
    const firstMainRoundName = baseDrawSize >= 32 ? "16avos" : baseDrawSize === 16 ? "8vos" : baseDrawSize === 8 ? "Cuartos" : baseDrawSize === 4 ? "Semifinal" : "Final";
    assertFirstMainAccessDistribution(bracket, accessRoundName, firstMainRoundName, `Eliminacion Directa ${count}/${seed}`);
    assertTopSeedsOppositeWhenPresent(bracket, firstMainRoundName, `Eliminacion Directa ${count}/${seed}`);
    assertPayloadProgresses(bracket, db, `Eliminacion Directa ${count}/${seed}`);
  }
  return "PASS";
}

function zonePlayer(index, zoneIndex, position) {
  return {
    id: `zone-player-${index}`,
    fullName: `Zona Player ${index}`,
    playerName: `Zona Player ${index}`,
    ranking: index,
    wins: Math.max(0, 4 - position),
    zonePoints: Math.max(0, 4 - position),
    played: 2,
    setsWon: Math.max(0, 6 - position),
    setsLost: position,
    gamesWon: Math.max(1, 30 - position),
    gamesLost: position + zoneIndex,
    position,
  };
}

function buildZoneQualifierBracket(totalQualifiers) {
  const zones = Array.from({ length: totalQualifiers }, (_, index) => {
    const top = zonePlayer((index * 3) + 1, index + 1, 1);
    const second = zonePlayer((index * 3) + 2, index + 1, 2);
    const third = zonePlayer((index * 3) + 3, index + 1, 3);
    return {
      id: `zone-${index + 1}`,
      name: `Zona ${index + 1}`,
      size: 3,
      qualifiers: 1,
      standingsResolved: true,
      players: [top, second, third].map((item) => item.fullName),
      playerIds: [top, second, third].map((item) => item.id),
      standings: [top, second, third],
    };
  });
  const players = zones.flatMap((zone) => zone.standings.map((standing) => player(Number(standing.id.replace("zone-player-", "")))));
  const db = buildDb(players.length, "Zonas");
  db.players = players;
  db.tournaments[0].categoryStages[0].participants = players.map((item) => item.id);
  const bracket = {
    tournamentId: "tournament-sporting",
    categoryId: "category-sporting",
    category: "Categoria Sporting",
    format: "Zonas",
    zones,
    rounds: [],
  };
  return { db, bracket };
}

function validateZoneQualifierTotal(totalQualifiers) {
  const validation = getZoneBracketValidation(totalQualifiers);
  if (!validation.valid) return "REQUIRES_REVIEW";
  for (const seed of RANDOM_SEEDS) {
    const { db, bracket } = withSeed(seed, () => buildZoneQualifierBracket(totalQualifiers));
    const result = buildZoneEliminationBracket(db, db.tournaments[0], db.tournaments[0].categoryStages[0], bracket, {
      completionStrategy: validation.accessMatches ? undefined : "best-next",
    });
    assert.equal(result.ok, true, `Zonas Q${totalQualifiers}/${seed}: bracket generated`);
    assert.equal(result.validation.target, validation.target, `Zonas Q${totalQualifiers}/${seed}: target`);
    assert.equal(result.validation.accessMatches, validation.accessMatches, `Zonas Q${totalQualifiers}/${seed}: access matches`);
    assertLabelReferencesResolve(result.bracket, `Zonas Q${totalQualifiers}/${seed}`);
    assertFirstMainAccessDistribution(result.bracket, validation.accessRoundName, validation.directRoundName, `Zonas Q${totalQualifiers}/${seed}`);
    assertPayloadProgresses(result.bracket, db, `Zonas Q${totalQualifiers}/${seed}`);
    const firstRound = roundByName(result.bracket, getZoneMainRoundNames(validation.target)[0]);
    assert.equal((firstRound?.matches || []).length, validation.target / 2, `Zonas Q${totalQualifiers}/${seed}: first main round size`);
  }
  return "PASS";
}

function runMatrix() {
  for (const count of COUNTS) {
    const row = { count };
    try {
      row.preliminar = validatePreliminaryCount(count);
    } catch (error) {
      row.preliminar = `FAIL: ${error.message}`;
    }
    try {
      row.directa = count >= 8 ? validateDirectEliminationCount(count) : "REQUIRES_REVIEW";
    } catch (error) {
      row.directa = `FAIL: ${error.message}`;
    }
    try {
      row.zonas = count >= 8 ? validateZoneQualifierTotal(count) : "REQUIRES_REVIEW";
    } catch (error) {
      row.zonas = `FAIL: ${error.message}`;
    }
    matrix.push(row);
  }
}

runMatrix();

const failures = matrix.flatMap((row) =>
  ["preliminar", "directa", "zonas"]
    .filter((format) => String(row[format]).startsWith("FAIL"))
    .map((format) => `${row.count} ${format}: ${row[format]}`)
);

console.table(matrix.map((row) => ({
  COUNT: row.count,
  PRELIMINAR: row.preliminar,
  "ELIMINACION DIRECTA": row.directa,
  ZONAS: row.zonas,
})));

if (failures.length) {
  console.error("validateAllOfficialBracketSportingDistribution: FAIL");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("validateAllOfficialBracketSportingDistribution: PASS", {
    counts: "5-48",
    randomSeeds: RANDOM_SEEDS.length,
    preliminaryResultVariants: RESULT_VARIANTS.length,
    checks: [
      "official direct/access distribution",
      "incoming winners vs waiting entrants",
      "no duplicate progression slots",
      "top seed half separation when present",
      "preliminary rivals separated immediately",
      "label references resolve to real source matches",
      "zone target/access rules",
      "visual labels can follow real connections",
    ],
  });
}
