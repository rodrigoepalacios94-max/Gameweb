import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

export const tournamentService = {
  async getTournaments() {
    return mockRequest(() => readMockData((db) => db.tournaments), "No pudimos cargar los torneos.");
  },
  async getTournamentById(id) {
    return mockRequest(() => readMockData((db) => db.tournaments.find((tournament) => tournament.id === id) || null), "No pudimos cargar el torneo.");
  },
  async getTournamentBracket(id) {
    return mockRequest(() => readMockData((db) => db.brackets[id] || null), "No pudimos cargar el cuadro.");
  },
  async getTournamentParticipants(id) {
    return mockRequest(() =>
      readMockData((db) => {
        const tournament = db.tournaments.find((item) => item.id === id);
        return (tournament?.participants || []).map((playerId) => db.players.find((player) => player.id === playerId)).filter(Boolean);
      }), "No pudimos cargar los participantes.");
  },
  async getTournamentCategories(id) {
    return mockRequest(() =>
      readMockData((db) => {
        const tournament = db.tournaments.find((item) => item.id === id);
        return db.categories.filter((category) => tournament?.categories.includes(category.id));
      }), "No pudimos cargar las categorias del torneo.");
  },
  async createTournament(payload, actor = "admin-1") {
    return mockRequest(async () => {
      const tournament = mutateMockData((db) => {
        const created = {
          id: createMockId("tour"),
          status: "Borrador",
          participants: [],
          phases: [],
          categories: [],
          courts: [],
          ...payload,
        };
        db.tournaments.push(created);
        return created;
      });
      await auditService.record({
        action: "create_tournament",
        entityType: "tournament",
        entityId: tournament.id,
        description: `Torneo creado: ${tournament.name}`,
        actor,
      });
      return tournament;
    }, "No pudimos crear el torneo.");
  },
  async updateTournament(id, updates, actor = "admin-1") {
    return mockRequest(async () => {
      const tournament = mutateMockData((db) => {
        const target = db.tournaments.find((item) => item.id === id);
        if (!target) return null;
        Object.assign(target, updates);
        return target;
      });
      await auditService.record({
        action: "update_tournament",
        entityType: "tournament",
        entityId: id,
        description: "Torneo actualizado en mock.",
        actor,
      });
      return tournament;
    }, "No pudimos actualizar el torneo.");
  },
  async cancelTournament(id, actor = "admin-1") {
    return this.updateTournament(id, { status: "Cancelado" }, actor);
  },
};
