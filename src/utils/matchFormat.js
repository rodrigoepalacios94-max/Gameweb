export const DEFAULT_MATCH_FORMAT = {
  bestOfSets: 3,
  gamesPerSet: 6,
  useSuperTiebreak: true,
  superTiebreakInDecidingSet: true,
};

export const MATCH_FORMAT_OPTIONS = {
  bestOfSets: [
    { value: 1, label: "Al mejor de 1 set" },
    { value: 3, label: "Al mejor de 3 sets" },
    { value: 5, label: "Al mejor de 5 sets" },
  ],
  gamesPerSet: [
    { value: 4, label: "4 games" },
    { value: 6, label: "6 games" },
  ],
};

export function normalizeMatchFormat(format = {}) {
  return {
    ...DEFAULT_MATCH_FORMAT,
    ...format,
    bestOfSets: Number(format.bestOfSets || DEFAULT_MATCH_FORMAT.bestOfSets),
    gamesPerSet: Number(format.gamesPerSet || DEFAULT_MATCH_FORMAT.gamesPerSet),
    useSuperTiebreak: Boolean(format.useSuperTiebreak ?? DEFAULT_MATCH_FORMAT.useSuperTiebreak),
    superTiebreakInDecidingSet: Boolean(format.superTiebreakInDecidingSet ?? DEFAULT_MATCH_FORMAT.superTiebreakInDecidingSet),
  };
}

export function getSetsToWin(format = DEFAULT_MATCH_FORMAT) {
  return Math.floor(normalizeMatchFormat(format).bestOfSets / 2) + 1;
}

export function isDecidingSuperTiebreak(index, format = DEFAULT_MATCH_FORMAT) {
  const normalized = normalizeMatchFormat(format);
  return normalized.useSuperTiebreak && normalized.superTiebreakInDecidingSet && index === normalized.bestOfSets - 1;
}

export function getMatchFormatRows(format = DEFAULT_MATCH_FORMAT) {
  const normalized = normalizeMatchFormat(format);
  return Array.from({ length: normalized.bestOfSets }, (_, index) => ({
    index,
    type: isDecidingSuperTiebreak(index, normalized) ? "super_tiebreak" : "set",
    label: isDecidingSuperTiebreak(index, normalized) ? `Set ${index + 1} / Super Tie-Break` : `Set ${index + 1}`,
  }));
}

export function describeMatchFormat(format = DEFAULT_MATCH_FORMAT) {
  const normalized = normalizeMatchFormat(format);
  return {
    sets: `Al mejor de ${normalized.bestOfSets}`,
    games: `${normalized.gamesPerSet} games por set`,
    decidingSet: normalized.useSuperTiebreak && normalized.superTiebreakInDecidingSet ? "Super Tie-Break en set decisivo" : "Sin Super Tie-Break",
  };
}

export function formatResultSets(sets = []) {
  return sets.map((set) => `${set.playerAScore ?? set.a}-${set.playerBScore ?? set.b}`).join(" / ");
}
