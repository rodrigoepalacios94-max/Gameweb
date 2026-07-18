import { readMockData } from "../mocks/mockDatabase";
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
  async getScheduleByTournament(tournamentId) {
    return mockRequest(() => readMockData((db) => db.schedule.filter((slot) => slot.tournamentId === tournamentId)), "No pudimos cargar la programacion.");
  },
};
