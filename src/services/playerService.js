import { getCalendarYearEnd } from "../utils/paymentRules";
import { normalizeText } from "../utils/formatters";
import { auditService } from "./auditService";
import {
  createDataError,
  ensureSupabaseDataClient,
  isForeignKeyViolation,
  isUniqueViolation,
  logSupabaseDataError,
  normalizeEmail,
} from "./supabaseDataUtils";

const statusToDb = {
  Activo: "active",
  active: "active",
  Suspendido: "suspended",
  suspended: "suspended",
  "Bloqueado por faltas": "blocked_faults",
  blocked_faults: "blocked_faults",
};

const statusFromDb = {
  active: "Activo",
  suspended: "Suspendido",
  blocked_faults: "Bloqueado por faltas",
};

function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    branch: row.branch || "Masculino",
    level: Number(row.level || 1),
    status: row.is_active ? "Activa" : "Inactiva",
    isActive: Boolean(row.is_active),
  };
}

function mapPlayer(row) {
  if (!row) return null;
  const category = mapCategory(row.categories);
  const firstName = row.first_name || "";
  const lastName = row.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const disciplineStatus = row.status === "blocked_faults" ? "Bloqueado" : "Sin sanciones";
  return {
    id: row.id,
    firstName,
    lastName,
    fullName,
    dni: row.document || "",
    document: row.document || "",
    birthDate: row.birth_date || "",
    gender: row.gender || "",
    phone: row.phone || "",
    email: row.email || "",
    address: row.address || "",
    categoryId: row.current_category_id,
    currentCategoryId: row.current_category_id,
    categoryName: category?.name || "Sin categoría",
    category,
    ranking: null,
    points: 0,
    status: statusFromDb[row.status] || "Activo",
    avatar: row.avatar_url || "",
    avatarUrl: row.avatar_url || "",
    stats: { played: 0, wins: 0, losses: 0, tournaments: 0 },
    discipline: { faults: 0, limit: 3, status: disciplineStatus },
    categoryHistory: [],
    categoryRankings: [],
    benefit: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function basePlayerSelect() {
  return `
    id,
    first_name,
    last_name,
    email,
    document,
    address,
    phone,
    birth_date,
    gender,
    current_category_id,
    status,
    avatar_url,
    created_at,
    updated_at,
    categories:current_category_id (
      id,
      name,
      branch,
      level,
      is_active
    )
  `;
}

function mapBenefit(row) {
  if (!row) return null;
  const percentage = Number(row.discount_percent || 0);
  const startedAt = row.starts_at || "";
  const expiresAt = row.ends_at || null;
  return {
    id: row.id,
    percentage,
    startedAt,
    months: null,
    expiresAt,
    indefinite: !expiresAt,
    annualWaiver: percentage === 100,
    reason: row.reason || "",
    createdBy: row.created_by || "",
    revokedAt: row.revoked_at || null,
  };
}

async function getActiveBenefitsByPlayerIds(playerIds = []) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const client = ensureSupabaseDataClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await client
    .from("player_benefits")
    .select("id, player_id, discount_percent, starts_at, ends_at, reason, created_by, created_at, revoked_at")
    .in("player_id", ids)
    .is("revoked_at", null)
    .lte("starts_at", today)
    .or(`ends_at.is.null,ends_at.gte.${today}`)
    .order("created_at", { ascending: false });
  if (error) {
    logSupabaseDataError("player benefits list", error);
    throw createDataError("NO PUDIMOS CARGAR BENEFICIOS DE JUGADORES", { cause: error });
  }
  const map = new Map();
  (data || []).forEach((row) => {
    if (!map.has(row.player_id)) map.set(row.player_id, mapBenefit(row));
  });
  return map;
}

async function attachBenefits(players = []) {
  try {
    const benefits = await getActiveBenefitsByPlayerIds(players.map((player) => player.id));
    return players.map((player) => ({ ...player, benefit: benefits.get(player.id) || null }));
  } catch (error) {
    logSupabaseDataError("player benefits attach", error.cause || error);
    return players.map((player) => ({ ...player, benefit: null }));
  }
}

async function attachDiscipline(players = []) {
  const ids = [...new Set(players.map((player) => player.id).filter(Boolean))];
  if (!ids.length) return players;
  try {
    const client = ensureSupabaseDataClient();
    const [{ data, error }, { data: unblocks, error: unblockError }] = await Promise.all([
      client
        .from("player_discipline_faults")
        .select("player_id, created_at")
        .in("player_id", ids),
      client
        .from("player_discipline_unblocks")
        .select("player_id, unblocked_at")
        .in("player_id", ids)
        .order("unblocked_at", { ascending: false }),
    ]);
    if (error) throw error;
    if (unblockError) throw unblockError;
    const lastUnblockByPlayer = (unblocks || []).reduce((map, row) => {
      if (!map.has(row.player_id)) map.set(row.player_id, row.unblocked_at);
      return map;
    }, new Map());
    const counts = (data || []).reduce((map, row) => {
      const lastUnblock = lastUnblockByPlayer.get(row.player_id);
      if (lastUnblock && new Date(row.created_at) <= new Date(lastUnblock)) return map;
      map.set(row.player_id, (map.get(row.player_id) || 0) + 1);
      return map;
    }, new Map());
    return players.map((player) => {
      const faults = counts.get(player.id) || 0;
      return {
        ...player,
        discipline: {
          ...player.discipline,
          faults,
          limit: 3,
          status: player.status.includes("Bloqueado") ? "Bloqueado" : faults ? "Seguimiento" : "Sin sanciones",
        },
      };
    });
  } catch (error) {
    logSupabaseDataError("player discipline attach", error);
    return players;
  }
}

async function attachPlayerExtras(players = [], { includeBenefits = true, includeDiscipline = true } = {}) {
  const withBenefits = includeBenefits ? await attachBenefits(players) : players;
  return includeDiscipline ? attachDiscipline(withBenefits) : withBenefits;
}

function normalizeOptionalDigits(value, { message, code, field }) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) throw createDataError(message, { code, field });
  return raw;
}

