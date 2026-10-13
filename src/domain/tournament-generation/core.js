import { DEFAULT_MATCH_FORMAT } from "../../utils/matchFormat.js";
import { availabilityPreferencesMatchSlot, normalizeAvailabilityPreferences } from "../../utils/availabilityPreferences.js";
import { compareBestResultMetrics, performanceMetricsFromSets } from "../../utils/bestResultPerformance.js";
import { ZONE_MAX_QUALIFIERS_PER_ZONE, compareZonePerformance, getZoneBracketValidation, getZoneCompletionOptions, getZoneMainRoundNames, getZoneValidationMessage, normalizeZoneQualifierCount, orderZoneQualifiersForBracket, pairZoneAccessPlayers, proposeZoneDistribution, resolveZoneQualifiers } from "../../utils/zoneFormat.js";

function createMockId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const TOURNAMENT_FORMATS = ["Preliminar", "Zonas", "Eliminacion Directa"];
const STANDARD_DRAWS = [4, 8, 16, 32, 64];

export function recommendTournamentFormat(participantCount = 0) {
  const count = Number(participantCount || 0);
  if (count <= 0) return null;
  if ([6, 7].includes(count)) return "Zonas";
  if ([8, 16, 32].includes(count)) return "Eliminacion Directa";
  if (count >= 30 && count <= 48) return "Preliminar";
  if (count % 2 !== 0) return "Zonas";
  if ([12, 20, 24, 28].includes(count)) return "Zonas";
  if (count >= 10 && count < 30) return "Zonas";
  return "Eliminacion Directa";
}

export function getCategoryLabel(category) {
  if (!category) return "Categoria";
  return `${category.name} ${category.branch}`;
}

function bracketKey(tournamentId, categoryId) {
  return `${tournamentId}::${categoryId}`;
}

function getCategoryById(db, categoryId) {
  return db.categories.find((category) => category.id === categoryId) || null;
}

function getPlayerById(db, playerId) {
  return db.players.find((player) => player.id === playerId) || null;
}

function enrollmentParticipants(db, tournamentId, categoryId) {
  return db.enrollments
    .filter((enrollment) => enrollment.tournamentId === tournamentId && enrollment.categoryId === categoryId && enrollment.status !== "Rechazada")
    .map((enrollment) => enrollment.playerId);
}

function legacyParticipants(db, tournament, categoryId) {
  return (tournament.participants || [])
    .map((playerId) => getPlayerById(db, playerId))
    .filter((player) => player?.categoryId === categoryId)
    .map((player) => player.id);
}

export function ensureTournamentCategoryStages(db, tournament) {
  if (!tournament) return [];
  const categories = tournament.categories || [];
  const existingStages = tournament.categoryStages || [];
  const existingByCategory = new Map(existingStages.map((stage) => [stage.categoryId, stage]));

  tournament.categoryStages = categories.map((categoryId) => {
    const category = getCategoryById(db, categoryId);
    const enrolled = enrollmentParticipants(db, tournament.id, categoryId);
    const legacy = legacyParticipants(db, tournament, categoryId);
    const participantIds = [...new Set([...(existingByCategory.get(categoryId)?.participants || []), ...enrolled, ...legacy])];
    const previous = existingByCategory.get(categoryId) || {};
    const recommendedFormat = participantIds.length ? recommendTournamentFormat(participantIds.length) : null;
    const formatStatus = previous.formatStatus || (participantIds.length ? (previous.format ? "confirmed" : "pending") : "empty");
    const status = previous.status || (participantIds.length ? (formatStatus === "confirmed" ? "Formato confirmado" : "Formato pendiente") : "Sin inscriptos");

    return {
      id: previous.id || `${tournament.id}-${categoryId}`,
      tournamentId: tournament.id,
      categoryId,
      categoryName: previous.categoryName || getCategoryLabel(category),
      status,
      format: previous.format || "",
      formatStatus,
      formatDecision: previous.formatDecision || (formatStatus === "confirmed" ? "legacy" : "pending"),
      recommendedFormat: previous.recommendedFormat || recommendedFormat,
      matchFormat: previous.matchFormat || tournament.matchFormat || DEFAULT_MATCH_FORMAT,
      participants: participantIds,
      inscriptionsCount: participantIds.length,
      zonesConfig: previous.zonesConfig || null,
      bracketKey: previous.bracketKey || bracketKey(tournament.id, categoryId),
      progress: previous.progress || null,
    };
  });

  return tournament.categoryStages;
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
    playerANote: playerA?.testNote || extra.playerANote,
    playerBNote: playerB?.testNote || extra.playerBNote,
    playerASource: playerA?.source || extra.playerASource || null,
    playerBSource: playerB?.source || extra.playerBSource || null,
    score: extra.score || "Pendiente",
    winner: extra.winner || null,
    matchId: extra.matchId || null,
    bye: Boolean(extra.bye),
    connectionNote: extra.connectionNote,
    structuralPlaceholder: Boolean(extra.structuralPlaceholder),
    sportingSlotKey: extra.sportingSlotKey || null,
  };
}

function createMatchFromBracket(db, tournament, stage, round, bracketMatch, index, phase = "Cuadro principal", options = {}) {
  const structuralPlaceholder = Boolean(options.structuralPlaceholder || bracketMatch.structuralPlaceholder);
  if ((!bracketMatch.playerAId || !bracketMatch.playerBId) && !structuralPlaceholder) return null;
  if (bracketMatch.bye || bracketMatch.matchId) return null;
  const id = createMockId("match");
  const match = {
    id,
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    tournament: tournament.name,
    category: stage.categoryName,
    round: round.name,
    phase,
    playerAId: bracketMatch.playerAId || null,
    playerA: bracketMatch.playerA,
    playerAAvatar: bracketMatch.playerAAvatar,
    playerBId: bracketMatch.playerBId || null,
    playerB: bracketMatch.playerB,
    playerBAvatar: bracketMatch.playerBAvatar,
    opponentId: bracketMatch.playerBId,
    opponent: bracketMatch.playerB,
    opponentAvatar: bracketMatch.playerBAvatar,
    date: "",
    time: "A definir",
    court: "A definir",
    status: "Pendiente de asistencia",
    attendanceStatus: {
      [bracketMatch.playerAId]: "Pendiente",
      [bracketMatch.playerBId]: "Pendiente",
    },
    result: null,
    resultDetail: null,
    sets: [],
    winnerId: null,
    loserId: null,
    pointsEarned: 0,
    discipline: { claims: [], confirmedFaults: [] },
    metadata: {
      structural: structuralPlaceholder,
      sportingSlotKey: bracketMatch.sportingSlotKey || `${stage.categoryId}:${round.id || round.name}:${index + 1}`,
    },
  };
  if (!structuralPlaceholder || options.persistPlaceholder) db.matches.push(match);
  bracketMatch.matchId = id;
  bracketMatch.connectionNote = bracketMatch.connectionNote || `Partido ${index + 1} de ${round.name}`;
  return match;
}

function createByeMatch(db, tournament, stage, player, roundName, index) {
  const id = createMockId("match");
  const match = {
    id,
    tournamentId: tournament.id,
    categoryId: stage.categoryId,
    tournament: tournament.name,
    category: stage.categoryName,
    round: roundName,
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
    date: "",
    time: "No programable",
    court: "No programable",
    status: "Finalizado",
    attendanceStatus: {},
    result: "6-0 / 6-0",
    resultDetail: { type: "BYE", source: "Ranking General", note: "Victoria administrativa por BYE." },
    sets: [{ playerA: 6, playerB: 0 }, { playerA: 6, playerB: 0 }],
    winnerId: player.id,
    loserId: null,
    pointsEarned: 0,
    discipline: { claims: [], confirmedFaults: [] },
    bye: true,
    byeSource: "Ranking General",
    connectionNote: `BYE ${index + 1} por Ranking General`,
  };
  db.matches.push(match);
  return match;
}

function largestStandardDraw(count) {
  return [...STANDARD_DRAWS].reverse().find((size) => size <= count) || 4;
}

function isStandardDrawSize(count) {
  return STANDARD_DRAWS.includes(Number(count || 0));
}

function shouldUseAccessDrawForPreliminary(count) {
  return false;
}

function nextMainRoundNames(drawSize) {
  if (drawSize >= 32) return ["16avos", "Octavos", "Cuartos", "Semifinal", "Final"];
  if (drawSize === 16) return ["8vos", "Cuartos", "Semifinal", "Final"];
  if (drawSize === 8) return ["Cuartos", "Semifinal", "Final"];
  if (drawSize === 4) return ["Semifinal", "Final"];
  return ["Final"];
}

function previousAccessRoundName(baseDrawSize) {
  if (baseDrawSize >= 32) return "32avos";
  if (baseDrawSize === 16) return "16avos";
  if (baseDrawSize === 8) return "8vos";
  if (baseDrawSize === 4) return "Cuartos";
  return "Ronda de acceso";
}

function sortByRanking(players) {
  return [...players].sort((a, b) => (a.ranking || 9999) - (b.ranking || 9999));
}

function hasExplicitSeed(player) {
  return Boolean(player?.seed || player?.isSeed || player?.seeded);
}

function protectedSeedCount(players = [], minimum = 4) {
  const explicitSeeds = players.filter(hasExplicitSeed).length;
  if (explicitSeeds) return explicitSeeds;
  return Math.min(players.length, Math.max(Number(minimum || 0), Math.ceil(players.length / 3), 0));
}

function splitSeededPlayers(players = [], minimumSeedCount = 4) {
  const sorted = sortByRanking(players);
  const seedCount = protectedSeedCount(sorted, minimumSeedCount);
  const explicitSeeds = sorted.filter(hasExplicitSeed);
  const seeds = explicitSeeds.length ? explicitSeeds : sorted.slice(0, seedCount);
  const seedIds = new Set(seeds.map((player) => player.id));
  return {
    seeds,
    nonSeeds: sorted.filter((player) => !seedIds.has(player.id)),
  };
}

