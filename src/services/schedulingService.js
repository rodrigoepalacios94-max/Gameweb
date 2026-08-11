import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";
import { emailService } from "./emailService";
import { ensureTournamentCategoryStages } from "./tournamentCategoryService";

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
const GAME_TIMEZONE = "America/Argentina/Buenos_Aires";
const GAME_TIMEZONE_OFFSET = "-03:00";
const PLAYABLE_DB_STATUSES = new Set(["pending", "scheduled", "suspended", "rescheduled"]);
const BLOCKED_DB_STATUSES = new Set(["finished", "in_progress", "cancelled", "standby"]);

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

function saturdayBeforeFinal(finalsDate) {
  const finalDate = parseDate(finalsDate);
  if (Number.isNaN(finalDate.getTime())) return "";
  return toDateString(addDays(finalDate, -1));
}

function nextDefinitionWeekend(finalsDate) {
  const finalDate = parseDate(finalsDate);
  if (Number.isNaN(finalDate.getTime())) return { saturday: "", sunday: "" };
  return {
    saturday: toDateString(addDays(finalDate, 6)),
    sunday: toDateString(addDays(finalDate, 7)),
  };
}

function isSemifinalMatch(match) {
  return String(match?.round || match?.phase || "").toLowerCase().includes("semifinal");
}

function isFinalMatch(match) {
  const value = String(match?.round || match?.phase || "").toLowerCase();
  return value === "final";
}

function fullName(player) {
  return `${player?.first_name || ""} ${player?.last_name || ""}`.trim();
}

function dbCategoryLabel(row) {
  const category = row?.tournament_categories?.categories || row?.categories;
  return category ? `${category.name} ${category.branch || ""}`.trim() : "Categoria";
}

function localDateTimeParts(value) {
  if (!value) return { date: "", time: "A definir" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "A definir" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: GAME_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function scheduledAtFromSlot(date, time) {
  const normalizedTime = String(time || "00:00").length === 5 ? `${time}:00` : String(time || "00:00");
  return new Date(`${date}T${normalizedTime}${GAME_TIMEZONE_OFFSET}`).toISOString();
}

function mapScheduleTournament(row) {
  return row ? {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    semifinalsDate: row.semifinals_date,
    finalsDate: row.finals_date || row.end_date,
    schedule: row.schedule || {},
    courtCapacity: row.court_capacity || {},
    courts: row.courts || [],
  } : null;
}

function mapScheduleStage(row) {
  const category = row.categories;
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: category ? `${category.name} ${category.branch || ""}`.trim() : "Categoria",
  };
}

function mapScheduleMatch(row) {
  const parts = localDateTimeParts(row.scheduled_at);
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    tournamentCategoryId: row.tournament_category_id,
    categoryId: row.tournament_categories?.category_id,
    category: dbCategoryLabel(row),
    round: row.round_name || row.phase || "Partido",
    roundIndex: Number(row.round_index || 0),
    bracketSlot: Number(row.bracket_slot || 0),
    phase: row.phase,
    status: row.status,
    resultType: row.result_type,
    playerAId: row.player1_id,
    playerBId: row.player2_id,
    playerA: fullName(row.player1) || "A definir",
    playerB: fullName(row.player2) || "A definir",
    scheduledAt: row.scheduled_at,
    date: parts.date,
    time: parts.time,
    court: row.court || "A definir",
    metadata: row.metadata || {},
  };
}

async function fetchScheduleSeed(tournamentId) {
  const client = ensureSupabaseDataClient();
  const [{ data: tournament, error: tournamentError }, { data: stages, error: stagesError }, { data: matches, error: matchesError }] = await Promise.all([
    client.from("tournaments").select("id, name, start_date, end_date, semifinals_date, finals_date, schedule, court_capacity, courts").eq("id", tournamentId).maybeSingle(),
    client.from("tournament_categories").select("id, category_id, categories:category_id(id, name, branch)").eq("tournament_id", tournamentId),
    client.from("matches").select(`
      id,
      tournament_id,
      tournament_category_id,
      phase,
      round_name,
      round_index,
      bracket_slot,
      status,
      result_type,
      player1_id,
      player2_id,
      scheduled_at,
      court,
      metadata,
      tournament_categories:tournament_category_id (
        id,
        category_id,
        categories:category_id (
          id,
          name,
          branch
        )
      ),
      player1:player1_id (
        id,
        first_name,
        last_name
      ),
      player2:player2_id (
        id,
        first_name,
        last_name
      )
    `).eq("tournament_id", tournamentId),
  ]);
  if (tournamentError) {
    logSupabaseDataError("schedule tournament lookup", tournamentError);
    throw createDataError("No pudimos cargar el torneo para programar.", { cause: tournamentError });
  }
  if (stagesError) {
    logSupabaseDataError("schedule stages lookup", stagesError);
    throw createDataError("No pudimos cargar las categorias para programar.", { cause: stagesError });
  }
  if (matchesError) {
    logSupabaseDataError("schedule matches lookup", matchesError);
    throw createDataError("No pudimos cargar los partidos para programar.", { cause: matchesError });
  }
  return {
    tournament: mapScheduleTournament(tournament),
    stages: (stages || []).map(mapScheduleStage),
    matches: (matches || []).map(mapScheduleMatch),
  };
}

