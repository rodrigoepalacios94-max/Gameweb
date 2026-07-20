import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

export const adminService = {
  async getDashboardSummary() {
    return mockRequest(() =>
      readMockData((db) => {
        const activeTournaments = db.tournaments.filter((item) => item.status === "En juego");
        const openTournaments = db.tournaments.filter((item) => item.status === "Inscripciones abiertas");
        const pendingMatches = db.matches.filter((item) => ["Pendiente", "Programado", "Reprogramado", "W.O."].includes(item.status));
        const pendingResults = db.matches.filter((item) => ["W.O.", "Finalizado"].includes(item.status) && !item.auditLocked);
        const pendingDescents = db.categoryChangeRequests.filter((request) => request.status === "Pendiente");
        const pendingClaims = db.disciplineClaims.filter((claim) => claim.status === "Pendiente");
        const blockedPlayers = db.players.filter((player) => player.status.includes("Bloqueado"));
        return {
          tournaments: db.tournaments,
          players: db.players,
          matches: db.matches,
          notifications: db.notifications.filter((notification) => notification.role === "admin"),
          activeTournaments,
          openTournaments,
          pendingMatches,
          pendingResults,
          pendingDescents,
          pendingClaims,
          blockedPlayers,
          enrollments: db.enrollments,
        };
      }), "No pudimos cargar el dashboard administrativo.");
  },
  async getSettings() {
    return mockRequest(() => readMockData((db) => db.settings), "No pudimos cargar la configuracion.");
  },
  async createScoringSystem(payload, actor = "admin-1") {
    return mockRequest(async () => {
      const scoringSystem = mutateMockData((db) => {
        const created = { id: createMockId("score"), status: "Activo", ...payload };
        db.settings.scoringSystems.push(created);
        return created;
      });
      await auditService.record({
        action: "create_scoring_system",
        entityType: "scoring_system",
        entityId: scoringSystem.id,
        description: `Sistema de puntaje creado: ${scoringSystem.name}`,
        actor,
      });
      return scoringSystem;
    }, "No pudimos crear el sistema de puntaje.");
  },
  async updateScoringSystem(id, updates, actor = "admin-1") {
    return mockRequest(async () => {
      const scoringSystem = mutateMockData((db) => {
        const target = db.settings.scoringSystems.find((system) => system.id === id);
        if (!target) return null;
        Object.assign(target, updates);
        return target;
      });
      await auditService.record({
        action: "update_scoring_system",
        entityType: "scoring_system",
        entityId: id,
        description: "Sistema de puntaje actualizado en mock.",
        actor,
      });
      return scoringSystem;
    }, "No pudimos actualizar el sistema de puntaje.");
  },
  async toggleScoringSystem(id, actor = "admin-1") {
    return mockRequest(async () => {
      const scoringSystem = mutateMockData((db) => {
        const target = db.settings.scoringSystems.find((system) => system.id === id);
        if (!target) return null;
        target.status = target.status === "Activo" ? "Inactivo" : "Activo";
        return target;
      });
      await auditService.record({
        action: "toggle_scoring_system",
        entityType: "scoring_system",
        entityId: id,
        description: `Sistema de puntaje ${scoringSystem?.status || "actualizado"}.`,
        actor,
      });
      return scoringSystem;
    }, "No pudimos cambiar el estado del sistema de puntaje.");
  },
  async removeScoringSystem(id, actor = "admin-1") {
    return mockRequest(async () => {
      const scoringSystem = mutateMockData((db) => {
        const target = db.settings.scoringSystems.find((system) => system.id === id);
        if (!target) return null;
        const isUsed = db.tournaments.some((tournament) => tournament.scoringSystemId === id || tournament.scoringSystem === target.name);
        if (isUsed) {
          target.status = "Inactivo";
          target.archivedBecauseUsed = true;
          return target;
        }
        db.settings.scoringSystems = db.settings.scoringSystems.filter((system) => system.id !== id);
        return { ...target, removed: true };
      });
      await auditService.record({
        action: "remove_scoring_system",
        entityType: "scoring_system",
        entityId: id,
        description: scoringSystem?.removed ? "Sistema de puntaje eliminado en mock." : "Sistema de puntaje desactivado por historial futuro.",
        actor,
      });
      return scoringSystem;
    }, "No pudimos eliminar el sistema de puntaje.");
  },
  async getRegulation() {
    return mockRequest(() => readMockData((db) => db.settings.regulation || null), "No pudimos cargar el reglamento.");
  },
  async saveRegulation(payload, actor = "admin-1") {
    return mockRequest(async () => {
      const regulation = mutateMockData((db) => {
        const now = new Date().toISOString();
        db.settings.regulation = {
          id: db.settings.regulation?.id || createMockId("regulation"),
          title: payload.title,
          content: payload.content,
          updatedAt: now,
          publishedAt: db.settings.regulation?.publishedAt || now,
        };
        return db.settings.regulation;
      });
      await auditService.record({
        action: "save_regulation",
        entityType: "regulation",
        entityId: regulation.id,
        description: `Reglamento guardado: ${regulation.title}`,
        actor,
      });
      return regulation;
    }, "No pudimos guardar el reglamento.");
  },
  async deleteRegulation(actor = "admin-1") {
    return mockRequest(async () => {
      const deleted = mutateMockData((db) => {
        const current = db.settings.regulation;
        db.settings.regulation = null;
        return current;
      });
      await auditService.record({
        action: "delete_regulation",
        entityType: "regulation",
        entityId: deleted?.id || "regulation",
        description: "Reglamento eliminado en mock.",
        actor,
      });
      return deleted;
    }, "No pudimos eliminar el reglamento.");
  },
  async getScheduleByTournament(tournamentId) {
    return mockRequest(() => readMockData((db) => db.schedule.filter((slot) => slot.tournamentId === tournamentId)), "No pudimos cargar la programacion.");
  },
};
