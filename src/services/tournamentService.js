import { canPlayerRegisterInCategory } from "../utils/categoryRules";
import { DEFAULT_MATCH_FORMAT } from "../utils/matchFormat";
import { auditService } from "./auditService";
import { categoryService } from "./categoryService";
import { emailService } from "./emailService";
import { playerService } from "./playerService";
import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";
import { getTournamentCategoryParticipants, tournamentStageService } from "./tournamentStageService";
import { schedulingService } from "./schedulingService";
import { recommendTournamentFormat, TOURNAMENT_FORMATS } from "./tournamentCategoryService";

function isOpenTournament(tournament) {
  return tournament?.status === "Inscripciones abiertas";
}

function tournamentDateValue(tournament) {
  const date = tournament?.startDate || tournament?.finalsDate || tournament?.createdAt || "";
  const value = Date.parse(`${date}T12:00:00`);
  return Number.isNaN(value) ? 0 : value;
}

function createdDateValue(tournament) {
  const value = Date.parse(tournament?.createdAt || tournament?.created_at || "");
  return Number.isNaN(value) ? 0 : value;
}

function sortTournamentsNewestFirst(tournaments = []) {
  return [...tournaments].sort((a, b) =>
    tournamentDateValue(b) - tournamentDateValue(a) ||
    createdDateValue(b) - createdDateValue(a) ||
    String(b.id || b.name).localeCompare(String(a.id || a.name), undefined, { numeric: true }),
  );
}

function playerHasTournamentRelation(db, tournament, playerId) {
  if (!tournament || !playerId) return false;
  if ((tournament.participants || []).includes(playerId)) return true;
  if (db.enrollments.some((enrollment) => enrollment.tournamentId === tournament.id && enrollment.playerId === playerId && enrollment.status !== "Rechazada")) return true;
  return db.matches.some((match) => match.tournamentId === tournament.id && (match.playerAId === playerId || match.playerBId === playerId));
}

function playerCanRegisterInOpenTournament(db, tournament, playerId) {
  if (!isOpenTournament(tournament)) return false;
  const player = db.players.find((item) => item.id === playerId);
  const playerCategory = db.categories.find((category) => category.id === player?.categoryId);
  if (!player || player.status?.includes("Bloqueado")) return false;
  return (tournament.categories || []).some((categoryId) => {
    const category = db.categories.find((item) => item.id === categoryId);
    const alreadyRegistered = db.enrollments.some(
      (enrollment) =>
        enrollment.tournamentId === tournament.id &&
        enrollment.playerId === playerId &&
        enrollment.categoryId === categoryId &&
        enrollment.status !== "Rechazada",
    );
    return category?.status === "Activa" && !alreadyRegistered && canPlayerRegisterInCategory(playerCategory, category);
  });
}

const tournamentSelect = `
  id,
  name,
  description,
  start_date,
  end_date,
  registration_close_date,
  semifinals_date,
  finals_date,
  status,
  price_per_category,
  scoring_system_id,
  match_format,
  schedule,
  court_capacity,
  courts,
  phases,
  metadata,
  finalized_at,
  created_at,
  updated_at
`;

const tournamentListBaseSelect = `
  id,
  name,
  status,
  start_date,
  end_date
`;

const ADMIN_TOURNAMENT_LIST_SELECT = "id,name,status,start_date,end_date";

const stageSelect = `
  id,
  tournament_id,
  category_id,
  format,
  recommended_format,
  format_status,
  format_decision,
  match_format,
  status,
  stage_status,
  generated_at,
  locked_at,
  ranking_awarded_at,
  metadata,
  created_at,
  updated_at,
  categories:category_id (
    id,
    name,
    branch,
    level,
    is_active
  )
`;

const statusToDb = {
  "Inscripciones abiertas": "open",
  "Inscripciones cerradas": "closed",
  "En juego": "in_progress",
  Finalizado: "finished",
  Cancelado: "cancelled",
};

