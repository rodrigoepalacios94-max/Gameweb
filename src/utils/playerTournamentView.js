import { canPlayerRegisterInCategory } from "./categoryRules";
import { isPaymentPending, isPaymentWaived } from "./paymentRules";

export function buildPlayerTournamentViews({ tournaments = [], categories = [], currentPlayer, enrollments = [] }) {
  const currentCategory = categories.find((category) => category.id === currentPlayer?.categoryId);
  const activeEnrollments = enrollments.filter((enrollment) => enrollment.status !== "Rechazada");
  const enrollmentsByTournament = activeEnrollments.reduce((map, enrollment) => {
    const current = map.get(enrollment.tournamentId) || [];
    map.set(enrollment.tournamentId, [...current, enrollment]);
    return map;
  }, new Map());
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return tournaments.map((tournament) => {
    const existingEnrollments = enrollmentsByTournament.get(tournament.id) || [];
    const registeredCategoryIds = new Set(existingEnrollments.map((enrollment) => enrollment.categoryId));
    const playerTournamentCategories = (tournament.categories || [])
      .map((categoryId) => categoryById.get(categoryId))
      .filter(Boolean)
      .map((category) => ({
        ...category,
        isEligible: category.status === "Activa" && canPlayerRegisterInCategory(currentCategory, category),
        isRegistered: registeredCategoryIds.has(category.id),
      }));
    const eligibleCategories = playerTournamentCategories.filter((category) => category.isEligible && !category.isRegistered);

    const hasPendingPayment = existingEnrollments.some(isPaymentPending);
    const hasWaivedPayment = existingEnrollments.some(isPaymentWaived);
    const hasFaultExpulsion = existingEnrollments.some((enrollment) =>
      enrollment.participationStatus === "eliminated_faults" ||
      enrollment.eliminationReason === "three_faults"
    );

    return {
      ...tournament,
      playerTournamentCategories,
      eligibleCategories,
      existingEnrollments,
      personalStatus: existingEnrollments.length
        ? hasFaultExpulsion
          ? "EXPULSADO POR 3 FALTAS"
          : hasPendingPayment
          ? "INSCRIPTO · PAGO PENDIENTE"
          : hasWaivedPayment
            ? "INSCRIPTO · LIBERADO"
            : "INSCRIPTO · PAGADO"
        : "NO INSCRIPTO",
      registrationStatus: hasFaultExpulsion ? "Expulsado por 3 faltas" : existingEnrollments.length ? "Inscripto" : "No inscripto",
      paymentStatus: hasPendingPayment ? "pending" : hasWaivedPayment ? "waived" : existingEnrollments.length ? "paid" : null,
      expelledByFaults: hasFaultExpulsion,
    };
  });
}
