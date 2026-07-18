import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

export const rankingService = {
  async getRankingByCategory(categoryId) {
    return mockRequest(() =>
      readMockData((db) =>
        db.rankings
          .filter((entry) => entry.categoryId === categoryId)
          .map((entry) => ({
            ...entry,
            player: db.players.find((player) => player.id === entry.playerId),
          }))
          .sort((a, b) => a.position - b.position),
      ), "No pudimos cargar el ranking.");
  },
  async getPlayerRankingHistory(playerId) {
    return mockRequest(() => readMockData((db) => db.rankingMovements.filter((movement) => movement.playerId === playerId)), "No pudimos cargar el historial de ranking.");
  },
  async getMovementsByPlayer(playerId) {
    return this.getPlayerRankingHistory(playerId);
  },
  async adjustPoints({ playerId, tournamentId = null, concept = "Ajuste manual", points, reason }, actor = "admin-1") {
    return mockRequest(async () => {
      const movement = mutateMockData((db) => {
        const created = {
          id: createMockId("move"),
          playerId,
          tournamentId,
          concept,
          points,
          date: new Date().toISOString().slice(0, 10),
          reason: reason || concept,
        };
        db.rankingMovements.push(created);
        const ranking = db.rankings.find((entry) => entry.playerId === playerId);
        if (ranking) ranking.points += points;
        const player = db.players.find((item) => item.id === playerId);
        if (player) player.points += points;
        return created;
      });
      await auditService.record({
        action: "adjust_points",
        entityType: "player",
        entityId: playerId,
        description: `${concept}: ${points} puntos.`,
        actor,
      });
      return movement;
    }, "No pudimos ajustar puntos.");
  },
};
