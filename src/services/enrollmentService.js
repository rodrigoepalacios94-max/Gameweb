import { PAYMENT_STATUS, REGISTRATION_STATUS, isPaymentPending } from "../utils/paymentRules";
import { auditService } from "./auditService";
import { paymentService } from "./paymentService";
import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";

const registrationSelect = `
  id,
  player_id,
  tournament_id,
  status,
  payment_status,
  payment_due_at,
  unit_price,
  category_count,
  subtotal,
  subtotal_amount,
  benefit_percentage,
  discount_percent,
  discount_amount,
  total_amount,
  amount_breakdown,
  created_at,
  updated_at,
  cancelled_at,
  cancel_reason,
  players:player_id (
    id,
    first_name,
    last_name,
    email
  ),
  tournaments:tournament_id (
    id,
    name,
    price_per_category,
    start_date
  ),
  registration_categories (
    id,
    category_name,
    unit_price,
    status,
    eliminated_at,
    elimination_reason,
    tournament_categories:tournament_category_id (
      id,
      category_id
    )
  )
`;

const paymentSelect = `
  id,
  registration_id,
  provider,
  amount,
  status,
  payment_method,
  approved_at,
  review_required,
  created_at
`;

function normalizeDateInput(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value ?? fallback);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function paymentStatusFromDb(value) {
  if (value === "paid") return PAYMENT_STATUS.PAID;
  if (value === "waived") return PAYMENT_STATUS.WAIVED;
  return PAYMENT_STATUS.PENDING;
}

function registrationStatusFromDb(value) {
  return value === "cancelled" ? REGISTRATION_STATUS.CANCELLED : REGISTRATION_STATUS.CONFIRMED;
}

function paymentLabel(paymentStatus) {
  if (paymentStatus === PAYMENT_STATUS.WAIVED) return "Liberado";
  if (paymentStatus === PAYMENT_STATUS.PAID) return "Aprobado";
  return "Pendiente";
}

function playerName(player) {
  return `${player?.first_name || ""} ${player?.last_name || ""}`.trim();
}

function normalizePayments(payments) {
  if (Array.isArray(payments)) return payments;
  return payments ? [payments] : [];
}

function latestPayment(payments) {
  return normalizePayments(payments)
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))[0] || null;
}

function groupPaymentsByRegistration(payments = []) {
  return payments.reduce((groups, payment) => {
    if (!payment?.registration_id) return groups;
    groups.set(payment.registration_id, [...(groups.get(payment.registration_id) || []), payment]);
    return groups;
  }, new Map());
}