function isDbPlayableMatch(match) {
  if (!match?.playerAId || !match?.playerBId) return false;
  if (match.resultType === "BYE") return false;
  if (BLOCKED_DB_STATUSES.has(match.status)) return false;
  return PLAYABLE_DB_STATUSES.has(match.status);
}

function hasScheduledConflict(scheduled, match, slot) {
  const players = [match.playerAId, match.playerBId].filter(Boolean);
  return scheduled.some((item) =>
    item.date === slot.date &&
    item.time === slot.time &&
    players.some((playerId) => item.playerIds.includes(playerId))
  );
}

function isCourtBusy(scheduled, slot) {
  return scheduled.some((item) => item.date === slot.date && item.time === slot.time && item.court === slot.court);
}

function dbRoundPriority(match) {
  return ROUND_PRIORITY[match.round] || 30;
}

function calculateDbCategoryWeights(matches, stages) {
  const pendingByCategory = stages.map((stage) => ({
    categoryId: stage.categoryId,
    categoryName: stage.categoryName,
    pending: matches.filter((match) => match.categoryId === stage.categoryId && isDbPlayableMatch(match)).length,
  }));
  const totalPending = pendingByCategory.reduce((total, item) => total + item.pending, 0) || 1;
  return pendingByCategory.map((item) => ({ ...item, weight: item.pending / totalPending }));
}