function shufflePlayers(players = []) {
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function normalizeAvailabilityValue(value) {
  if (!value) return null;
  if (Array.isArray(value)) return { preferences: normalizeAvailabilityPreferences(value), legacySlots: new Set(value.filter((item) => typeof item === "string")), missing: false };
  if (value instanceof Set) return { preferences: {}, legacySlots: value, missing: false };
  if (value.available_slots) return normalizeAvailabilityValue(value.available_slots);
  if (value.preferences) return { preferences: normalizeAvailabilityPreferences(Object.entries(value.preferences).map(([date, preference]) => ({ date, preference }))), legacySlots: new Set(), missing: false };
  if (typeof value === "object") return { preferences: normalizeAvailabilityPreferences(Object.entries(value).map(([date, preference]) => ({ date, preference }))), legacySlots: new Set(), missing: false };
  return null;
}

function normalizeGenerationContext(options = {}) {
  const context = options.schedulingContext || options;
  const rawSlots = context?.slots || context?.scheduleSlots || [];
  const slots = rawSlots
    .map((slot) => ({
      ...slot,
      date: String(slot.date || slot.slotDate || slot.scheduled_at || "").slice(0, 10),
      time: String(slot.time || slot.startTime || slot.start_time || "").slice(0, 5),
      scheduledAt: slot.scheduledAt || slot.scheduled_at || null,
    }))
    .filter((slot) => slot.date && slot.time);
  const rawAvailability = context?.availabilityByPlayer || context?.playerAvailability || new Map();
  const availabilityByPlayer = rawAvailability instanceof Map
    ? rawAvailability
    : new Map(Object.entries(rawAvailability || {}));
  return {
    slots,
    availabilityByPlayer,
  };
}

function playerMatchesGenerationSlot(player, slot, context) {
  if (!player?.id) return false;
  const availability = normalizeAvailabilityValue(context.availabilityByPlayer.get(player.id));
  if (!availability) return false;
  if (availability.legacySlots.size) {
    const scheduledAt = slot.scheduledAt || `${slot.date}T${slot.time}:00`;
    return availability.legacySlots.has(scheduledAt);
  }
  const preference = availability.preferences?.[slot.date];
  if (!preference) return false;
  return availabilityPreferencesMatchSlot(availability.preferences, slot);
}

function pairProgramabilityScore(playerA, playerB, context) {
  if (!playerA?.id || !playerB?.id || !context.slots.length) return 0;
  return context.slots.reduce((score, slot) => (
    playerMatchesGenerationSlot(playerA, slot, context) && playerMatchesGenerationSlot(playerB, slot, context)
      ? score + 1
      : score
  ), 0);
}

function zoneProgramabilityScore(players = [], context) {
  let score = 0;
  for (let a = 0; a < players.length; a += 1) {
    for (let b = a + 1; b < players.length; b += 1) {
      score += pairProgramabilityScore(players[a], players[b], context);
    }
  }
  return score;
}

function chooseBestByProgramability(candidates = [], scoreFn = () => 0) {
  const shuffled = shufflePlayers(candidates);
  let best = null;
  let bestScore = -Infinity;
  shuffled.forEach((candidate) => {
    const score = scoreFn(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });
  return best || shuffled[0] || null;
}

export function distributeSeededPlayersIntoZones(players = [], distribution = [], options = {}) {
  const zones = distribution.map((size) => ({ size, players: [] }));
  const { seeds, nonSeeds } = splitSeededPlayers(players, distribution.length);
  const generationContext = normalizeGenerationContext(options);

  seeds.forEach((seed, index) => {
    const preferredZone = index % Math.max(zones.length, 1);
    const targetZone = zones[preferredZone]?.players.length < zones[preferredZone]?.size
      ? zones[preferredZone]
      : zones.find((zone) => zone.players.length < zone.size);
    if (targetZone) targetZone.players.push(seed);
  });

  const remainingNonSeeds = shufflePlayers(nonSeeds);
  while (remainingNonSeeds.length) {
    let placedInPass = false;
    for (const zone of zones) {
      if (!remainingNonSeeds.length) break;
      if (zone.players.length >= zone.size) continue;
      const selected = chooseBestByProgramability(
        remainingNonSeeds,
        (candidate) => zoneProgramabilityScore([...zone.players, candidate], generationContext),
      );
      const selectedIndex = remainingNonSeeds.findIndex((player) => player.id === selected?.id);
      if (selectedIndex < 0) continue;
      zone.players.push(remainingNonSeeds.splice(selectedIndex, 1)[0]);
      placedInPass = true;
    }
    if (!placedInPass) break;
  }

  return zones.map((zone) => zone.players);
}

export function makeProtectedPreliminaryPairs(players = [], options = {}) {
  const sorted = sortByRanking(players);
  const { seeds, nonSeeds } = splitSeededPlayers(sorted, 4);
  const pairs = [];
  const availableNonSeeds = shufflePlayers(nonSeeds);
  const availableSeeds = [...seeds];
  const generationContext = normalizeGenerationContext(options);

  while (availableSeeds.length && availableNonSeeds.length) {
    const seed = availableSeeds.shift();
    const opponent = chooseBestByProgramability(
      availableNonSeeds,
      (candidate) => pairProgramabilityScore(seed, candidate, generationContext),
    );
    const opponentIndex = availableNonSeeds.findIndex((player) => player.id === opponent?.id);
    pairs.push([seed, availableNonSeeds.splice(opponentIndex, 1)[0]]);
  }

  while (availableNonSeeds.length >= 2) {
    const playerA = availableNonSeeds.shift();
    const playerB = chooseBestByProgramability(
      availableNonSeeds,
      (candidate) => pairProgramabilityScore(playerA, candidate, generationContext),
    );
    const opponentIndex = availableNonSeeds.findIndex((player) => player.id === playerB?.id);
    pairs.push([playerA, availableNonSeeds.splice(opponentIndex, 1)[0]]);
  }

  while (availableSeeds.length >= 2) {
    const highestSeed = availableSeeds.shift();
    const lowestSeed = availableSeeds.pop();
    pairs.push([highestSeed, lowestSeed]);
  }

  if (availableSeeds.length) {
    const leftoverOpponent = availableNonSeeds.shift() || null;
    pairs.push([availableSeeds.shift(), leftoverOpponent]);
  }

  return pairs.filter(([playerA, playerB]) => playerA && playerB);
}

function getMatchResultType(match) {
  return String(match.resultType || match.resultDetail?.type || "").toUpperCase();
}

function getPreliminaryPerformance(match, playerId) {
  const isPlayerA = match.playerAId === playerId;
  const isPlayerB = match.playerBId === playerId;
  if (!isPlayerA && !isPlayerB) {
    return { administrativePenalty: 1, setsDiff: -999, gamesDiff: -999 };
  }
  const resultType = getMatchResultType(match);
  const lostByWalkover = match.loserId === playerId && ["WO", "DOUBLE_WO"].includes(resultType);
  const totals = performanceMetricsFromSets(match.sets || [], { isPlayerA });
  return {
    ...totals,
    setsDiff: totals.setsWon - totals.setsLost,
    gamesDiff: totals.gamesWon - totals.gamesLost,
    administrativePenalty: lostByWalkover ? 1 : 0,
  };
}

function comparePreliminaryPerformance(a, b) {
  return a.performance.administrativePenalty - b.performance.administrativePenalty
    || compareBestResultMetrics(
      { ...a.performance, ranking: a.ranking },
      { ...b.performance, ranking: b.ranking },
    );
}

function placeSeededEntrants(entrants, drawSize) {
  const slots = Array.from({ length: drawSize }, () => null);
  const rankedPlayers = sortByRanking(entrants.filter((entrant) => entrant?.id));
  const seedPositions = [0, drawSize - 1, Math.floor(drawSize / 2), Math.floor(drawSize / 2) - 1];

  rankedPlayers.slice(0, 4).forEach((player, index) => {
    slots[seedPositions[index]] = player;
  });

  const placedIds = new Set(slots.filter((slot) => slot?.id).map((slot) => slot.id));
  const remaining = [
    ...sortByRanking(entrants.filter((entrant) => entrant?.id && !placedIds.has(entrant.id))),
    ...entrants.filter((entrant) => !entrant?.id),
  ];

  slots.forEach((slot, index) => {
    if (!slot) slots[index] = remaining.shift() || "A definir";
  });

  return slots;
}

function isIncomingWinnerSlot(entrant) {
  return typeof entrant === "string" && /^Ganador\s+.+\s+\d+$/i.test(entrant.trim());
}

function slotPairIndex(slotIndex) {
  return Math.floor(slotIndex / 2);
}

function oppositeSlotIndex(slotIndex) {
  return slotIndex % 2 === 0 ? slotIndex + 1 : slotIndex - 1;
}

function sideForIncomingIndex(index, totalIncoming) {
  return index < Math.ceil(totalIncoming / 2) ? "left" : "right";
}

function candidateIncomingSlots(drawSize, side) {
  const totalMatches = drawSize / 2;
  const sideMatchCount = totalMatches / 2;
  const startMatch = side === "left" ? 0 : sideMatchCount;
  const seedOpponentSlots = side === "left"
    ? [1, Math.max(0, drawSize / 2 - 2)]
    : [drawSize / 2 + 1, drawSize - 2];
  const slots = [];
  seedOpponentSlots.forEach((slot) => {
    if (slot >= startMatch * 2 && slot < (startMatch + sideMatchCount) * 2) slots.push(slot);
  });
  for (let matchIndex = startMatch; matchIndex < startMatch + sideMatchCount; matchIndex += 1) {
    slots.push(matchIndex * 2 + 1, matchIndex * 2);
  }
  return [...new Set(slots)].filter((slot) => slot >= 0 && slot < drawSize);
}

function chooseIncomingSlotsWithWaitingEntrants(drawSize, incomingCount) {
  const reserved = [];
  const usedPairs = new Set();
  const usedSlots = new Set();
  for (let index = 0; index < incomingCount; index += 1) {
    const side = sideForIncomingIndex(index, incomingCount);
    const slot = candidateIncomingSlots(drawSize, side).find((candidate) => (
      !usedSlots.has(candidate) && !usedPairs.has(slotPairIndex(candidate))
    ));
    if (slot == null) return null;
    reserved.push(slot);
    usedSlots.add(slot);
    usedPairs.add(slotPairIndex(slot));
  }
  return reserved;
}

function seedPreferredSlots(drawSize) {
  return [0, drawSize - 1, Math.floor(drawSize / 2), Math.floor(drawSize / 2) - 1]
    .filter((slot, index, list) => slot >= 0 && slot < drawSize && list.indexOf(slot) === index);
}

function chooseDirectSlotsForAccessHeavyDraw(drawSize, directCount) {
  const slots = [];
  const used = new Set();
  const usedPairs = new Set();
  const addSlot = (slot) => {
    if (slots.length >= directCount || used.has(slot) || slot < 0 || slot >= drawSize) return;
    slots.push(slot);
    used.add(slot);
    usedPairs.add(slotPairIndex(slot));
  };
  seedPreferredSlots(drawSize).forEach(addSlot);
  for (let slot = 0; slot < drawSize; slot += 1) {
    if (!usedPairs.has(slotPairIndex(slot))) addSlot(slot);
  }
  for (let slot = 0; slot < drawSize; slot += 1) addSlot(slot);
  return slots;
}

function slotsOnSide(drawSize, side) {
  const start = side === "left" ? 0 : drawSize / 2;
  const end = side === "left" ? drawSize / 2 : drawSize;
  return Array.from({ length: end - start }, (_, index) => start + index);
}

function buildIncomingQueueForSide(drawSize, side, directSlots, needed, usedIncoming) {
  const directSet = new Set(directSlots);
  const sideSlots = slotsOnSide(drawSize, side);
  const queue = [];
  const add = (slot) => {
    if (queue.length >= needed) return;
    if (slot < 0 || slot >= drawSize || directSet.has(slot) || usedIncoming.has(slot) || queue.includes(slot)) return;
    queue.push(slot);
  };

  sideSlots
    .map((slot) => ({ slot, opposite: oppositeSlotIndex(slot) }))
    .filter(({ opposite }) => directSet.has(opposite))
    .forEach(({ slot }) => add(slot));

  for (let index = 0; index < sideSlots.length && queue.length < needed; index += 1) {
    const first = sideSlots[index];
    const second = oppositeSlotIndex(first);
    if (first > second || !sideSlots.includes(second)) continue;
    if (directSet.has(first) || directSet.has(second)) continue;
    add(first);
    add(second);
  }

  return queue;
}

function chooseIncomingSlotsWithIncomingPairs(drawSize, incomingCount, directCount) {
  const directSlots = chooseDirectSlotsForAccessHeavyDraw(drawSize, directCount);
  const leftNeeded = Math.ceil(incomingCount / 2);
  const rightNeeded = incomingCount - leftNeeded;
  const usedIncoming = new Set();
  const leftQueue = buildIncomingQueueForSide(drawSize, "left", directSlots, leftNeeded, usedIncoming);
  leftQueue.forEach((slot) => usedIncoming.add(slot));
  const rightQueue = buildIncomingQueueForSide(drawSize, "right", directSlots, rightNeeded, usedIncoming);
  rightQueue.forEach((slot) => usedIncoming.add(slot));
  const fallback = Array.from({ length: drawSize }, (_, slot) => slot)
    .filter((slot) => !directSlots.includes(slot) && !usedIncoming.has(slot));
  const slots = [];
  for (let index = 0; index < incomingCount; index += 1) {
    const side = sideForIncomingIndex(index, incomingCount);
    const queue = side === "left" ? leftQueue : rightQueue;
    slots.push(queue.shift() ?? fallback.shift());
  }
  return slots.every((slot) => Number.isInteger(slot)) ? slots : null;
}

function chooseIncomingSlots(drawSize, incomingCount, directCount) {
  if (directCount >= incomingCount) {
    return chooseIncomingSlotsWithWaitingEntrants(drawSize, incomingCount);
  }
  return chooseIncomingSlotsWithIncomingPairs(drawSize, incomingCount, directCount);
}

function placeDirectEntrantsAroundReservedSlots(directEntrants, drawSize, reservedSlots) {
  const slots = Array.from({ length: drawSize }, () => null);
  const reserved = new Set(reservedSlots);
  const rankedPlayers = sortByRanking(directEntrants.filter((entrant) => entrant?.id));
  const seedPositions = seedPreferredSlots(drawSize);

  rankedPlayers.slice(0, 4).forEach((player, index) => {
    const preferred = seedPositions[index];
    const target = !reserved.has(preferred) && !slots[preferred]
      ? preferred
      : slots.findIndex((slot, slotIndex) => !slot && !reserved.has(slotIndex));
    if (target >= 0) slots[target] = player;
  });

  const placedIds = new Set(slots.filter((slot) => slot?.id).map((slot) => slot.id));
  const remaining = [
    ...sortByRanking(directEntrants.filter((entrant) => entrant?.id && !placedIds.has(entrant.id))),
    ...directEntrants.filter((entrant) => !entrant?.id),
  ];

  slots.forEach((slot, index) => {
    if (!slot && !reserved.has(index)) slots[index] = remaining.shift() || "A definir";
  });

  return slots;
}

function samePreliminarySource(playerA, playerB) {
  return Boolean(playerA?.preliminaryMatchId && playerA.preliminaryMatchId === playerB?.preliminaryMatchId);
}

function pairHasSamePreliminarySource(slots, pairIndex) {
  return samePreliminarySource(slots[pairIndex * 2], slots[pairIndex * 2 + 1]);
}

function isTopProtectedSeed(player) {
  return Number(player?.ranking || 9999) <= 2;
}

function isFixedIncomingSlot(slot) {
  return isIncomingWinnerSlot(slot);
}

function avoidImmediatePreliminaryRematches(slots) {
  const arranged = [...slots];
  const pairCount = arranged.length / 2;
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    if (!pairHasSamePreliminarySource(arranged, pairIndex)) continue;
    const pairSlots = [pairIndex * 2, pairIndex * 2 + 1]
      .sort((a, b) => Number(isTopProtectedSeed(arranged[a])) - Number(isTopProtectedSeed(arranged[b])));
    let fixed = false;
    for (const sourceSlot of pairSlots) {
      if (isFixedIncomingSlot(arranged[sourceSlot])) continue;
      const targetSlots = Array.from({ length: arranged.length }, (_, targetSlot) => targetSlot)
        .sort((a, b) => Number(isTopProtectedSeed(arranged[a])) - Number(isTopProtectedSeed(arranged[b])));
      for (const targetSlot of targetSlots) {
        if (pairSlots.includes(targetSlot)) continue;
        if (isFixedIncomingSlot(arranged[targetSlot])) continue;
        const targetPairIndex = Math.floor(targetSlot / 2);
        const next = [...arranged];
        [next[sourceSlot], next[targetSlot]] = [next[targetSlot], next[sourceSlot]];
        if (!pairHasSamePreliminarySource(next, pairIndex) && !pairHasSamePreliminarySource(next, targetPairIndex)) {
          arranged[sourceSlot] = next[sourceSlot];
          arranged[targetSlot] = next[targetSlot];
          fixed = true;
          break;
        }
      }
      if (fixed) break;
    }
  }
  return arranged;
}

function placeRoundEntrants(entrants, drawSize) {
  const incoming = entrants.filter(isIncomingWinnerSlot);
  if (!incoming.length) return avoidImmediatePreliminaryRematches(placeSeededEntrants(entrants, drawSize));
  const directEntrants = entrants.filter((entrant) => !isIncomingWinnerSlot(entrant));
  if (drawSize % 4 !== 0) return avoidImmediatePreliminaryRematches(placeSeededEntrants(entrants, drawSize));
  const incomingSlots = chooseIncomingSlots(drawSize, incoming.length, directEntrants.length);
  if (!incomingSlots) return avoidImmediatePreliminaryRematches(placeSeededEntrants(entrants, drawSize));
  const slots = placeDirectEntrantsAroundReservedSlots(directEntrants, drawSize, incomingSlots);
  incoming.forEach((entrant, index) => {
    slots[incomingSlots[index]] = entrant;
  });
  if (slots.some((slot) => !slot)) return avoidImmediatePreliminaryRematches(placeSeededEntrants(entrants, drawSize));
  return avoidImmediatePreliminaryRematches(slots);
}

function makePairedRound(stage, roundId, roundName, entrants, connectionNote, options = {}) {
  const slots = placeRoundEntrants(entrants, entrants.length);
  const matches = [];
  for (let index = 0; index < slots.length; index += 2) {
    const matchIndex = matches.length + 1;
    matches.push(makeBracketMatch(`${stage.categoryId}-${roundId}-${matchIndex}`, slots[index], slots[index + 1], {
      connectionNote,
      structuralPlaceholder: Boolean(options.structuralPlaceholder),
      sportingSlotKey: `${stage.categoryId}:${roundId}:${matchIndex}`,
    }));
  }
  return { id: `${stage.categoryId}-${roundId}`, name: roundName, matches };
}

function buildFutureRounds(stage, drawSize, firstRoundIndex = 1) {
  const allNames = nextMainRoundNames(drawSize);
  const names = allNames.slice(firstRoundIndex);
  let matchCount = drawSize / 4;
  return names.map((name, roundOffset) => {
    const previousRoundName = allNames[firstRoundIndex + roundOffset - 1];
    const count = Math.max(1, matchCount / (2 ** roundOffset));
    return {
      id: `${stage.categoryId}-${name.toLowerCase()}-${roundOffset + 1}`,
      name,
      matches: Array.from({ length: count }, (_, index) => makeBracketMatch(
        `${stage.categoryId}-${name}-${index + 1}`,
        `Ganador ${previousRoundName} ${index * 2 + 1}`,
        `Ganador ${previousRoundName} ${index * 2 + 2}`,
      )),
    };
  });
}

function getPreliminaryMainDrawSize(participantCount) {
  return getOfficialPreliminaryRule(participantCount)?.mainDrawSize || (participantCount >= 33 ? 32 : largestStandardDraw(participantCount));
}

const PRELIMINARY_POST_RULES = Object.freeze({
  ALL_TO_MAIN: "ALL_TO_MAIN",
  ALL_TO_ACCESS: "ALL_TO_ACCESS",
  TOP_ALL_BY_PERFORMANCE: "TOP_ALL_BY_PERFORMANCE",
  TOP_GENERAL_RANKING: "TOP_GENERAL_RANKING",
  WINNERS_AND_TOP_LOSERS: "WINNERS_AND_TOP_LOSERS",
  TOP_WINNERS: "TOP_WINNERS",
  SPECIAL_30: "SPECIAL_30",
});

const OFFICIAL_PRELIMINARY_RULES = Object.freeze({
  8: { mainDrawSize: 8, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.ALL_TO_MAIN, directCount: 8, accessMatches: 0 },
  9: { mainDrawSize: 8, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 6, accessMatches: 1 },
  10: { mainDrawSize: 8, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 6, accessMatches: 2 },
  11: { mainDrawSize: 8, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 4, accessMatches: 3 },
  12: { mainDrawSize: 8, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 4, accessMatches: 4 },
  13: { mainDrawSize: 8, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 2, accessMatches: 5 },
  14: { mainDrawSize: 8, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 2, accessMatches: 6 },
  15: { mainDrawSize: 8, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.ALL_TO_ACCESS, directCount: 0, accessMatches: 7 },
  16: { mainDrawSize: 16, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.ALL_TO_MAIN, directCount: 16, accessMatches: 0 },
  17: { mainDrawSize: 16, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 6, accessMatches: 1 },
  18: { mainDrawSize: 16, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 5, accessMatches: 2 },
  19: { mainDrawSize: 16, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 3, accessMatches: 3 },
  20: { mainDrawSize: 16, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 2, accessMatches: 4 },
  21: { mainDrawSize: 16, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 0, accessMatches: 5 },
  22: { mainDrawSize: 16, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 10, accessMatches: 6 },
  23: { mainDrawSize: 16, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 8, accessMatches: 7 },
  24: { mainDrawSize: 16, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 8, accessMatches: 8 },
  25: { mainDrawSize: 16, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_WINNERS, directWinners: 6, accessMatches: 9 },
  26: { mainDrawSize: 16, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 6, accessMatches: 10 },
  27: { mainDrawSize: 16, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 4, accessMatches: 11 },
  28: { mainDrawSize: 16, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_GENERAL_RANKING, directCount: 4, accessMatches: 12 },
  29: { mainDrawSize: 16, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 2, accessMatches: 13 },
  30: { mainDrawSize: 16, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.SPECIAL_30, directCount: 0, accessMatches: 15, classifierMatches: 1 },
  31: { mainDrawSize: 16, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.ALL_TO_ACCESS, directCount: 0, accessMatches: 15 },
  32: { mainDrawSize: 32, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.ALL_TO_MAIN, directCount: 32, accessMatches: 0 },
  33: { mainDrawSize: 32, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 30, accessMatches: 1 },
  34: { mainDrawSize: 32, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 30, accessMatches: 2 },
  35: { mainDrawSize: 32, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 28, accessMatches: 3 },
  36: { mainDrawSize: 32, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, directCount: 28, accessMatches: 4 },
  37: { mainDrawSize: 32, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 8, accessMatches: 5 },
  38: { mainDrawSize: 32, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 7, accessMatches: 6 },
  39: { mainDrawSize: 32, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 5, accessMatches: 7 },
  40: { mainDrawSize: 32, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 4, accessMatches: 8 },
  41: { mainDrawSize: 32, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 2, accessMatches: 9 },
  42: { mainDrawSize: 32, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, directLosers: 1, accessMatches: 10 },
  43: { mainDrawSize: 32, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_WINNERS, directWinners: 20, accessMatches: 11 },
  44: { mainDrawSize: 32, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_WINNERS, directWinners: 20, accessMatches: 12 },
  45: { mainDrawSize: 32, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_WINNERS, directWinners: 18, accessMatches: 13 },
  46: { mainDrawSize: 32, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_WINNERS, directWinners: 18, accessMatches: 14 },
  47: { mainDrawSize: 32, preGeneralByes: 1, postRule: PRELIMINARY_POST_RULES.TOP_WINNERS, directWinners: 16, accessMatches: 15 },
  48: { mainDrawSize: 32, preGeneralByes: 0, postRule: PRELIMINARY_POST_RULES.TOP_WINNERS, directWinners: 16, accessMatches: 16 },
});

export function getOfficialPreliminaryRule(participantCount) {
  const count = Number(participantCount || 0);
  const rule = OFFICIAL_PRELIMINARY_RULES[count];
  if (!rule) return null;
  const preliminaryPlayers = count - Number(rule.preGeneralByes || 0);
  return {
    participants: count,
    preliminaryPlayers,
    preliminaryMatches: preliminaryPlayers / 2,
    accessRoundName: rule.accessMatches ? previousAccessRoundName(rule.mainDrawSize) : null,
    firstMainRoundName: nextMainRoundNames(rule.mainDrawSize)[0],
    ...rule,
  };
}

function buildPreliminaryPlan(participantCount) {
  const count = Number(participantCount || 0);
  const officialRule = getOfficialPreliminaryRule(count);
  if (!officialRule) {
    return {
      participants: count,
      supported: false,
      mainDrawSize: 0,
      preliminaryByes: 0,
      preliminaryMatches: 0,
      directWinners: 0,
      directLosers: 0,
      accessMatches: 0,
      accessPlayers: 0,
      eliminatedLosers: 0,
      accessRoundName: null,
      firstMainRoundName: null,
    };
  }
  const mainDrawSize = officialRule.mainDrawSize;
  const preliminaryByes = officialRule.preGeneralByes;
  const preliminaryMatches = officialRule.preliminaryMatches;
  const directWinners = officialRule.postRule === PRELIMINARY_POST_RULES.ALL_TO_MAIN
    ? preliminaryMatches
    : [PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS, PRELIMINARY_POST_RULES.TOP_WINNERS].includes(officialRule.postRule)
      ? Number(officialRule.directWinners ?? preliminaryMatches)
      : 0;
  const directLosers = officialRule.postRule === PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS
    ? Number(officialRule.directLosers || 0)
    : 0;
  const directPlayers = [PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE, PRELIMINARY_POST_RULES.TOP_GENERAL_RANKING].includes(officialRule.postRule)
    ? Number(officialRule.directCount || 0)
    : officialRule.postRule === PRELIMINARY_POST_RULES.ALL_TO_MAIN
      ? officialRule.preliminaryPlayers
      : 0;
  const accessMatches = Number(officialRule.accessMatches || 0);
  const accessPlayers = accessMatches * 2;
  const expectedMainSlots = Number(officialRule.preGeneralByes || 0)
    + directWinners
    + directLosers
    + directPlayers
    + accessMatches
    + (officialRule.postRule === PRELIMINARY_POST_RULES.SPECIAL_30 ? 16 : 0);
  return {
    participants: count,
    supported: true,
    mainDrawSize,
    preliminaryByes,
    preliminaryMatches,
    directWinners,
    directPlayers,
    directLosers,
    accessMatches,
    accessPlayers,
    eliminatedLosers: 0,
    postRule: officialRule.postRule,
    classifierMatches: Number(officialRule.classifierMatches || 0),
    expectedMainSlots,
    accessRoundName: officialRule.accessRoundName,
    firstMainRoundName: officialRule.firstMainRoundName,
  };
}

function directPlaceholderLabel(plan, index) {
  if (plan.postRule === PRELIMINARY_POST_RULES.TOP_GENERAL_RANKING) return `BYE Ranking General ${index + 1}`;
  if (plan.postRule === PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE) return `Mejor rendimiento preliminar ${index + 1}`;
  if (plan.postRule === PRELIMINARY_POST_RULES.TOP_WINNERS) return `Mejor ganador preliminar ${index + 1}`;
  if (plan.postRule === PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS) {
    const directWinners = Number(plan.directWinners || 0);
    if (index < directWinners) return `Ganador preliminar ${index + 1}`;
    return `Mejor perdedor ${index - directWinners + 1}`;
  }
  return `Clasificado directo ${index + 1}`;
}

function buildPreliminaryMainEntrants(stage, plan, { byePlayers = [], directEntrants = [], placeholders = false } = {}) {
  const byeEntrants = placeholders
    ? byePlayers.map((player) => ({ ...player, testNote: "BYE por Ranking General" }))
    : byePlayers.map((player) => ({ ...player, testNote: "BYE preliminar" }));
  const directCount = plan.postRule === PRELIMINARY_POST_RULES.SPECIAL_30
    ? 0
    : Math.max(0, plan.mainDrawSize - byeEntrants.length - plan.accessMatches);
  const direct = placeholders
    ? Array.from({ length: directCount }, (_, index) => directPlaceholderLabel(plan, index))
    : directEntrants.map((player) => ({ ...player, testNote: player.testNote || "Clasificado directo" }));
  const accessEntrants = plan.accessMatches
    ? Array.from({ length: plan.accessMatches }, (_, index) => `Ganador ${plan.accessRoundName} ${index + 1}`)
    : [];
  const entrants = [...byeEntrants, ...direct, ...accessEntrants];
  while (entrants.length < plan.mainDrawSize) entrants.push(`Clasificado ${entrants.length + 1}`);
  return entrants.slice(0, plan.mainDrawSize);
}

function buildPreliminaryAccessRound(stage, plan, players = []) {
  if (!plan.accessMatches) return null;
  const accessSlots = [];
  Array.from({ length: plan.accessMatches }, (_, index) => {
    const leftIndex = index;
    const rightIndex = (plan.accessPlayers || plan.accessMatches * 2) - index - 1;
    accessSlots.push(
      players[leftIndex] || `Perdedor clasificado ${leftIndex + 1}`,
      players[rightIndex] || `Perdedor clasificado ${rightIndex + 1}`,
    );
  });
  const arrangedSlots = avoidImmediatePreliminaryRematches(accessSlots);
  const matches = Array.from({ length: plan.accessMatches }, (_, index) => {
    const playerA = arrangedSlots[index * 2];
    const playerB = arrangedSlots[index * 2 + 1];
    return makeBracketMatch(`${stage.categoryId}-${plan.accessRoundName}-${index + 1}`, playerA, playerB, {
      connectionNote: "Los perdedores clasificados definen los ultimos lugares del cuadro principal",
    });
  });
  return {
    id: `${stage.categoryId}-${plan.accessRoundName}`,
    name: plan.accessRoundName,
    matches,
  };
}

function buildSpecial30ClassifierRound(stage) {
  return {
    id: `${stage.categoryId}-clasificatorio-perdedores-16avos`,
    name: "Clasificatorio",
    skipIncomingFallback: true,
    matches: [
      makeBracketMatch(`${stage.categoryId}-clasificatorio-1`, "Mejor perdedor 16avos 1", "Mejor perdedor 16avos 2", {
        connectionNote: "Los dos mejores perdedores de 16avos definen el ultimo lugar de 8vos",
        sportingSlotKey: `${stage.categoryId}:preliminary-classifier:1`,
      }),
    ],
  };
}

function buildSpecial30MainRound(stage) {
  const entrants = [
    ...Array.from({ length: 15 }, (_, index) => `Ganador 16avos ${index + 1}`),
    "Ganador Clasificatorio 1",
  ];
  return makePairedRound(stage, "pre-main-1", "8vos", entrants, "8vos desde 16avos y clasificatorio de perdedores");
}

function withoutPlayers(players = [], excluded = []) {
  const excludedIds = new Set(excluded.map((player) => player?.id).filter(Boolean));
  return players.filter((player) => !excludedIds.has(player?.id));
}

function sortAccessPlayersForWinnerLoserPriority(players = []) {
  const winners = players.filter((player) => player.preliminaryRole === "winner");
  const losers = players.filter((player) => player.preliminaryRole === "loser");
  return [...winners, ...losers];
}

function selectOfficialPreliminaryEntrants(plan, { winners = [], losers = [] } = {}) {
  const allRanked = [...winners, ...losers].sort(comparePreliminaryPerformance);
  const byGeneralRanking = sortByRanking(allRanked);
  let directEntrants = [];
  let accessPlayers = [];
  let eliminatedPlayers = [];

  if (plan.postRule === PRELIMINARY_POST_RULES.ALL_TO_MAIN) {
    directEntrants = allRanked;
  } else if (plan.postRule === PRELIMINARY_POST_RULES.ALL_TO_ACCESS) {
    accessPlayers = allRanked;
  } else if (plan.postRule === PRELIMINARY_POST_RULES.TOP_ALL_BY_PERFORMANCE) {
    directEntrants = allRanked.slice(0, plan.directPlayers);
    accessPlayers = allRanked.slice(plan.directPlayers);
  } else if (plan.postRule === PRELIMINARY_POST_RULES.TOP_GENERAL_RANKING) {
    directEntrants = byGeneralRanking.slice(0, plan.directPlayers).map((player) => ({
      ...player,
      testNote: "BYE por Ranking General",
    }));
    accessPlayers = withoutPlayers(allRanked, directEntrants);
  } else if (plan.postRule === PRELIMINARY_POST_RULES.WINNERS_AND_TOP_LOSERS) {
    const directLosers = losers.slice(0, plan.directLosers);
    directEntrants = [
      ...winners.map((player) => ({ ...player, testNote: "Ganador preliminar" })),
      ...directLosers.map((player) => ({ ...player, testNote: "Mejor perdedor" })),
    ];
    accessPlayers = losers.slice(plan.directLosers);
  } else if (plan.postRule === PRELIMINARY_POST_RULES.TOP_WINNERS) {
    const directWinners = winners.slice(0, plan.directWinners);
    directEntrants = directWinners.map((player) => ({ ...player, testNote: "Mejor ganador preliminar" }));
    accessPlayers = [
      ...winners.slice(plan.directWinners),
      ...losers,
    ];
  } else if (plan.postRule === PRELIMINARY_POST_RULES.SPECIAL_30) {
    accessPlayers = allRanked;
  }

  const expectedAccessPlayers = plan.accessMatches * 2;
  if (accessPlayers.length > expectedAccessPlayers) {
    eliminatedPlayers = accessPlayers.slice(expectedAccessPlayers);
    accessPlayers = accessPlayers.slice(0, expectedAccessPlayers);
  }

  return {
    directEntrants,
    accessPlayers: sortAccessPlayersForWinnerLoserPriority(accessPlayers),
    eliminatedPlayers,
  };
}

function buildDirectElimination(db, tournament, stage, players, options = {}) {
  const sorted = sortByRanking(players);
  const baseDrawSize = players.length <= 4 ? Math.max(2, players.length) : largestStandardDraw(players.length);
  const accessMatchCount = Math.max(0, players.length - baseDrawSize);
  const previousPlayersCount = accessMatchCount * 2;
  const previousPlayers = previousPlayersCount ? sorted.slice(-previousPlayersCount) : [];
  const directPlayers = previousPlayersCount ? sorted.slice(0, sorted.length - previousPlayersCount) : sorted;
  const rounds = [];
  const previousWinnerSlots = [];
  const accessRoundName = previousAccessRoundName(baseDrawSize);
  const directByes = previousPlayersCount
    ? directPlayers.map((player, index) => {
        const match = createByeMatch(db, tournament, stage, player, accessRoundName, index);
        return {
          playerId: player.id,
          player: player.fullName,
          source: "Ranking General",
          score: "6-0 / 6-0",
          matchId: match.id,
        };
      })
    : [];

  if (previousPlayers.length) {
    const previousMatches = [];
    for (let index = 0; index < previousPlayers.length; index += 2) {
      const matchIndex = previousMatches.length + 1;
      previousMatches.push(makeBracketMatch(`${stage.categoryId}-${accessRoundName}-${matchIndex}`, options.flexibleSkeleton ? null : previousPlayers[index], options.flexibleSkeleton ? null : previousPlayers[index + 1], {
        connectionNote: "Primera instancia para completar la llave con BYE por Ranking General",
        structuralPlaceholder: Boolean(options.flexibleSkeleton),
        sportingSlotKey: `${stage.categoryId}:direct-access:${matchIndex}`,
      }));
      previousWinnerSlots.push(`Ganador ${accessRoundName} ${previousMatches.length}`);
    }
    const previousRound = { id: `${stage.categoryId}-${accessRoundName}`, name: accessRoundName, matches: previousMatches };
    previousRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, previousRound, match, index, "Cuadro principal", { structuralPlaceholder: options.flexibleSkeleton }));
    rounds.push(previousRound);
  }

  const mainEntrants = [...directPlayers.map((player) => ({ ...player, testNote: "BYE por Ranking General" })), ...previousWinnerSlots];
  const mainRoundNames = nextMainRoundNames(baseDrawSize);
  const firstMainEntrants = options.flexibleSkeleton && !previousPlayers.length
    ? Array.from({ length: baseDrawSize }, (_, index) => `Flexible ${index + 1}`)
    : mainEntrants;
  const firstMainRound = makePairedRound(stage, "main-1", mainRoundNames[0], firstMainEntrants, "Cuadro principal de eliminacion directa", {
    structuralPlaceholder: Boolean(options.flexibleSkeleton && !previousPlayers.length),
  });
  firstMainRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, firstMainRound, match, index, "Cuadro principal", {
    structuralPlaceholder: Boolean(options.flexibleSkeleton && !previousPlayers.length),
  }));
  rounds.push(firstMainRound, ...buildFutureRounds(stage, baseDrawSize));
  return { rounds, directByes };
}