async function fetchPaymentsForRegistrations(registrationIds = []) {
  const ids = [...new Set(registrationIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const client = ensureSupabaseDataClient();
  const { data, error } = await client
    .from("payments")
    .select(paymentSelect)
    .in("registration_id", ids)
    .order("created_at", { ascending: false });
  if (error) {
    logSupabaseDataError("registration payments optional fetch", {
      ...error,
      table: "payments",
      select: paymentSelect,
      filter: JSON.stringify({ registrationIds: ids }),
    });
    return new Map();
  }
  return groupPaymentsByRegistration(data || []);
}

function mapRegistrationRows(registration) {
  if (!registration) return [];
  const registrationStatus = registrationStatusFromDb(registration.status);
  const paymentStatus = paymentStatusFromDb(registration.payment_status);
  const categories = registration.registration_categories || [];
  const payment = latestPayment(registration.payments);
  return categories.map((item) => ({
    id: item.id,
    registrationId: registration.id,
    paymentGroupId: registration.id,
    status: registrationStatus === REGISTRATION_STATUS.CANCELLED ? "Rechazada" : "Confirmada",
    registrationStatus,
    registrationState: registrationStatus,
    paymentStatus,
    paymentState: paymentStatus === PAYMENT_STATUS.PENDING ? "PENDING_PAYMENT" : "APPROVED",
    payment: paymentLabel(paymentStatus),
    paymentDueAt: registration.payment_due_at,
    date: String(registration.created_at || "").slice(0, 10),
    createdAt: registration.created_at,
    tournamentId: registration.tournament_id,
    tournamentName: registration.tournaments?.name || "",
    playerId: registration.player_id,
    playerName: playerName(registration.players),
    categoryId: item.tournament_categories?.category_id,
    categoryName: item.category_name,
    unitPrice: Number(item.unit_price || registration.unit_price || 0),
    originalPrice: Number(registration.subtotal_amount || registration.subtotal || 0),
    subtotal: Number(registration.subtotal_amount || registration.subtotal || 0),
    discountAmount: Number(registration.discount_amount || 0),
    benefitPercentage: Number(registration.discount_percent || registration.benefit_percentage || 0),
    price: Number(registration.total_amount || 0),
    totalAmount: Number(registration.total_amount || 0),
    paymentProvider: payment?.provider || (paymentStatus === PAYMENT_STATUS.WAIVED ? "waiver" : null),
    paymentMethod: payment?.payment_method || payment?.provider || (paymentStatus === PAYMENT_STATUS.WAIVED ? "waiver" : null),
    paymentReviewRequired: Boolean(payment?.review_required),
    amountBreakdown: registration.amount_breakdown || null,
    participationStatus: item.status || "active",
    eliminatedAt: item.eliminated_at || null,
    eliminationReason: item.elimination_reason || null,
    cancelReason: registration.cancel_reason,
    cancelledAt: registration.cancelled_at,
  }));
}

function mapRegistrationCreateError(error) {
  const message = String(error?.message || "");
  if (message.includes("PLAYER_BLOCKED_FAULTS")) {
    return createDataError("NO PODÉS INSCRIBIRTE. Tu cuenta deportiva está bloqueada por faltas. Contactá al administrador.", {
      code: "PLAYER_BLOCKED_FAULTS",
      cause: error,
    });
  }
  if (message.includes("PLAYER_EXPELLED_FROM_TOURNAMENT")) {
    return createDataError("NO PODÉS REINGRESAR A ESTE TORNEO. Tu participación quedó expulsada por 3 faltas.", {
      code: "PLAYER_EXPELLED_FROM_TOURNAMENT",
      cause: error,
    });
  }
  return createDataError("No pudimos registrar la inscripcion.", { cause: error });
}

async function fetchRegistrations(filters = {}) {
  const client = ensureSupabaseDataClient();
  let query = client.from("registrations").select(registrationSelect);
  if (filters.tournamentId) query = query.eq("tournament_id", filters.tournamentId);
  if (filters.playerId) query = query.eq("player_id", filters.playerId);
  if (filters.registrationId) query = query.eq("id", filters.registrationId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    const source = {
      ...error,
      table: "registrations",
      select: registrationSelect,
      filter: JSON.stringify(filters),
    };
    logSupabaseDataError("registrations fetch", source);
    const wrappedError = createDataError("No pudimos cargar inscripciones.", { cause: source });
    wrappedError.table = source.table;
    wrappedError.select = source.select;
    wrappedError.filters = source.filter;
    wrappedError.details = source.details || null;
    wrappedError.hint = source.hint || null;
    wrappedError.status = source.status || null;
    throw wrappedError;
  }
  const rows = data || [];
  const paymentsByRegistration = await fetchPaymentsForRegistrations(rows.map((registration) => registration.id));
  return rows.flatMap((registration) => mapRegistrationRows({
    ...registration,
    payments: paymentsByRegistration.get(registration.id) || [],
  }));
}

function buildPendingPaymentSummaries(rows) {
  const groups = new Map();
  rows
    .filter((enrollment) => enrollment.registrationStatus !== REGISTRATION_STATUS.CANCELLED && isPaymentPending(enrollment))
    .forEach((enrollment) => {
      const key = enrollment.registrationId || enrollment.paymentGroupId || enrollment.id;
      groups.set(key, [...(groups.get(key) || []), enrollment]);
    });

  return [...groups.values()].map((items) => {
    const first = items[0];
    return {
      registrationId: first.registrationId,
      paymentGroupId: first.paymentGroupId,
      playerId: first.playerId,
      playerName: first.playerName,
      tournamentId: first.tournamentId,
      tournamentName: first.tournamentName,
      categories: items.map((row) => ({ id: row.categoryId, name: row.categoryName })),
      totalAmount: first.totalAmount || first.price || 0,
      paymentDueAt: first.paymentDueAt,
      amountBreakdown: first.amountBreakdown,
    };
  });
}

function groupRowsByRegistration(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const registrationId = row.registrationId || row.paymentGroupId;
    if (!registrationId) return;
    groups.set(registrationId, [...(groups.get(registrationId) || []), row]);
  });
  return [...groups.values()];
}

function getValidRegistrationGroup(rows = []) {
  return groupRowsByRegistration(rows).find((items) =>
    items.some((item) => item.registrationStatus !== REGISTRATION_STATUS.CANCELLED)
  ) || null;
}

