import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { GameServiceError } from "./serviceUtils";

export function ensureSupabaseDataClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw createDataError("Supabase no está configurado para datos de GAME.", {
      code: "SUPABASE_DATA_CONFIG",
    });
  }
  return supabase;
}

export function createDataError(message, options = {}) {
  const error = new GameServiceError(message, options.cause);
  error.code = options.code || options.cause?.code || "SUPABASE_DATA_ERROR";
  error.field = options.field || null;
  return error;
}

export function logSupabaseDataError(context, error) {
  if (!import.meta.env.DEV || !error) return;
  console.error(`[GAME Supabase] ${context}`, {
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
    status: error.status || null,
    table: error.table || null,
    select: error.select || null,
    filter: error.filter || null,
  });
}

export function isUniqueViolation(error) {
  return error?.code === "23505";
}

export function isForeignKeyViolation(error) {
  return error?.code === "23503";
}

export function isMissingColumnError(error, table, column) {
  const source = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return source.includes(String(table || "").toLowerCase()) &&
    source.includes(String(column || "").toLowerCase()) &&
    (source.includes("pgrst204") || source.includes("42703") || source.includes("could not find") || source.includes("does not exist"));
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeDigits(value) {
  return String(value || "").trim();
}
