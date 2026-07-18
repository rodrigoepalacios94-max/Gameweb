import { mockTournaments } from "../mocks/mockTournaments";

export const tournamentService = {
  getTournaments() {
    return mockTournaments;
  },
  getTournamentById(id) {
    return mockTournaments.find((tournament) => tournament.id === id);
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
