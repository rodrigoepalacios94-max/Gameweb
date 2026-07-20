export const mockRegistrations = [];

export const mockDescentRequests = [];

export const mockSchedule = [];

export const mockSettings = {
  scoringSystems: [
    { name: "GAME 250", inscription: 20, preliminary: 30, preliminaryWin: 20, champion: 250, runnerUp: 160 },
    { name: "GAME 500", inscription: 40, preliminary: 50, preliminaryWin: 30, champion: 500, runnerUp: 300 },
    { name: "GAME 1000", inscription: 70, preliminary: 80, preliminaryWin: 50, champion: 1000, runnerUp: 650 },
    { name: "MASTER GAME 1500", inscription: 100, preliminary: 120, preliminaryWin: 80, champion: 1500, runnerUp: 950 },
  ],
  tournamentTypes: ["Preliminar", "Zonas", "Eliminacion Directa"],
  courts: ["Cancha 1", "Cancha 2", "Cancha 3", "Central"],
  timeSlots: ["Sabado 09:00", "Sabado 12:00", "Sabado 16:00", "Domingo 09:00", "Domingo 12:00", "Domingo 16:00"],
  discipline: {
    faultLimit: 3,
    limitAction: "Expulsion del torneo actual y bloqueo hasta rehabilitacion manual del profesor.",
  },
  notifications: ["Avisos dentro de GAME", "Correo electronico para eventos importantes"],
};
