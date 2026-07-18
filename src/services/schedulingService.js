import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { ensureTournamentCategoryStages } from "./tournamentCategoryService";
import { mockRequest } from "./serviceUtils";

const DAY_CONFIG = {
  saturday: { label: "Sabado", courts: 3 },
  sunday: { label: "Domingo", courts: 4 },
};

const ROUND_PRIORITY = {
  Final: 100,
  Semifinal: 85,
  Cuartos: 70,
  Octavos: 55,
  "16avos": 42,
  "32avos": 34,
  Preliminar: 20,
};

function parseDate(date) {
  return new Date(`${date}T00:00:00`);
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekendDates(startDate, offsetWeeks = 0) {
  const base = parseDate(startDate);
  const saturday = addDays(base, offsetWeeks * 7);
  const sunday = addDays(saturday, 1);
  return { saturday: toDateString(saturday), sunday: toDateString(sunday) };
}

function isPlayableMatch(match) {
  return !["Finalizado", "W.O.", "Doble W.O.", "Suspendido"].includes(match.status);
}

function categoryLabel(stage) {
  return stage?.categoryName || "Categoria";
}

function roundPriority(match) {
  return ROUND_PRIORITY[match.round] || 30;
}

function ensureScheduleMeta(db) {
  if (!db.scheduleEvents) db.scheduleEvents = [];
  return db.scheduleEvents;
}

function availabilityFor(db, match, playerId) {
  return (db.matchAvailability || []).find((item) => item.matchId === match.id && item.playerId === playerId);
}

function playerConfirmedOrHadChance(db, match, playerId) {
  if (!playerId || match.playerA === "A definir" || match.playerB === "A definir") return false;
  return Boolean(availabilityFor(db, match, playerId));
}

function slotLabel(date, time) {
  return `${date} ${time}`;
}

function playerUnavailable(db, match, playerId, date, time) {
  const availability = availabilityFor(db, match, playerId);
  if (!availability) return false;
  const label = slotLabel(date, time);
  return availability.unavailableSlots.includes(label) || availability.unavailableSlots.includes(`${date}|${time}`);
}

function hasPlayerConflict(scheduled, match, date, time) {
  const players = [match.playerAId, match.playerBId].filter(Boolean);
  return scheduled.some((slot) => slot.date === date && slot.time === time && players.some((playerId) => slot.playerIds.includes(playerId)));
}

function canUseSlot(db, scheduled, match, slot) {
  if (!match.playerAId || !match.playerBId) return false;
  if (!playerConfirmedOrHadChance(db, match, match.playerAId) || !playerConfirmedOrHadChance(db, match, match.playerBId)) return false;
  if (playerUnavailable(db, match, match.playerAId, slot.date, slot.time)) return false;
  if (playerUnavailable(db, match, match.playerBId, slot.date, slot.time)) return false;
  if (hasPlayerConflict(scheduled, match, slot.date, slot.time)) return false;
  return true;
}

function getWeekendSlots(tournament, weekendOffset = 0) {
  const dates = weekendDates(tournament.startDate, weekendOffset);
  const schedule = tournament.schedule || { saturday: ["10:00", "12:00", "14:00"], sunday: ["09:00", "11:00", "13:00"] };
  return Object.entries(DAY_CONFIG).flatMap(([dayKey, config]) => {
    const times = schedule[dayKey] || [];
    return times.flatMap((time) =>
      Array.from({ length: tournament.courtCapacity?.[dayKey] || config.courts }, (_, index) => ({
        id: `${dates[dayKey]}-${time}-${index + 1}`,
        weekend: `Fin de semana ${weekendOffset + 1}`,
        date: dates[dayKey],
        day: config.label,
        time,
        court: `Cancha ${index + 1}`,
      })),
    );
  });
}

export function calculateCategoryWeights(matches, stages) {
  const pendingByCategory = stages.map((stage) => ({
    categoryId: stage.categoryId,
    categoryName: categoryLabel(stage),
    pending: matches.filter((match) => match.categoryId === stage.categoryId && isPlayableMatch(match)).length,
  }));
  const totalPending = pendingByCategory.reduce((total, item) => total + item.pending, 0) || 1;
  return pendingByCategory.map((item) => ({
    ...item,
    weight: item.pending / totalPending,
  }));
}

export function calculateCategoryProgress(matches, stages) {
  return stages.map((stage) => {
    const categoryMatches = matches.filter((match) => match.categoryId === stage.categoryId);
    const total = categoryMatches.length || stage.progress?.totalMatches || 0;
    const completed = categoryMatches.filter((match) => ["Finalizado", "W.O."].includes(match.status)).length;
    const progress = total ? completed / total : 0;
    return {
      categoryId: stage.categoryId,
      categoryName: categoryLabel(stage),
      total,
      completed,
      progress,
      lag: Math.max(0, 1 - progress),
    };
  });
}

export function getSchedulableMatches(db, tournamentId) {
  return db.matches
    .filter((match) => match.tournamentId === tournamentId && isPlayableMatch(match))
    .filter((match) => match.playerAId && match.playerBId)
    .filter((match) => ["Pendiente", "Pendiente de asistencia", "Listo para programar", "Reprogramado", "Programado"].includes(match.status));
}

function scoreMatch(match, weights, progress) {
  const weight = weights.find((item) => item.categoryId === match.categoryId)?.weight || 0;
  const lag = progress.find((item) => item.categoryId === match.categoryId)?.lag || 0;
  return roundPriority(match) + weight * 35 + lag * 25;
}

function buildDistribution(matches, scheduledSlots, stages, weights) {
  return stages.map((stage) => {
    const pending = matches.filter((match) => match.categoryId === stage.categoryId && isPlayableMatch(match)).length;
    const programmed = scheduledSlots.filter((slot) => slot.categoryId === stage.categoryId).length;
    return {
      categoryId: stage.categoryId,
      categoryName: stage.categoryName,
      pending,
      programmed,
      weight: weights.find((item) => item.categoryId === stage.categoryId)?.weight || 0,
    };
  });
}

export function generateWeekendScheduleInDb(db, tournamentId, weekendOffset = 0) {
  const tournament = db.tournaments.find((item) => item.id === tournamentId);
  if (!tournament) return null;
  const stages = ensureTournamentCategoryStages(db, tournament);
  const allMatches = getSchedulableMatches(db, tournamentId);
  const weights = calculateCategoryWeights(allMatches, stages);
  const progress = calculateCategoryProgress(db.matches.filter((match) => match.tournamentId === tournamentId), stages);
  const slots = getWeekendSlots(tournament, weekendOffset);
  const scheduled = [];
  const sortedMatches = [...allMatches].sort((a, b) => scoreMatch(b, weights, progress) - scoreMatch(a, weights, progress));

  for (const slot of slots) {
    const alreadyScheduledCategoryCount = Object.fromEntries(stages.map((stage) => [
      stage.categoryId,
      scheduled.filter((item) => item.categoryId === stage.categoryId).length,
    ]));
    const nextMatch = sortedMatches
      .filter((match) => !scheduled.some((item) => item.matchId === match.id))
      .sort((a, b) => {
        const aWeight = weights.find((item) => item.categoryId === a.categoryId)?.weight || 0;
        const bWeight = weights.find((item) => item.categoryId === b.categoryId)?.weight || 0;
        const aDeficit = aWeight * (scheduled.length + 1) - (alreadyScheduledCategoryCount[a.categoryId] || 0);
        const bDeficit = bWeight * (scheduled.length + 1) - (alreadyScheduledCategoryCount[b.categoryId] || 0);
        return bDeficit - aDeficit || scoreMatch(b, weights, progress) - scoreMatch(a, weights, progress);
      })
      .find((match) => canUseSlot(db, scheduled, match, slot));

    if (!nextMatch) continue;
    Object.assign(nextMatch, {
      date: slot.date,
      time: slot.time,
      court: slot.court,
      status: "Programado",
      scheduleWeekend: slot.weekend,
    });
    scheduled.push({
      id: `${slot.id}-${nextMatch.id}`,
      tournamentId,
      matchId: nextMatch.id,
      categoryId: nextMatch.categoryId,
      category: nextMatch.category,
      round: nextMatch.round,
      playerIds: [nextMatch.playerAId, nextMatch.playerBId],
      players: `${nextMatch.playerA} vs ${nextMatch.playerB}`,
      weekend: slot.weekend,
      date: slot.date,
      day: slot.day,
      time: slot.time,
      court: slot.court,
      load: "Asignado por peso proporcional y disponibilidad",
    });
  }

  db.schedule = db.schedule.filter((slot) => !(slot.tournamentId === tournamentId && slot.weekend === `Fin de semana ${weekendOffset + 1}`));
  db.schedule.push(...scheduled);
  tournament.scheduleSummary = buildDistribution(allMatches, scheduled, stages, weights);
  return {
    slots: scheduled,
    distribution: tournament.scheduleSummary,
    weights,
    progress,
  };
}

function clearMatchSchedule(match) {
  Object.assign(match, {
    date: "",
    time: "A definir",
    court: "A definir",
  });
}

function makeStressPlayer(categoryId, categoryName, index) {
  return {
    id: `stress-${categoryId}-${index}`,
    firstName: "Stress",
    lastName: `${categoryName}-${index}`,
    fullName: `Stress ${categoryName} ${index}`,
    categoryId,
    categoryName,
    ranking: index,
    points: 0,
    status: "Activo",
    avatar: "",
    discipline: { faults: 0, limit: 3, status: "Sin sanciones" },
    isSchedulingStress: true,
  };
}

function createStressMatches(db, tournament, stage, count, sharedPlayer = null) {
  const matches = [];
  for (let index = 0; index < count; index += 1) {
    const playerA = sharedPlayer && index === 0 ? sharedPlayer : makeStressPlayer(stage.categoryId, stage.categoryName, index * 2 + 1);
    const playerB = makeStressPlayer(stage.categoryId, stage.categoryName, index * 2 + 2);
    [playerA, playerB].forEach((player) => {
      if (!db.players.some((item) => item.id === player.id)) db.players.push(player);
      if (!stage.participants.includes(player.id)) stage.participants.push(player.id);
    });
    const match = {
      id: `stress-match-${stage.categoryId}-${index + 1}`,
      tournamentId: tournament.id,
      categoryId: stage.categoryId,
      tournament: tournament.name,
      category: stage.categoryName,
      round: index < 2 ? "Semifinal" : index < 4 ? "Cuartos" : "Preliminar",
      phase: index < 4 ? "Cuadro principal" : "Preliminar",
      playerAId: playerA.id,
      playerA: playerA.fullName,
      playerAAvatar: playerA.avatar,
      playerBId: playerB.id,
      playerB: playerB.fullName,
      playerBAvatar: playerB.avatar,
      opponentId: playerB.id,
      opponent: playerB.fullName,
      opponentAvatar: playerB.avatar,
      date: "",
      time: "A definir",
      court: "A definir",
      status: "Listo para programar",
      result: null,
      sets: [],
      winnerId: null,
      discipline: { claims: [], confirmedFaults: [] },
      isSchedulingStress: true,
    };
    matches.push(match);
    [playerA.id, playerB.id].forEach((playerId) => {
      db.matchAvailability.push({
        matchId: match.id,
        tournamentId: tournament.id,
        categoryId: stage.categoryId,
        playerId,
        confirmed: true,
        unavailableSlots: index === 0 && playerId === playerA.id ? ["2026-10-03 10:00"] : [],
        submittedAt: "2026-09-30T10:00:00.000Z",
      });
    });
  }
  db.matches.push(...matches);
}

function createStressScenarioInDb(db) {
  const tournamentId = "stress-40-20-10";
  db.tournaments = db.tournaments.filter((item) => item.id !== tournamentId);
  db.matches = db.matches.filter((item) => item.tournamentId !== tournamentId);
  db.schedule = db.schedule.filter((item) => item.tournamentId !== tournamentId);
  db.matchAvailability = (db.matchAvailability || []).filter((item) => item.tournamentId !== tournamentId);

  const stages = [
    { categoryId: "cat-m2", categoryName: "2a Masculino", format: "Preliminar", participants: [], inscriptionsCount: 80, bracketKey: `${tournamentId}::cat-m2`, status: "En programacion" },
    { categoryId: "cat-m3", categoryName: "3a Masculino", format: "Eliminacion Directa", participants: [], inscriptionsCount: 40, bracketKey: `${tournamentId}::cat-m3`, status: "En programacion" },
    { categoryId: "cat-f4", categoryName: "4a Femenino", format: "Zonas", participants: [], inscriptionsCount: 20, bracketKey: `${tournamentId}::cat-f4`, status: "En programacion" },
  ];
  const tournament = {
    id: tournamentId,
    name: "DEV Programacion 40/20/10",
    description: "Escenario mock de distribucion proporcional.",
    startDate: "2026-10-03",
    semifinalsDate: "2026-10-10",
    finalsDate: "2026-10-11",
    status: "En programacion",
    type: "Formato por categoria",
    scoringSystem: "GAME 1000",
    matchFormat: { bestOfSets: 3, gamesPerSet: 6, useSuperTiebreak: true, superTiebreakInDecidingSet: true },
    price: 0,
    categories: stages.map((stage) => stage.categoryId),
    categoryStages: stages,
    playerCategoryId: "cat-m2",
    playerCategoryName: "2a Masculino",
    courts: ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4"],
    schedule: { saturday: ["10:00", "12:00", "14:00", "16:00"], sunday: ["09:00", "11:00", "13:00"] },
    courtCapacity: { saturday: 3, sunday: 4 },
    participants: [],
    phases: ["Preliminar", "Cuadro principal"],
    isSchedulingStress: true,
  };
  db.tournaments.push(tournament);

  const sharedPlayer = makeStressPlayer("cat-m2", "2a Masculino", 999);
  sharedPlayer.id = "stress-shared-player";
  sharedPlayer.fullName = "Stress Doble Categoria";
  createStressMatches(db, tournament, stages[0], 40, sharedPlayer);
  createStressMatches(db, tournament, stages[1], 20, sharedPlayer);
  createStressMatches(db, tournament, stages[2], 10);
  tournament.participants = [...new Set(stages.flatMap((stage) => stage.participants))];
  const generated = generateWeekendScheduleInDb(db, tournamentId, 0);
  return { tournament, generated };
}

export const schedulingService = {
  async getScheduleByTournament(tournamentId) {
    return mockRequest(() => readMockData((db) => {
      const tournament = db.tournaments.find((item) => item.id === tournamentId);
      const stages = ensureTournamentCategoryStages(db, tournament);
      const matches = db.matches.filter((match) => match.tournamentId === tournamentId);
      const weights = calculateCategoryWeights(matches, stages);
      const progress = calculateCategoryProgress(matches, stages);
      return {
        slots: db.schedule.filter((slot) => slot.tournamentId === tournamentId),
        distribution: tournament?.scheduleSummary || buildDistribution(matches, db.schedule.filter((slot) => slot.tournamentId === tournamentId), stages, weights),
        weights,
        progress,
        events: ensureScheduleMeta(db).filter((event) => event.tournamentId === tournamentId),
      };
    }), "No pudimos cargar programacion dinamica.");
  },
  async recalculateSchedule(tournamentId) {
    return mockRequest(() => mutateMockData((db) => generateWeekendScheduleInDb(db, tournamentId, 0)), "No pudimos recalcular programacion.");
  },
  async suspendMatch(matchId, reason = "Suspension administrativa") {
    return mockRequest(() => mutateMockData((db) => {
      const match = db.matches.find((item) => item.id === matchId);
      if (!match || match.status === "Finalizado") return null;
      const previousSlot = { date: match.date, time: match.time, court: match.court };
      match.status = "Suspendido";
      match.suspensionReason = reason;
      clearMatchSchedule(match);
      db.schedule = db.schedule.filter((slot) => slot.matchId !== matchId);
      ensureScheduleMeta(db).push({ tournamentId: match.tournamentId, type: "match", reason, matchId, previousSlot, createdAt: new Date().toISOString() });
      const recalculated = generateWeekendScheduleInDb(db, match.tournamentId, 0);
      return { match, previousSlot, recalculated };
    }), "No pudimos suspender partido.");
  },
  async suspendDay(tournamentId, date, fromTime = null, reason = "Suspension de jornada") {
    return mockRequest(() => mutateMockData((db) => {
      const suspendedMatches = db.matches.filter((match) =>
        match.tournamentId === tournamentId &&
        match.date === date &&
        match.status !== "Finalizado" &&
        (!fromTime || match.time >= fromTime),
      );
      suspendedMatches.forEach((match) => {
        match.status = "Reprogramado";
        match.suspensionReason = reason;
        clearMatchSchedule(match);
      });
      db.schedule = db.schedule.filter((slot) => !(slot.tournamentId === tournamentId && slot.date === date && (!fromTime || slot.time >= fromTime)));
      ensureScheduleMeta(db).push({ tournamentId, type: fromTime ? "partial-day" : "day", date, fromTime, reason, createdAt: new Date().toISOString() });
      const recalculated = generateWeekendScheduleInDb(db, tournamentId, 1);
      return { suspendedMatches, recalculated };
    }), "No pudimos suspender jornada.");
  },
  async suspendWeekend(tournamentId, startDate, reason = "Suspension de fin de semana") {
    return mockRequest(() => mutateMockData((db) => {
      const start = parseDate(startDate);
      const dates = [toDateString(start), toDateString(addDays(start, 1))];
      const suspendedMatches = db.matches.filter((match) => match.tournamentId === tournamentId && dates.includes(match.date) && match.status !== "Finalizado");
      suspendedMatches.forEach((match) => {
        match.status = "Reprogramado";
        match.suspensionReason = reason;
        clearMatchSchedule(match);
      });
      db.schedule = db.schedule.filter((slot) => !(slot.tournamentId === tournamentId && dates.includes(slot.date)));
      ensureScheduleMeta(db).push({ tournamentId, type: "weekend", dates, reason, createdAt: new Date().toISOString() });
      const recalculated = generateWeekendScheduleInDb(db, tournamentId, 1);
      return { suspendedMatches, recalculated };
    }), "No pudimos suspender fin de semana.");
  },
  async createSchedulingStressScenario() {
    return mockRequest(() => mutateMockData((db) => createStressScenarioInDb(db)), "No pudimos crear escenario de programacion.");
  },
  calculateCategoryWeights,
  calculateCategoryProgress,
  getSchedulableMatches,
};
