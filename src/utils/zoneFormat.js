export const ZONE_FINAL_DRAW_SIZES = [8, 16, 32];
export const ZONE_MIN_QUALIFIERS_PER_ZONE = 1;
export const ZONE_MAX_QUALIFIERS_PER_ZONE = 2;

const ACCESS_ROUND_BY_TARGET = {
  8: "8vos",
  16: "16avos",
  32: "32avos",
};

const DIRECT_ROUND_BY_TARGET = {
  8: "Cuartos",
  16: "8vos",
  32: "16avos",
};

export function proposeZoneDistribution(participantCount = 0) {
  const count = Number(participantCount || 0);
  if (count <= 0) return [];
  if (count < 3) return [count];
  if (count <= 4) return [count];

  const remainder = count % 3;
  if (remainder === 0) return Array.from({ length: count / 3 }, () => 3);
  if (remainder === 1) return [...Array.from({ length: (count - 4) / 3 }, () => 3), 4];
  return [...Array.from({ length: (count - 8) / 3 }, () => 3), 4, 4];
}

export function getZoneBracketValidation(totalQualifiers = 0) {
  const total = Number(totalQualifiers || 0);
  const target = getZoneTargetDrawSize(total);
  const missing = Math.max(8 - total, 0);
  const accessMatches = total > target ? total - target : 0;
  const accessPlayers = accessMatches * 2;
  const directPlayers = total >= 8 ? Math.max(target - accessMatches, 0) : 0;

  return {
    valid: total >= 8 && total <= 48 && directPlayers + accessMatches === target,
    total,
    target,
    missing,
    excess: 0,
    directPlayers,
    accessPlayers,
    accessMatches,
    accessRoundName: accessMatches ? ACCESS_ROUND_BY_TARGET[target] : null,
    directRoundName: DIRECT_ROUND_BY_TARGET[target],
    ready: total >= 8 && total <= 48,
  };
}

export function normalizeZoneQualifierCount(value = 1) {
  const number = Number(value || 0);
  if (number < ZONE_MIN_QUALIFIERS_PER_ZONE) return ZONE_MIN_QUALIFIERS_PER_ZONE;
  if (number > ZONE_MAX_QUALIFIERS_PER_ZONE) return ZONE_MAX_QUALIFIERS_PER_ZONE;
  return number;
}

export function isValidZoneQualifierCount(value) {
  return [ZONE_MIN_QUALIFIERS_PER_ZONE, ZONE_MAX_QUALIFIERS_PER_ZONE].includes(Number(value));
}

export function getZoneValidationMessage(validation) {
  if (!validation) return "Selecciona cuantos jugadores clasifican por zona.";
  if (!validation.valid && validation.missing) {
    return `NO SE PUEDE GENERAR LA LLAVE. ${validation.total} jugadores clasificados. Se necesita un minimo de 8. Falta clasificar ${validation.missing} jugador${validation.missing === 1 ? "" : "es"}.`;
  }
  if (!validation.valid) return `${validation.total} clasificados: cantidad inconsistente para el formato Zonas.`;
  if (!validation.accessMatches) return `${validation.total} clasificados. Llave objetivo: ${validation.target}. Todos comienzan directo en ${validation.directRoundName}. LISTO PARA GENERAR.`;
  return `${validation.total} clasificados. Llave objetivo: ${validation.target}. ${validation.directPlayers} pasan directo a ${validation.directRoundName}. ${validation.accessPlayers} disputan ${validation.accessMatches} partidos de ${validation.accessRoundName}. Los ${validation.accessMatches} ganadores completan los ${validation.target} jugadores de ${validation.directRoundName}. LISTO PARA GENERAR.`;
}

export function getZoneTargetDrawSize(totalQualifiers = 0) {
  const total = Number(totalQualifiers || 0);
  if (total >= 33) return 32;
  if (total >= 32) return 32;
  if (total >= 17) return 16;
  if (total >= 16) return 16;
  return 8;
}

export function getZoneMainRoundNames(drawSize) {
  if (drawSize === 32) return ["16avos", "8vos", "Cuartos", "Semifinal", "Final"];
  if (drawSize === 16) return ["8vos", "Cuartos", "Semifinal", "Final"];
  if (drawSize === 8) return ["Cuartos", "Semifinal", "Final"];
  return ["Final"];
}

export function getZoneMatchups(players = []) {
  const matchups = [];
  for (let a = 0; a < players.length; a += 1) {
    for (let b = a + 1; b < players.length; b += 1) {
      matchups.push([players[a], players[b]]);
    }
  }
  return matchups;
}

function getStandingScore(standing) {
  return [
    Number(standing.zonePoints ?? standing.points ?? standing.wins ?? 0),
    Number(standing.setsDiff ?? standing.setDifference ?? 0),
    Number(standing.gamesDiff ?? standing.gameDifference ?? 0),
    Number(standing.gamesWon ?? 0),
  ].join("|");
}

function compareStandingPerformance(playerA, playerB) {
  const fields = [
    ["zonePoints", "points", "wins"],
    ["setsDiff", "setDifference"],
    ["gamesDiff", "gameDifference"],
    ["gamesWon"],
  ];

  for (const aliases of fields) {
    const a = aliases.map((key) => playerA[key]).find((value) => value != null) ?? 0;
    const b = aliases.map((key) => playerB[key]).find((value) => value != null) ?? 0;
    if (Number(b) !== Number(a)) return Number(b) - Number(a);
  }

  return 0;
}