const statusFromDb = {
  open: "Inscripciones abiertas",
  closed: "Inscripciones cerradas",
  in_progress: "En juego",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

function mapDbCategory(row) {
  const category = row?.categories || row;
  if (!category) return null;
  return {
    id: category.id,
    name: category.name,
    branch: category.branch || "Masculino",
    level: Number(category.level || 1),
    status: category.is_active ? "Activa" : "Inactiva",
    isActive: Boolean(category.is_active),
  };
}

function mapStage(row) {
  if (!row) return null;
  const category = mapDbCategory(row);
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    categoryId: row.category_id,
    categoryName: category ? `${category.name} ${category.branch}` : "",
    format: row.format || "",
    recommendedFormat: row.recommended_format || "",
    formatStatus: row.format_status || "pending",
    formatDecision: row.format_decision || "",
    matchFormat: row.match_format || DEFAULT_MATCH_FORMAT,
    status: row.status || "Formato pendiente",
    stageStatus: row.stage_status || "draft",
    generatedAt: row.generated_at,
    lockedAt: row.locked_at,
    rankingAwardedAt: row.ranking_awarded_at,
    participants: row.metadata?.participants || [],
    inscriptionsCount: Number(row.metadata?.inscriptionsCount || 0),
    bracketKey: row.metadata?.bracketKey || `${row.tournament_id}::${row.category_id}`,
    metadata: row.metadata || {},
    category,
  };
}

function isEligibleRegistration(registration, now = new Date()) {
  if (!registration || registration.status === "cancelled") return false;
  if (["paid", "waived"].includes(registration.payment_status)) return true;
  if (registration.payment_status !== "pending") return false;
  if (!registration.payment_due_at) return true;
  const dueAt = new Date(registration.payment_due_at);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() >= now.getTime();
}

function withTournamentLoadMeta(error, meta) {
  return {
    ...error,
    table: meta.table || null,
    select: meta.select || null,
    filter: meta.filter || null,
  };
}

function formatTournamentServiceError(error, meta = {}) {
  return {
    table: meta.table || error.table || null,
    select: meta.select || error.select || null,
    filters: meta.filter || error.filter || null,
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
    status: error.status || null,
    stack: error.stack || null,
  };
}

function logAdminTournamentsLoadError(error, meta = {}) {
  if (!error) return;
  console.error("[GAME Tournaments] optional load warning", formatTournamentServiceError(error, meta));
}

function logAdminTournamentCreateError(error, meta = {}) {
  if (!import.meta.env.DEV || !error) return;
  console.error("[GAME Admin] create tournament error", {
    table: meta.table || error.table || null,
    select: meta.select || error.select || null,
    filters: meta.filter || error.filter || null,
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
    status: error.status || null,
  });
}

function logAdminTournamentDetailError(error, meta = {}) {
  if (!import.meta.env.DEV || !error) return;
  console.error("[GAME Admin] tournament detail load error", {
    table: meta.table || error.table || null,
    select: meta.select || error.select || null,
    filters: meta.filter || error.filter || null,
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
    status: error.status || null,
  });
}

async function attachScoringSystems(rows = [], { optional = false } = {}) {
  const scoringIds = [...new Set(rows.map((row) => row.scoring_system_id).filter(Boolean))];
  if (!scoringIds.length) return rows;
  const client = ensureSupabaseDataClient();
  const selectScoringSystems = "id, name";
  const { data, error } = await client
    .from("scoring_systems")
    .select(selectScoringSystems)
    .in("id", scoringIds);
  if (error) {
    const meta = {
      table: "scoring_systems",
      select: selectScoringSystems,
      filter: `id in (${scoringIds.join(",")})`,
    };
    const loggedError = withTournamentLoadMeta(error, meta);
    if (optional) {
      logAdminTournamentsLoadError(loggedError);
      return rows;
    }
    logSupabaseDataError("tournament scoring systems", loggedError);
    throw createDataError("No pudimos cargar el sistema de puntaje del torneo.", { cause: loggedError });
  }
  const scoringById = new Map((data || []).map((item) => [item.id, item]));
  return rows.map((row) => ({
    ...row,
    scoring_systems: scoringById.get(row.scoring_system_id) || null,
  }));
}

