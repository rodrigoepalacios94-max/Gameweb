export const mockDiscipline = {
  claims: [
    {
      id: "claim-1",
      match: "GAME 500 Primavera - Octavos",
      reportedPlayer: "Diego Soria",
      claimant: "Federico Ramos",
      reason: "Conducta antideportiva",
      status: "Pendiente",
      date: "2026-07-18",
    },
    {
      id: "claim-2",
      match: "GAME 250 Apertura - Semifinal",
      reportedPlayer: "Luciano Molina",
      claimant: "Sebastian Gallardo",
      reason: "Discusion reiterada",
      status: "Confirmado",
      date: "2026-03-21",
    },
  ],
  faults: [
    { id: "fault-1", playerId: "player-1", reason: "Demora injustificada", date: "2026-06-22" },
    { id: "fault-2", playerId: "player-4", reason: "Conducta antideportiva", date: "2026-03-21" },
    { id: "fault-3", playerId: "player-8", reason: "W.O. sin aviso", date: "2026-05-11" },
    { id: "fault-4", playerId: "player-8", reason: "Reclamo confirmado", date: "2026-06-04" },
    { id: "fault-5", playerId: "player-8", reason: "Doble W.O.", date: "2026-06-30" },
  ],
};
