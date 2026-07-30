import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";

function mapSeason(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    year: Number(row.year),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const seasonService = {
  async getCurrentSeason() {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("get_current_season");
    if (error) {
      logSupabaseDataError("current season", error);
      throw createDataError("No pudimos cargar la temporada actual.", { cause: error });
    }
    return mapSeason(Array.isArray(data) ? data[0] : data);
  },

  async getSeasons() {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.from("seasons").select("*").order("year", { ascending: false });
    if (error) {
      logSupabaseDataError("seasons list", error);
      throw createDataError("No pudimos cargar las temporadas.", { cause: error });
    }
    return (data || []).map(mapSeason);
  },
};
