const GAME_TIMEZONE_OFFSET = "-03:00";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const REGISTRATION_STATUS = {
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
};

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  WAIVED: "waived",
};

function normalizeDateInput(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value ?? fallback);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function parseTournamentStart(tournament) {
  const rawDate = tournament?.startDate || tournament?.start_at || tournament?.date;
  if (!rawDate) return null;
  const rawTime = tournament?.startTime || tournament?.time || "00:00:00";
  const normalizedTime = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
  const parsed = new Date(`${rawDate}T${normalizedTime}${GAME_TIMEZONE_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getPaymentDueAt(tournament) {
  const start = parseTournamentStart(tournament);
  if (!start) return null;
  return new Date(start.getTime() - 3 * MS_PER_DAY).toISOString();
}

export function canPayLater(tournament, now = new Date()) {
  const dueAt = getPaymentDueAt(tournament);
  if (!dueAt) return false;
  return normalizeDateInput(now).getTime() < new Date(dueAt).getTime();
}

export function getCalendarYearEnd(date = new Date()) {
  const year = date.getFullYear();
  return `${year}-12-31`;
}

export function isPaymentWaiverActive(waiver, date = new Date()) {
  if (!waiver || waiver.revokedAt || waiver.revoked_at) return false;
  const currentDate = normalizeDateInput(date);
  const startsAt = new Date(`${waiver.startsAt || waiver.starts_at}T00:00:00${GAME_TIMEZONE_OFFSET}`);
  const endsAt = new Date(`${waiver.endsAt || waiver.ends_at}T23:59:59${GAME_TIMEZONE_OFFSET}`);
  return startsAt.getTime() <= currentDate.getTime() && currentDate.getTime() <= endsAt.getTime();
}

export function calculateRegistrationAmount({ unitPrice = 0, categoryIds = [], benefitPercentage = 0, waived = false }) {
  const selectedCount = categoryIds.length;
  const normalizedUnitPrice = Number(unitPrice || 0);
  const subtotal = normalizedUnitPrice * selectedCount;
  const normalizedBenefit = Math.max(0, Math.min(100, Number(benefitPercentage || 0)));
  const discountAmount = waived ? subtotal : Math.round((subtotal * normalizedBenefit) / 100);
  const total = waived ? 0 : Math.max(0, subtotal - discountAmount);

  return {
    unitPrice: normalizedUnitPrice,
    categoryCount: selectedCount,
    subtotal,
    benefitPercentage: normalizedBenefit,
    discountAmount,
    total,
    waived: Boolean(waived),
  };
}

export function isPaymentPending(enrollment) {
  return enrollment?.paymentStatus === PAYMENT_STATUS.PENDING || enrollment?.payment_status === PAYMENT_STATUS.PENDING || enrollment?.paymentState === "PENDING_PAYMENT" || enrollment?.payment === "Pendiente";
}

export function isPaymentPaid(enrollment) {
  return enrollment?.paymentStatus === PAYMENT_STATUS.PAID || enrollment?.payment_status === PAYMENT_STATUS.PAID || enrollment?.paymentState === "APPROVED";
}

export function isPaymentWaived(enrollment) {
  return enrollment?.paymentStatus === PAYMENT_STATUS.WAIVED || enrollment?.payment_status === PAYMENT_STATUS.WAIVED || enrollment?.payment === "Bonificado";
}

export function getPaymentStatusLabel(enrollment) {
  if (isPaymentWaived(enrollment)) return "LIBERADO";
  if (isPaymentPending(enrollment)) return "PAGO PENDIENTE";
  if (isPaymentPaid(enrollment)) return "PAGADO";
  return "PAGO";
}

export function getPaymentStatusTone(enrollment) {
  if (isPaymentPending(enrollment)) return "danger";
  if (isPaymentWaived(enrollment)) return "info";
  if (isPaymentPaid(enrollment)) return "success";
  return "neutral";
}
