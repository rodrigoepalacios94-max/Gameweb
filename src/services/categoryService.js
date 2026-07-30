import {
  canPlayerRegisterInCategory,
  getAllowedSuperiorCategories,
  getBlockedLowerCategories,
  getSameOrAllowedCategories,
  isLowerCategory,
} from "../utils/categoryRules";
import {
  createDataError,
  ensureSupabaseDataClient,
  isForeignKeyViolation,
  isUniqueViolation,
} from "./supabaseDataUtils";

function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    branch: row.branch || "Masculino",
    level: Number(row.level || 1),
    isActive: Boolean(row.is_active),
    status: row.is_active ? "Activa" : "Inactiva",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCategoryPayload(payload) {
  const mapped = {};
  if ("name" in payload) mapped.name = String(payload.name || "").trim();
  if ("branch" in payload) mapped.branch = payload.branch || "Masculino";
  if ("level" in payload) mapped.level = Number(payload.level || 1);
  if ("status" in payload) mapped.is_active = payload.status === "Activa" || payload.status === "active" || payload.status === true;
  if ("isActive" in payload) mapped.is_active = Boolean(payload.isActive);
  if ("is_active" in payload) mapped.is_active = Boolean(payload.is_active);
  return mapped;
}

function mapCategoryError(error, fallbackMessage) {
  if (isUniqueViolation(error)) {
    return createDataError("YA EXISTE UNA CATEGORÍA CON ESE NOMBRE", {
      code: "CATEGORY_NAME_EXISTS",
      field: "name",
      cause: error,
    });
  }
  return createDataError(fallbackMessage, { cause: error });
}

async function fetchCategoriesQuery(query, fallbackMessage) {
  const { data, error } = await query;
  if (error) throw createDataError(fallbackMessage, { cause: error });
  return (data || []).map(mapCategory);
}

export const categoryService = {
  async getCategories() {
    const client = ensureSupabaseDataClient();
    return fetchCategoriesQuery(
      client
        .from("categories")
        .select("id, name, branch, level, is_active, created_at, updated_at")
        .order("level", { ascending: true })
        .order("name", { ascending: true }),
      "NO PUDIMOS CARGAR LAS CATEGORÍAS",
    );
  },

  async getActiveCategories() {
    const client = ensureSupabaseDataClient();
    return fetchCategoriesQuery(
      client
        .from("categories")
        .select("id, name, branch, level, is_active, created_at, updated_at")
        .eq("is_active", true)
        .order("level", { ascending: true })
        .order("name", { ascending: true }),
      "NO PUDIMOS CARGAR LAS CATEGORÍAS",
    );
  },

  async getCategoryById(id) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("categories")
      .select("id, name, branch, level, is_active, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw createDataError("NO PUDIMOS CARGAR LA CATEGORÍA", { cause: error });
    return mapCategory(data);
  },

  async getCategoryRulesForPlayer(playerId) {
    const client = ensureSupabaseDataClient();
    const [{ data: player, error: playerError }, categories] = await Promise.all([
      client
        .from("players")
        .select("id, current_category_id")
        .eq("id", playerId)
        .maybeSingle(),
      this.getCategories(),
    ]);

    if (playerError) throw createDataError("NO PUDIMOS CALCULAR REGLAS DE CATEGORÍA", { cause: playerError });

    const playerCategory = categories.find((category) => category.id === player?.current_category_id) || null;
    return {
      currentCategory: playerCategory,
      allowedCategories: getSameOrAllowedCategories(playerCategory, categories),
      superiorCategories: getAllowedSuperiorCategories(playerCategory, categories),
      lowerCategories: getBlockedLowerCategories(playerCategory, categories),
    };
  },

  canPlayerRegisterInCategory,
  isLowerCategory,

  async createCategory(payload) {
    const client = ensureSupabaseDataClient();
    const mapped = mapCategoryPayload(payload);
    const { data, error } = await client
      .from("categories")
      .insert(mapped)
      .select("id, name, branch, level, is_active, created_at, updated_at")
      .single();
    if (error) throw mapCategoryError(error, "NO PUDIMOS CREAR LA CATEGORÍA");
    return mapCategory(data);
  },

  async updateCategory(id, updates) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("categories")
      .update(mapCategoryPayload(updates))
      .eq("id", id)
      .select("id, name, branch, level, is_active, created_at, updated_at")
      .single();
    if (error) throw mapCategoryError(error, "NO PUDIMOS ACTUALIZAR LA CATEGORÍA");
    return mapCategory(data);
  },

  async setCategoryActive(id, active) {
    return this.updateCategory(id, { isActive: active });
  },

  async deleteCategory(id) {
    const client = ensureSupabaseDataClient();
    const category = await this.getCategoryById(id);
    const { error } = await client.from("categories").delete().eq("id", id);
    if (!error) return { deleted: true, category, reasons: [] };

    if (isForeignKeyViolation(error)) {
      return {
        deleted: false,
        blocked: true,
        category,
        reasons: ["Esta categoría tiene jugadores asociados."],
      };
    }

    throw createDataError("NO PUDIMOS ELIMINAR LA CATEGORÍA", { cause: error });
  },
};