function buildPreliminaries(db, tournament, stage, players, options = {}) {
  const sorted = sortByRanking(players);
  const preliminaryBye = sorted.length % 2 === 1 ? sorted[0] : null;
  const playablePlayers = preliminaryBye ? sorted.slice(1) : sorted;
  const pairs = makeProtectedPreliminaryPairs(playablePlayers, options);

  const byeEntry = preliminaryBye ? (() => {
    const match = createByeMatch(db, tournament, stage, preliminaryBye, "Preliminar", 0);
    return [{
      matchId: match.id,
      playerA: preliminaryBye.fullName,
      playerB: "BYE",
      status: "Bye preliminar",
      result: "Clasifica directo por ranking de categoria",
      winner: preliminaryBye.fullName,
      bye: true,
      byePlayerId: preliminaryBye.id,
    }];
  })() : [];

  return [
    ...byeEntry,
    ...pairs.map(([playerA, playerB], index) => {
      const bracketMatch = makeBracketMatch(`${stage.categoryId}-pre-${index + 1}`, options.flexibleSkeleton ? null : playerA, options.flexibleSkeleton ? null : playerB, {
        structuralPlaceholder: Boolean(options.flexibleSkeleton),
        sportingSlotKey: `${stage.categoryId}:preliminary:${index + 1}`,
      });
      const round = { id: `${stage.categoryId}-preliminar`, name: "Preliminar" };
      const match = createMatchFromBracket(db, tournament, stage, round, bracketMatch, index, "Preliminar", {
        structuralPlaceholder: options.flexibleSkeleton,
        persistPlaceholder: options.flexibleSkeleton,
      });
      return {
        matchId: match?.id,
        playerA: options.flexibleSkeleton ? "A definir" : playerA.fullName,
        playerB: options.flexibleSkeleton ? "A definir" : playerB.fullName,
        status: match?.status || "Pendiente",
        structuralPlaceholder: Boolean(options.flexibleSkeleton),
      };
    }),
  ];
}

