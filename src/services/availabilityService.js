import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";

const matchAvailabilitySelect = `
  id,
  tournament_id,
  tournament_category_id,
  phase,
  round_name,
  round_index,
  bracket_slot,
  status,
  player1_id,
  player2_id,
  scheduled_at,
  court,
  metadata,
  created_at,
  tournaments:tournament_id (
    id,
    name
  ),
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
    last_name,
    avatar_url
  ),
  player2:player2_id (
    id,
    first_name,
    last_name,
    avatar_url
  )
`;

const REQUEST_STATUSES = new Set(["pending", "rescheduled", "suspended"]);

function fullName(player) {
  return `${player?.first_name || ""} ${player?.last_name || ""}`.trim();
}

function categoryLabel(row) {
  const category = row.tournament_categories?.categories;
  return category ? `${category.name} ${category.branch || ""}`.trim() : "Categoria";
}

function dbStatusLabel(status) {
  const labels = {
    pending: "Disponibilidad pendiente",
    rescheduled: "Reprogramacion pendiente",
    suspended: "Suspendido",
    scheduled: "Programado",
  };
  return labels[status] || status;
}

function localDateParts(value) {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
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

function groupSlotsByDay(slots = [], selectedValues = []) {
  const selected = new Set(selectedValues);
  const days = new Map();
  slots.forEach((slot) => {
    const value = slot.scheduled_at;
    const parts = localDateParts(value);
    if (!parts.date || !parts.time) return;
    if (!days.has(parts.date)) {
      days.set(parts.date, {
        key: parts.date,
        date: parts.date,
        label: parts.date,
        slots: [],
      });
    }
    days.get(parts.date).slots.push({
      id: `${parts.date}-${parts.time}`,
      value,
      time: parts.time,
      selectable: Boolean(slot.selectable),
      selected: selected.has(value),
      usedCount: Number(slot.used_count || 0),
      capacity: Number(slot.capacity || 0),
      status: slot.selectable ? "DISPONIBLE" : "NO DISPONIBLE",
    });
  });
  return [...days.values()].map((day) => ({
    ...day,
    slots: day.slots.sort((a, b) => a.time.localeCompare(b.time)),
  }));
}

function mapAvailabilityMatch(row, playerId, slots = [], response = null) {
  const isPlayerA = row.player1_id === playerId;
  const opponent = isPlayerA ? row.player2 : row.player1;
  const opponentId = isPlayerA ? row.player2_id : row.player1_id;
  const selectedSlots = response?.available_slots || [];
  const pendingRival = !row.player1_id || !row.player2_id;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    tournament: row.tournaments?.name || "",
    category: categoryLabel(row),
    round: row.round_name || row.phase || "Partido",
    phase: row.phase,
    playerAId: row.player1_id,
    playerBId: row.player2_id,
    opponentId,
    opponent: opponentId ? fullName(opponent) : "A definir",
    opponentAvatar: opponent?.avatar_url,
    pendingRival,
    status: dbStatusLabel(row.status),
    statusRaw: row.status,
    court: row.court || "A definir",
    scheduledAt: row.scheduled_at,
    attendance: Boolean(response?.submitted_at),
    submittedAt: response?.submitted_at || null,
    revision: response?.revision || 0,
    needsAttendanceConfirmation: REQUEST_STATUSES.has(row.status),
    availableSlotsByDay: groupSlotsByDay(slots, selectedSlots),
    selectedAvailableSlots: selectedSlots,
  };
}

async function fetchActiveResponse(matchId, playerId) {
  const client = ensureSupabaseDataClient();
  const { data, error } = await client
    .from("match_availability_responses")
    .select("id, match_id, player_id, available_slots, submitted_at, revision, active")
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .eq("active", true)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logSupabaseDataError("match availability response", error);
    throw createDataError("No pudimos cargar tu disponibilidad.", { cause: error });
  }
  return data || null;
}

async function fetchSlotOptions(matchId) {
  const client = ensureSupabaseDataClient();
  const { data, error } = await client.rpc("game_match_slot_options", { p_match_id: matchId });
  if (error) {
    logSupabaseDataError("match slot options", error);
    throw createDataError("No pudimos cargar los horarios disponibles.", { cause: error });
  }
  return data || [];
}

export const availabilityService = {
  async getPlayerAttendanceRequests(playerId) {
    if (!playerId) return [];
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("matches")
      .select(matchAvailabilitySelect)
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
      .in("status", [...REQUEST_STATUSES])
      .order("round_index", { ascending: true })
      .order("bracket_slot", { ascending: true });

    if (error) {
      logSupabaseDataError("player availability matches", error);
      throw createDataError("No pudimos cargar partidos con disponibilidad pendiente.", { cause: error });
    }

    const mapped = await Promise.all((data || []).map(async (match) => {
      const [slots, response] = await Promise.all([
        fetchSlotOptions(match.id),
        fetchActiveResponse(match.id, playerId),
      ]);
      return mapAvailabilityMatch(match, playerId, slots, response);
    }));

    return mapped.filter((match) => match.availableSlotsByDay.some((day) => day.slots.length));
  },

  async getMatchAvailability(matchId, playerId) {
    if (!matchId || !playerId) return null;
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("matches")
      .select(matchAvailabilitySelect)
      .eq("id", matchId)
      .maybeSingle();
    if (error) {
      logSupabaseDataError("match availability lookup", error);
      throw createDataError("No pudimos cargar la disponibilidad del partido.", { cause: error });
    }
    if (!data) return null;
    const [slots, response] = await Promise.all([
      fetchSlotOptions(matchId),
      fetchActiveResponse(matchId, playerId),
    ]);
    return mapAvailabilityMatch(data, playerId, slots, response);
  },

  async confirmAttendance(matchId, playerId, selectedAvailableSlots = []) {
    if (!matchId || !playerId) throw createDataError("Falta el partido o jugador para guardar disponibilidad.");
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("submit_match_availability", {
      p_match_id: matchId,
      p_player_id: playerId,
      p_available_slots: selectedAvailableSlots,
    });
    if (error) {
      logSupabaseDataError("submit match availability", error);
      throw createDataError("No pudimos guardar tu disponibilidad.", { cause: error });
    }
    return data;
  },
};
