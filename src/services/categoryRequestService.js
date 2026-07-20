import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

export const categoryRequestService = {
  async getCategoryChangeRequests() {
    return mockRequest(() => readMockData((db) => db.categoryChangeRequests), "No pudimos cargar solicitudes.");
  },
  async getRequestsByPlayer(playerId) {
    return mockRequest(() => readMockData((db) => db.categoryChangeRequests.filter((request) => request.playerId === playerId)), "No pudimos cargar solicitudes del jugador.");
  },
  async approveRequest(id, actor = "admin-1") {
    return mockRequest(async () => {
      const request = mutateMockData((db) => {
        const target = db.categoryChangeRequests.find((item) => item.id === id);
        if (!target) return null;
        const player = db.players.find((item) => item.id === target.playerId);
        const requestedCategory = db.categories.find((category) => category.id === target.requestedCategoryId);
        const previousCategoryId = player?.categoryId;
        const previousCategoryName = player?.categoryName;
        target.status = "Aprobada";
        target.resolvedAt = new Date().toISOString();
        target.previousCategoryId = previousCategoryId;
        target.previousCategoryName = previousCategoryName;
        target.newCategoryId = requestedCategory?.id || target.requestedCategoryId;
        target.newCategoryName = requestedCategory ? `${requestedCategory.name} ${requestedCategory.branch}` : target.requestedCategoryName;
        if (player && requestedCategory) {
          player.categoryId = requestedCategory.id;
          player.categoryName = `${requestedCategory.name} ${requestedCategory.branch}`;
          player.categoryHistory = [
            ...(player.categoryHistory || []),
            {
              id: `category-change-${Date.now()}`,
              previousCategoryId,
              previousCategoryName,
              newCategoryId: requestedCategory.id,
              newCategoryName: player.categoryName,
              date: new Date().toISOString().slice(0, 10),
              reason: target.note || "Descenso aprobado por profesor.",
              requestId: target.id,
            },
          ];
        }
        return target;
      });
      await auditService.record({
        action: "approve_category_downgrade",
        entityType: "category_change_request",
        entityId: id,
        description: request ? `Solicitud aprobada: ${request.previousCategoryName} a ${request.newCategoryName}.` : "Solicitud de descenso aprobada en mock.",
        actor,
      });
      return request;
    }, "No pudimos aprobar la solicitud.");
  },
  async rejectRequest(id, actor = "admin-1") {
    return mockRequest(async () => {
      const request = mutateMockData((db) => {
        const target = db.categoryChangeRequests.find((item) => item.id === id);
        if (!target) return null;
        target.status = "Rechazada";
        return target;
      });
      await auditService.record({
        action: "reject_category_downgrade",
        entityType: "category_change_request",
        entityId: id,
        description: "Solicitud de descenso rechazada en mock.",
        actor,
      });
      return request;
    }, "No pudimos rechazar la solicitud.");
  },
};
