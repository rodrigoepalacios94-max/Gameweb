import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

function recalculateCategoryRanking(db, categoryId) {
  const entries = db.rankings
    .filter((entry) => entry.categoryId === categoryId && entry.points > 0)
    .sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));
  entries.forEach((entry, index) => {
    entry.position = index + 1;
    const player = db.players.find((item) => item.id === entry.playerId);
    if (player) player.ranking = entry.position;
  });
}

export const rankingService = {
  async getRankingByCategory(categoryId) {
    return mockRequest(() =>
      readMockData((db) =>
        db.rankings
          .filter((entry) => entry.categoryId === categoryId && entry.points > 0)
          .map((entry) => ({
            ...entry,
            player: db.players.find((player) => player.id === entry.playerId),
          }))
          .sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId))
          .map((entry, index) => ({ ...entry, position: index + 1 })),
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
        const numericPoints = Number(points);
        const player = db.players.find((item) => item.id === playerId);
        if (!player) return null;
        const created = {
          id: createMockId("move"),
          playerId,
          tournamentId,
          concept,
          points: numericPoints,
          date: new Date().toISOString().slice(0, 10),
          reason: reason || concept,
        };
        db.rankingMovements.push(created);
        let ranking = db.rankings.find((entry) => entry.playerId === playerId && entry.categoryId === player.categoryId);
        if (!ranking) {
          ranking = {
            playerId,
            categoryId: player.categoryId,
            position: null,
            points: 0,
          };
          db.rankings.push(ranking);
        }
        ranking.points = Math.max(0, Number(ranking.points || 0) + numericPoints);
        player.points = Math.max(0, Number(player.points || 0) + numericPoints);
        recalculateCategoryRanking(db, player.categoryId);
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