function buildPreliminarySkeletonRounds(stage, players) {
  const sorted = sortByRanking(players);
  const plan = buildPreliminaryPlan(sorted.length);
  if (!plan.supported) return [];
  const rounds = [];
  const preliminaryBye = plan.preliminaryByes ? sorted[0] : null;
  const accessRound = buildPreliminaryAccessRound(stage, plan);
  if (accessRound) rounds.push(accessRound);
  if (plan.postRule === PRELIMINARY_POST_RULES.SPECIAL_30) {
    const classifierRound = buildSpecial30ClassifierRound(stage);
    const firstMainRound = buildSpecial30MainRound(stage);
    rounds.push(classifierRound, firstMainRound, ...buildFutureRounds(stage, plan.mainDrawSize, 1));
    return rounds;
  }
  const entrants = buildPreliminaryMainEntrants(stage, plan, {
    byePlayers: preliminaryBye ? [preliminaryBye] : [],
    placeholders: true,
  });
  const firstMainRound = makePairedRound(stage, "pre-main-1", plan.firstMainRoundName, entrants, "Cruce pendiente del ranking preliminar");
  rounds.push(firstMainRound, ...buildFutureRounds(stage, plan.mainDrawSize));
  return rounds;
}

export function buildPreliminaryBracketFromResults(db, tournament, categoryId) {
  const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
  if (!stage) return null;
  const prelimMatches = db.matches
    .filter((match) => match.tournamentId === tournament.id && match.categoryId === categoryId && (match.phase === "Preliminar" || (match.phase === "BYE" && match.round === "Preliminar")))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (!prelimMatches.length || prelimMatches.some((match) => match.status !== "Finalizado" || !match.winnerId)) return null;
  db.matches = db.matches.filter((match) => !(match.tournamentId === tournament.id && match.categoryId === categoryId && match.phase !== "Preliminar" && !match.result));
  const byeMatches = prelimMatches.filter((match) => match.bye || match.resultDetail?.type === "BYE" || match.playerB === "BYE" || !match.playerBId);
  const playablePrelimMatches = prelimMatches.filter((match) => !byeMatches.includes(match));
  const participantCount = stage.participants?.length || (playablePrelimMatches.length * 2) + byeMatches.length;
  const plan = buildPreliminaryPlan(participantCount);
  if (!plan.supported) return null;
  const byePlayers = byeMatches.map((match) => ({
    id: match.winnerId,
    fullName: match.playerA,
    avatar: match.playerAAvatar,
    ranking: getPlayerById(db, match.winnerId)?.ranking || 1,
    testNote: "BYE por Ranking General",
  }));

  const winners = playablePrelimMatches.map((match, index) => {
    const winnerIsA = match.winnerId === match.playerAId;
    return {
      id: match.winnerId,
      fullName: winnerIsA ? match.playerA : match.playerB,
      avatar: winnerIsA ? match.playerAAvatar : match.playerBAvatar,
      ranking: getPlayerById(db, match.winnerId)?.ranking || index + 1,
      performance: getPreliminaryPerformance(match, match.winnerId),
      preliminaryRole: "winner",
      preliminaryMatchId: match.id,
      testNote: "Ganador preliminar",
    };
  }).sort(comparePreliminaryPerformance);

  const losers = playablePrelimMatches.map((match, index) => {
    const loserId = match.winnerId === match.playerAId ? match.playerBId : match.playerAId;
    return {
      id: loserId,
      fullName: match.winnerId === match.playerAId ? match.playerB : match.playerA,
      avatar: match.winnerId === match.playerAId ? match.playerBAvatar : match.playerAAvatar,
      ranking: getPlayerById(db, loserId)?.ranking || index + winners.length + 1,
      performance: getPreliminaryPerformance(match, loserId),
      preliminaryRole: "loser",
      preliminaryMatchId: match.id,
      testNote: "Perdedor clasificado",
    };
  }).filter((player) => player.id).sort(comparePreliminaryPerformance);

  const {
    directEntrants,
    accessPlayers,
    eliminatedPlayers,
  } = selectOfficialPreliminaryEntrants(plan, { winners, losers });

  const rounds = [];
  const accessRound = buildPreliminaryAccessRound(stage, plan, accessPlayers);
  if (accessRound) {
    accessRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, accessRound, match, index));
    rounds.push(accessRound);
  }

  if (plan.postRule === PRELIMINARY_POST_RULES.SPECIAL_30) {
    const classifierRound = buildSpecial30ClassifierRound(stage);
    classifierRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, classifierRound, match, index));
    const firstMainRound = buildSpecial30MainRound(stage);
    firstMainRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, firstMainRound, match, index));
    rounds.push(classifierRound, firstMainRound, ...buildFutureRounds(stage, plan.mainDrawSize, 1));
  } else {
    const entrants = buildPreliminaryMainEntrants(stage, plan, {
      byePlayers,
      directEntrants,
    });
    const firstMainRound = makePairedRound(stage, "main-preliminar", plan.firstMainRoundName, entrants, "Cuadro principal desde preliminares");
    firstMainRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, firstMainRound, match, index));
    rounds.push(firstMainRound, ...buildFutureRounds(stage, plan.mainDrawSize));
  }

  const bracket = {
    tournamentId: tournament.id,
    categoryId,
    category: stage.categoryName,
    format: "Preliminar",
    preliminaries: prelimMatches.map((match) => ({
      matchId: match.id,
      playerA: match.playerA,
      playerB: match.playerB,
      status: match.status,
      result: match.result,
      winner: match.winnerId === match.playerAId ? match.playerA : match.playerB,
    })),
    preliminarySummary: {
      participants: participantCount,
      preliminaryByes: byePlayers.length,
      winners: winners.length,
      losers: losers.length,
      directEntrants: directEntrants.length,
      directWinners: directEntrants.filter((player) => player.preliminaryRole === "winner").length,
      directLosers: directEntrants.filter((player) => player.preliminaryRole === "loser").length,
      accessMatches: plan.accessMatches,
      accessPlayers: accessPlayers.length,
      eliminatedPlayers: eliminatedPlayers.length,
      eliminatedLosers: eliminatedPlayers.filter((player) => player.preliminaryRole === "loser").length,
      previousRoundPlayers: accessPlayers.length,
      mainDrawSize: plan.mainDrawSize,
      firstMainRoundName: plan.firstMainRoundName,
      postRule: plan.postRule,
    },
    zones: [],
    rounds,
  };

  db.brackets[stage.bracketKey] = bracket;
  db.brackets[`${tournament.id}::${categoryId}`] = bracket;
  stage.status = "Cuadro generado";
  return bracket;
}

