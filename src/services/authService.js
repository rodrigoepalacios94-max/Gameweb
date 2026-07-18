import { readMockData } from "../mocks/mockDatabase";
import { mockRequest } from "./serviceUtils";

const mockAdmin = {
  id: "admin-1",
  firstName: "Martin",
  lastName: "Aguirre",
  fullName: "Martin Aguirre",
  role: "admin",
  avatar: "https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&w=240&q=80",
  title: "Profesor principal",
};

function buildSession(role = "player") {
  const playerUser = readMockData((db) => db.players.find((player) => player.id === "player-1"));
  const user = role === "admin" ? mockAdmin : { ...playerUser, role: "player" };
  return { role, user, isPlayer: role === "player", isAdmin: role === "admin" };
}

export const authService = {
  getInitialSession(role = "player") {
    return buildSession(role);
  },
  async getCurrentSession(role = "player") {
    return mockRequest(() => buildSession(role), "No pudimos cargar la sesion mock.");
  },
  async signInMock(role) {
    return mockRequest(() => buildSession(role), "No pudimos iniciar sesion mock.");
  },
  async signOutMock() {
    return mockRequest(() => true, "No pudimos cerrar sesion mock.");
  },
};