function normalizeRequiredDigits(value, { requiredMessage, invalidMessage, code, field }) {
  const raw = String(value ?? "").trim();
  if (!raw) throw createDataError(requiredMessage, { code: `${code}_REQUIRED`, field });
  if (!/^\d+$/.test(raw)) throw createDataError(invalidMessage, { code, field });
  return raw;
}

function normalizeRequiredText(value, { message, code, field }) {
  const raw = String(value ?? "").trim();
  if (!raw) throw createDataError(message, { code, field });
  return raw;
}

function normalizeOptionalDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw createDataError("INGRESA UNA FECHA DE NACIMIENTO VALIDA", { code: "PLAYER_BIRTH_DATE_INVALID", field: "birthDate" });
  }
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw createDataError("INGRESA UNA FECHA DE NACIMIENTO VALIDA", { code: "PLAYER_BIRTH_DATE_INVALID", field: "birthDate" });
  }
  return raw;
}

function normalizeRequiredDate(value) {
  const raw = String(value || "").trim();
  if (!raw) throw createDataError("INGRESA UNA FECHA DE NACIMIENTO", { code: "PLAYER_BIRTH_DATE_REQUIRED", field: "birthDate" });
  return normalizeOptionalDate(raw);
}

function normalizeGender(value) {
  const raw = String(value || "").trim();
  if (!raw) throw createDataError("SELECCIONA TU SEXO", { code: "PLAYER_GENDER_REQUIRED", field: "gender" });
  if (raw !== "Masculino" && raw !== "Femenino") {
    throw createDataError("SELECCIONA MASCULINO O FEMENINO", { code: "PLAYER_GENDER_INVALID", field: "gender" });
  }
  return raw;
}

function normalizeRequiredCategoryId(value) {
  const raw = String(value || "").trim();
  if (!raw) throw createDataError("SELECCIONA UNA CATEGORIA", { code: "PLAYER_CATEGORY_REQUIRED", field: "categoryId" });
  return raw;
}