function buildZones(db, tournament, stage, players, options = {}) {
  const sorted = sortByRanking(players);
  const distribution = proposeZoneDistribution(sorted.length);
  const defaultQualifierCounts = getDefaultZoneQualifierCounts(distribution);
  const zoneAssignments = distributeSeededPlayersIntoZones(sorted, distribution, options);
  const zones = distribution.map((size, index) => {
    const zonePlayers = zoneAssignments[index] || [];
    const zoneId = `${stage.categoryId}-zone-${index + 1}`;
    const configuredQualifiers = stage.zonesConfig?.zoneQualifiers?.[zoneId] ?? stage.zonesConfig?.qualifiers;
    return {
      id: zoneId,
      name: `Zona ${String.fromCharCode(65 + index)}`,
      players: zonePlayers.map((player) => player.fullName),
      playerIds: zonePlayers.map((player) => player.id),
      seedOrders: zonePlayers.map((player) => Number(player.ranking || 9999)),
      size,
      qualifiers: normalizeZoneQualifierCount(configuredQualifiers || defaultQualifierCounts[index] || 1),
      status: "Pendiente de clasificacion",
      standingsResolved: false,
    };
  });

  zones.forEach((zone, zoneIndex) => {
    const zonePlayers = zoneAssignments[zoneIndex] || [];
    for (let a = 0; a < zonePlayers.length; a += 1) {
      for (let b = a + 1; b < zonePlayers.length; b += 1) {
        const bracketMatch = makeBracketMatch(`${zone.id}-match-${a}-${b}`, zonePlayers[a], zonePlayers[b], {
          connectionNote: `${zone.name}: todos contra todos`,
        });
        createMatchFromBracket(db, tournament, stage, { id: zone.id, name: zone.name }, bracketMatch, b, "Zonas");
      }
    }
  });

  return zones;
}

