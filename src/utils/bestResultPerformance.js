export function isPerformanceSet(set = {}) {
  return String(set.type || set.set_type || set.setType || "").toLowerCase() !== "super_tiebreak";
}

export function readScore(set = {}, side = "A") {
  if (side === "A") return Number(set.playerAScore ?? set.playerA ?? set.player1Score ?? set.player1_score ?? set.a ?? 0);
  return Number(set.playerBScore ?? set.playerB ?? set.player2Score ?? set.player2_score ?? set.b ?? 0);
}

export function compareGameWinPercentage(a = {}, b = {}) {
  const aGamesWon = Number(a.gamesWon || 0);
  const aTotal = aGamesWon + Number(a.gamesLost || 0);
  const bGamesWon = Number(b.gamesWon || 0);
  const bTotal = bGamesWon + Number(b.gamesLost || 0);
  if (aTotal <= 0 && bTotal <= 0) return 0;
  if (aTotal <= 0) return -1;
  if (bTotal <= 0) return 1;
  return (aGamesWon * bTotal) - (bGamesWon * aTotal);
}

export function compareBestResultMetrics(a = {}, b = {}) {
  const setsWonDelta = Number(b.setsWon || 0) - Number(a.setsWon || 0);
  if (setsWonDelta) return setsWonDelta;
  const gamesPercentageDelta = compareGameWinPercentage(b, a);
  if (gamesPercentageDelta) return gamesPercentageDelta;
  return Number(a.ranking ?? a.generalRanking ?? 9999) - Number(b.ranking ?? b.generalRanking ?? 9999);
}

export function gameWinRatio(value = {}) {
  const gamesWon = Number(value.gamesWon || 0);
  const total = gamesWon + Number(value.gamesLost || 0);
  return total > 0 ? gamesWon / total : 0;
}

export function bestResultPerformanceScore(value = {}) {
  return Number(value.setsWon || 0) * 1000 + gameWinRatio(value);
}

export function performanceMetricsFromSets(sets = [], { isPlayerA = true } = {}) {
  const totals = { setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 };
  (sets || []).filter(isPerformanceSet).forEach((set) => {
    const a = readScore(set, "A");
    const b = readScore(set, "B");
    const own = isPlayerA ? a : b;
    const other = isPlayerA ? b : a;
    totals.gamesWon += own;
    totals.gamesLost += other;
    if (own > other) totals.setsWon += 1;
    if (other > own) totals.setsLost += 1;
  });
  return totals;
}
