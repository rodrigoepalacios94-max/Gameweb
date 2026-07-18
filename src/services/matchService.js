import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

export const matchService = {
  async getMatches() {
    return mockRequest(() => readMockData((db) => db.matches), "No pudimos cargar los partidos.");
  },
  async getPlayerMatches(playerId = "player-1") {
    return mockRequest(() =>
      readMockData((db) => db.matches.filter((match) => match.playerAId === playerId || match.playerBId === playerId)), "No pudimos cargar los partidos del jugador.");
  },
  async getMatchById(id) {
    return mockRequest(() => readMockData((db) => db.matches.find((match) => match.id === id) || null), "No pudimos cargar el partido.");
  },
  async getMatchesByPlayer(playerId) {
    return this.getPlayerMatches(playerId);
  },
  async getMatchesByTournament(tournamentId) {
    return mockRequest(() => readMockData((db) => db.matches.filter((match) => match.tournamentId === tournamentId)), "No pudimos cargar los partidos del torneo.");
  },
  async saveResult(id, { winnerId, result = "6-4 / 7-5", sets = [{ a: 6, b: 4 }, { a: 7, b: 5 }] }, actor = "admin-1") {
    return mockRequest(async () => {
      const match = mutateMockData((db) => {
        const target = db.matches.find((item) => item.id === id);
        if (!target) return null;
        Object.assign(target, {
          status: "Finalizado",
          result,
          sets,
          winnerId,
          walkoverPlayerId: null,
        });
        return target;
      });
      await auditService.record({
        action: "save_result",
        entityType: "match",
        entityId: id,
        description: "Resultado cargado o editado en mock.",
        actor,
      });
      return match;
    }, "No pudimos guardar el resultado.");
  },
  async registerWalkover(id, { walkoverPlayerId, doubleWalkover = false }, actor = "admin-1") {
    return mockRequest(async () => {
      const match = mutateMockData((db) => {
        const target = db.matches.find((item) => item.id === id);
        if (!target) return null;
        const winnerId = doubleWalkover ? null : walkoverPlayerId === target.playerAId ? target.playerBId : target.playerAId;
        Object.assign(target, {
          status: doubleWalkover ? "Doble W.O." : "W.O.",
          result: doubleWalkover ? "Doble W.O." : "Ganador por W.O.",
          sets: [],
          winnerId,
          walkoverPlayerId,
        });
        return target;
      });
      await auditService.record({
        action: doubleWalkover ? "register_double_walkover" : "register_walkover",
        entityType: "match",
        entityId: id,
        description: "W.O. registrado en mock.",
        actor,
      });
      return match;
    }, "No pudimos registrar el W.O.");
  },
  async rescheduleMatch(id, { date, time, court }, actor = "admin-1") {
    return mockRequest(async () => {
      const match = mutateMockData((db) => {
        const target = db.matches.find((item) => item.id === id);
        if (!target) return null;
        Object.assign(target, { date, time, court, status: "Reprogramado" });
        return target;
      });
      await auditService.record({
        action: "reschedule_match",
        entityType: "match",
        entityId: id,
        description: "Partido reprogramado en mock.",
        actor,
      });
      return match;
    }, "No pudimos reprogramar el partido.");
  },
};
