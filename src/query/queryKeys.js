export const queryKeys = {
  adminDashboard: () => ["admin", "dashboard"],
  adminPlayers: () => ["admin", "players"],
  playerHome: (playerId) => ["player", playerId, "home"],
  playerProfile: (playerId) => ["player", playerId, "profile"],
};
