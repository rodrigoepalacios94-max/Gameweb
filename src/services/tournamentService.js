import { mockTournaments } from "../mocks/mockTournaments";
import { mockBrackets } from "../mocks/mockBrackets";

export const tournamentService = {
  getTournaments() {
    return mockTournaments;
  },
  getTournamentById(id) {
    return mockTournaments.find((tournament) => tournament.id === id);
  },
  getTournamentBracket(id) {
    return mockBrackets[id] || null;
  },
  createMockRegistration(payload) {
    return {
      id: `mock-registration-${Date.now()}`,
      status: "Confirmada",
      paymentStatus: "Pago mock aprobado",
      ...payload,
    };
  },
};