function getDefaultZoneQualifierCounts(distribution = []) {
  const counts = distribution.map(() => 1);
  if (counts.length <= 1) return counts;
  if (counts.length >= 8) return counts;
  const maxQualifiers = counts.length * ZONE_MAX_QUALIFIERS_PER_ZONE;
  const targetQualifiers = maxQualifiers >= 8 ? 8 : Math.min(4, maxQualifiers);
  let missing = Math.max(0, targetQualifiers - counts.reduce((total, count) => total + count, 0));
  const priority = distribution
    .map((size, index) => ({ size, index }))
    .sort((a, b) => b.size - a.size || a.index - b.index);
  while (missing > 0) {
    let changed = false;
    for (const { index } of priority) {
      if (counts[index] >= ZONE_MAX_QUALIFIERS_PER_ZONE) continue;
      counts[index] += 1;
      missing -= 1;
      changed = true;
      if (missing === 0) break;
    }
    if (!changed) break;
  }
  return counts;
}

function orderTwoZoneSemifinalQualifiers(qualifiers = [], zoneResolutions = []) {
  if (zoneResolutions.length !== 2) return null;
  const [zoneA, zoneB] = zoneResolutions.map((zone) =>
    qualifiers
      .filter((player) => player.zoneId === zone.zoneId)
      .sort((a, b) => Number(a.zonePosition || 9999) - Number(b.zonePosition || 9999))
  );
  if (zoneA.length < 2 || zoneB.length < 2) return null;
  return [zoneA[0], zoneB[1], zoneB[0], zoneA[1]];
}

function compareZoneCandidatePerformance(playerA, playerB) {
  return compareZonePerformance(playerA, playerB)
    || Number(playerA.ranking ?? 9999) - Number(playerB.ranking ?? 9999)
    || String(playerA.fullName || playerA.name || playerA.player || playerA.id || "").localeCompare(String(playerB.fullName || playerB.name || playerB.player || playerB.id || ""), undefined, { numeric: true });
}

function sortZoneCandidatesByPerformance(players = []) {
  return [...players].sort(compareZoneCandidatePerformance);
}

function isZoneResolved(zone) {
  if (typeof zone?.standingsResolved === "boolean") return zone.standingsResolved;
  if (["finished", "Finalizada"].includes(zone?.status)) return true;
  const size = Number(zone?.size || zone?.playerIds?.length || zone?.players?.length || zone?.standings?.length || 0);
  const expectedPlayed = Math.max(0, size - 1);
  return Boolean(size > 1 && zone?.standings?.length && zone.standings.every((standing) => Number(standing.played || 0) >= expectedPlayed));
}

function ordinal(value) {
  return `${value}°`;
}

function makeZonePlaceholder({ zone, zonePosition, label = null, sourceType = "zone-position", sportOrder = null, entryPath = null }) {
  const playerLabel = label || `${ordinal(zonePosition)} ${zone.name}`;
  return {
    id: null,
    fullName: playerLabel,
    player: playerLabel,
    ranking: 9999,
    zoneId: zone.id,
    zoneName: zone.name,
    zoneSize: zone.size,
    zonePosition,
    sportOrder,
    entryPath,
    unresolved: true,
    testNote: sourceType === "zone-general" ? "Por definirse" : zone.name,
    source: {
      type: sourceType,
      zoneId: zone.id,
      zoneName: zone.name,
      zonePosition,
      sportOrder,
      entryPath,
    },
  };
}

function relabelBestNextPlaceholder(player, index) {
  if (!player?.unresolved) return player;
  const label = `Mejor ${ordinal(player.zonePosition)} ${index + 1}`;
  return {
    ...player,
    fullName: label,
    player: label,
    testNote: "Mejor zona",
    source: {
      ...(player.source || {}),
      type: "zone-best-next",
      bestNextOrder: index + 1,
    },
  };
}

function makeBestNextPlaceholder(index, zonePosition = 2) {
  const label = `Mejor ${ordinal(zonePosition)} ${index + 1}`;
  return {
    id: null,
    fullName: label,
    player: label,
    ranking: 9999,
    zoneId: null,
    zoneName: null,
    zonePosition,
    sportOrder: null,
    entryPath: "best-next",
    unresolved: true,
    testNote: "Mejor zona",
    source: {
      type: "zone-best-next",
      zonePosition,
      bestNextOrder: index + 1,
      entryPath: "best-next",
    },
  };
}

function makeGeneralZonePlaceholder(index, targetPlayer) {
  const sportOrder = index + 1;
  const label = `Clasificado general ${sportOrder}`;
  return {
    id: null,
    fullName: label,
    player: label,
    ranking: 9999,
    zoneId: null,
    zoneName: null,
    zonePosition: null,
    sportOrder,
    unresolved: true,
    testNote: "Zonas",
    source: {
      type: "zone-general",
      sportOrder,
      targetZonePosition: targetPlayer?.zonePosition || null,
    },
  };
}

function hasUnresolvedZoneSources(players = []) {
  return players.some((player) => player?.unresolved);
}

function resolveZonesWithQualifierCounts(db, bracket, qualifierCountForZone) {
  return (bracket.zones || []).map((zone) => {
    const resolved = isZoneResolved(zone);
    const zoneStandings = resolved ? getZoneStandings(db, zone).map((player, index) => ({
      ...player,
      zoneId: zone.id,
      zoneName: zone.name,
      zoneSize: zone.size,
      zonePosition: player.position ?? index + 1,
      ranking: player.ranking ?? 9999,
    })) : Array.from({ length: Number(zone.size || zone.playerIds?.length || zone.players?.length || 0) }, (_, index) =>
      makeZonePlaceholder({ zone, zonePosition: index + 1 })
    );
    const requestedQualifiers = normalizeZoneQualifierCount(qualifierCountForZone(zone));
    const resolution = resolved
      ? resolveZoneQualifiers(zoneStandings, requestedQualifiers)
      : { qualifiers: zoneStandings.slice(0, requestedQualifiers), tiebreaks: [], usedRankingGeneral: false };
    const qualifierIds = new Set(resolution.qualifiers.map((player) => player.id).filter(Boolean));
    const qualifierSources = new Set(resolution.qualifiers.map((player) => `${player.zoneId}:${player.zonePosition}`));
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      zoneSize: zone.size,
      resolved,
      qualifierCount: requestedQualifiers,
      standings: zoneStandings,
      qualifiers: resolution.qualifiers.map((player, index) => ({
        ...player,
        zoneId: zone.id,
        zoneName: zone.name,
        zoneSize: zone.size,
        zonePosition: player.zonePosition ?? player.position ?? index + 1,
        testNote: `Clasificado ${zone.name}`,
      })),
      nextPlayers: zoneStandings.filter((player) => (
        player.id ? !qualifierIds.has(player.id) : !qualifierSources.has(`${player.zoneId}:${player.zonePosition}`)
      )).map((player) => ({
        ...player,
        zoneId: zone.id,
        zoneName: zone.name,
        zoneSize: zone.size,
        testNote: `Mejor siguiente ${zone.name}`,
      })),
      usedRankingGeneral: resolution.usedRankingGeneral,
      tiebreaks: resolution.tiebreaks,
    };
  });
}

function getDirectRoundNameForTarget(target) {
  return getZoneMainRoundNames(target)[0] || "Llave";
}

function getAccessRoundNameForTarget(target) {
  if (target >= 32) return "32avos";
  if (target === 16) return "16avos";
  if (target === 8) return "8vos";
  return "Ronda de acceso";
}

