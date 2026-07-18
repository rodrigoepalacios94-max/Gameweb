import { mockMatches } from "../mocks/mockMatches";

export const matchService = {
  getMatches() {
    return mockMatches;
  },
  getPlayerMatches() {
    return mockMatches;
  },
  getMatchById(id) {
    return mockMatches.find((match) => match.id === id);
  },
  getMatchesByTournament(tournamentId) {
    return mockMatches.filter((match) => match.tournamentId === tournamentId);
  },
};
