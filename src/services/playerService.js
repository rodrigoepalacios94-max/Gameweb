import { mockPlayers } from "../mocks/mockPlayers";
import { normalizeText } from "../utils/formatters";

export const playerService = {
  getPlayers() {
    return mockPlayers;
  },
  getPlayerById(id) {
    return mockPlayers.find((player) => player.id === id);
  },
  searchPlayers(query) {
    const normalizedQuery = normalizeText(query);
    return mockPlayers.filter((player) => normalizeText(player.fullName).includes(normalizedQuery));
  },
};
