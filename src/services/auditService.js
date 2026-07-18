import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { mockRequest } from "./serviceUtils";

export const auditService = {
  async getAuditLogs() {
    return mockRequest(() => readMockData((db) => db.auditLogs), "No pudimos cargar auditoria mock.");
  },
  async record({ action, entityType, entityId, description, actor = "admin-1" }) {
    return mockRequest(() =>
      mutateMockData((db) => {
        const log = {
          id: createMockId("audit"),
          action,
          entityType,
          entityId,
          description,
          date: new Date().toISOString(),
          actor,
        };
        db.auditLogs.unshift(log);
        return log;
      }), "No pudimos registrar auditoria mock.");
  },
};
