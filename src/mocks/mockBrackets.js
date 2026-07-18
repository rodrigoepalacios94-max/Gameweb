export const mockBrackets = {
  "tour-3": {
    tournamentId: "tour-3",
    category: "4a Masculino",
    rounds: [
      {
        id: "octavos",
        name: "Octavos",
        matches: [
          { id: "br-1", matchId: "match-2", playerA: "Sebastian Gallardo", playerB: "Luciano Molina", score: "6-4 / 7-5", winner: "Sebastian Gallardo" },
          { id: "br-2", playerA: "Tomas Lescano", playerB: "BYE", score: "BYE", winner: "Tomas Lescano", bye: true },
          { id: "br-3", playerA: "Nicolas Pereyra", playerB: "BYE", score: "BYE", winner: "Nicolas Pereyra", bye: true },
          { id: "br-4", matchId: "match-5", playerA: "Diego Soria", playerB: "Federico Ramos", score: "W.O.", winner: "Nicolas Pereyra", walkover: true },
        ],
      },
      {
        id: "cuartos",
        name: "Cuartos",
        matches: [
          { id: "br-5", matchId: "match-1", playerA: "Sebastian Gallardo", playerB: "Tomas Lescano", score: "Programado", winner: null },
          { id: "br-6", playerA: "Nicolas Pereyra", playerB: "Ganador pendiente", score: "Pendiente", winner: null },
        ],
      },
      {
        id: "semifinal",
        name: "Semifinal",
        matches: [{ id: "br-7", playerA: "Ganador cuartos 1", playerB: "Ganador cuartos 2", score: "Pendiente", winner: null }],
      },
      {
        id: "final",
        name: "Final",
        matches: [{ id: "br-8", playerA: "Ganador semifinal", playerB: "A definir", score: "Pendiente", winner: null }],
      },
    ],
  },
  "tour-1": {
    tournamentId: "tour-1",
    category: "4a Masculino",
    preliminaries: [
      { matchId: "match-4", playerA: "Sebastian Gallardo", playerB: "Diego Soria", status: "Pendiente" },
      { playerA: "Tomas Lescano", playerB: "Federico Ramos", status: "Pendiente" },
    ],
    rounds: [
      {
        id: "cuadro-principal",
        name: "Cuadro principal",
        matches: [{ id: "br-1000-1", playerA: "Ganador preliminar", playerB: "Perdedor preliminar", score: "A programar", winner: null }],
      },
    ],
  },
};
