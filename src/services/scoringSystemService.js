import { auditService } from "./auditService";
import {
  createDataError,
  ensureSupabaseDataClient,
  isForeignKeyViolation,
  logSupabaseDataError,
} from "./supabaseDataUtils";

const scoringSelect = `
  id,
  name,
  is_active,
  inscription,
  preliminary,
  preliminary_win,
  classification,
  round32,
  round16,
  octavos,
  cuartos,
  semifinal,
  runner_up,
  champion,
  special_bonus,
  created_at,
  updated_at
`;

function mapScoringSystem(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.is_active ? "Activo" : "Inactivo",
    inscription: Number(row.inscription || 0),
    preliminary: Number(row.preliminary || 0),
    preliminaryWin: Number(row.preliminary_win || 0),
    classification: Number(row.classification || 0),
    round32: Number(row.round32 || 0),
    round16: Number(row.round16 || 0),
    octavos: Number(row.octavos || 0),
    cuartos: Number(row.cuartos || 0),
    semifinal: Number(row.semifinal || 0),
    runnerUp: Number(row.runner_up || 0),
    champion: Number(row.champion || 0),
    specialBonus: Number(row.special_bonus || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayload(payload = {}) {
  return {
    name: String(payload.name || "").trim(),
    is_active: payload.status ? payload.status === "Activo" : payload.isActive ?? true,
    inscription: Number(payload.inscription || 0),
    preliminary: Number(payload.preliminary || 0),
    preliminary_win: Number(payload.preliminaryWin || 0),
    classification: Number(payload.classification || 0),
    round32: Number(payload.round32 || 0),
    round16: Number(payload.round16 || 0),
    octavos: Number(payload.octavos || 0),
    cuartos: Number(payload.cuartos || 0),
    semifinal: Number(payload.semifinal || 0),
    runner_up: Number(payload.runnerUp || 0),
    champion: Number(payload.champion || 0),
  };
}

async function getScoringSystemUsage(client, id) {
  const { data: tournaments, error: tournamentError } = await client
    .from("tournaments")
    .select("id, name, status, scoring_system_id")
    .eq("scoring_system_id", id)
    .limit(5);
  if (tournamentError) {
    logSupabaseDataError("scoring systems usage tournaments", tournamentError);
    throw createDataError("No pudimos verificar si el sistema de puntaje esta en uso.", { cause: tournamentError });
  }

  const references = [];
  (tournaments || []).forEach((tournament) => {
    references.push({
      table: "tournaments",
      id: tournament.id,
      label: tournament.name || tournament.id,
      reason: "tournaments.scoring_system_id",
    });
  });

  return references;
}

export const scoringSystemService = {
  async getScoringSystems() {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.from("scoring_systems").select(scoringSelect).order("champion", { ascending: true });
    if (error) {
      logSupabaseDataError("scoring systems list", error);
      throw createDataError("No pudimos cargar los sistemas de puntaje.", { cause: error });
    }
    return (data || []).map(mapScoringSystem);
  },

  async createScoringSystem(payload, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const mapped = mapPayload(payload);
    if (!mapped.name) throw createDataError("Ingresá un nombre para el sistema de puntaje.", { field: "name" });
    const { data, error } = await client.from("scoring_systems").insert(mapped).select(scoringSelect).single();
    if (error) {
      logSupabaseDataError("scoring systems create", error);
      throw createDataError("No pudimos crear el sistema de puntaje.", { cause: error });
    }
    const scoringSystem = mapScoringSystem(data);
    await auditService.record({
      action: "create_scoring_system",
      entityType: "scoring_system",
      entityId: scoringSystem.id,
      description: `Sistema de puntaje creado: ${scoringSystem.name}`,
      actor,
    });
    return scoringSystem;
  },

  async updateScoringSystem(id, updates, actor = "admin-1") {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.from("scoring_systems").update(mapPayload(updates)).eq("id", id).select(scoringSelect).single();
    if (error) {
      logSupabaseDataError("scoring systems update", error);
      throw createDataError("No pudimos actualizar el sistema de puntaje.", { cause: error });
    }
    const scoringSystem = mapScoringSystem(data);
    await auditService.record({
      action: "update_scoring_system",
      entityType: "scoring_system",
      entityId: id,
      description: "Sistema de puntaje actualizado.",
      actor,
    });
    return scoringSystem;
  },

  async toggleScoringSystem(id, actor = "admin-1") {
    const systems = await this.getScoringSystems();
    const current = systems.find((system) => system.id === id);
    if (!current) return null;
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("scoring_systems")
      .update({ is_active: current.status !== "Activo" })
      .eq("id", id)
      .select(scoringSelect)
      .single();
    if (error) {
      logSupabaseDataError("scoring systems toggle", error);
      throw createDataError("No pudimos cambiar el estado del sistema de puntaje.", { cause: error });
    }
    const scoringSystem = mapScoringSystem(data);
    await auditService.record({
      action: "toggle_scoring_system",
      entityType: "scoring_system",
      entityId: id,
      description: `Sistema de puntaje ${scoringSystem.status}.`,
      actor,
    });
    return scoringSystem;
  },

  async removeScoringSystem(id, actor = "admin-1") {
    const systems = await this.getScoringSystems();
    const target = systems.find((system) => system.id === id) || null;
    const client = ensureSupabaseDataClient();
    const usage = await getScoringSystemUsage(client, id);
    if (usage.length) {
      return {
        ...target,
        blocked: true,
        reasons: usage.map((item) => item.reason),
        references: usage,
      };
    }
    const { error } = await client.from("scoring_systems").delete().eq("id", id);
    if (!error) {
      await auditService.record({
        action: "remove_scoring_system",
        entityType: "scoring_system",
        entityId: id,
        description: "Sistema de puntaje eliminado.",
        actor,
      });
      return { ...target, removed: true };
    }
    if (isForeignKeyViolation(error)) {
      const refreshedUsage = await getScoringSystemUsage(client, id);
      if (refreshedUsage.length) {
        return {
          ...target,
          blocked: true,
          reasons: refreshedUsage.map((item) => item.reason),
          references: refreshedUsage,
        };
      }
    }
    logSupabaseDataError("scoring systems delete", error);
    throw createDataError("No pudimos eliminar el sistema de puntaje.", { cause: error });
  },
};