async function ensureActiveCategory(client, categoryId) {
  const id = normalizeRequiredCategoryId(categoryId);
  const { data, error } = await client
    .from("categories")
    .select("id, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logSupabaseDataError("player category validation", error);
    throw createDataError("NO PUDIMOS VALIDAR LA CATEGORIA", { code: "PLAYER_CATEGORY_VALIDATE_FAILED", field: "categoryId", cause: error });
  }
  if (!data) throw createDataError("SELECCIONA UNA CATEGORIA VALIDA", { code: "PLAYER_CATEGORY_NOT_FOUND", field: "categoryId" });
  if (!data.is_active) throw createDataError("SELECCIONA UNA CATEGORIA ACTIVA", { code: "PLAYER_CATEGORY_INACTIVE", field: "categoryId" });
  return id;
}

function mapPlayerPayload(payload, { allowEmail = true } = {}) {
  const firstName = normalizeRequiredText(payload.firstName ?? payload.first_name, { message: "INGRESA TU NOMBRE", code: "PLAYER_FIRST_NAME_REQUIRED", field: "firstName" });
  const lastName = normalizeRequiredText(payload.lastName ?? payload.last_name, { message: "INGRESA TU APELLIDO", code: "PLAYER_LAST_NAME_REQUIRED", field: "lastName" });
  const document = normalizeRequiredDigits(payload.document ?? payload.dni, {
    requiredMessage: "INGRESA TU DOCUMENTO",
    invalidMessage: "EL DOCUMENTO SOLO PUEDE CONTENER NUMEROS",
    code: "PLAYER_DOCUMENT_DIGITS",
    field: "document",
  });
  const phone = normalizeRequiredDigits(payload.phone, {
    requiredMessage: "INGRESA TU TELEFONO",
    invalidMessage: "EL TELEFONO SOLO PUEDE CONTENER NUMEROS",
    code: "PLAYER_PHONE_DIGITS",
    field: "phone",
  });
  const email = normalizeEmail(payload.email);
  const categoryId = normalizeRequiredCategoryId(payload.categoryId ?? payload.currentCategoryId ?? payload.current_category_id);

  if (allowEmail && !email) throw createDataError("INGRESA UN CORREO VALIDO", { code: "PLAYER_EMAIL_REQUIRED", field: "email" });

  const mapped = {
    first_name: firstName,
    last_name: lastName,
    document: document || null,
    address: String(payload.address || "").trim() || null,
    phone: phone || null,
    birth_date: normalizeRequiredDate(payload.birthDate || payload.birth_date),
    gender: normalizeGender(payload.gender),
    current_category_id: categoryId,
  };

  if (allowEmail) mapped.email = email;
  if ("status" in payload) mapped.status = statusToDb[payload.status] || payload.status;
  if ("avatar" in payload || "avatarUrl" in payload || "avatar_url" in payload) {
    mapped.avatar_url = payload.avatar || payload.avatarUrl || payload.avatar_url || null;
  }

  return mapped;
}