function pairZoneAccessPlayersByPerformance(accessPlayers = []) {
  const ordered = [...accessPlayers];
  const pairs = [];
  let left = 0;
  let right = ordered.length - 1;
  while (left < right) {
    pairs.push([ordered[left], ordered[right]]);
    left += 1;
    right -= 1;
  }
  const sameZonePairs = pairs.filter(([a, b]) => a?.zoneId && a.zoneId === b?.zoneId).length;
  return { pairs, sameZonePairs, avoidedSameZone: sameZonePairs === 0 };
}

function buildZoneResolutionSummary(zoneResolutions = []) {
  return zoneResolutions.map((resolution) => ({
    zoneId: resolution.zoneId,
    zoneName: resolution.zoneName,
    usedRankingGeneral: resolution.usedRankingGeneral,
    tiebreaks: resolution.tiebreaks,
    qualifiers: resolution.qualifiers.map((player) => ({
      playerId: player.id,
      player: player.fullName || player.name || player.player,
      ranking: player.ranking,
      zonePosition: player.zonePosition,
    })),
  }));
}

function applyZoneValidation(bracket) {
  (bracket?.zones || []).forEach((zone) => {
    zone.qualifiers = normalizeZoneQualifierCount(zone.qualifiers || 1);
  });
  const standingChampionMode = bracket?.zones?.length === 1 && Number(bracket.zones[0].size || bracket.zones[0].playerIds?.length || bracket.zones[0].players?.length || 0) === 3;
  bracket.zoneStandingChampionMode = standingChampionMode;
  if (standingChampionMode) {
    const validation = {
      valid: false,
      total: 1,
      target: null,
      minimum: 1,
      missing: 0,
      directPlayers: 0,
      accessPlayers: 0,
      accessMatches: 0,
      accessRoundName: null,
      directRoundName: null,
      ready: true,
      standingChampion: true,
    };
    bracket.zoneValidation = validation;
    bracket.zoneClassificationStatus = "Zona unica de 3 jugadores. El 1.º de la tabla sera campeon. No requiere llave eliminatoria.";
    return validation;
  }
  const validation = getZoneBracketValidation((bracket?.zones || []).reduce((total, zone) => total + Number(zone.qualifiers || 0), 0));
  bracket.zoneValidation = validation;
  bracket.zoneClassificationStatus = getZoneValidationMessage(validation);
  bracket.zoneCompletionOptions = getZoneCompletionOptions(bracket?.zones || [], validation);
  return validation;
}

function getZonePlayerObjects(db, zone) {
  if (zone.playerIds?.length) {
    return zone.playerIds.map((playerId) => getPlayerById(db, playerId)).filter(Boolean);
  }
  return (zone.players || []).map((player, index) => ({
    id: null,
    fullName: player,
    ranking: index + 1,
  }));
}

function getZoneStandings(db, zone) {
  if (zone.standings?.length) {
    return zone.standings.map((standing) => {
      const player = standing.playerId ? getPlayerById(db, standing.playerId) : null;
      return {
        ...player,
        id: standing.playerId || player?.id,
        fullName: standing.playerName || player?.fullName,
        zonePoints: standing.zonePoints ?? standing.points ?? standing.wins ?? 0,
        wins: standing.wins ?? 0,
        played: standing.played ?? 0,
        setsWon: standing.setsWon ?? 0,
        setsLost: standing.setsLost ?? 0,
        setsDiff: standing.setsDiff ?? standing.setDifference ?? (Number(standing.setsWon || 0) - Number(standing.setsLost || 0)),
        gamesWon: standing.gamesWon ?? 0,
        gamesLost: standing.gamesLost ?? 0,
        gamesDiff: standing.gamesDiff ?? standing.gameDifference ?? (Number(standing.gamesWon || 0) - Number(standing.gamesLost || 0)),
        ranking: standing.ranking ?? player?.ranking ?? 9999,
        position: standing.position,
      };
    });
  }
  return getZonePlayerObjects(db, zone).map((player) => ({
    ...player,
    zonePoints: player.zonePoints ?? 0,
    wins: player.wins ?? 0,
    played: player.played ?? 0,
    setsWon: player.setsWon ?? 0,
    setsLost: player.setsLost ?? 0,
    setsDiff: player.setsDiff ?? 0,
    gamesWon: player.gamesWon ?? 0,
    gamesLost: player.gamesLost ?? 0,
    gamesDiff: player.gamesDiff ?? 0,
    ranking: player.ranking ?? 9999,
    position: player.position,
  }));
}