async function attachParticipantCounts(stages = [], { optional = false } = {}) {
  const stageIds = stages.map((stage) => stage.id).filter(Boolean);
  if (!stageIds.length) return stages;
  const client = ensureSupabaseDataClient();
  const selectParticipantCounts = `
      player_id,
      status,
      payment_status,
      payment_due_at,
      registration_categories!inner (
        tournament_category_id
      )
    `;
  const { data, error } = await client
    .from("registrations")
    .select(selectParticipantCounts)
    .in("registration_categories.tournament_category_id", stageIds);
  if (error) {
    const meta = {
      table: "registrations",
      select: selectParticipantCounts,
      filter: `registration_categories.tournament_category_id in (${stageIds.join(",")})`,
    };
    const loggedError = withTournamentLoadMeta(error, meta);
    if (optional) {
      logAdminTournamentsLoadError(loggedError);
      return stages;
    }
    logSupabaseDataError("tournament category participant counts", loggedError);
    throw createDataError("No pudimos cargar las cantidades de participantes.", { cause: loggedError });
  }
  const counts = new Map(stageIds.map((id) => [id, new Set()]));
  (data || []).filter(isEligibleRegistration).forEach((registration) => {
    (registration.registration_categories || []).forEach((item) => {
      if (!counts.has(item.tournament_category_id)) return;
      counts.get(item.tournament_category_id).add(registration.player_id);
    });
  });
  return stages.map((stage) => {
    const participantIds = [...(counts.get(stage.id) || [])];
    return {
      ...stage,
      participants: participantIds,
      inscriptionsCount: participantIds.length,
      recommendedFormat: stage.recommendedFormat || recommendTournamentFormat(participantIds.length) || "",
      formatStatus: participantIds.length ? stage.formatStatus : "empty",
      status: participantIds.length ? stage.status : "Sin inscriptos",
    };
  });
}

