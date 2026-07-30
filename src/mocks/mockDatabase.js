import { mockSettings } from "./mockAdmin";

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

const categories = [
  {
    id: "cat-prueba-a",
    name: "Categoria Prueba A",
    branch: "Masculino",
    level: 1,
    status: "Activa",
  },
  {
    id: "cat-prueba-b",
    name: "Categoria Prueba B",
    branch: "Masculino",
    level: 2,
    status: "Activa",
  },
];

const temporaryPlayer = {
  id: "player-1",
  firstName: "Juan",
  lastName: "Perez",
  fullName: "Juan Perez",
  dni: "30000000",
  birthDate: "1990-01-01",
  gender: "Masculino",
  phone: "1122334455",
  email: "hola@hola.com",
  address: "Domicilio temporal",
  categoryId: "cat-prueba-a",
  categoryName: "Categoria Prueba A",
  ranking: null,
  points: 0,
  status: "Activo",
  avatar: "",
  stats: { played: 0, wins: 0, losses: 0, tournaments: 0 },
  discipline: { faults: 0, limit: 3, status: "Sin sanciones" },
  categoryHistory: [],
  categoryRankings: [],
  benefit: null,
};

export const mockDb = {
  players: [temporaryPlayer],
  categories,
  tournaments: [],
  brackets: {},
  matches: [],
  rankings: [],
  previousSeasonRankings: [],
  rankingMovements: [],
  notifications: [],
  photoAlbums: [],
  disciplineClaims: [],
  disciplineFaults: [],
  enrollments: [],
  payments: [],
  playerPaymentWaivers: [],
  categoryChangeRequests: [],
  schedule: [],
  settings: clone(mockSettings),
  auditLogs: [],
  operationalAlertReads: [],
  matchAvailability: [],
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
