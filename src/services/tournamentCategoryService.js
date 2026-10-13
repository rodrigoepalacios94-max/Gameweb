import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { mockRequest } from "./serviceUtils";
import { buildPreliminaryBracketFromResults, buildZoneEliminationBracket, ensureTournamentCategoryStages, generateCategoryBracketInDb, recommendTournamentFormat, TOURNAMENT_FORMATS } from "../domain/tournament-generation/core.js";

export { buildPreliminaryBracketFromResults, buildZoneEliminationBracket, distributeSeededPlayersIntoZones, ensureTournamentCategoryStages, generateCategoryBracketInDb, getCategoryLabel, makeProtectedPreliminaryPairs, recommendTournamentFormat, TOURNAMENT_FORMATS } from "../domain/tournament-generation/core.js";

export const tournamentCategoryService = {
  async getCategoryStages(tournamentId) {
    return mockRequest(() => readMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      return ensureTournamentCategoryStages(db, tournament);
    }), "No pudimos cargar categorias del torneo.");
  },
  async closeRegistrations(tournamentId, actor = "admin-1") {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return null;
      const stages = ensureTournamentCategoryStages(db, tournament);
      tournament.status = "Inscripciones cerradas";
      tournament.registrationClosedBy = actor;
      stages.forEach((stage) => {
        stage.inscriptionsCount = stage.participants?.length || 0;
        stage.recommendedFormat = recommendTournamentFormat(stage.inscriptionsCount);
        if (!stage.inscriptionsCount) {
          stage.status = "Sin inscriptos";
          stage.formatStatus = "empty";
          stage.format = "";
          stage.formatDecision = "empty";
          return;
        }
        if (stage.formatStatus !== "confirmed") {
          stage.format = stage.format || stage.recommendedFormat;
          stage.status = "Formato sugerido";
          stage.formatStatus = "suggested";
          stage.formatDecision = "suggested";
        }
      });
      return tournament;
    }), "No pudimos cerrar inscripciones.");
  },
  async updateCategoryFormat(tournamentId, categoryId, format) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament || !TOURNAMENT_FORMATS.includes(format)) return null;
      if (tournament.status === "Inscripciones abiertas") return null;
      const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
      if (!stage) return null;
      stage.format = format;
      stage.formatDecision = format === stage.recommendedFormat ? "suggested" : "manual";
      if (stage.formatStatus === "pending") stage.formatStatus = "suggested";
      if (stage.status === "Formato pendiente") stage.status = "Formato sugerido";
      return stage;
    }), "No pudimos actualizar formato por categoria.");
  },
  async confirmCategoryFormat(tournamentId, categoryId, format) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament || !TOURNAMENT_FORMATS.includes(format)) return null;
      if (tournament.status === "Inscripciones abiertas") return null;
      const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
      if (!stage) return null;
      if (!stage.inscriptionsCount) {
        stage.status = "Sin inscriptos";
        stage.formatStatus = "empty";
        return stage;
      }
      stage.format = format;
      stage.recommendedFormat = stage.recommendedFormat || recommendTournamentFormat(stage.inscriptionsCount);
      stage.formatDecision = format === stage.recommendedFormat ? "suggested" : "manual";
      stage.formatStatus = "confirmed";
      stage.status = "Formato confirmado";
      generateCategoryBracketInDb(db, tournamentId, categoryId);
      return stage;
    }), "No pudimos confirmar formato por categoria.");
  },
  async confirmAllCategoryFormats(tournamentId) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return [];
      if (tournament.status === "Inscripciones abiertas") return [];
      return ensureTournamentCategoryStages(db, tournament).map((stage) => {
        const format = stage.format || stage.recommendedFormat || recommendTournamentFormat(stage.inscriptionsCount);
        if (!format) {
          stage.status = "Sin inscriptos";
          stage.formatStatus = "empty";
          return stage;
        }
        stage.format = format;
        stage.recommendedFormat = stage.recommendedFormat || recommendTournamentFormat(stage.inscriptionsCount);
        stage.formatDecision = format === stage.recommendedFormat ? "suggested" : "manual";
        stage.formatStatus = "confirmed";
        stage.status = "Formato confirmado";
        generateCategoryBracketInDb(db, tournamentId, stage.categoryId);
        return stage;
      });
    }), "No pudimos confirmar formatos por categoria.");
  },
  async generateCategoryBracket(tournamentId, categoryId) {
    return mockRequest(() => mutateMockData((db) => generateCategoryBracketInDb(db, tournamentId, categoryId)), "No pudimos generar cuadro por categoria.");
  },
  async updateZoneQualifiers(tournamentId, categoryId, zoneId, qualifiers) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return null;
      const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
      const bracket = stage ? db.brackets[stage.bracketKey] : null;
      const zone = bracket?.zones?.find((item) => item.id === zoneId);
      const value = Number(qualifiers);
      if (!stage || !bracket || !zone || ![1, 2].includes(value)) return null;
      zone.qualifiers = value;
      stage.zonesConfig = {
        ...(stage.zonesConfig || {}),
        zones: bracket.zones.length,
        distribution: bracket.zoneDistribution || bracket.zones.map((item) => item.size),
        zoneQualifiers: {
          ...(stage.zonesConfig?.zoneQualifiers || {}),
          [zoneId]: value,
        },
      };
      bracket.rounds = [];
      bracket.zoneGeneratedAt = null;
      stage.status = "Zonas en juego";
      applyZoneValidation(bracket);
      return bracket;
    }), "No pudimos actualizar clasificados por zona.");
  },
  async generateZoneEliminationBracket(tournamentId, categoryId, options = {}) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return null;
      const stage = ensureTournamentCategoryStages(db, tournament).find((item) => item.categoryId === categoryId);
      const bracket = stage ? db.brackets[stage.bracketKey] : null;
      if (!stage || !bracket || stage.format !== "Zonas") return null;
      return buildZoneEliminationBracket(db, tournament, stage, bracket, options);
    }), "No pudimos generar la llave desde zonas.");
  },
  async generateAllCategoryBrackets(tournamentId) {
    return mockRequest(() => mutateMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      if (!tournament) return [];
      return ensureTournamentCategoryStages(db, tournament).map((stage) => generateCategoryBracketInDb(db, tournamentId, stage.categoryId));
    }), "No pudimos generar cuadros por categoria.");
  },
};
