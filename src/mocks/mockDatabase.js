import { createTorneoGameFixture } from "../dev/torneoGameFixture";
import { mockSettings } from "./mockAdmin";
import { mockCategories } from "./mockCategories";

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

const torneoGameFixture = createTorneoGameFixture();

export const mockDb = {
  players: clone(torneoGameFixture.players),
  categories: clone(mockCategories),
  tournaments: clone(torneoGameFixture.tournaments),
  brackets: clone(torneoGameFixture.brackets),
  matches: clone(torneoGameFixture.matches),
  rankings: clone(torneoGameFixture.rankings),
  rankingMovements: clone(torneoGameFixture.rankingMovements),
  notifications: [],
  disciplineClaims: [],
  disciplineFaults: [],
  enrollments: clone(torneoGameFixture.enrollments),
  categoryChangeRequests: [],
  schedule: clone(torneoGameFixture.schedule),
  settings: clone(mockSettings),
  auditLogs: [],
  operationalAlertReads: [],
  matchAvailability: clone(torneoGameFixture.matchAvailability),
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
