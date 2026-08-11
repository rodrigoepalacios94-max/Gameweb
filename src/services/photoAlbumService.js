import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";
import { emailService } from "./emailService";

const albumSelect = "id, title, url, is_active, created_at, updated_at";

export function isSafePhotoAlbumUrl(value = "") {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeAlbumPayload(payload = {}) {
  return {
    title: String(payload.title || payload.name || "").trim(),
    url: String(payload.url || payload.link || "").trim(),
    is_active: payload.active ?? payload.isActive ?? true,
  };
}

function validateAlbumPayload(payload) {
  if (!payload.title) throw createDataError("El nombre del album es obligatorio.", { field: "name" });
  if (!payload.url) throw createDataError("El link del album es obligatorio.", { field: "link" });
  if (!isSafePhotoAlbumUrl(payload.url)) {
    throw createDataError("El link debe ser una URL https:// valida.", { field: "link" });
  }
}

function assertAdmin(actorRole) {
  if (actorRole !== "admin") throw createDataError("Solo el administrador puede modificar albumes.");
}

function mapAlbum(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.title,
    title: row.title,
    link: row.url,
    url: row.url,
    active: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const photoAlbumService = {
  async getPhotoAlbums({ activeOnly = false } = {}) {
    const client = ensureSupabaseDataClient();
    let query = client.from("photo_albums").select(albumSelect).order("created_at", { ascending: false });
    if (activeOnly) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) {
      logSupabaseDataError("photo albums list", error);
      throw createDataError("No pudimos cargar los albumes.", { cause: error });
    }
    return (data || []).map(mapAlbum);
  },

  async createPhotoAlbum(payload, actorRole = "player") {
    assertAdmin(actorRole);
    const client = ensureSupabaseDataClient();
    const dataToInsert = normalizeAlbumPayload(payload);
    validateAlbumPayload(dataToInsert);
    const { data, error } = await client.from("photo_albums").insert(dataToInsert).select(albumSelect).single();
    if (error) {
      logSupabaseDataError("photo album create", error);
      throw createDataError("No pudimos crear el album.", { cause: error });
    }
    if (data?.is_active) emailService.processQueuedGameEmails("photo_album_published");
    return mapAlbum(data);
  },

  async updatePhotoAlbum(id, payload, actorRole = "player") {
    assertAdmin(actorRole);
    const client = ensureSupabaseDataClient();
    const dataToUpdate = normalizeAlbumPayload(payload);
    validateAlbumPayload(dataToUpdate);
    const { data, error } = await client.from("photo_albums").update(dataToUpdate).eq("id", id).select(albumSelect).single();
    if (error) {
      logSupabaseDataError("photo album update", error);
      throw createDataError("No pudimos actualizar el album.", { cause: error });
    }
    if (data?.is_active) emailService.processQueuedGameEmails("photo_album_published");
    return mapAlbum(data);
  },

  async deletePhotoAlbum(id, actorRole = "player") {
    assertAdmin(actorRole);
    const client = ensureSupabaseDataClient();
    const { error } = await client.from("photo_albums").delete().eq("id", id);
    if (error) {
      logSupabaseDataError("photo album delete", error);
      throw createDataError("No pudimos eliminar el album.", { cause: error });
    }
    return { deleted: true };
  },
};
