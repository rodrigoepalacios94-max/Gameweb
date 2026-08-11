import { useQuery } from "@tanstack/react-query";
import { adminService } from "../services/adminService";
import { availabilityService } from "../services/availabilityService";
import { categoryService } from "../services/categoryService";
import { enrollmentService } from "../services/enrollmentService";
import { matchService } from "../services/matchService";
import { playerService } from "../services/playerService";
import { regulationDocumentService } from "../services/regulationDocumentService";
import { tournamentService } from "../services/tournamentService";
import { getBlockedLowerCategories } from "../utils/categoryRules";
import { buildPlayerTournamentViews } from "../utils/playerTournamentView";
import { queryKeys } from "./queryKeys";

async function loadOptional(scope, label, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    console.error(`[GAME ${scope}] ${label}`, {
      code: error.code || error.cause?.code || null,
      message: error.message || error.cause?.message || null,
      details: error.details || error.cause?.details || null,
      hint: error.hint || error.cause?.hint || null,
    });
    return fallback;
  }
}

async function loadPlayerHome(user) {
  if (!user?.id) {
    return { matches: [], tournaments: [], currentPlayer: null, enrollments: [], pendingPayments: [], attendanceRequests: [] };
  }
  const currentPlayer = user;
  const [matches, tournaments, categories, enrollments, attendanceRequests] = await Promise.all([
    loadOptional("Player", "matches", () => matchService.getPlayerMatches(user.id), []),
    loadOptional("Player", "tournaments", () => tournamentService.getTournaments(), []),
    loadOptional("Player", "categories", () => categoryService.getCategories(), []),
    loadOptional("Player", "enrollments", () => enrollmentService.getEnrollmentsByPlayer(user.id), []),
    loadOptional("Player", "attendance requests", () => availabilityService.getPlayerAttendanceRequests(user.id), []),
  ]);
  const tournamentViews = buildPlayerTournamentViews({ tournaments, categories, currentPlayer, enrollments });
  const visibleTournamentViews = tournamentViews.filter((tournament) => {
    if (tournament.existingEnrollments?.length) return true;
    if (tournament.status !== "Inscripciones abiertas" || currentPlayer.status?.includes("Bloqueado")) return false;
    return tournament.eligibleCategories?.length > 0;
  });
  return {
    matches,
    tournaments: visibleTournamentViews,
    currentPlayer,
    enrollments,
    pendingPayments: enrollmentService.getPendingPaymentSummaries(enrollments),
    attendanceRequests,
  };
}

async function loadPlayerProfile(user) {
  const player = user;
  if (!player) throw new Error("No pudimos cargar tu ficha de jugador.");
  const [matches, tournaments, categories, regulationDocuments, enrollments] = await Promise.all([
    loadOptional("Player", "matches", () => matchService.getPlayerMatches(user.id), []),
    loadOptional("Player", "tournaments", () => tournamentService.getTournaments(), []),
    loadOptional("Player", "categories", () => categoryService.getCategories(), []),
    loadOptional("Player", "regulations", () => regulationDocumentService.getRegulationDocuments({ activeOnly: true }), []),
    loadOptional("Player", "enrollments", () => enrollmentService.getEnrollmentsByPlayer(user.id), []),
  ]);
  const currentCategory = categories.find((category) => category.id === player.categoryId) || player.category || null;
  return {
    player,
    matches,
    tournaments: tournaments.filter((tournament) => tournament.participants?.includes(user.id)),
    lowerCategories: getBlockedLowerCategories(currentCategory, categories),
    regulationDocuments,
    activeCategories: categories.filter((category) => category.status === "Activa"),
    enrollments,
    allTournaments: tournaments,
  };
}

async function loadAdminPlayers() {
  const [players, categories] = await Promise.all([
    playerService.getPlayers({ includeBenefits: false }),
    categoryService.getCategories(),
  ]);
  return { players, categories };
}

export function usePlayerHomeQuery(user) {
  return useQuery({
    queryKey: queryKeys.playerHome(user?.id || "none"),
    queryFn: () => loadPlayerHome(user),
    enabled: Boolean(user?.id),
  });
}

export function usePlayerProfileQuery(user) {
  return useQuery({
    queryKey: queryKeys.playerProfile(user?.id || "none"),
    queryFn: () => loadPlayerProfile(user),
    enabled: Boolean(user?.id),
  });
}

export function useAdminDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.adminDashboard(),
    queryFn: () => adminService.getDashboardSummary(),
  });
}

export function useAdminPlayersQuery() {
  return useQuery({
    queryKey: queryKeys.adminPlayers(),
    queryFn: loadAdminPlayers,
  });
}
