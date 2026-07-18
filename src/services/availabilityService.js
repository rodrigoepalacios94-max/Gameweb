import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { mockRequest } from "./serviceUtils";

function playerIdsForMatch(match) {
  return [match?.playerAId, match?.playerBId].filter(Boolean);
}

function ensureAvailabilityStore(db) {
  if (!db.matchAvailability) db.matchAvailability = [];
  return db.matchAvailability;
}

function getAvailabilityRecord(db, matchId, playerId) {
  return ensureAvailabilityStore(db).find((item) => item.matchId === matchId && item.playerId === playerId) || null;
}

function hasPendingRival(match, playerId) {
  if (!match) return false;
  if (match.playerAId === playerId) return !match.playerBId || match.playerB === "A definir";
  if (match.playerBId === playerId) return !match.playerAId || match.playerA === "A definir";
  return false;
}

function decorateMatchForPlayer(db, match, playerId) {
  const playerAvailability = getAvailabilityRecord(db, match.id, playerId);
  const opponentId = match.playerAId === playerId ? match.playerBId : match.playerAId;
  const opponentName = match.playerAId === playerId ? match.playerB : match.playerA;
  const opponentAvatar = match.playerAId === playerId ? match.playerBAvatar : match.playerAAvatar;
  return {
    ...match,
    opponentId,
    opponent: opponentName || "A definir",
    opponentAvatar,
    attendance: playerAvailability || null,
    needsAttendanceConfirmation: ["Pendiente", "Pendiente de asistencia", "Reprogramado"].includes(match.status) && !playerAvailability,
    pendingRival: hasPendingRival(match, playerId),
  };
}

function updateMatchAttendanceStatus(match, availabilityStore) {
  const playerIds = playerIdsForMatch(match);
  const confirmed = playerIds.filter((playerId) => availabilityStore.some((item) => item.matchId === match.id && item.playerId === playerId && item.confirmed));
  match.attendanceStatus = Object.fromEntries(playerIds.map((playerId) => [
    playerId,
    confirmed.includes(playerId) ? "Confirmada" : "Pendiente",
  ]));
  if (playerIds.length === 2 && confirmed.length === 2 && match.status === "Pendiente de asistencia") {
    match.status = "Listo para programar";
  }
}

export const availabilityService = {
  async getPlayerAttendanceRequests(playerId = "player-1") {
    return mockRequest(() => readMockData((db) =>
      db.matches
        .filter((match) => playerIdsForMatch(match).includes(playerId))
        .filter((match) => ["Pendiente", "Pendiente de asistencia", "Listo para programar", "Reprogramado"].includes(match.status))
        .map((match) => decorateMatchForPlayer(db, match, playerId)),
    ), "No pudimos cargar solicitudes de asistencia.");
  },
  async getMatchAvailability(matchId) {
    return mockRequest(() => readMockData((db) => ensureAvailabilityStore(db).filter((item) => item.matchId === matchId)), "No pudimos cargar disponibilidad.");
  },
  async confirmAttendance(matchId, playerId, unavailableSlots = []) {
    return mockRequest(() => mutateMockData((db) => {
      const match = db.matches.find((item) => item.id === matchId);
      if (!match) return null;
      const store = ensureAvailabilityStore(db);
      const existing = getAvailabilityRecord(db, matchId, playerId);
      const payload = {
        matchId,
        tournamentId: match.tournamentId,
        categoryId: match.categoryId,
        playerId,
        confirmed: true,
        unavailableSlots,
        submittedAt: new Date().toISOString(),
        pendingRivalAtSubmit: hasPendingRival(match, playerId),
      };
      if (existing) Object.assign(existing, payload);
      else store.push(payload);
      updateMatchAttendanceStatus(match, store);
      return decorateMatchForPlayer(db, match, playerId);
    }), "No pudimos confirmar asistencia.");
  },
};
