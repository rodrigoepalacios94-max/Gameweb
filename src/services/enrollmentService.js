import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

export const enrollmentService = {
  async getEnrollmentsByTournament(tournamentId) {
    return mockRequest(() => readMockData((db) => db.enrollments.filter((enrollment) => enrollment.tournamentId === tournamentId)), "No pudimos cargar inscripciones.");
  },
  async getEnrollmentsByPlayer(playerId) {
    return mockRequest(() => readMockData((db) => db.enrollments.filter((enrollment) => enrollment.playerId === playerId)), "No pudimos cargar inscripciones del jugador.");
  },
  async enrollPlayer(payload) {
    return mockRequest(() =>
      mutateMockData((db) => {
        const enrollment = {
          id: createMockId("reg"),
          status: "Pendiente de pago",
          payment: "Pendiente",
          date: new Date().toISOString().slice(0, 10),
          ...payload,
        };
        db.enrollments.push(enrollment);
        return enrollment;
      }), "No pudimos inscribir al jugador.");
  },
  async confirmEnrollment(id, actor = "admin-1") {
    return mockRequest(async () => {
      const enrollment = mutateMockData((db) => {
        const target = db.enrollments.find((item) => item.id === id);
        if (!target) return null;
        target.status = "Confirmada";
        target.payment = "Confirmado";
        return target;
      });
      await auditService.record({
        action: "confirm_enrollment",
        entityType: "enrollment",
        entityId: id,
        description: "Inscripcion confirmada en mock.",
        actor,
      });
      return enrollment;
    }, "No pudimos confirmar inscripcion.");
  },
  async cancelEnrollment(id, actor = "admin-1") {
    return mockRequest(async () => {
      const enrollment = mutateMockData((db) => {
        const target = db.enrollments.find((item) => item.id === id);
        if (!target) return null;
        target.status = "Rechazada";
        return target;
      });
      await auditService.record({
        action: "cancel_enrollment",
        entityType: "enrollment",
        entityId: id,
        description: "Inscripcion cancelada o rechazada en mock.",
        actor,
      });
      return enrollment;
    }, "No pudimos cancelar inscripcion.");
  },
};