export function buildZoneEliminationBracket(db, tournament, stage, bracket, options = {}) {
  const validation = applyZoneValidation(bracket);
  if (validation.standingChampion) {
    bracket.rounds = [];
    stage.status = "Zonas en juego";
    return { ok: true, bracket, validation, message: bracket.zoneClassificationStatus };
  }
  if (!validation.valid) {
    const completionOptions = getZoneCompletionOptions(bracket.zones || [], validation);
    const selectedOption = completionOptions.find((option) => option.id === options.completionStrategy);
    if (!selectedOption?.available) {
      bracket.rounds = [];
      bracket.zoneCompletionOptions = completionOptions;
      stage.status = "Zonas en juego";
      return { ok: false, bracket, validation, options: completionOptions, message: bracket.zoneClassificationStatus };
    }
    const target = selectedOption.target;
    const zoneResolutions = selectedOption.id === "expand-zone-qualifiers"
      ? resolveZonesWithQualifierCounts(db, bracket, (zone) => Math.min(ZONE_MAX_QUALIFIERS_PER_ZONE, Number(zone.size || zone.playerIds?.length || zone.players?.length || zone.standings?.length || 0)))
      : resolveZonesWithQualifierCounts(db, bracket, () => 1);
    const allZonesResolved = zoneResolutions.every((resolution) => resolution.resolved);
    const currentQualifiers = zoneResolutions.flatMap((resolution) => resolution.qualifiers);
    const hasUnresolvedSources = hasUnresolvedZoneSources(currentQualifiers);
    const bestNext = selectedOption.id === "best-next"
      ? allZonesResolved
        ? sortZoneCandidatesByPerformance(zoneResolutions.flatMap((resolution) => resolution.nextPlayers))
          .slice(0, selectedOption.addedPlayers)
          .map(relabelBestNextPlaceholder)
        : Array.from({ length: Number(selectedOption.addedPlayers || 0) }, (_, index) => makeBestNextPlaceholder(index))
      : [];
    const allSelected = selectedOption.id === "best-next"
      ? orderZoneQualifiersForBracket([...currentQualifiers, ...bestNext])
      : hasUnresolvedSources
        ? orderZoneQualifiersForBracket(currentQualifiers).map((player, index) => makeGeneralZonePlaceholder(index, player))
        : orderZoneQualifiersForBracket(currentQualifiers);
    const accessMatches = selectedOption.id === "expand-zone-qualifiers" ? Math.max(0, allSelected.length - target) : 0;
    const accessPlayers = accessMatches * 2;
    const directPlayers = accessMatches ? Math.max(target - accessMatches, 0) : target;
    const directQualifiers = allSelected.slice(0, directPlayers).map((player) => ({ ...player, testNote: player.testNote || "Clasificado directo" }));
    const accessQualifiers = accessMatches ? allSelected.slice(directPlayers, directPlayers + accessPlayers) : [];
    const accessPairing = accessMatches ? pairZoneAccessPlayersByPerformance(accessQualifiers) : { pairs: [], sameZonePairs: 0, avoidedSameZone: true };
    const directRoundName = getDirectRoundNameForTarget(target);
    const accessRoundName = accessMatches ? getAccessRoundNameForTarget(target) : null;
    const entrants = [
      ...directQualifiers,
      ...accessPairing.pairs.map((_, index) => `Ganador ${accessRoundName} ${index + 1}`),
    ];
    const roundNames = getZoneMainRoundNames(target);
    db.matches = db.matches.filter((match) => !(match.tournamentId === tournament.id && match.categoryId === stage.categoryId && match.phase === "Cuadro principal" && !match.result));
    const accessRound = accessMatches ? {
      id: `${stage.categoryId}-zones-access`,
      name: accessRoundName,
      matches: accessPairing.pairs.map(([playerA, playerB], index) => makeBracketMatch(`${stage.categoryId}-zones-access-${index + 1}`, playerA, playerB, {
        connectionNote: "Ronda de acceso generada desde clasificados ampliados de zonas",
      })),
    } : null;
    if (accessRound) {
      accessRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, accessRound, match, index));
    }
    const firstRound = makePairedRound(stage, "zones-main-1", roundNames[0], entrants, "Fase final generada desde zonas");
    firstRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, firstRound, match, index));
    bracket.rounds = [
      ...(accessRound ? [accessRound] : []),
      firstRound,
      ...roundNames.slice(1).map((name, roundOffset) => {
        const matchCount = Math.max(1, target / (2 ** (roundOffset + 2)));
        return {
          id: `${stage.categoryId}-zones-${name.toLowerCase()}-${roundOffset + 2}`,
          name,
          matches: Array.from({ length: matchCount }, (_, index) => makeBracketMatch(`${stage.categoryId}-zones-${name}-${index + 1}`, `Ganador ${name} ${index + 1}`, "A definir", {
            score: "A programar",
            connectionNote: "Cruce pendiente de la fase final de zonas",
          })),
        };
      }),
    ];
    bracket.qualifiers = allSelected.map((player, index) => ({
      playerId: player.id,
      playerName: player.fullName || player.name || player.player,
      zoneId: player.zoneId,
      zoneName: player.zoneName,
      zoneSize: player.zoneSize,
      zonePosition: player.zonePosition,
      ranking: player.ranking,
      sportOrder: index + 1,
      source: player.source || null,
      entryPath: selectedOption.id === "best-next"
        ? (bestNext.some((nextPlayer) => (
            nextPlayer.id
              ? nextPlayer.id === player.id
              : nextPlayer.source?.bestNextOrder != null && nextPlayer.source.bestNextOrder === player.source?.bestNextOrder
          )) ? "best-next" : "qualified")
        : (index < directPlayers ? "direct" : "access"),
    }));
    bracket.zoneResolutions = buildZoneResolutionSummary(zoneResolutions);
    bracket.zoneAccessPlan = {
      completionStrategy: selectedOption.id,
      total: allSelected.length,
      target,
      directPlayers,
      accessPlayers,
      accessMatches,
      accessRoundName,
      directRoundName,
      sameZoneAccessPairs: accessPairing.sameZonePairs,
      avoidedSameZone: accessPairing.avoidedSameZone,
      addedBestNextPlayers: bestNext.length,
    };
    bracket.zoneCompletionOptions = completionOptions;
    bracket.zoneGeneratedAt = new Date().toISOString();
    stage.status = "Cuadro generado";
    return { ok: true, bracket, validation: { ...validation, valid: true, target, directPlayers, accessPlayers, accessMatches, accessRoundName, directRoundName }, message: selectedOption.preview };
  }

  const completionOptions = getZoneCompletionOptions(bracket.zones || [], validation);
  if (completionOptions.length && !options.completionStrategy) {
    bracket.rounds = [];
    bracket.zoneCompletionOptions = completionOptions;
    stage.status = "Zonas en juego";
    return { ok: false, bracket, validation, options: completionOptions, message: "Elegí cómo completar la llave de zonas." };
  }
  if (completionOptions.length && options.completionStrategy) {
      const selectedOption = completionOptions.find((option) => option.id === options.completionStrategy);
    if (selectedOption?.available) {
      const zoneCount = Number((bracket.zones || []).length || 0);
      const allCurrentZonesResolved = (bracket.zones || []).every((zone) => isZoneResolved(zone));
      if (validation.valid && !allCurrentZonesResolved) {
        bracket.rounds = [];
        bracket.zoneCompletionOptions = completionOptions;
        stage.status = "Zonas en juego";
        return { ok: false, bracket, validation, options: completionOptions, message: "Esperá a completar todas las zonas antes de fijar clasificados." };
      }
      const selectedBestNextAlreadyRepresented = selectedOption.id === "best-next"
        && [0, zoneCount].includes(Number(selectedOption.addedPlayers || 0))
        && validation.valid
        && allCurrentZonesResolved;
      const selectedExpandedAlreadyRepresented = selectedOption.id === "expand-zone-qualifiers"
        && validation.valid
        && allCurrentZonesResolved;
      if (selectedBestNextAlreadyRepresented || selectedExpandedAlreadyRepresented) {
        bracket.zoneAccessPlan = {
          completionStrategy: selectedOption.id,
          alreadyRepresentedByCurrentQualifiers: true,
        };
      } else {
      return buildZoneEliminationBracket(db, tournament, stage, {
        ...bracket,
        zones: (bracket.zones || []).map((zone) => ({ ...zone, qualifiers: 1 })),
        zoneValidation: null,
      }, options);
      }
    }
    if (selectedOption?.available) {
      // Continue with the current valid qualifier configuration when the chosen
      // strategy is already equivalent to it. This avoids re-entering the
      // same valid state for counts such as 12-14.
    } else {
    bracket.rounds = [];
    bracket.zoneCompletionOptions = completionOptions;
    stage.status = "Zonas en juego";
    return { ok: false, bracket, validation, options: completionOptions, message: "Elegí una estrategia válida para completar la llave de zonas." };
    }
  }

  const zoneResolutions = resolveZonesWithQualifierCounts(db, bracket, (zone) => Number(zone.qualifiers || 0));
  const qualifiers = zoneResolutions.flatMap((resolution) =>
    resolution.qualifiers.map((player, index) => ({
      ...player,
      zoneId: resolution.zoneId,
      zoneName: resolution.zoneName,
      zoneSize: resolution.zoneSize,
      zonePosition: player.position ?? index + 1,
      testNote: `Clasificado ${resolution.zoneName}`,
    }))
  );
  bracket.zoneResolutions = zoneResolutions.map((resolution) => ({
    zoneId: resolution.zoneId,
    zoneName: resolution.zoneName,
    usedRankingGeneral: resolution.usedRankingGeneral,
    tiebreaks: resolution.tiebreaks,
    qualifiers: resolution.qualifiers.map((player) => ({
      playerId: player.id,
      player: player.fullName || player.name || player.player,
      ranking: player.ranking,
      source: player.source || null,
    })),
  }));
  const semifinalQualifiers = validation.target === 4
    ? orderTwoZoneSemifinalQualifiers(qualifiers, zoneResolutions)
    : null;
  const orderedQualifiers = semifinalQualifiers || orderZoneQualifiersForBracket(qualifiers);
  const directQualifiers = orderedQualifiers.slice(0, validation.directPlayers);
  const accessQualifiers = orderedQualifiers.slice(validation.directPlayers);
  const accessPairing = pairZoneAccessPlayers(accessQualifiers);
  const entrants = [
    ...directQualifiers,
    ...accessPairing.pairs.map((_, index) => `Ganador ${validation.accessRoundName} ${index + 1}`),
  ];
  const roundNames = getZoneMainRoundNames(validation.target);
  db.matches = db.matches.filter((match) => !(match.tournamentId === tournament.id && match.categoryId === stage.categoryId && match.phase === "Cuadro principal" && !match.result));
  const accessRound = validation.accessMatches ? {
    id: `${stage.categoryId}-zones-access`,
    name: validation.accessRoundName,
    matches: accessPairing.pairs.map(([playerA, playerB], index) => makeBracketMatch(`${stage.categoryId}-zones-access-${index + 1}`, playerA, playerB, {
      connectionNote: "Ronda de acceso generada desde clasificados de zonas",
    })),
  } : null;
  if (accessRound) {
    accessRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, accessRound, match, index));
  }
  const firstRound = makePairedRound(stage, "zones-main-1", roundNames[0], entrants, "Fase final generada desde zonas");
  firstRound.matches.forEach((match, index) => createMatchFromBracket(db, tournament, stage, firstRound, match, index));
  bracket.rounds = [
    ...(accessRound ? [accessRound] : []),
    firstRound,
    ...roundNames.slice(1).map((name, roundOffset) => {
    const matchCount = Math.max(1, validation.target / (2 ** (roundOffset + 2)));
    return {
      id: `${stage.categoryId}-zones-${name.toLowerCase()}-${roundOffset + 2}`,
      name,
      matches: Array.from({ length: matchCount }, (_, index) => makeBracketMatch(`${stage.categoryId}-zones-${name}-${index + 1}`, `Ganador ${name} ${index + 1}`, "A definir", {
        score: "A programar",
        connectionNote: "Cruce pendiente de la fase final de zonas",
      })),
    };
  })];
  bracket.qualifiers = orderedQualifiers.map((player, index) => ({
    playerId: player.id,
    playerName: player.fullName || player.name || player.player,
    zoneId: player.zoneId,
    zoneName: player.zoneName,
    zoneSize: player.zoneSize,
    zonePosition: player.zonePosition,
    ranking: player.ranking,
    sportOrder: index + 1,
    source: player.source || null,
    entryPath: index < validation.directPlayers ? "direct" : "access",
  }));
  bracket.zoneAccessPlan = {
    total: validation.total,
    target: validation.target,
    directPlayers: validation.directPlayers,
    accessPlayers: validation.accessPlayers,
    accessMatches: validation.accessMatches,
    accessRoundName: validation.accessRoundName,
    directRoundName: validation.directRoundName,
    sameZoneAccessPairs: accessPairing.sameZonePairs,
    avoidedSameZone: accessPairing.avoidedSameZone,
  };
  bracket.zoneGeneratedAt = new Date().toISOString();
  stage.status = "Cuadro generado";
  return { ok: true, bracket, validation, message: bracket.zoneClassificationStatus };
}

export function generateCategoryBracketInDb(db, tournamentId, categoryId, options = {}) {
  const tournament = db.tournaments.find((item) => item.id === tournamentId);
  if (!tournament) return null;
  const stages = ensureTournamentCategoryStages(db, tournament);
  const stage = stages.find((item) => item.categoryId === categoryId);
  if (!stage) return null;
  if (!stage.participants?.length) {
    stage.status = "Sin inscriptos";
    stage.formatStatus = "empty";
    return null;
  }
  if (stage.formatStatus && stage.formatStatus !== "confirmed") return null;
  if (!TOURNAMENT_FORMATS.includes(stage.format)) return null;

  db.matches = db.matches.filter((match) => {
    if (!(match.tournamentId === tournamentId && match.categoryId === categoryId)) return true;
    const isGeneratedBye = match.bye || match.resultDetail?.type === "BYE";
    return match.result && !isGeneratedBye;
  });
  const players = stage.participants.map((playerId) => getPlayerById(db, playerId)).filter(Boolean);
  const bracket = {
    tournamentId,
    categoryId,
    category: stage.categoryName,
    format: stage.format,
    preliminaries: [],
    preliminarySummary: null,
    zones: [],
    zoneDistribution: [],
    rounds: [],
  };

  if (stage.format === "Preliminar") {
    const preliminaryPlan = buildPreliminaryPlan(players.length);
    if (!preliminaryPlan.supported) {
      bracket.preliminarySummary = {
        participants: players.length,
        supported: false,
        reason: "PRELIMINARY_COUNT_NOT_DOCUMENTED",
      };
      stage.status = "Formato preliminar no documentado";
    } else if (shouldUseAccessDrawForPreliminary(players.length)) {
      const accessDraw = buildDirectElimination(db, tournament, stage, players, options);
      const mainDrawSize = largestStandardDraw(players.length);
      const accessMatches = Math.max(0, players.length - mainDrawSize);
      bracket.rounds = accessDraw.rounds;
      bracket.directByes = accessDraw.directByes;
      bracket.preliminarySummary = {
        participants: players.length,
        preliminaryByes: accessDraw.directByes.length,
        preliminaryByePlayer: accessDraw.directByes.map((bye) => bye.player).join(", ") || null,
        preliminaries: 0,
        accessMatches,
        accessPlayers: accessMatches * 2,
        directPlayers: accessDraw.directByes.length,
        mainDrawSize,
        accessRoundName: accessMatches ? previousAccessRoundName(mainDrawSize) : null,
        firstMainRoundName: nextMainRoundNames(mainDrawSize)[0],
        accessDraw: true,
      };
    } else {
      bracket.preliminaries = buildPreliminaries(db, tournament, stage, players, options);
      bracket.rounds = buildPreliminarySkeletonRounds(stage, players);
      bracket.preliminarySummary = {
        participants: players.length,
        preliminaryByes: bracket.preliminaries.filter((match) => match.bye).length,
        preliminaryByePlayer: bracket.preliminaries.find((match) => match.bye)?.winner || null,
        preliminaries: bracket.preliminaries.filter((match) => match.matchId).length,
        mainDrawSize: preliminaryPlan.mainDrawSize,
        postRule: preliminaryPlan.postRule,
      };
    }
  } else if (stage.format === "Zonas") {
    bracket.zones = buildZones(db, tournament, stage, players, options);
    bracket.zoneDistribution = bracket.zones.map((zone) => zone.size);
    stage.zonesConfig = {
      zones: bracket.zones.length,
      qualifiers: bracket.zones[0]?.qualifiers || 1,
      distribution: bracket.zoneDistribution,
    };
    applyZoneValidation(bracket);
    stage.status = "Zonas en juego";
  } else {
    const directElimination = buildDirectElimination(db, tournament, stage, players, options);
    bracket.rounds = directElimination.rounds;
    bracket.directByes = directElimination.directByes;
  }

  db.brackets[stage.bracketKey] = bracket;
  if (stage.format !== "Zonas" && stage.status !== "Formato preliminar no documentado") stage.status = "Cuadro generado";
  stage.progress = {
    totalMatches: bracket.rounds.reduce((total, round) => total + round.matches.length, 0) + bracket.preliminaries.length + (bracket.directByes?.length || 0),
    completedMatches: bracket.directByes?.length || 0,
  };
  return bracket;
}
