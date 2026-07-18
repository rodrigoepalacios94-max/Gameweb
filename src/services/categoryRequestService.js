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
        target.status = "Aprobada";
        return target;
      });
      await auditService.record({
        action: "approve_category_downgrade",
        entityType: "category_change_request",
        entityId: id,
        description: "Solicitud de descenso aprobada en mock.",
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