function mapPlayerUpdatePayload(updates, { allowEmail = true } = {}) {
  const mapped = {};

  if ("firstName" in updates || "first_name" in updates) {
    const firstName = String(updates.firstName ?? updates.first_name ?? "").trim();
    if (!firstName) throw createDataError("INGRESA TU NOMBRE", { code: "PLAYER_FIRST_NAME_REQUIRED", field: "firstName" });
    mapped.first_name = firstName;
  }

  if ("lastName" in updates || "last_name" in updates) {
    const lastName = String(updates.lastName ?? updates.last_name ?? "").trim();
    if (!lastName) throw createDataError("INGRESA TU APELLIDO", { code: "PLAYER_LAST_NAME_REQUIRED", field: "lastName" });
    mapped.last_name = lastName;
  }

  if (allowEmail && "email" in updates) {
    throw createDataError("EL CORREO NO SE EDITA TEMPORALMENTE DESDE ADMIN", { code: "PLAYER_EMAIL_EDIT_DISABLED", field: "email" });
  }

  if ("document" in updates || "dni" in updates) {
    mapped.document = normalizeRequiredDigits(updates.document ?? updates.dni, {
      requiredMessage: "INGRESA TU DOCUMENTO",
      invalidMessage: "EL DOCUMENTO SOLO PUEDE CONTENER NUMEROS",
      code: "PLAYER_DOCUMENT_DIGITS",
      field: "document",
    });
  }

  if ("phone" in updates) {
    mapped.phone = normalizeRequiredDigits(updates.phone, {
      requiredMessage: "INGRESA TU TELEFONO",
      invalidMessage: "EL TELEFONO SOLO PUEDE CONTENER NUMEROS",
      code: "PLAYER_PHONE_DIGITS",
      field: "phone",
    });
  }

  if ("address" in updates) mapped.address = String(updates.address || "").trim() || null;
  if ("birthDate" in updates || "birth_date" in updates) mapped.birth_date = normalizeRequiredDate(updates.birthDate || updates.birth_date);
  if ("gender" in updates) mapped.gender = normalizeGender(updates.gender);
  if ("categoryId" in updates || "currentCategoryId" in updates || "current_category_id" in updates) {
    mapped.current_category_id = normalizeRequiredCategoryId(updates.categoryId ?? updates.currentCategoryId ?? updates.current_category_id);
  }
  if ("status" in updates) mapped.status = statusToDb[updates.status] || updates.status;
  if ("avatar" in updates || "avatarUrl" in updates || "avatar_url" in updates) {
    mapped.avatar_url = updates.avatar || updates.avatarUrl || updates.avatar_url || null;
  }

  return mapped;
}

function mapPlayerError(error, fallbackMessage) {
  if (isUniqueViolation(error)) {
    const source = `${error.message || ""} ${error.details || ""}`;
    if (source.includes("players_document_unique") || source.includes("players_document_unique_when_present")) {
      return createDataError("EL DOCUMENTO YA ESTÁ REGISTRADO", {
        code: "PLAYER_DOCUMENT_EXISTS",
        field: "document",
        cause: error,
      });
    }
    return createDataError("YA EXISTE UN JUGADOR CON ESE CORREO", {
      code: "PLAYER_EMAIL_EXISTS",
      field: "email",
      cause: error,
    });
  }

  if (isForeignKeyViolation(error)) {
    return createDataError("SELECCIONÁ UNA CATEGORÍA VÁLIDA", {
      code: "PLAYER_CATEGORY_INVALID",
      field: "categoryId",
      cause: error,
    });
  }

  return createDataError(fallbackMessage, { cause: error });
}

async function readFunctionErrorBody(error) {
  const response = error?.context;
  if (!response || typeof response.clone !== "function") return null;
  try {
    return await response.clone().text();
  } catch {
    return null;
  }
}

function logDeletePlayerError(source = {}) {
  if (!import.meta.env.DEV) return;
  console.error("[GAME Admin] delete player error", {
    status: source.status || source.context?.status || null,
    code: source.code || source.error || null,
    message: source.message || null,
    details: source.details || null,
    hint: source.hint || null,
    responseBody: source.responseBody || null,
  });
}

async function fetchPlayerBy(column, value, fallbackMessage, options = {}) {
  const client = ensureSupabaseDataClient();
  const query = client.from("players").select(basePlayerSelect());
  const { data, error } = column === "email"
    ? await query.ilike("email", value).maybeSingle()
    : await query.eq(column, value).maybeSingle();
  if (error) {
    logSupabaseDataError(`players lookup by ${column}`, error);
    throw createDataError(fallbackMessage, { cause: error });
  }
  const player = mapPlayer(data);
  if (!player) return null;
  return (await attachPlayerExtras([player], options))[0];
}