async function getExistingValidRegistrationRows(payload) {
  if (!payload?.playerId || !payload?.tournamentId) return null;
  const rows = await fetchRegistrations({ playerId: payload.playerId, tournamentId: payload.tournamentId });
  return getValidRegistrationGroup(rows);
}

async function createRegistration(payload, paymentMode, actor) {
  const client = ensureSupabaseDataClient();
  const categoryIds = [...new Set(payload.categoryIds || [payload.categoryId].filter(Boolean))];
  const { data, error } = await client.rpc("create_registration_for_player", {
    p_player_id: payload.playerId,
    p_tournament_id: payload.tournamentId,
    p_category_ids: categoryIds,
    p_payment_mode: paymentMode,
  });
  if (error) {
    logSupabaseDataError("registration create rpc", error);
    throw mapRegistrationCreateError(error);
  }
  const rows = await fetchRegistrations({ registrationId: data });
  const isMercadoPago = paymentMode === "mercadopago";
  await auditService.record({
    action: isMercadoPago ? "create_mercadopago_registration" : "confirm_pay_later_registration",
    entityType: "registration",
    entityId: data,
    description: isMercadoPago
      ? `Inscripcion creada para pago con Mercado Pago en ${rows.length} categoria(s).`
      : `Inscripcion confirmada con pago pendiente en ${rows.length} categoria(s).`,
    actor,
  });
  return rows;
}

async function startCheckoutForRegistration(registrationId, actor = "player", paymentMethod = "checkout") {
  const checkout = await paymentService.createMercadoPagoPreference(registrationId, paymentMethod);
  await auditService.record({
    action: paymentMethod === "qr" ? "start_mercadopago_qr" : "start_mercadopago_checkout",
    entityType: "registration",
    entityId: registrationId,
    description: checkout.status === "waived"
      ? "Inscripcion liberada de pago."
      : paymentMethod === "qr"
        ? "QR dinamico de Mercado Pago generado."
        : "Checkout Pro de Mercado Pago iniciado.",
    actor,
  });
  return checkout;
}

async function startCheckoutFromEnrollmentRows(enrollments, actor, paymentMethod = "checkout") {
  const registrationId = enrollments?.[0]?.registrationId;
  if (!registrationId) {
    throw createDataError("No pudimos identificar la inscripcion para iniciar el pago.", {
      code: "REGISTRATION_ID_MISSING",
    });
  }
  const paymentStatus = enrollments[0]?.paymentStatus;
  if (paymentStatus === PAYMENT_STATUS.WAIVED) {
    return { status: "waived", registrationId, enrollments };
  }
  if (paymentStatus === PAYMENT_STATUS.PAID) {
    throw createDataError("Esta inscripcion ya esta pagada.", {
      code: "REGISTRATION_ALREADY_PAID",
    });
  }
  const checkout = await startCheckoutForRegistration(registrationId, actor, paymentMethod);
  return { ...checkout, enrollments };
}

