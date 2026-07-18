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
          { id: "br-4", matchId: "match-5", playerA: "Nicolas Pereyra", playerB: "Luciano Molina", score: "W.O.", winner: "Nicolas Pereyra", walkover: true },
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
  "tour-3::cat-m4": {
    tournamentId: "tour-3",
    categoryId: "cat-m4",
    category: "4a Masculino",
    format: "Eliminacion Directa",
    rounds: [
      {
        id: "octavos",
        name: "Octavos",
        matches: [
          { id: "br-1", matchId: "match-2", playerA: "Sebastian Gallardo", playerB: "Luciano Molina", score: "6-4 / 7-5", winner: "Sebastian Gallardo" },
          { id: "br-2", playerA: "Tomas Lescano", playerB: "BYE", score: "BYE", winner: "Tomas Lescano", bye: true },
          { id: "br-3", playerA: "Nicolas Pereyra", playerB: "BYE", score: "BYE", winner: "Nicolas Pereyra", bye: true },
          { id: "br-4", matchId: "match-5", playerA: "Nicolas Pereyra", playerB: "Luciano Molina", score: "W.O.", winner: "Nicolas Pereyra", walkover: true },
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
  "tour-3::cat-m5": {
    tournamentId: "tour-3",
    categoryId: "cat-m5",
    category: "5a Masculino",
    format: "Eliminacion Directa",
    rounds: [
      { id: "final-m5", name: "Final", matches: [{ id: "br-m5-1", playerA: "Diego Soria", playerB: "A definir", score: "Pendiente", winner: null }] },
    ],
  },
  "tour-1": {
    tournamentId: "tour-1",
    category: "4a Masculino",
    preliminaries: [
      { matchId: "match-4", playerA: "Sebastian Gallardo", playerB: "Tomas Lescano", status: "Pendiente" },
      { playerA: "Nicolas Pereyra", playerB: "Luciano Molina", status: "Pendiente" },
    ],
    rounds: [
      {
        id: "cuadro-principal",
        name: "Cuadro principal",
        matches: [{ id: "br-1000-1", playerA: "Ganador preliminar", playerB: "Perdedor preliminar", score: "A programar", winner: null }],
      },
    ],
  },
  "tour-1::cat-m4": {
    tournamentId: "tour-1",
    categoryId: "cat-m4",
    category: "4a Masculino",
    format: "Preliminar",
    preliminaries: [
      { matchId: "match-4", playerA: "Sebastian Gallardo", playerB: "Tomas Lescano", status: "Pendiente" },
      { playerA: "Nicolas Pereyra", playerB: "Luciano Molina", status: "Pendiente" },
    ],
    rounds: [
      {
        id: "cuadro-principal",
        name: "Cuadro principal",
        matches: [{ id: "br-1000-1", playerA: "Ganador preliminar", playerB: "Perdedor preliminar", score: "A programar", winner: null }],
      },
    ],
  },
  "tour-1::cat-m3": {
    tournamentId: "tour-1",
    categoryId: "cat-m3",
    category: "3a Masculino",
    format: "Eliminacion Directa",
    rounds: [
      { id: "final-m3", name: "Final", matches: [{ id: "br-m3-1", playerA: "Federico Ramos", playerB: "A definir", score: "Pendiente", winner: null }] },
    ],
  },
  "tour-1::cat-m5": {
    tournamentId: "tour-1",
    categoryId: "cat-m5",
    category: "5a Masculino",
    format: "Zonas",
    zones: [
      { id: "zone-m5-a", name: "Zona A", qualifiers: 2, players: ["Diego Soria"] },
      { id: "zone-m5-b", name: "Zona B", qualifiers: 2, players: [] },
    ],
    rounds: [],
  },
  "tour-1::cat-f4": {
    tournamentId: "tour-1",
    categoryId: "cat-f4",
    category: "4a Femenino",
    format: "Preliminar",
    preliminaries: [
      { playerA: "Valentina Marquez", playerB: "Camila Suarez", status: "Pendiente" },
    ],
    rounds: [
      { id: "final-f4", name: "Final", matches: [{ id: "br-f4-1", playerA: "Ganador preliminar", playerB: "A definir", score: "A programar", winner: null }] },
    ],
  },
};