export const playerService = {
  async getCurrentPlayer() {
    const client = ensureSupabaseDataClient();
    const { data: authData, error: authError } = await client.auth.getSession();
    if (authError || !authData.session?.user?.id) return null;
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("player_id")
      .eq("auth_user_id", authData.session.user.id)
      .maybeSingle();
    if (profileError || !profile?.player_id) return null;
    return this.getPlayerById(profile.player_id);
  },

  async getPlayers(options = {}) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("players")
      .select(basePlayerSelect())
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });
    if (error) {
      logSupabaseDataError("players list", error);
      throw createDataError("NO PUDIMOS CARGAR LOS JUGADORES", { cause: error });
    }
    return attachPlayerExtras((data || []).map(mapPlayer), options);
  },

  async getPlayerById(id, options = {}) {
    return fetchPlayerBy("id", id, "NO PUDIMOS CARGAR EL JUGADOR", options);
  },

  async getPlayerByEmail(email, options = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;
    return fetchPlayerBy("email", normalizedEmail, "NO PUDIMOS CARGAR EL JUGADOR", options);
  },

  async searchPlayers(query) {
    const players = await this.getPlayers();
    const normalizedQuery = normalizeText(query);
    return players.filter((player) => normalizeText(player.fullName).includes(normalizedQuery));
  },

  async createPlayer(payload, { createTemporaryAccess = false } = {}) {
    const client = ensureSupabaseDataClient();
    const mapped = mapPlayerPayload({ ...payload, status: payload.status || "Activo" });
    mapped.current_category_id = await ensureActiveCategory(client, mapped.current_category_id);
    const { data, error } = await client
      .from("players")
      .insert(mapped)
      .select(basePlayerSelect())
      .single();
    if (error) {
      logSupabaseDataError("players create", error);
      throw mapPlayerError(error, "NO PUDIMOS CREAR EL JUGADOR");
    }
    const player = (await attachPlayerExtras([mapPlayer(data)]))[0];
    return createTemporaryAccess ? { ...player, accountStatus: "SIN CUENTA" } : player;
  },

  async linkAdminProfilePlayer(playerId) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("link_admin_profile_player", {
      p_player_id: playerId,
    });
    if (error) {
      logSupabaseDataError("admin profile player link", error);
      if (String(error.message || "").includes("PLAYER_ALREADY_LINKED")) {
        throw createDataError("ESA FICHA YA ESTÁ VINCULADA A OTRA CUENTA", { code: "PLAYER_ALREADY_LINKED", cause: error });
      }
      throw createDataError("NO PUDIMOS VINCULAR EL PERFIL DE JUGADOR", { cause: error });
    }
    return data;
  },

  async invitePlayerAccount(playerId) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.functions.invoke("invite-player", {
      body: { playerId },
    });
    if (error) {
      logSupabaseDataError("player invite edge function", error);
      throw createDataError("NO PUDIMOS ENVIAR LA INVITACION", { cause: error });
    }
    if (data?.error) {
      throw createDataError("NO PUDIMOS ENVIAR LA INVITACION", {
        code: data.error,
        cause: data,
      });
    }
    return data;
  },

  async updatePlayer(id, updates) {
    const client = ensureSupabaseDataClient();
    const mapped = mapPlayerUpdatePayload(updates, { allowEmail: "email" in updates });
    const categoryChangeId = mapped.current_category_id ? await ensureActiveCategory(client, mapped.current_category_id) : null;
    if (categoryChangeId) delete mapped.current_category_id;
    if (!Object.keys(mapped).length && categoryChangeId) {
      const { error: categoryError } = await client.rpc("set_player_category", {
        p_player_id: id,
        p_category_id: categoryChangeId,
        p_reason: updates.categoryChangeReason || updates.reason || "Cambio de categoria administrativo",
      });
      if (categoryError) {
        logSupabaseDataError("players category update rpc", categoryError);
        throw createDataError("NO PUDIMOS ACTUALIZAR LA CATEGORÍA DEL JUGADOR", { cause: categoryError });
      }
      return this.getPlayerById(id);
    }
    const { data, error } = await client
      .from("players")
      .update(mapped)
      .eq("id", id)
      .select(basePlayerSelect())
      .single();
    if (error) {
      logSupabaseDataError("players update", error);
      throw mapPlayerError(error, "NO PUDIMOS ACTUALIZAR EL JUGADOR");
    }
    if (categoryChangeId) {
      const { error: categoryError } = await client.rpc("set_player_category", {
        p_player_id: id,
        p_category_id: categoryChangeId,
        p_reason: updates.categoryChangeReason || updates.reason || "Cambio de categoria administrativo",
      });
      if (categoryError) {
        logSupabaseDataError("players category update rpc", categoryError);
        throw createDataError("NO PUDIMOS ACTUALIZAR LA CATEGORÍA DEL JUGADOR", { cause: categoryError });
      }
      return this.getPlayerById(id);
    }
    return (await attachPlayerExtras([mapPlayer(data)]))[0];
  },

  async updateOwnProfile(id, updates) {
    const current = await this.getPlayerById(id);
    const payload = {
      firstName: updates.firstName,
      lastName: updates.lastName,
      birthDate: updates.birthDate,
      phone: updates.phone,
      dni: updates.dni,
      address: updates.address ?? current?.address ?? "",
    };
    if ("gender" in updates || current?.gender) payload.gender = updates.gender ?? current?.gender;
    if (current?.categoryId) payload.categoryId = current.categoryId;
    return this.updatePlayer(id, payload);
  },

  async updateAvatar(id, avatarDataUrl) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("players")
      .update({ avatar_url: avatarDataUrl || null })
      .eq("id", id)
      .select(basePlayerSelect())
      .single();
    if (error) {
      logSupabaseDataError("players avatar update", error);
      throw createDataError("NO PUDIMOS ACTUALIZAR LA FOTO DEL JUGADOR", { cause: error });
    }
    return (await attachPlayerExtras([mapPlayer(data)]))[0];
  },

  async setPlayerStatus(id, status) {
    const client = ensureSupabaseDataClient();
    const dbStatus = statusToDb[status] || status;
    const { data, error } = await client
      .from("players")
      .update({ status: dbStatus })
      .eq("id", id)
      .select(basePlayerSelect())
      .single();
    if (error) {
      logSupabaseDataError("players status update", error);
      throw createDataError("NO PUDIMOS ACTUALIZAR EL ESTADO DEL JUGADOR", { cause: error });
    }
    return (await attachPlayerExtras([mapPlayer(data)]))[0];
  },

  async deletePlayer(id) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.functions.invoke("delete-player", {
      body: { playerId: id },
    });
    if (error) {
      const responseBody = await readFunctionErrorBody(error);
      const enrichedError = { ...error, responseBody, status: error.context?.status || error.status };
      logSupabaseDataError("player delete edge function", enrichedError);
      logDeletePlayerError(enrichedError);
      throw createDataError("NO PUDIMOS ELIMINAR EL JUGADOR", { code: error.code, cause: enrichedError });
    }
    if (data?.error === "PLAYER_ACTIVE_TOURNAMENT") {
      logDeletePlayerError(data);
      throw createDataError("NO SE PUEDE ELIMINAR EL JUGADOR", {
        code: "PLAYER_ACTIVE_TOURNAMENT",
        cause: data,
      });
    }
    if (data?.error === "ADMIN_PLAYER_DELETE_FORBIDDEN") {
      logDeletePlayerError(data);
      throw createDataError("NO SE PUEDE ELIMINAR UNA FICHA VINCULADA A UNA CUENTA ADMINISTRADORA", {
        code: "ADMIN_PLAYER_DELETE_FORBIDDEN",
        cause: data,
      });
    }
    if (data?.error === "PLAYER_HAS_SPORT_HISTORY" || data?.error === "PLAYER_HAS_SPORT_ACTIVITY") {
      logDeletePlayerError(data);
      throw createDataError("NO SE PUEDE ELIMINAR EL JUGADOR", {
        code: data.error,
        cause: data,
      });
    }
    if (data?.error) {
      logDeletePlayerError(data);
      throw createDataError("NO PUDIMOS ELIMINAR EL JUGADOR", {
        code: data.error,
        cause: data,
      });
    }
    return { deleted: true, id, ...data };
  },

  async saveBenefit(playerId, payload, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const startedAt = new Date().toISOString().slice(0, 10);
    const percentage = Number(payload.percentage);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw createDataError("INGRESA UN PORCENTAJE VALIDO", { field: "percentage" });
    }
    if (percentage <= 0) return this.resetBenefit(playerId, actor);
    const isAnnualWaiver = percentage === 100;
    const months = isAnnualWaiver || payload.indefinite ? null : Number(payload.months || 1);
    const expiresAt = isAnnualWaiver
      ? getCalendarYearEnd(new Date())
      : payload.indefinite
      ? null
      : new Date(new Date(`${startedAt}T12:00:00`).setMonth(new Date(`${startedAt}T12:00:00`).getMonth() + months)).toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const { error: revokeError } = await client
      .from("player_benefits")
      .update({ revoked_at: now, revoked_by: actor })
      .eq("player_id", playerId)
      .is("revoked_at", null);
    if (revokeError) {
      logSupabaseDataError("player benefit revoke before save", revokeError);
      throw createDataError("NO PUDIMOS ACTUALIZAR EL BENEFICIO", { cause: revokeError });
    }
    const { data, error } = await client
      .from("player_benefits")
      .insert({
        player_id: playerId,
        discount_percent: percentage,
        starts_at: startedAt,
        ends_at: expiresAt,
        reason: isAnnualWaiver ? "Beneficio 100% configurado desde administracion." : payload.reason || "",
        created_by: actor,
      })
      .select("id, player_id, discount_percent, starts_at, ends_at, reason, created_by, created_at, revoked_at")
      .single();
    if (error) {
      logSupabaseDataError("player benefit save", error);
      throw createDataError("NO PUDIMOS GUARDAR EL BENEFICIO", { cause: error });
    }
    const savedBenefit = mapBenefit(data);
    await auditService.record({
      action: "save_player_benefit",
      entityType: "player",
      entityId: playerId,
      description: `Beneficio actualizado: ${savedBenefit.percentage}% de descuento.`,
      actor,
    });
    return savedBenefit;
  },

  async resetBenefit(playerId, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const { error } = await client
      .from("player_benefits")
      .update({ revoked_at: new Date().toISOString(), revoked_by: actor })
      .eq("player_id", playerId)
      .is("revoked_at", null);
    if (error) {
      logSupabaseDataError("player benefit reset", error);
      throw createDataError("NO PUDIMOS RESTABLECER EL BENEFICIO", { cause: error });
    }
    await auditService.record({
      action: "reset_player_benefit",
      entityType: "player",
      entityId: playerId,
      description: "Beneficio restablecido a pago normal.",
      actor,
    });
    return null;
  },

  async getPaymentWaiver(playerId) {
    const benefits = await getActiveBenefitsByPlayerIds([playerId]);
    const benefit = benefits.get(playerId) || null;
    if (!benefit || benefit.percentage !== 100) return null;
    return {
      id: benefit.id,
      playerId,
      year: new Date().getFullYear(),
      startsAt: benefit.startedAt,
      endsAt: benefit.expiresAt,
      reason: benefit.reason,
      createdBy: benefit.createdBy,
      revokedAt: benefit.revokedAt,
    };
  },

  async grantPaymentWaiver(playerId, payload = {}, actor = "admin-1") {
    const benefit = await this.saveBenefit(playerId, { percentage: 100, reason: payload.reason || "" }, actor);
    return this.getPaymentWaiver(playerId) || {
      id: benefit.id,
      playerId,
      startsAt: benefit.startedAt,
      endsAt: benefit.expiresAt,
      reason: benefit.reason,
      createdBy: actor,
      revokedAt: null,
    };
  },

  async revokePaymentWaiver(playerId, actor = "admin-1") {
    const current = await this.getPaymentWaiver(playerId);
    if (!current) return null;
    await this.resetBenefit(playerId, actor);
    return { ...current, revokedAt: new Date().toISOString(), revokedBy: actor };
  },

  async requestCategoryDowngrade(playerId, requestedCategoryId) {
    throw createDataError("Las solicitudes de descenso todavia no estan habilitadas en datos reales.", {
      playerId,
      requestedCategoryId,
    });
  },
};
