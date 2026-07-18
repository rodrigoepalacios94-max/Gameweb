import { mockRankings, mockRankingMovements } from "../mocks/mockRankings";
import { mockPlayers } from "../mocks/mockPlayers";

export const rankingService = {
  getRankingByCategory(categoryId) {
    return mockRankings
      .filter((entry) => entry.categoryId === categoryId)
      .map((entry) => ({
        ...entry,
        player: mockPlayers.find((player) => player.id === entry.playerId),
      }))
      .sort((a, b) => a.position - b.position);
  },
  getMovementsByPlayer(playerId) {
    return mockRankingMovements.filter((movement) => movement.playerId === playerId);
  },
};