function buildDbDistribution(matches, scheduledSlots, stages, weights) {
  return stages.map((stage) => {
    const pending = matches.filter((match) => match.categoryId === stage.categoryId && isDbPlayableMatch(match)).length;
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

function mapMatchToScheduleSlot(match) {
  return {
    id: `${match.scheduledAt || "slot"}-${match.id}`,
    tournamentId: match.tournamentId,
    matchId: match.id,
    categoryId: match.categoryId,
    category: match.category,
    round: match.round,
    playerIds: [match.playerAId, match.playerBId].filter(Boolean),
    players: `${match.playerA} vs ${match.playerB}`,
    weekend: "Programado",
    date: match.date,
    day: "",
    time: match.time,
    court: match.court,
    load: "Programado automaticamente",
  };
}

function getMultiWeekendSlots(tournament, startOffsetWeeks = 0, weekendCount = 10) {
  return Array.from({ length: weekendCount }, (_, index) => getWeekendSlots(tournament, startOffsetWeeks + index)).flat();
}

async function updateScheduledMatches(assignments) {
  if (!assignments.length) return;
  const client = ensureSupabaseDataClient();
  await Promise.all(assignments.map(async ({ match, slot }) => {
    const { error } = await client
      .from("matches")
      .update({
        scheduled_at: scheduledAtFromSlot(slot.date, slot.time),
        court: slot.court,
        status: "scheduled",
        metadata: {
          ...(match.metadata || {}),
          schedule: {
            source: "auto",
            updatedAt: new Date().toISOString(),
          },
        },
      })
      .eq("id", match.id);
    if (error) {
      logSupabaseDataError("schedule match update", error);
      throw createDataError("No pudimos guardar la programacion automatica.", { cause: error });
    }
  }));
  emailService.processQueuedGameEmails("match_programmed");
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

export const schedulingService = {
  async getScheduleByTournament(tournamentId) {
    const { stages, matches } = await fetchScheduleSeed(tournamentId);
    const weights = calculateDbCategoryWeights(matches, stages);
    const slots = matches
      .filter((match) => match.scheduledAt)
      .sort((a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.time).localeCompare(String(b.time)) ||
        String(a.court).localeCompare(String(b.court), undefined, { numeric: true })
      )
      .map(mapMatchToScheduleSlot);
    return {
      slots,
      distribution: buildDbDistribution(matches, slots, stages, weights),
      weights,
      progress: [],
      events: [],
    };
  },
  async recalculateSchedule(tournamentId, { preserveScheduled = true, startOffsetWeeks = 0, weekendCount = 10, startDateOverride = null, slotFilter = null } = {}) {
    const { tournament, stages, matches } = await fetchScheduleSeed(tournamentId);
    if (!tournament) throw createDataError("No encontramos el torneo para programar.");
    const scheduleTournament = startDateOverride ? { ...tournament, startDate: startDateOverride } : tournament;
    const weights = calculateDbCategoryWeights(matches, stages);
    const fixedScheduled = preserveScheduled
      ? matches.filter((match) => match.scheduledAt && match.status === "scheduled").map(mapMatchToScheduleSlot)
      : [];
    const candidates = matches
      .filter(isDbPlayableMatch)
      .filter((match) => !(preserveScheduled && match.scheduledAt && match.status === "scheduled"))
      .sort((a, b) => dbRoundPriority(b) - dbRoundPriority(a) || a.roundIndex - b.roundIndex || a.bracketSlot - b.bracketSlot);
    const scheduled = [...fixedScheduled];
    const assignments = [];
    const slots = getMultiWeekendSlots(scheduleTournament, startOffsetWeeks, weekendCount)
      .filter((slot) => (typeof slotFilter === "function" ? slotFilter(slot) : true));

    for (const match of candidates) {
      const slot = slots.find((item) => !isCourtBusy(scheduled, item) && !hasScheduledConflict(scheduled, match, item));
      if (!slot) continue;
      scheduled.push({
        id: `${slot.id}-${match.id}`,
        tournamentId,
        matchId: match.id,
        categoryId: match.categoryId,
        category: match.category,
        round: match.round,
        playerIds: [match.playerAId, match.playerBId].filter(Boolean),
        players: `${match.playerA} vs ${match.playerB}`,
        weekend: slot.weekend,
        date: slot.date,
        day: slot.day,
        time: slot.time,
        court: slot.court,
        load: "Asignado automaticamente por categoria y disponibilidad de cancha",
      });
      assignments.push({ match, slot });
    }

    await updateScheduledMatches(assignments);
    const refreshed = await this.getScheduleByTournament(tournamentId);
    return {
      ...refreshed,
      scheduledCount: assignments.length,
      unscheduledCount: candidates.length - assignments.length,
      distribution: buildDbDistribution(matches, scheduled, stages, weights),
    };
  },
  async suspendMatch(matchId, reason = "Suspension administrativa") {
    const client = ensureSupabaseDataClient();
    const { data: match, error: lookupError } = await client
      .from("matches")
      .select("id, tournament_id, status, scheduled_at, court, metadata")
      .eq("id", matchId)
      .maybeSingle();
    if (lookupError) {
      logSupabaseDataError("suspend match lookup", lookupError);
      throw createDataError("No pudimos cargar el partido a suspender.", { cause: lookupError });
    }
    if (!match || BLOCKED_DB_STATUSES.has(match.status)) return null;
    const previousSlot = { scheduledAt: match.scheduled_at, court: match.court };
    const { error } = await client
      .from("matches")
      .update({
        status: "rescheduled",
        scheduled_at: null,
        court: null,
        metadata: {
          ...(match.metadata || {}),
          suspension: { type: "match", reason, previousSlot, createdAt: new Date().toISOString() },
        },
      })
      .eq("id", matchId);
    if (error) {
      logSupabaseDataError("suspend match update", error);
      throw createDataError("No pudimos suspender el partido.", { cause: error });
    }
    const recalculated = { slots: [], scheduledCount: 0, unscheduledCount: 1, requiresAvailability: true };
    emailService.processQueuedGameEmails("match_suspended");
    return { match, previousSlot, recalculated };
  },
  async suspendDay(tournamentId, date, fromTime = null, reason = "Suspension de jornada") {
    const { tournament, matches } = await fetchScheduleSeed(tournamentId);
    const suspendedMatches = matches.filter((match) =>
      match.date === date &&
      !BLOCKED_DB_STATUSES.has(match.status) &&
      (!fromTime || match.time >= fromTime)
    );
    const client = ensureSupabaseDataClient();
    await Promise.all(suspendedMatches.map(async (match) => {
      const previousSlot = { scheduledAt: match.scheduledAt, date: match.date, time: match.time, court: match.court };
      const { error } = await client
        .from("matches")
        .update({
          status: "rescheduled",
          scheduled_at: null,
          court: null,
          metadata: {
            ...(match.metadata || {}),
            suspension: { type: fromTime ? "partial-day" : "day", date, fromTime, reason, previousSlot, createdAt: new Date().toISOString() },
          },
        })
        .eq("id", match.id);
      if (error) {
        logSupabaseDataError("suspend day match update", error);
        throw createDataError("No pudimos suspender la jornada.", { cause: error });
      }
    }));
    const hasSuspendedSemifinal = suspendedMatches.some(isSemifinalMatch);
    let recalculated = { slots: [], scheduledCount: 0, unscheduledCount: suspendedMatches.length, requiresAvailability: true };
    if (hasSuspendedSemifinal && tournament?.finalsDate) {
      const semifinalSaturday = saturdayBeforeFinal(tournament.finalsDate);
      const updateSemifinalDate = async (semifinalsDate, finalsDate = tournament.finalsDate) => {
        const { error } = await client
          .from("tournaments")
          .update({ semifinals_date: semifinalsDate, finals_date: finalsDate, end_date: finalsDate })
          .eq("id", tournamentId);
        if (error) {
          logSupabaseDataError("suspend day tournament definition dates update", error);
          throw createDataError("No pudimos actualizar las fechas de definicion.", { cause: error });
        }
      };

      await updateSemifinalDate(semifinalSaturday);
      recalculated = {
        ...recalculated,
        semifinalsDate: semifinalSaturday,
        finalsDate: tournament.finalsDate,
      };
    }
    emailService.processQueuedGameEmails("day_suspended");
    return { suspendedMatches, recalculated };
  },
  async suspendWeekend(tournamentId, startDate, reason = "Suspension de fin de semana") {
    const start = parseDate(startDate);
    const dates = [toDateString(start), toDateString(addDays(start, 1))];
    const { tournament, matches } = await fetchScheduleSeed(tournamentId);
    const suspendedMatches = matches.filter((match) => dates.includes(match.date) && !BLOCKED_DB_STATUSES.has(match.status));
    const client = ensureSupabaseDataClient();
    await Promise.all(suspendedMatches.map(async (match) => {
      const previousSlot = { scheduledAt: match.scheduledAt, date: match.date, time: match.time, court: match.court };
      const { error } = await client
        .from("matches")
        .update({
          status: "rescheduled",
          scheduled_at: null,
          court: null,
          metadata: {
            ...(match.metadata || {}),
            suspension: { type: "weekend", dates, reason, previousSlot, createdAt: new Date().toISOString() },
          },
        })
        .eq("id", match.id);
      if (error) {
        logSupabaseDataError("suspend weekend match update", error);
        throw createDataError("No pudimos suspender el fin de semana.", { cause: error });
      }
    }));
    const definitionSaturday = tournament?.finalsDate ? saturdayBeforeFinal(tournament.finalsDate) : "";
    const affectsDefinition = suspendedMatches.some(isFinalMatch) ||
      (suspendedMatches.some(isSemifinalMatch) && dates.includes(definitionSaturday) && dates.includes(tournament?.finalsDate));
    const nextWeekend = affectsDefinition && tournament?.finalsDate ? nextDefinitionWeekend(tournament.finalsDate) : null;
    if (nextWeekend?.saturday && nextWeekend?.sunday) {
      await client
        .from("tournaments")
        .update({ semifinals_date: nextWeekend.saturday, finals_date: nextWeekend.sunday, end_date: nextWeekend.sunday })
        .eq("id", tournamentId);
    }
    const recalculated = {
      slots: [],
      scheduledCount: 0,
      unscheduledCount: suspendedMatches.length,
      requiresAvailability: true,
      semifinalsDate: nextWeekend?.saturday || null,
      finalsDate: nextWeekend?.sunday || null,
    };
    emailService.processQueuedGameEmails("weekend_suspended");
    return { suspendedMatches, recalculated };
  },
  async createSchedulingStressScenario() {
    throw createDataError("El escenario de programacion de prueba no esta disponible en el flujo real.");
  },
  calculateCategoryWeights,
  calculateCategoryProgress,
  getSchedulableMatches,
};