function compareRanking(playerA, playerB) {
  return Number(playerA.ranking ?? playerA.generalRanking ?? 9999) - Number(playerB.ranking ?? playerB.generalRanking ?? 9999);
}

function safeRate(value, total) {
  const denominator = Number(total || 0);
  if (denominator <= 0) return 0;
  return Number(value || 0) / denominator;
}

function getZoneSportMetrics(player) {
  const played = Number(player.played ?? player.matchesPlayed ?? 0);
  const setsWon = Number(player.setsWon ?? 0);
  const setsLost = Number(player.setsLost ?? 0);
  const gamesWon = Number(player.gamesWon ?? 0);
  const gamesLost = Number(player.gamesLost ?? 0);
  return {
    zonePosition: Number(player.zonePosition ?? player.position ?? 9999),
    zoneSize: Number(player.zoneSize ?? player.size ?? 0),
    winRate: safeRate(player.wins, played),
    setRate: safeRate(setsWon, setsWon + setsLost),
    gameRate: safeRate(gamesWon, gamesWon + gamesLost),
    ranking: Number(player.ranking ?? player.generalRanking ?? 9999),
    label: player.fullName || player.playerName || player.name || player.player || player.id || "",
  };
}

export function compareZoneSportOrder(playerA, playerB) {
  const a = getZoneSportMetrics(playerA);
  const b = getZoneSportMetrics(playerB);
  return a.zonePosition - b.zonePosition
    || b.zoneSize - a.zoneSize
    || b.winRate - a.winRate
    || b.setRate - a.setRate
    || b.gameRate - a.gameRate
    || a.ranking - b.ranking
    || a.label.localeCompare(b.label, undefined, { numeric: true });
}

export function orderZoneQualifiersForBracket(qualifiers = []) {
  return [...qualifiers].sort(compareZoneSportOrder);
}

function countSameZonePairs(pairs) {
  return pairs.filter(([playerA, playerB]) => playerA?.zoneId && playerA.zoneId === playerB?.zoneId).length;
}

function buildPairsGreedy(players) {
  const remaining = [...players];
  const pairs = [];
  while (remaining.length >= 2) {
    const playerA = remaining.shift();
    const opponentIndex = remaining.findIndex((candidate) => candidate.zoneId !== playerA.zoneId);
    const playerB = remaining.splice(opponentIndex >= 0 ? opponentIndex : 0, 1)[0];
    pairs.push([playerA, playerB]);
  }
  return pairs;
}

export function pairZoneAccessPlayers(accessPlayers = []) {
  const ordered = [...accessPlayers];
  if (ordered.length <= 2) {
    const pairs = buildPairsGreedy(ordered);
    return { pairs, sameZonePairs: countSameZonePairs(pairs), avoidedSameZone: countSameZonePairs(pairs) === 0 };
  }

  let bestPairs = null;
  let bestConflicts = Number.POSITIVE_INFINITY;

  function search(remaining, pairs) {
    if (!remaining.length) {
      const conflicts = countSameZonePairs(pairs);
      if (conflicts < bestConflicts) {
        bestConflicts = conflicts;
        bestPairs = pairs.map((pair) => [...pair]);
      }
      return conflicts === 0;
    }
    if (countSameZonePairs(pairs) >= bestConflicts) return false;

    const [playerA, ...rest] = remaining;
    const candidates = [...rest].sort((a, b) => {
      const aConflict = a.zoneId && a.zoneId === playerA.zoneId ? 1 : 0;
      const bConflict = b.zoneId && b.zoneId === playerA.zoneId ? 1 : 0;
      return aConflict - bConflict;
    });

    for (const playerB of candidates) {
      const nextRemaining = rest.filter((player) => player !== playerB);
      if (search(nextRemaining, [...pairs, [playerA, playerB]])) return true;
    }
    return false;
  }

  if (ordered.length <= 16) search(ordered, []);
  else bestPairs = buildPairsGreedy(ordered);

  const pairs = bestPairs || buildPairsGreedy(ordered);
  const sameZonePairs = countSameZonePairs(pairs);
  return {
    pairs,
    sameZonePairs,
    avoidedSameZone: sameZonePairs === 0,
  };
}

export function buildZoneAccessPreview(totalQualifiers = 0) {
  return getZoneBracketValidation(totalQualifiers);
}

export function resolveZoneQualifiers(standings = [], qualifierCount = 1) {
  const requestedSlots = Math.max(0, Number(qualifierCount || 0));
  const ordered = [...standings].sort(compareStandingPerformance);
  const classified = [];
  const tiebreaks = [];
  let cursor = 0;

  while (cursor < ordered.length && classified.length < requestedSlots) {
    const current = ordered[cursor];
    const score = getStandingScore(current);
    const tiedGroup = [];

    while (cursor < ordered.length && getStandingScore(ordered[cursor]) === score) {
      tiedGroup.push(ordered[cursor]);
      cursor += 1;
    }

    const availableSlots = requestedSlots - classified.length;
    if (tiedGroup.length <= availableSlots) {
      classified.push(...tiedGroup);
      continue;
    }

    const selected = [...tiedGroup].sort(compareRanking).slice(0, availableSlots);
    classified.push(...selected);
    tiebreaks.push({
      affectedLastQualifyingPlace: true,
      availableSlots,
      tiedPlayers: tiedGroup.map((player) => player.fullName || player.name || player.player || player.id),
      selectedPlayers: selected.map((player) => player.fullName || player.name || player.player || player.id),
      criterion: "Ranking General",
    });
  }

  return {
    qualifiers: classified,
    tiebreaks,
    usedRankingGeneral: tiebreaks.length > 0,
  };
}
