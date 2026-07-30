import {
  assertRegistrationAccess,
  corsHeaders,
  createServiceClient,
  fetchRegistration,
  getAuthenticatedProfile,
  json,
  mercadoPagoFetch,
  syncMercadoPagoPayment,
} from "../_shared/mercadopago.ts";

function statusPayload(registration: any, payment: any) {
  if (payment?.review_required) {
    return {
      status: "review",
      message: "El pago requiere revision administrativa.",
    };
  }
  if (registration.payment_status === "paid") {
    return {
      status: "approved",
      message: "Pago aprobado. Tu inscripcion esta confirmada.",
    };
  }
  if (registration.payment_status === "waived") {
    return {
      status: "waived",
      message: "Tu inscripcion quedo liberada de pago.",
    };
  }
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment?.status)) {
    return {
      status: payment.status,
      message: "El pago no quedo aprobado.",
    };
  }
  return {
    status: "pending",
    message: "Mercado Pago todavia esta procesando el pago.",
  };
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, headers);

  try {
    const serviceClient = createServiceClient();
    const { profile } = await getAuthenticatedProfile(req, serviceClient);
    const body = await req.json().catch(() => ({}));
    const registrationId = String(body.registrationId || "").trim();
    const providerPaymentId = String(body.providerPaymentId || "").trim();
    if (!registrationId) return json({ error: "REGISTRATION_REQUIRED" }, 400, headers);

    let registration = await fetchRegistration(serviceClient, registrationId);
    assertRegistrationAccess(registration, profile);

    if (providerPaymentId) {
      const mercadoPagoPayment = await mercadoPagoFetch(`/v1/payments/${encodeURIComponent(providerPaymentId)}`);
      const externalReference = String(mercadoPagoPayment?.external_reference || "");
      if (externalReference && externalReference !== registrationId) {
        return json({ error: "PAYMENT_REGISTRATION_MISMATCH" }, 409, headers);
      }
      await syncMercadoPagoPayment(serviceClient, mercadoPagoPayment);
      registration = await fetchRegistration(serviceClient, registrationId);
      assertRegistrationAccess(registration, profile);
    }

    const { data: payments, error: paymentsError } = await serviceClient
      .from("payments")
      .select("id, provider, provider_payment_id, provider_preference_id, amount, status, review_required, review_reason, updated_at, created_at")
      .eq("registration_id", registrationId)
      .order("created_at", { ascending: false });
    if (paymentsError) throw paymentsError;

    const latestPayment = (payments || []).find((payment: any) => payment.provider === "mercadopago") || (payments || [])[0] || null;
    const payload = statusPayload(registration, latestPayment);

    return json({
      ...payload,
      registration: {
        id: registration.id,
        status: registration.status,
        paymentStatus: registration.payment_status,
        totalAmount: Number(registration.total_amount || 0),
        tournamentName: registration.tournaments?.name || "",
        categories: (registration.registration_categories || []).map((category: any) => category.category_name).filter(Boolean),
      },
      payment: latestPayment,
    }, 200, headers);
  } catch (error) {
    console.error("[GAME Mercado Pago] payment status failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
      status: (error as any)?.status || null,
      mpStatus: (error as any)?.data?.status || null,
      mpMessage: (error as any)?.data?.message || null,
    });
    return json({
      error: error instanceof Error ? error.message : "PAYMENT_STATUS_FAILED",
      message: "No pudimos verificar el estado del pago.",
    }, (error as any)?.status || 500, headers);
  }
});
