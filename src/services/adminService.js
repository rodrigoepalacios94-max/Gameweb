import { enrollmentService } from "./enrollmentService";
import { matchService } from "./matchService";
import { playerService } from "./playerService";
import { scoringSystemService } from "./scoringSystemService";
import { tournamentService } from "./tournamentService";

function tournamentDateValue(tournament) {
  const date = tournament?.startDate || tournament?.finalsDate || tournament?.createdAt || "";
  const value = Date.parse(`${date}T12:00:00`);
  return Number.isNaN(value) ? 0 : value;
}

function sortTournamentsNewestFirst(tournaments = []) {
  const createdValue = (tournament) => {
    const value = Date.parse(tournament?.createdAt || "");
    return Number.isNaN(value) ? 0 : value;
  };
  return [...tournaments].sort((a, b) =>
    tournamentDateValue(b) - tournamentDateValue(a) ||
    createdValue(b) - createdValue(a) ||
    String(b.id || b.name).localeCompare(String(a.id || a.name), undefined, { numeric: true }),
  );
}

async function loadOptional(label, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error(`[GAME Admin] ${label}`, {
        code: error.code || error.cause?.code || null,
        message: error.message || error.cause?.message || null,
        details: error.details || error.cause?.details || null,
        hint: error.hint || error.cause?.hint || null,
      });
    }
    return fallback;
  }
}

export const adminService = {
  async getDashboardSummary() {
    const [tournaments, players, matches, enrollments] = await Promise.all([
      loadOptional("dashboard tournaments", () => tournamentService.getTournaments(), []),
      loadOptional("dashboard players", () => playerService.getPlayers(), []),
      loadOptional("dashboard matches", () => matchService.getMatches(), []),
      loadOptional("dashboard enrollments", () => enrollmentService.getEnrollmentsByTournament(), []),
    ]);
    const sortedTournaments = sortTournamentsNewestFirst(tournaments);
    const activeTournaments = sortedTournaments.filter((item) => item.status === "En juego");
    const openTournaments = sortedTournaments.filter((item) => item.status === "Inscripciones abiertas");
    const pendingMatches = matches.filter((item) => ["Pendiente", "Programado", "Reprogramado", "W.O."].includes(item.status));
    const blockedPlayers = players.filter((player) => player.status?.includes("Bloqueado"));
    return {
      tournaments: sortedTournaments,
      players,
      matches,
      notifications: [],
      activeTournaments,
      openTournaments,
      pendingMatches,
      pendingResults: [],
      pendingDescents: [],
      pendingClaims: [],
      blockedPlayers,
      enrollments,
    };
  },
  async getSettings() {
    const scoringSystems = await scoringSystemService.getScoringSystems();
    return { scoringSystems, regulation: null };
  },
  async createScoringSystem(payload, actor = "admin-1") {
    return scoringSystemService.createScoringSystem(payload, actor);
  },
  async updateScoringSystem(id, updates, actor = "admin-1") {
    return scoringSystemService.updateScoringSystem(id, updates, actor);
  },
  async toggleScoringSystem(id, actor = "admin-1") {
    return scoringSystemService.toggleScoringSystem(id, actor);
  },
  async removeScoringSystem(id, actor = "admin-1") {
    return scoringSystemService.removeScoringSystem(id, actor);
  },
  async getRegulation() {
    return null;
  },
  async saveRegulation() {
    return null;
  },
  async deleteRegulation() {
    return null;
  },
  async getScheduleByTournament() {
    return [];
  },
};
