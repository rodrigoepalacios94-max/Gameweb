import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { mockRequest } from "./serviceUtils";

const RESULT_GRACE_HOURS = 4;

function getScheduledDate(match) {
  if (!match.date || !match.time) return null;
  return new Date(`${match.date}T${match.time}:00`);
}

function isPendingResult(match, referenceDate) {
  const scheduledAt = getScheduledDate(match);
  if (!scheduledAt) return false;
  const deadline = new Date(scheduledAt.getTime() + RESULT_GRACE_HOURS * 60 * 60 * 1000);
  const hasResult = Boolean(match.result || match.winnerId || match.walkoverPlayerId);
  const blockedStatuses = ["Cancelado", "Suspendido", "Finalizado", "W.O.", "Doble W.O."];
  return referenceDate > deadline && !hasResult && !blockedStatuses.includes(match.status);
}

function buildPendingResultAlert(match, readIds) {
  const id = `operational-result-${match.id}`;
  return {
    id,
    role: "admin",
    type: "Resultado",
    title: "Resultado pendiente de cargar",
    message: `${match.tournament}: ${match.playerA} vs ${match.playerB}. Programado para ${match.date} - ${match.time}; ya pasaron mas de ${RESULT_GRACE_HOURS} horas sin resultado.`,
    date: match.date,
    time: match.time,
    read: readIds.includes(id),
    actionTo: `/admin/matches/${match.id}`,
    severity: "warning",
  };
}

function buildCourtConflictAlerts(matches, readIds) {
  const groups = matches.reduce((acc, match) => {
    if (!match.date || !match.time || !match.court) return acc;
    if (["Cancelado", "Suspendido", "Finalizado", "W.O.", "Doble W.O."].includes(match.status)) return acc;
    const key = `${match.date}|${match.time}|${match.court}`;
    acc[key] = acc[key] || [];
    acc[key].push(match);
    return acc;
  }, {});

  return Object.entries(groups)
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const [date, time, court] = key.split("|");
      const id = `operational-court-${date}-${time}-${court}`.replace(/\s+/g, "-").toLowerCase();
      const involved = group.map((match) => `${match.tournament}: ${match.playerA} vs ${match.playerB}`).join(" / ");
      return {
        id,
        role: "admin",
        type: "Programacion",
        title: "Conflicto de cancha",
        message: `${court} esta asignada el ${date} a las ${time} para ${group.length} partidos: ${involved}.`,
        date,
        time,
        read: readIds.includes(id),
        actionTo: group[0]?.id ? `/admin/matches/${group[0].id}` : "/admin/matches",
        severity: "danger",
      };
    });
}

export const operationalAlertService = {
  async getOperationalAlerts(referenceDate = new Date()) {
    return mockRequest(() =>
      readMockData((db) => {
        const readIds = db.operationalAlertReads || [];
        const pendingResults = db.matches
          .filter((match) => isPendingResult(match, referenceDate))
          .map((match) => buildPendingResultAlert(match, readIds));
        const courtConflicts = buildCourtConflictAlerts(db.matches, readIds);
        return [...pendingResults, ...courtConflicts];
      }), "No pudimos calcular los avisos operativos.");
  },
  async markAsRead(id) {
    return mockRequest(() =>
      mutateMockData((db) => {
        db.operationalAlertReads = db.operationalAlertReads || [];
        if (!db.operationalAlertReads.includes(id)) db.operationalAlertReads.push(id);
        return db.operationalAlertReads;
      }), "No pudimos marcar el aviso operativo.");
  },
  async markAllAsRead() {
    const alerts = await this.getOperationalAlerts();
    return mockRequest(() =>
      mutateMockData((db) => {
        db.operationalAlertReads = db.operationalAlertReads || [];
        alerts.forEach((alert) => {
          if (!db.operationalAlertReads.includes(alert.id)) db.operationalAlertReads.push(alert.id);
        });
        return db.operationalAlertReads;
      }), "No pudimos marcar los avisos operativos.");
  },
};
