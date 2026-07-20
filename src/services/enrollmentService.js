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
        const player = db.players.find((item) => item.id === payload.playerId);
        if (player?.status?.includes("Bloqueado")) {
          throw new Error("Tu cuenta esta bloqueada y no podes inscribirte a torneos.");
        }
        const tournament = db.tournaments.find((item) => item.id === payload.tournamentId);
        const category = db.categories.find((item) => item.id === payload.categoryId);
        const alreadyRegistered = db.enrollments.some(
          (enrollment) =>
            enrollment.tournamentId === payload.tournamentId &&
            enrollment.playerId === payload.playerId &&
            enrollment.categoryId === payload.categoryId &&
            enrollment.status !== "Rechazada",
        );
        if (alreadyRegistered) return db.enrollments.find((enrollment) => enrollment.tournamentId === payload.tournamentId && enrollment.playerId === payload.playerId && enrollment.categoryId === payload.categoryId);
        const enrollment = {
          id: createMockId("reg"),
          status: "Pendiente de pago",
          payment: "Pendiente",
          date: new Date().toISOString().slice(0, 10),
          categoryName: category ? `${category.name} ${category.branch}` : payload.categoryName,
          ...payload,
        };
        db.enrollments.push(enrollment);
        if (tournament) {
          tournament.participants = [...new Set([...(tournament.participants || []), payload.playerId])];
          const stage = tournament.categoryStages?.find((item) => item.categoryId === payload.categoryId);
          if (stage) {
            stage.participants = [...new Set([...(stage.participants || []), payload.playerId])];
            stage.inscriptionsCount = stage.participants.length;
          }
        }
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