async function getStagesForTournaments(tournamentIds = [], { optional = false } = {}) {
  const ids = [...new Set(tournamentIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const client = ensureSupabaseDataClient();
  const { data, error } = await client.from("tournament_categories").select(stageSelect).in("tournament_id", ids);
  if (error) {
    const meta = {
      table: "tournament_categories",
      select: stageSelect,
      filter: `tournament_id in (${ids.join(",")})`,
    };
    const loggedError = withTournamentLoadMeta(error, meta);
    if (optional) {
      logAdminTournamentsLoadError(loggedError);
      return new Map();
    }
    logSupabaseDataError("tournament categories list", loggedError);
    throw createDataError("No pudimos cargar las categorias del torneo.", { cause: loggedError });
  }
  const stages = await attachParticipantCounts((data || []).map(mapStage).filter(Boolean), { optional });
  const map = new Map();
  stages.forEach((stage) => {
    map.set(stage.tournamentId, [...(map.get(stage.tournamentId) || []), stage]);
  });
  return map;
}

async function fetchTournamentListRows() {
  const client = ensureSupabaseDataClient();
  const { data: baseRows, error: baseError } = await client
    .from("tournaments")
    .select(tournamentListBaseSelect)
    .order("start_date", { ascending: false });

  if (baseError) {
    const loggedError = withTournamentLoadMeta(baseError, {
      table: "tournaments",
      select: tournamentListBaseSelect,
      filter: "order start_date desc",
    });
    throw createDataError("No pudimos cargar los torneos.", { cause: loggedError });
  }

  const ids = (baseRows || []).map((row) => row.id).filter(Boolean);
  if (!ids.length) return [];

  const { data: enrichedRows, error: enrichedError } = await client
    .from("tournaments")
    .select(tournamentSelect)
    .in("id", ids);

  if (enrichedError) {
    logAdminTournamentsLoadError(withTournamentLoadMeta(enrichedError, {
      table: "tournaments",
      select: tournamentSelect,
      filter: `id in (${ids.join(",")})`,
    }));
    return baseRows || [];
  }

  const enrichedById = new Map((enrichedRows || []).map((row) => [row.id, row]));
  return (baseRows || []).map((baseRow) => ({
    ...baseRow,
    ...(enrichedById.get(baseRow.id) || {}),
  }));
}

function mapTournament(row, stages = []) {
  if (!row) return null;
  const categoryIds = stages.map((stage) => stage.categoryId);
  const firstStage = stages[0] || null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    registrationCloseDate: row.registration_close_date || "",
    semifinalsDate: row.semifinals_date || "",
    finalsDate: row.finals_date || "",
    status: statusFromDb[row.status] || row.status,
    price: Number(row.price_per_category || 0),
    scoringSystemId: row.scoring_system_id,
    scoringSystem: row.scoring_systems?.name || row.metadata?.scoringSystem || "",
    type: row.scoring_systems?.name || row.metadata?.type || "",
    matchFormat: row.match_format || DEFAULT_MATCH_FORMAT,
    schedule: row.schedule || {},
    courtCapacity: row.court_capacity || {},
    courts: row.courts || [],
    phases: row.phases || [],
    categories: categoryIds,
    categoryStages: stages,
    playerCategoryId: firstStage?.categoryId || null,
    playerCategoryName: firstStage?.categoryName || "",
    participants: row.metadata?.participants || [],
    finalizedAt: row.finalized_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdminTournamentListRow(row) {
  return {
    id: row.id,
    name: row.name || "Torneo sin nombre",
    status: statusFromDb[row.status] || row.status || "Sin estado",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    description: "",
    type: "",
    scoringSystem: "",
    price: 0,
    categories: [],
    categoryStages: [],
    participants: [],
  };
}

export async function getAdminTournamentList() {
  const client = ensureSupabaseDataClient();
  const { data, error } = await client
    .from("tournaments")
    .select(ADMIN_TOURNAMENT_LIST_SELECT)
    .order("created_at", { ascending: false });

  console.log("ADMIN TOURNAMENTS RAW", { data, error });

  if (error) throw error;
  return (data || []).map(mapAdminTournamentListRow);
}

function mapTournamentPayload(payload = {}) {
  return {
    name: String(payload.name || "").trim(),
    description: String(payload.description || "").trim() || null,
    start_date: payload.startDate || payload.start_date,
    end_date: payload.endDate || payload.end_date || null,
    registration_close_date: payload.registrationCloseDate || payload.registration_close_date || null,
    semifinals_date: payload.semifinalsDate || payload.semifinals_date || null,
    finals_date: payload.finalsDate || payload.finals_date || null,
    status: statusToDb[payload.status] || payload.status || "open",
    price_per_category: Number(payload.price || payload.pricePerCategory || payload.price_per_category || 0),
    scoring_system_id: payload.scoringSystemId || payload.scoring_system_id || null,
    match_format: payload.matchFormat || DEFAULT_MATCH_FORMAT,
    schedule: payload.schedule || {},
    court_capacity: payload.courtCapacity || {},
    courts: payload.courts || [],
    phases: payload.phases || [],
    metadata: {
      type: payload.type || payload.scoringSystem || "",
      scoringSystem: payload.scoringSystem || "",
      participants: payload.participants || [],
    },
  };
}

function mapTournamentUpdates(payload = {}) {
  const mapped = {};
  if ("name" in payload) mapped.name = String(payload.name || "").trim();
  if ("description" in payload) mapped.description = String(payload.description || "").trim() || null;
  if ("startDate" in payload || "start_date" in payload) mapped.start_date = payload.startDate || payload.start_date;
  if ("endDate" in payload || "end_date" in payload) mapped.end_date = payload.endDate || payload.end_date || null;
  if ("registrationCloseDate" in payload || "registration_close_date" in payload) mapped.registration_close_date = payload.registrationCloseDate || payload.registration_close_date || null;
  if ("semifinalsDate" in payload || "semifinals_date" in payload) mapped.semifinals_date = payload.semifinalsDate || payload.semifinals_date || null;
  if ("finalsDate" in payload || "finals_date" in payload) mapped.finals_date = payload.finalsDate || payload.finals_date || null;
  if ("status" in payload) mapped.status = statusToDb[payload.status] || payload.status;
  if ("price" in payload || "pricePerCategory" in payload || "price_per_category" in payload) {
    mapped.price_per_category = Number(payload.price || payload.pricePerCategory || payload.price_per_category || 0);
  }
  if ("scoringSystemId" in payload || "scoring_system_id" in payload) mapped.scoring_system_id = payload.scoringSystemId || payload.scoring_system_id || null;
  if ("matchFormat" in payload) mapped.match_format = payload.matchFormat || DEFAULT_MATCH_FORMAT;
  if ("schedule" in payload) mapped.schedule = payload.schedule || {};
  if ("courtCapacity" in payload) mapped.court_capacity = payload.courtCapacity || {};
  if ("courts" in payload) mapped.courts = payload.courts || [];
  if ("phases" in payload) mapped.phases = payload.phases || [];
  return mapped;
}

async function fetchTournament(id) {
  const client = ensureSupabaseDataClient();
  const { data, error } = await client.from("tournaments").select(tournamentSelect).eq("id", id).maybeSingle();
  if (error) {
    const loggedError = withTournamentLoadMeta(error, {
      table: "tournaments",
      select: tournamentSelect,
      filter: `id eq ${id}`,
    });
    logSupabaseDataError("tournament by id", loggedError);
    logAdminTournamentDetailError(loggedError);
    throw createDataError("No pudimos cargar el torneo.", { cause: loggedError });
  }
  if (!data) return null;
  const stages = await getStagesForTournaments([id], { optional: true });
  const [tournament] = await attachScoringSystems([data], { optional: true });
  return mapTournament(tournament, stages.get(id) || []);
}

export const tournamentService = {
  async getTournaments() {
    const tournamentRows = await attachScoringSystems(await fetchTournamentListRows(), { optional: true });
    const stages = await getStagesForTournaments(tournamentRows.map((item) => item.id), { optional: true });
    return sortTournamentsNewestFirst(tournamentRows.map((row) => mapTournament(row, stages.get(row.id) || [])));
  },
  async getVisibleTournamentsForPlayer(playerId) {
    const [player, tournaments] = await Promise.all([playerService.getPlayerById(playerId), this.getTournaments()]);
    if (!player) return [];
    const enrolled = new Set();
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.from("registrations").select("tournament_id").eq("player_id", playerId).neq("status", "cancelled");
    if (error) {
      logSupabaseDataError("player tournament relations", error);
      throw createDataError("No pudimos cargar los torneos del jugador.", { cause: error });
    }
    (data || []).forEach((row) => enrolled.add(row.tournament_id));
    const categories = await categoryService.getCategories();
    const playerCategory = categories.find((category) => category.id === player.categoryId);
    return tournaments.filter((tournament) => {
      if (enrolled.has(tournament.id)) return true;
      if (!isOpenTournament(tournament) || player.status?.includes("Bloqueado")) return false;
      return tournament.categoryStages.some((stage) => stage.category?.isActive && canPlayerRegisterInCategory(playerCategory, stage.category));
    });
  },
  async canPlayerAccessTournament(id, playerId) {
    const tournaments = await this.getVisibleTournamentsForPlayer(playerId);
    return tournaments.some((tournament) => tournament.id === id);
  },
  async getPlayerTournamentById(id, playerId) {
    const canAccess = await this.canPlayerAccessTournament(id, playerId);
    if (!canAccess) return null;
    return fetchTournament(id);
  },
  async getTournamentById(id) {
    return fetchTournament(id);
  },
  async getTournamentBracket(id, categoryId = null) {
    const client = ensureSupabaseDataClient();
    let tournamentCategoryId = null;
    if (categoryId) {
      const { data: stage, error: stageError } = await client
        .from("tournament_categories")
        .select("id")
        .eq("tournament_id", id)
        .eq("category_id", categoryId)
        .maybeSingle();
      if (stageError) {
        logSupabaseDataError("tournament bracket stage lookup", stageError);
        throw createDataError("No pudimos cargar el cuadro.", { cause: stageError });
      }
      tournamentCategoryId = stage?.id || null;
      if (!tournamentCategoryId) return null;
    }
    let query = client
      .from("brackets")
      .select(`
        id,
        tournament_id,
        tournament_category_id,
        format,
        size,
        status,
        champion_player_id,
        runner_up_player_id,
        bracket_data,
        tournament_categories:tournament_category_id (
          category_id
        ),
        champion:champion_player_id (
          id,
          first_name,
          last_name
        )
      `)
      .eq("tournament_id", id);
    if (tournamentCategoryId) query = query.eq("tournament_category_id", tournamentCategoryId);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      logSupabaseDataError("tournament bracket", error);
      throw createDataError("No pudimos cargar el cuadro.", { cause: error });
    }
    if (!data) return null;
    const bracket = data.bracket_data || {};
    const championName = `${data.champion?.first_name || ""} ${data.champion?.last_name || ""}`.trim();
    return {
      ...bracket,
      id: data.id,
      tournamentId: data.tournament_id,
      tournamentCategoryId: data.tournament_category_id,
      format: bracket.format || data.format,
      status: data.status,
      championPlayerId: data.champion_player_id,
      runnerUpPlayerId: data.runner_up_player_id,
      champion: bracket.champion || championName || null,
    };
  },
  async getTournamentParticipants(id, categoryId = null) {
    const client = ensureSupabaseDataClient();
    if (categoryId) {
      const { data: stage, error: stageError } = await client
        .from("tournament_categories")
        .select("id, category_id")
        .eq("tournament_id", id)
        .eq("category_id", categoryId)
        .maybeSingle();
      if (stageError) {
        logSupabaseDataError("tournament participants stage lookup", stageError);
        throw createDataError("No pudimos cargar los participantes.", { cause: stageError });
      }
      if (!stage?.id) return [];
      return getTournamentCategoryParticipants(stage.id, { categoryId: stage.category_id });
    }
    const stages = await this.getTournamentCategoryStages(id);
    const rows = await Promise.all(stages.map((stage) => getTournamentCategoryParticipants(stage.id, { categoryId: stage.categoryId })));
    const seen = new Set();
    return rows.flat().filter((player) => {
      if (!player?.id || seen.has(player.id)) return false;
      seen.add(player.id);
      return true;
    });
  },
  async getTournamentCategories(id) {
    const stages = await this.getTournamentCategoryStages(id);
    return stages.map((stage) => stage.category).filter(Boolean);
  },
  async getTournamentCategoryStages(id) {
    const stages = await getStagesForTournaments([id], { optional: true });
    return stages.get(id) || [];
  },
  async createTournament(payload, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.from("tournaments").insert(mapTournamentPayload(payload)).select(tournamentSelect).single();
    if (error) {
      const loggedError = withTournamentLoadMeta(error, {
        table: "tournaments",
        select: tournamentSelect,
        filter: "insert tournament",
      });
      logSupabaseDataError("tournament create", loggedError);
      logAdminTournamentCreateError(loggedError);
      throw createDataError("No pudimos crear el torneo.", { cause: error });
    }
    const tournamentId = data.id;
    const categoryIds = [...new Set(payload.categories || [])];
    try {
      if (categoryIds.length) {
        const rows = categoryIds.map((categoryId) => {
          const stage = (payload.categoryStages || []).find((item) => item.categoryId === categoryId) || {};
          return {
            tournament_id: tournamentId,
            category_id: categoryId,
            format: stage.format || null,
            recommended_format: stage.recommendedFormat || stage.recommended_format || null,
            format_status: stage.formatStatus || "pending",
            format_decision: stage.formatDecision || null,
            match_format: stage.matchFormat || payload.matchFormat || DEFAULT_MATCH_FORMAT,
            status: stage.status || "Formato pendiente",
            metadata: {
              participants: stage.participants || [],
              inscriptionsCount: stage.inscriptionsCount || 0,
              bracketKey: stage.bracketKey || `${tournamentId}::${categoryId}`,
            },
          };
        });
        const { error: categoryError } = await client.from("tournament_categories").insert(rows);
        if (categoryError) {
          const loggedError = withTournamentLoadMeta(categoryError, {
            table: "tournament_categories",
            select: "insert tournament category rows",
            filter: `tournament_id eq ${tournamentId}`,
          });
          logSupabaseDataError("tournament categories create", loggedError);
          logAdminTournamentCreateError(loggedError);
          throw createDataError("No pudimos asociar categorias al torneo.", { cause: loggedError });
        }
      }
    } catch (createError) {
      const { error: rollbackError } = await client.from("tournaments").delete().eq("id", tournamentId);
      if (rollbackError) logAdminTournamentCreateError(rollbackError, { table: "tournaments", filter: `rollback id eq ${tournamentId}` });
      throw createError;
    }
    const tournament = await fetchTournament(tournamentId);
    await auditService.record({
      action: "create_tournament",
      entityType: "tournament",
      entityId: tournament.id,
      description: `Torneo creado: ${tournament.name}`,
      actor,
    });
    if (tournament.status === "Inscripciones abiertas") {
      const { error: emailQueueError } = await client.rpc("game_enqueue_tournament_open_emails", { p_tournament_id: tournament.id });
      if (emailQueueError) logSupabaseDataError("tournament open email queue", emailQueueError);
      emailService.processQueuedGameEmails("tournament_open");
    }
    return tournament;
  },
  async updateTournament(id, updates, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const { error } = await client.from("tournaments").update(mapTournamentUpdates(updates)).eq("id", id);
    if (error) {
      logSupabaseDataError("tournament update", error);
      throw createDataError("No pudimos actualizar el torneo.", { cause: error });
    }
    const tournament = await fetchTournament(id);
    await auditService.record({
      action: "update_tournament",
      entityType: "tournament",
      entityId: id,
      description: "Torneo actualizado.",
      actor,
    });
    return tournament;
  },
  async closeRegistrations(id, actor = "admin-1") {
    const tournament = await this.updateTournament(id, { status: "Inscripciones cerradas" }, actor);
    const stages = await this.getTournamentCategoryStages(id);
    const shouldRegenerate = stages.some((stage) => stage.stageStatus === "dirty" && stage.formatStatus === "confirmed");
    if (!shouldRegenerate) return tournament;
    const generated = await tournamentStageService.generateAllCategoryStages(id);
    const schedule = await schedulingService.recalculateSchedule(id, { preserveScheduled: false, startOffsetWeeks: 0 });
    await auditService.record({
      action: "regenerate_after_reopen",
      entityType: "tournament",
      entityId: id,
      description: "Estructura regenerada automaticamente al volver a cerrar inscripciones.",
      actor,
    });
    return {
      ...(await fetchTournament(id)),
      regenerationResult: {
        generatedStages: generated.length,
        scheduledCount: schedule?.scheduledCount || 0,
        unscheduledCount: schedule?.unscheduledCount || 0,
      },
    };
  },
  async canReopenRegistrations(id) {
    const tournament = await fetchTournament(id);
    if (!tournament) return { ok: false, reason: "No encontramos el torneo." };
    if (["Finalizado", "Cancelado", "En juego"].includes(tournament.status)) {
      return { ok: false, reason: "El torneo ya no esta en una etapa precompetitiva." };
    }
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("matches")
      .select("id, status, result_type, winner_id")
      .eq("tournament_id", id);
    if (error) {
      logSupabaseDataError("reopen registrations match check", error);
      throw createDataError("No pudimos validar si el torneo puede reabrirse.", { cause: error });
    }
    const hasPlayedMatches = (data || []).some((match) => {
      if (match.result_type === "BYE") return false;
      return ["finished", "in_progress", "standby"].includes(match.status) || Boolean(match.winner_id);
    });
    if (hasPlayedMatches) {
      return { ok: false, reason: "No se puede reabrir porque ya existen partidos jugados." };
    }
    return { ok: true, tournament };
  },
  async reopenRegistrations(id, actor = "admin-1") {
    const validation = await this.canReopenRegistrations(id);
    if (!validation.ok) throw createDataError(validation.reason);
    const client = ensureSupabaseDataClient();
    const stages = await this.getTournamentCategoryStages(id);
    const { error: tournamentError } = await client
      .from("tournaments")
      .update({ status: "open" })
      .eq("id", id);
    if (tournamentError) {
      logSupabaseDataError("tournament reopen registrations", tournamentError);
      throw createDataError("No pudimos reabrir inscripciones.", { cause: tournamentError });
    }
    for (const stage of stages) {
      const metadata = {
        ...(stage.metadata || {}),
        regenerationRequired: true,
        regenerationMarkedAt: new Date().toISOString(),
      };
      const { error: stageError } = await client
        .from("tournament_categories")
        .update({ stage_status: "dirty", status: "Pendiente de regeneracion", metadata })
        .eq("id", stage.id);
      if (stageError) {
        logSupabaseDataError("stage mark dirty after reopen", stageError);
        throw createDataError("No pudimos marcar la estructura para regenerar.", { cause: stageError });
      }
    }
    await auditService.record({
      action: "reopen_registrations",
      entityType: "tournament",
      entityId: id,
      description: "Inscripciones reabiertas antes del inicio de competencia.",
      actor,
    });
    emailService.processQueuedGameEmails("tournament_reopen");
    return fetchTournament(id);
  },
  async updateCategoryFormat(id, categoryId, format) {
    const client = ensureSupabaseDataClient();
    const { error } = await client
      .from("tournament_categories")
      .update({ format, format_status: "updated", status: "Formato actualizado" })
      .eq("tournament_id", id)
      .eq("category_id", categoryId);
    if (error) {
      logSupabaseDataError("tournament category format update", error);
      throw createDataError("No pudimos actualizar el formato.", { cause: error });
    }
    return fetchTournament(id);
  },
  async confirmCategoryFormat(id, categoryId, format) {
    const client = ensureSupabaseDataClient();
    const { error } = await client
      .from("tournament_categories")
      .update({ format, format_status: "confirmed", format_decision: "confirmed", status: "Formato confirmado" })
      .eq("tournament_id", id)
      .eq("category_id", categoryId);
    if (error) {
      logSupabaseDataError("tournament category format confirm", error);
      throw createDataError("No pudimos confirmar el formato.", { cause: error });
    }
    return fetchTournament(id);
  },
  async confirmAllCategoryFormats(id) {
    const client = ensureSupabaseDataClient();
    const stages = await this.getTournamentCategoryStages(id);
    const activeStages = stages.filter((stage) => Number(stage.inscriptionsCount || 0) > 0);
    const missingFormat = activeStages.find((stage) => !TOURNAMENT_FORMATS.includes(stage.format || stage.recommendedFormat || ""));
    if (missingFormat) {
      throw createDataError(`La categoria ${missingFormat.categoryName} no tiene un formato valido para confirmar.`);
    }
    const generated = [];
    const skipped = stages.filter((stage) => !Number(stage.inscriptionsCount || 0)).map((stage) => stage.categoryName);

    for (const stage of stages) {
      if (!Number(stage.inscriptionsCount || 0)) {
        const { error: emptyError } = await client
          .from("tournament_categories")
          .update({ format_status: "empty", format_decision: "empty", status: "Sin inscriptos" })
          .eq("id", stage.id);
        if (emptyError) {
          logSupabaseDataError("empty tournament category format", emptyError);
          throw createDataError("No pudimos marcar categorias sin inscriptos.", { cause: emptyError });
        }
        continue;
      }

      const format = stage.format || stage.recommendedFormat;
      const { error } = await client
        .from("tournament_categories")
        .update({ format, format_status: "confirmed", format_decision: "confirmed", status: "Formato confirmado" })
        .eq("id", stage.id);
      if (error) {
        logSupabaseDataError("tournament category formats confirm all", error);
        throw createDataError("No pudimos confirmar los formatos.", { cause: error });
      }
      generated.push(stage.categoryName);
    }

    const brackets = await tournamentStageService.generateAllCategoryStages(id);
    const schedule = await schedulingService.recalculateSchedule(id, { preserveScheduled: true, startOffsetWeeks: 0 });
    const tournament = await fetchTournament(id);
    return {
      tournament,
      generatedCategories: generated,
      skippedCategories: skipped,
      generatedStages: brackets.length,
      schedule,
    };
  },
  async generateCategoryBracket(id, categoryId) {
    return tournamentStageService.generateStage(id, categoryId);
  },
  async updateZoneQualifiers(id, categoryId, zoneId, qualifiers) {
    return tournamentStageService.updateZoneQualifiers(id, categoryId, zoneId, qualifiers);
  },
  async generateZoneEliminationBracket(id, categoryId) {
    return tournamentStageService.generateZoneEliminationStage(id, categoryId);
  },
  async generateAllCategoryBrackets(id) {
    return tournamentStageService.generateAllCategoryStages(id);
  },
  async cancelTournament(id, actor = "admin-1") {
    return this.updateTournament(id, { status: "Cancelado" }, actor);
  },
  async deleteOpenTournament(id, actor = "admin-1") {
    const tournament = await fetchTournament(id);
    if (!tournament) return null;
    if (!isOpenTournament(tournament)) {
      throw createDataError("Solo se pueden eliminar torneos con inscripciones abiertas.");
    }
    const client = ensureSupabaseDataClient();
    const { error } = await client.from("tournaments").delete().eq("id", id);
    if (error) {
      logSupabaseDataError("tournament delete", error);
      throw createDataError("No pudimos eliminar el torneo.", { cause: error });
    }
    await auditService.record({
      action: "delete_open_tournament",
      entityType: "tournament",
      entityId: id,
      description: `Torneo eliminado: ${tournament.name}`,
      actor,
    });
    return { id: tournament.id, name: tournament.name };
  },
  async finalizeTournament(id, { pendingCount = 0 } = {}, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const { error } = await client
      .from("tournaments")
      .update({ status: "finished", finalized_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      logSupabaseDataError("tournament finalize", error);
      throw createDataError("No pudimos finalizar el torneo.", { cause: error });
    }
    const tournament = await fetchTournament(id);
    await auditService.record({
      action: "finalize_tournament",
      entityType: "tournament",
      entityId: id,
      description: pendingCount ? `Torneo finalizado con ${pendingCount} partidos pendientes.` : "Torneo finalizado sin partidos pendientes.",
      actor,
    });
    return tournament;
  },
};
