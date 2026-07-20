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
  async createPlayer(payload, actor = "admin-1") {
    return mockRequest(async () => {
      const player = mutateMockData((db) => {
        const category = db.categories.find((item) => item.id === payload.categoryId && item.status === "Activa");
        if (!category) throw new Error("No hay categoria activa valida para el jugador.");
        const firstName = payload.firstName.trim();
        const lastName = payload.lastName.trim();
        const created = {
          id: createMockId("player"),
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          dni: payload.dni || "-",
          birthDate: payload.birthDate || "",
          gender: payload.gender || category.branch,
          phone: payload.phone || "",
          email: payload.email || "",
          categoryId: category.id,
          categoryName: `${category.name} ${category.branch}`,
          ranking: null,
          points: 0,
          status: "Activo",
          avatar: payload.avatar || "",
          stats: { played: 0, wins: 0, losses: 0, tournaments: 0 },
          discipline: { faults: 0, limit: 3, status: "Sin sanciones" },
          categoryHistory: [],
          benefit: null,
        };
        db.players.push(created);
        return created;
      });
      await auditService.record({
        action: "create_player",
        entityType: "player",
        entityId: player.id,
        description: `Jugador creado: ${player.fullName}`,
        actor,
      });
      return player;
    }, "No pudimos crear el jugador.");
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
  async updateOwnProfile(id, updates) {
    return this.updatePlayer(id, {
      firstName: updates.firstName,
      lastName: updates.lastName,
      fullName: `${updates.firstName || ""} ${updates.lastName || ""}`.trim(),
      birthDate: updates.birthDate,
      phone: updates.phone,
      email: updates.email,
      dni: updates.dni,
    }, id);
  },
  async updateAvatar(id, avatarDataUrl) {
    return this.updatePlayer(id, { avatar: avatarDataUrl }, id);
  },
  async saveBenefit(playerId, payload, actor = "admin-1") {
    return mockRequest(async () => {
      const benefit = mutateMockData((db) => {
        const player = db.players.find((item) => item.id === playerId);
        if (!player) return null;
        const startedAt = new Date().toISOString().slice(0, 10);
        const months = payload.indefinite ? null : Number(payload.months);
        const expiresAt = payload.indefinite
          ? null
          : new Date(new Date(`${startedAt}T12:00:00`).setMonth(new Date(`${startedAt}T12:00:00`).getMonth() + months)).toISOString().slice(0, 10);
        player.benefit = {
          percentage: Number(payload.percentage),
          startedAt,
          months,
          expiresAt,
          indefinite: Boolean(payload.indefinite),
        };
        return player.benefit;
      });
      await auditService.record({
        action: "save_player_benefit",
        entityType: "player",
        entityId: playerId,
        description: `Beneficio actualizado: ${benefit?.percentage || 0}% de descuento.`,
        actor,
      });
      return benefit;
    }, "No pudimos guardar el beneficio.");
  },
  async resetBenefit(playerId, actor = "admin-1") {
    return mockRequest(async () => {
      const player = mutateMockData((db) => {
        const target = db.players.find((item) => item.id === playerId);
        if (!target) return null;
        target.benefit = null;
        return target;
      });
      await auditService.record({
        action: "reset_player_benefit",
        entityType: "player",
        entityId: playerId,
        description: "Beneficio restablecido a pago normal.",
        actor,
      });
      return player;
    }, "No pudimos restablecer el beneficio.");
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
