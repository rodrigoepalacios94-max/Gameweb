import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { normalizeText } from "../utils/formatters";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

export const playerService = {
  async getCurrentPlayer() {
    return mockRequest(() => readMockData((db) => db.players.find((player) => player.id === "player-1")), "No pudimos cargar el jugador actual.");
  },
  async getPlayers() {
    return mockRequest(() => readMockData((db) => db.players), "No pudimos cargar los jugadores.");
  },
  async getPlayerById(id) {
    return mockRequest(() => readMockData((db) => db.players.find((player) => player.id === id) || null), "No pudimos cargar el jugador.");
  },
  async searchPlayers(query) {
    return mockRequest(() => {
      const normalizedQuery = normalizeText(query);
      return readMockData((db) => db.players.filter((player) => normalizeText(player.fullName).includes(normalizedQuery)));
    }, "No pudimos buscar jugadores.");
  },
  async updatePlayer(id, updates, actor = "admin-1") {
    return mockRequest(async () => {
      const player = mutateMockData((db) => {
        const target = db.players.find((item) => item.id === id);
        if (!target) return null;
        Object.assign(target, updates);
        return target;
      });
      await auditService.record({
        action: "update_player",
        entityType: "player",
        entityId: id,
        description: "Jugador actualizado en mock.",
        actor,
      });
      return player;
    }, "No pudimos actualizar el jugador.");
  },
  async requestCategoryDowngrade(playerId, requestedCategoryId) {
    return mockRequest(() =>
      mutateMockData((db) => {
        const player = db.players.find((item) => item.id === playerId);
        const currentCategory = db.categories.find((item) => item.id === player?.categoryId);
        const requestedCategory = db.categories.find((item) => item.id === requestedCategoryId);
        const request = {
          id: createMockId("descent"),
          playerId,
          currentCategoryId: currentCategory?.id,
          currentCategoryName: `${currentCategory?.name} ${currentCategory?.branch}`,
          requestedCategoryId,
          requestedCategoryName: `${requestedCategory?.name} ${requestedCategory?.branch}`,
          date: new Date().toISOString().slice(0, 10),
          status: "Pendiente",
          note: "Solicitud mock generada por el jugador.",
        };
        db.categoryChangeRequests.push(request);
        return request;
      }), "No pudimos crear la solicitud de descenso.");
  },
};