export const enrollmentService = {
  async getEnrollmentsByTournament(tournamentId) {
    return fetchRegistrations({ tournamentId });
  },

  async getEnrollmentsByPlayer(playerId) {
    return fetchRegistrations({ playerId });
  },

  async getPendingPaymentsByPlayer(playerId) {
    return buildPendingPaymentSummaries(await fetchRegistrations({ playerId }));
  },

  getPendingPaymentSummaries(enrollments = []) {
    return buildPendingPaymentSummaries(enrollments);
  },

  async getPendingPaymentsByTournament(tournamentId) {
    return buildPendingPaymentSummaries(await fetchRegistrations({ tournamentId }));
  },

  async enrollPlayer(payload) {
    const rows = await createRegistration(payload, "later", payload.playerId);
    return rows[0];
  },

  async confirmMockPaymentRegistration(payload, actor = payload.playerId) {
    const enrollments = await this.confirmMockPaymentRegistrations({ ...payload, categoryIds: [payload.categoryId] }, actor);
    return enrollments[0];
  },

  async confirmMockPaymentRegistrations(payload, actor = payload.playerId) {
    return createRegistration(payload, "mercadopago", actor);
  },

  async startMercadoPagoCheckout(payload, actor = payload.playerId) {
    const existingEnrollments = await getExistingValidRegistrationRows(payload);
    if (existingEnrollments?.length) {
      return startCheckoutFromEnrollmentRows(existingEnrollments, actor);
    }
    const enrollments = await createRegistration(payload, "mercadopago", actor);
    return startCheckoutFromEnrollmentRows(enrollments, actor);
  },

  async startMercadoPagoQr(payload, actor = payload.playerId) {
    const existingEnrollments = await getExistingValidRegistrationRows(payload);
    if (existingEnrollments?.length) {
      return startCheckoutFromEnrollmentRows(existingEnrollments, actor, "qr");
    }
    const enrollments = await createRegistration(payload, "mercadopago", actor);
    return startCheckoutFromEnrollmentRows(enrollments, actor, "qr");
  },

  async startMercadoPagoCheckoutForRegistration(registrationId, actor = "player") {
    return startCheckoutForRegistration(registrationId, actor);
  },

  async startMercadoPagoQrForRegistration(registrationId, actor = "player") {
    return startCheckoutForRegistration(registrationId, actor, "qr");
  },

  async getPaymentReturnStatus({ registrationId, providerPaymentId, providerOrderId, orderId }) {
    return paymentService.getMercadoPagoPaymentStatus({ registrationId, providerPaymentId, providerOrderId, orderId });
  },

  async confirmPayLaterRegistrations(payload, actor = payload.playerId) {
    return createRegistration(payload, "later", actor);
  },

  async payPendingRegistration(registrationId, actor = "player") {
    const enrollments = await fetchRegistrations({ registrationId });
    return startCheckoutFromEnrollmentRows(enrollments, actor);
  },

  async payPendingRegistrationWithQr(registrationId, actor = "player") {
    const enrollments = await fetchRegistrations({ registrationId });
    return startCheckoutFromEnrollmentRows(enrollments, actor, "qr");
  },

  async markRegistrationAsPaid(registrationId, { method = "manual", actor = "admin-1" } = {}) {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("mark_registration_paid_manual", {
      p_registration_id: registrationId,
      p_actor: actor,
    });
    if (error) {
      logSupabaseDataError("registration mark paid rpc", error);
      throw createDataError("No pudimos marcar el pago como abonado.", { cause: error });
    }
    const rows = await fetchRegistrations({ registrationId: data || registrationId });
    await auditService.record({
      action: method === "manual" ? "mark_registration_paid_manual" : "pay_pending_registration_mock",
      entityType: "registration",
      entityId: registrationId,
      description: method === "manual" ? "Pago marcado manualmente por profesor." : "Inscripcion pendiente pagada con flujo temporal.",
      actor,
    });
    return rows;
  },

  async confirmEnrollment(id, actor = "admin-1") {
    return this.markRegistrationAsPaid(id, { method: "manual", actor });
  },

  async cancelEnrollment(id, actor = "admin-1", reason = "admin_cancelled") {
    const client = ensureSupabaseDataClient();
    const { data: row, error: lookupError } = await client.from("registration_categories").select("registration_id").eq("id", id).maybeSingle();
    if (lookupError) {
      logSupabaseDataError("registration category lookup for cancel", lookupError);
      throw createDataError("No pudimos cancelar inscripcion.", { cause: lookupError });
    }
    const registrationId = row?.registration_id || id;
    const { error } = await client
      .from("registrations")
      .update({ status: "cancelled", cancel_reason: reason, cancelled_at: new Date().toISOString() })
      .eq("id", registrationId);
    if (error) {
      logSupabaseDataError("registration cancel", error);
      throw createDataError("No pudimos cancelar inscripcion.", { cause: error });
    }
    await auditService.record({
      action: "cancel_enrollment",
      entityType: "enrollment",
      entityId: id,
      description: "Inscripcion cancelada o rechazada.",
      actor,
    });
    return (await fetchRegistrations({ registrationId }))[0] || null;
  },

  async expirePendingRegistrations(now = new Date(), actor = "system") {
    const client = ensureSupabaseDataClient();
    const { data, error } = await client.rpc("cancel_overdue_registrations", { p_now: normalizeDateInput(now).toISOString() });
    if (error) {
      logSupabaseDataError("registration expire rpc", error);
      throw createDataError("No pudimos procesar vencimientos de pago.", { cause: error });
    }
    if ((data || []).length) {
      await auditService.record({
        action: "expire_pending_registrations",
        entityType: "registration",
        entityId: (data || []).map((item) => item.registration_id).join(","),
        description: `${(data || []).length} inscripcion(es) canceladas por falta de pago.`,
        actor,
      });
    }
    return data || [];
  },
};
