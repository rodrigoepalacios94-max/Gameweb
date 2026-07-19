import { create34PlayerTestTournament, getTestTournamentDiagnostics as getDevTestTournamentDiagnostics, isTestTournamentName, simulatePreliminaryResults } from "../dev/tournamentTestFactory";
import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";
import { ensureTournamentCategoryStages, tournamentCategoryService } from "./tournamentCategoryService";

function getBracketKey(tournament, categoryId) {
  if (!categoryId) return tournament?.categoryStages?.find((stage) => stage.categoryId === tournament.playerCategoryId)?.bracketKey || tournament?.id;
  return tournament?.categoryStages?.find((stage) => stage.categoryId === categoryId)?.bracketKey || `${tournament?.id}::${categoryId}`;
}

export const tournamentService = {
  async getTournaments() {
    return mockRequest(() => readMockData((db) => db.tournaments), "No pudimos cargar los torneos.");
  },
  async getTournamentById(id) {
    return mockRequest(() => readMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === id) || null;
      if (tournament) ensureTournamentCategoryStages(db, tournament);
      return tournament;
    }), "No pudimos cargar el torneo.");
  },
  async getTournamentBracket(id, categoryId = null) {
    return mockRequest(() => readMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === id);
      if (tournament) ensureTournamentCategoryStages(db, tournament);
      const key = getBracketKey(tournament, categoryId);
      return db.brackets[key] || db.brackets[id] || null;
    }), "No pudimos cargar el cuadro.");
  },
  async getTournamentParticipants(id, categoryId = null) {
    return mockRequest(() =>
      readMockData((db) => {
        const tournament = db.tournaments.find((item) => item.id === id);
        if (!tournament) return [];
        const stages = ensureTournamentCategoryStages(db, tournament);
        const participantIds = categoryId
          ? stages.find((stage) => stage.categoryId === categoryId)?.participants || []
          : [...new Set(stages.flatMap((stage) => stage.participants || []))];
        return participantIds.map((playerId) => db.players.find((player) => player.id === playerId)).filter(Boolean);
      }), "No pudimos cargar los participantes.");
  },
  async getTournamentCategories(id) {
    return mockRequest(() =>
      readMockData((db) => {
        const tournament = db.tournaments.find((item) => item.id === id);
        return db.categories.filter((category) => tournament?.categories.includes(category.id));
      }), "No pudimos cargar las categorias del torneo.");
  },
  async getTournamentCategoryStages(id) {
    return tournamentCategoryService.getCategoryStages(id);
  },
  async createTournament(payload, actor = "admin-1") {
    return mockRequest(async () => {
      const shouldUseDevFactory = isTestTournamentName(payload.name);
      const tournament = shouldUseDevFactory
        ? create34PlayerTestTournament(payload)
        : mutateMockData((db) => {
            const created = {
              id: createMockId("tour"),
              status: "Inscripciones abiertas",
              participants: [],
              phases: [],
              categories: [],
              courts: [],
              matchFormat: payload.matchFormat || DEFAULT_MATCH_FORMAT,
              ...payload,
            };
            db.tournaments.push(created);
            return created;
          });
      await auditService.record({
        action: shouldUseDevFactory ? "create_dev_test_tournament" : "create_tournament",
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
  async closeRegistrations(id, actor = "admin-1") {
    return tournamentCategoryService.closeRegistrations(id, actor);
  },
  async updateCategoryFormat(id, categoryId, format) {
    return tournamentCategoryService.updateCategoryFormat(id, categoryId, format);
  },
  async confirmCategoryFormat(id, categoryId, format) {
    return tournamentCategoryService.confirmCategoryFormat(id, categoryId, format);
  },
  async confirmAllCategoryFormats(id) {
    return tournamentCategoryService.confirmAllCategoryFormats(id);
  },
  async generateCategoryBracket(id, categoryId) {
    return tournamentCategoryService.generateCategoryBracket(id, categoryId);
  },
  async generateAllCategoryBrackets(id) {
    return tournamentCategoryService.generateAllCategoryBrackets(id);
  },
  async cancelTournament(id, actor = "admin-1") {
    return this.updateTournament(id, { status: "Cancelado" }, actor);
  },
  async simulateTestPreliminaries(id, categoryId = null, actor = "admin-1") {
    return mockRequest(async () => {
      const result = simulatePreliminaryResults(id, categoryId);
      await auditService.record({
        action: "simulate_dev_preliminaries",
        entityType: "tournament",
        entityId: id,
        description: "Preliminares DEV simuladas en mock.",
        actor,
      });
      return result;
    }, "No pudimos simular las preliminares.");
  },
  async getTestTournamentDiagnostics(id) {
    return mockRequest(() => getDevTestTournamentDiagnostics(id), "No pudimos obtener diagnostico del torneo de prueba.");
  },
};
