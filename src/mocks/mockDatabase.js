import { mockRegistrations, mockDescentRequests, mockSchedule, mockSettings } from "./mockAdmin";
import { mockBrackets } from "./mockBrackets";
import { mockCategories } from "./mockCategories";
import { mockDiscipline } from "./mockDiscipline";
import { mockMatches } from "./mockMatches";
import { mockNotifications } from "./mockNotifications";
import { mockPlayers } from "./mockPlayers";
import { mockRankings, mockRankingMovements } from "./mockRankings";
import { mockTournaments } from "./mockTournaments";

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export const mockDb = {
  players: clone(mockPlayers),
  categories: clone(mockCategories),
  tournaments: clone(mockTournaments),
  brackets: clone(mockBrackets),
  matches: clone(mockMatches),
  rankings: clone(mockRankings),
  rankingMovements: clone(mockRankingMovements).map((movement) => ({
    tournamentId: movement.tournamentId || null,
    reason: movement.reason || movement.concept,
    ...movement,
  })),
  notifications: clone(mockNotifications),
  disciplineClaims: clone(mockDiscipline.claims).map((claim) => ({
    matchId: claim.matchId || null,
    tournamentId: claim.tournamentId || null,
    reportedPlayerId: claim.reportedPlayerId || null,
    claimantPlayerId: claim.claimantPlayerId || null,
    observations: claim.observations || "",
    ...claim,
  })),
  disciplineFaults: clone(mockDiscipline.faults),
  enrollments: clone(mockRegistrations),
  categoryChangeRequests: clone(mockDescentRequests),
  schedule: clone(mockSchedule),
  settings: clone(mockSettings),
  auditLogs: [],
  operationalAlertReads: [],
  matchAvailability: [
    { matchId: "match-1", tournamentId: "tour-3", categoryId: "cat-m4", playerId: "player-1", confirmed: true, unavailableSlots: [], submittedAt: "2026-07-18T10:00:00.000Z" },
    { matchId: "match-1", tournamentId: "tour-3", categoryId: "cat-m4", playerId: "player-2", confirmed: true, unavailableSlots: ["2026-07-19 12:00"], submittedAt: "2026-07-18T10:05:00.000Z" },
    { matchId: "match-4", tournamentId: "tour-1", categoryId: "cat-m4", playerId: "player-2", confirmed: true, unavailableSlots: ["2026-08-08 12:00"], submittedAt: "2026-08-01T09:00:00.000Z" },
  ],
  scheduleEvents: [],
};

export function readMockData(selector) {
  return clone(selector(mockDb));
}

export function mutateMockData(mutator) {
  const result = mutator(mockDb);
  return clone(result);
}

export function createMockId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getMockDbSnapshot() {
  return clone(mockDb);
}
