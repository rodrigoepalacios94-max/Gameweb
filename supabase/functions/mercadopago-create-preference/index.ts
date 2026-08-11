import {
  assertRegistrationPaymentAccess,
  corsHeaders,
  createServiceClient,
  fetchRegistration,
  gameError,
  getAuthenticatedProfile,
  json,
  mercadoPagoFetch,
  safeEdgeLog,
  sanitizeMercadoPagoPayload,
} from "../_shared/mercadopago.ts";

const MERCADOPAGO_QR_ORDERS_ENDPOINT = "/v1/orders";
const PRODUCTION_APP_ORIGIN = "https://gametorneos.com";
const DEFAULT_ALLOWED_APP_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  PRODUCTION_APP_ORIGIN,
];

function appUrlFromRequest(req: Request) {
  const origin = normalizeOrigin(req.headers.get("Origin"));
  if (origin && isLocalOrigin(origin)) return origin;

  const configured = normalizeOrigin(Deno.env.get("GAME_APP_URL"));
  if (configured && isAllowedAppOrigin(configured) && !isNetlifyOrigin(configured)) return configured;

  if (origin && isAllowedAppOrigin(origin) && !isNetlifyOrigin(origin)) return origin;

  return PRODUCTION_APP_ORIGIN;
}

function isLocalOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isNetlifyOrigin(origin: string) {
  try {
    return new URL(origin).hostname === "gametorneos.netlify.app";
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string | undefined | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function allowedAppOrigins() {
  const configured = String(Deno.env.get("GAME_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_APP_ORIGINS, ...configured])];
}

function isAllowedAppOrigin(origin: string) {
  return allowedAppOrigins().includes(normalizeOrigin(origin));
}

function paymentReturnUrl(appUrl: string, status: "success" | "pending" | "failure", registrationId: string) {
  const url = new URL("/payment/return", appUrl);
  url.searchParams.set("status", status);
  url.searchParams.set("registration_id", registrationId);
  return url.toString();
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return Boolean(url.origin) && (url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return false;
  }
}

function checkoutBackUrls(registrationId: string) {
  const backUrls = {
    success: paymentReturnUrl(PRODUCTION_APP_ORIGIN, "success", registrationId),
    pending: paymentReturnUrl(PRODUCTION_APP_ORIGIN, "pending", registrationId),
    failure: paymentReturnUrl(PRODUCTION_APP_ORIGIN, "failure", registrationId),
  };

  const invalidKeys = Object.entries(backUrls)
    .filter(([, value]) => !value || !isValidHttpUrl(value))
    .map(([key]) => key);

  if (invalidKeys.length) {
    throw gameError("MERCADOPAGO_BACK_URLS_INVALID", "No pudimos preparar las URLs de retorno del pago.", 500, {
      appBaseUrl: PRODUCTION_APP_ORIGIN,
      invalidBackUrlKeys: invalidKeys,
    });
  }

  return backUrls;
}

function notificationUrl() {
  const configured = Deno.env.get("MERCADOPAGO_NOTIFICATION_URL");
  if (configured) return configured;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL_MISSING");
  const functionsBase = supabaseUrl.replace(".supabase.co", ".functions.supabase.co");
  return `${functionsBase}/mercadopago-webhook?source_news=webhooks`;
}

function qrExternalPosId() {
  const configured = String(
    Deno.env.get("MERCADOPAGO_QR_EXTERNAL_POS_ID") ||
      Deno.env.get("MERCADOPAGO_EXTERNAL_POS_ID") ||
      "",
  ).trim();
  if (!configured) {
    throw gameError("MERCADOPAGO_QR_POS_REQUIRED", "Falta configurar la caja QR de Mercado Pago.", 500);
  }
  return configured;
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function mercadoPagoAmount(value: number) {
  return roundMoney(value).toFixed(2);
}

function checkoutAmount(registration: any) {
  return roundMoney(Number(registration?.total_amount || 0));
}

function qrAmount(registration: any) {
  return roundMoney(checkoutAmount(registration) * 0.95);
}

function qrExpiration() {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

function mapQrOrderError(error: any) {
  const status = Number(error?.status || 502);
  const payload = error?.data || {};
  const raw = `${payload.message || ""} ${payload.error || ""} ${payload.cause ? JSON.stringify(payload.cause) : ""}`.toLowerCase();
  const details = {
    mercadoPago: sanitizeMercadoPagoPayload(payload),
    mercadoPagoStatus: status,
    mercadoPagoEndpoint: error?.path || MERCADOPAGO_QR_ORDERS_ENDPOINT,
    mercadoPagoMethod: error?.method || "POST",
  };

  if (raw.includes("external_pos_id") || raw.includes("pos") || raw.includes("point of sale")) {
    return gameError(
      "MERCADOPAGO_QR_POS_INVALID",
      "La caja QR de Mercado Pago no existe o no pertenece a la cuenta configurada.",
      status,
      details,
    );
  }

  if (raw.includes("qr") || raw.includes("not enabled") || raw.includes("disabled") || raw.includes("forbidden")) {
    return gameError(
      "MERCADOPAGO_QR_NOT_ENABLED",
      "La cuenta de Mercado Pago no tiene QR dinamico habilitado para esta operacion.",
      status,
      details,
    );
  }

  return gameError(
    "MERCADOPAGO_QR_ORDER_FAILED",
    "No pudimos crear la orden QR de Mercado Pago. Revisa la configuracion de QR.",
    status,
    details,
  );
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED", message: "Metodo no permitido." }, 405, headers);
  }

  let registrationIdForLog = "";

  try {
    const serviceClient = createServiceClient();
    const { authUser, profile } = await getAuthenticatedProfile(req, serviceClient, {
      logContext: "[GAME Mercado Pago] create preference auth",
    });
    const body = await req.json().catch(() => ({}));
    const registrationId = String(body.registrationId || "").trim();
    const paymentMethod = String(body.paymentMethod || "checkout").trim().toLowerCase() === "qr" ? "qr" : "checkout";
    registrationIdForLog = registrationId;
    safeEdgeLog("[GAME Mercado Pago] create preference request", {
      authUserId: authUser.id,
      profileRole: profile.role,
      profilePlayerId: profile.player_id || null,
      registrationId,
      paymentMethod,
    });
    if (!registrationId) {
      return json({ code: "REGISTRATION_REQUIRED", message: "No pudimos identificar la inscripcion a pagar." }, 400, headers);
    }

    const registration = await fetchRegistration(serviceClient, registrationId);
    safeEdgeLog("[GAME Mercado Pago] create preference registration", {
      registrationId,
      registrationPlayerId: registration?.player_id || null,
      tournamentId: registration?.tournament_id || null,
      totalAmount: Number(registration?.total_amount || 0),
      paymentStatus: registration?.payment_status || null,
      status: registration?.status || null,
    });
    assertRegistrationPaymentAccess(registration, profile);

    if (registration.status === "cancelled") {
      return json({ code: "REGISTRATION_CANCELLED", message: "Esta inscripcion esta cancelada." }, 409, headers);
    }

    if (registration.payment_status === "paid") {
      return json({ code: "REGISTRATION_ALREADY_PAID", message: "Esta inscripcion ya esta pagada." }, 409, headers);
    }

    if (registration.payment_status === "waived" || Number(registration.total_amount || 0) <= 0) {
      await serviceClient
        .from("registrations")
        .update({ payment_status: "waived", updated_at: new Date().toISOString() })
        .eq("id", registration.id);
      const { data: waiverPayment, error: waiverLookupError } = await serviceClient
        .from("payments")
        .select("id")
        .eq("registration_id", registration.id)
        .eq("provider", "waiver")
        .limit(1)
        .maybeSingle();
      if (waiverLookupError) throw waiverLookupError;
      if (!waiverPayment) {
        const { error: waiverInsertError } = await serviceClient
          .from("payments")
          .insert({
            registration_id: registration.id,
            player_id: registration.player_id,
            tournament_id: registration.tournament_id,
            provider: "waiver",
            external_reference: registration.id,
            amount: 0,
            status: "approved",
            payment_method: "waiver",
            amount_breakdown: registration.amount_breakdown || {},
            approved_at: new Date().toISOString(),
          });
        if (waiverInsertError) throw waiverInsertError;
      }
      return json({ status: "waived", registrationId: registration.id }, 200, headers);
    }

    const recentSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentPayment, error: recentError } = await serviceClient
      .from("payments")
      .select("id, provider_preference_id, provider_init_point, provider_sandbox_init_point, provider_metadata, amount, created_at")
      .eq("registration_id", registration.id)
      .eq("provider", "mercadopago")
      .eq("payment_method", paymentMethod === "qr" ? "mercadopago_qr" : "checkout")
      .eq("status", "pending")
      .eq("review_required", false)
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentError) throw recentError;
    const recentCheckoutUrl = recentPayment?.provider_init_point || recentPayment?.provider_sandbox_init_point;
    if (paymentMethod === "checkout" && recentPayment?.provider_preference_id && recentCheckoutUrl) {
      return json({
        status: "ready",
        paymentMethod,
        registrationId: registration.id,
        preferenceId: recentPayment.provider_preference_id,
        checkoutUrl: recentCheckoutUrl,
        reused: true,
      }, 200, headers);
    }
    if (paymentMethod === "qr" && recentPayment?.provider_metadata?.qr_data) {
      return json({
        status: "ready",
        paymentMethod,
        registrationId: registration.id,
        orderId: recentPayment.provider_preference_id,
        qrData: recentPayment.provider_metadata.qr_data,
        qrAmount: Number(recentPayment.amount || 0),
        checkoutAmount: checkoutAmount(registration),
        qrDiscountPercent: 5,
        expiresAt: recentPayment.provider_metadata.expires_at || null,
        reused: true,
      }, 200, headers);
    }

    let paymentAttempt = recentPayment;
    if (paymentMethod === "qr" && recentPayment && !recentPayment.provider_metadata?.qr_data && !recentPayment.provider_preference_id) {
      paymentAttempt = null;
    }
    if (!paymentAttempt?.id) {
      const { data, error } = await serviceClient
        .from("payments")
        .insert({
          registration_id: registration.id,
          player_id: registration.player_id,
          tournament_id: registration.tournament_id,
          provider: "mercadopago",
          external_reference: registration.id,
          amount: paymentMethod === "qr" ? qrAmount(registration) : checkoutAmount(registration),
          status: "pending",
          payment_method: paymentMethod === "qr" ? "mercadopago_qr" : "checkout",
          amount_breakdown: registration.amount_breakdown || {},
          provider_metadata: paymentMethod === "qr"
            ? {
                checkout_amount: checkoutAmount(registration),
                qr_discount_percent: 5,
                qr_amount: qrAmount(registration),
              }
            : {},
        })
        .select("id")
        .single();
      if (error) throw error;
      paymentAttempt = data;
    }

    const player = registration.players || {};
    const tournament = registration.tournaments || {};
    const categories = (registration.registration_categories || []).map((category: any) => category.category_name).filter(Boolean);

    if (paymentMethod === "qr") {
      const expiresAt = qrExpiration();
      const externalPosId = qrExternalPosId();
      const paymentAmount = mercadoPagoAmount(qrAmount(registration));
      const description = `Inscripcion - ${tournament.name || "Torneo GAME"}`.slice(0, 150);
      const qrOrderBody = {
        type: "qr",
        external_reference: registration.id,
        total_amount: paymentAmount,
        description,
        expiration_time: "PT30M",
        config: {
          qr: {
            mode: "dynamic",
            external_pos_id: externalPosId,
          },
        },
        transactions: {
          payments: [{
            amount: paymentAmount,
          }],
        },
        items: [{
          title: description,
          quantity: 1,
          unit_measure: "unit",
          unit_price: paymentAmount,
        }],
      };
      safeEdgeLog("[GAME Mercado Pago] qr order request", {
        endpoint: `https://api.mercadopago.com${MERCADOPAGO_QR_ORDERS_ENDPOINT}`,
        externalPosId,
        registrationId: registration.id,
        paymentAttemptId: paymentAttempt.id,
        totalAmount: paymentAmount,
        mode: qrOrderBody.config.qr.mode,
        payload: sanitizeMercadoPagoPayload(qrOrderBody),
      });
      let order;
      try {
        order = await mercadoPagoFetch(MERCADOPAGO_QR_ORDERS_ENDPOINT, {
          method: "POST",
          headers: {
            "X-Idempotency-Key": String(paymentAttempt.id),
          },
          body: JSON.stringify(qrOrderBody),
        });
      } catch (error) {
        throw mapQrOrderError(error);
      }

      const qrData = order.type_response?.qr_data || order.qr_data || order.qrData || order.point_of_interaction?.transaction_data?.qr_code || order.payment?.qr_data || "";
      if (!qrData) {
        throw gameError("MERCADOPAGO_QR_DATA_MISSING", "No pudimos generar el QR de Mercado Pago. Intenta nuevamente.", 502, {
          data: order,
        });
      }

      const { error: updateQrError } = await serviceClient
        .from("payments")
        .update({
          provider_preference_id: order.id || null,
          provider_metadata: {
            ...(paymentAttempt.provider_metadata || {}),
            order_id: order.id || null,
            qr_data: qrData,
            qr_response_field: order.type_response?.qr_data ? "type_response.qr_data" : "fallback",
            external_pos_id: externalPosId,
            checkout_amount: checkoutAmount(registration),
            qr_discount_percent: 5,
            qr_amount: qrAmount(registration),
            expires_at: expiresAt,
            created_from: "mercadopago-create-preference",
          },
          qr_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentAttempt.id);
      if (updateQrError) throw updateQrError;

      return json({
        status: "ready",
        paymentMethod,
        registrationId: registration.id,
        orderId: order.id,
        qrData,
        qrAmount: qrAmount(registration),
        checkoutAmount: checkoutAmount(registration),
        qrDiscountPercent: 5,
        expiresAt,
        reused: false,
      }, 200, headers);
    }

    const backUrls = checkoutBackUrls(registration.id);
    const preferenceBody = {
      items: [{
        id: registration.id,
        title: `Inscripcion - ${tournament.name || "Torneo GAME"}`,
        description: categories.length ? categories.join(", ") : undefined,
        quantity: 1,
        currency_id: "ARS",
        unit_price: checkoutAmount(registration),
      }],
      payer: {
        email: player.email || undefined,
        name: player.first_name || undefined,
        surname: player.last_name || undefined,
      },
      external_reference: registration.id,
      notification_url: notificationUrl(),
      back_urls: {
        success: backUrls.success,
        pending: backUrls.pending,
        failure: backUrls.failure,
      },
      auto_return: "approved",
      metadata: {
        game_payment_id: paymentAttempt.id,
        registration_id: registration.id,
        tournament_id: registration.tournament_id,
        player_id: registration.player_id,
      },
    };
    const invalidFinalBackUrlKeys = Object.entries(preferenceBody.back_urls)
      .filter(([, value]) => typeof value !== "string" || !value.trim() || !isValidHttpUrl(value))
      .map(([key]) => key);
    if (invalidFinalBackUrlKeys.length) {
      throw gameError("MERCADOPAGO_BACK_URLS_INVALID", "No pudimos preparar las URLs de retorno del pago.", 500, {
        invalidBackUrlKeys: invalidFinalBackUrlKeys,
      });
    }
    safeEdgeLog("[GAME Mercado Pago] checkout return urls", {
      appBaseUrl: PRODUCTION_APP_ORIGIN,
      successUrl: backUrls.success,
      pendingUrl: backUrls.pending,
      failureUrl: backUrls.failure,
    });
    const preference = await mercadoPagoFetch("/checkout/preferences", {
      method: "POST",
      headers: {
        "X-Idempotency-Key": String(paymentAttempt.id),
      },
      body: JSON.stringify(preferenceBody),
    });

    const checkoutUrl = preference.init_point || preference.sandbox_init_point;
    if (!checkoutUrl) {
      throw gameError("MERCADOPAGO_CHECKOUT_URL_MISSING", "No pudimos iniciar el pago. Intenta nuevamente.", 502);
    }

    const { error: updateError } = await serviceClient
      .from("payments")
      .update({
        provider_preference_id: preference.id || null,
        provider_init_point: preference.init_point || null,
        provider_sandbox_init_point: preference.sandbox_init_point || null,
        provider_metadata: {
          preference_id: preference.id || null,
          created_from: "mercadopago-create-preference",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentAttempt.id);
    if (updateError) throw updateError;

    return json({
      status: "ready",
      paymentMethod,
      registrationId: registration.id,
      preferenceId: preference.id,
      checkoutUrl,
      reused: false,
    }, 200, headers);
  } catch (error) {
    const status = (error as any)?.status || 500;
    const code = (error as any)?.code || (error instanceof Error ? error.message : "CREATE_PREFERENCE_FAILED");
    const message = (error as any)?.publicMessage || "No pudimos iniciar el pago. Intenta nuevamente.";
    console.error("[GAME Mercado Pago] create preference failed", {
      code,
      status,
      registrationId: registrationIdForLog || null,
      registrationPlayerId: (error as any)?.registrationPlayerId || null,
      profileRole: (error as any)?.profileRole || null,
      profilePlayerId: (error as any)?.profilePlayerId || null,
      mpHttpStatus: (error as any)?.mercadoPagoStatus || (error as any)?.status || null,
      mpEndpoint: (error as any)?.mercadoPagoEndpoint || null,
      mpMethod: (error as any)?.mercadoPagoMethod || null,
      mpBody: sanitizeMercadoPagoPayload((error as any)?.mercadoPago || (error as any)?.data || null),
      mpStatus: (error as any)?.mercadoPago?.status || (error as any)?.data?.status || null,
      mpMessage: (error as any)?.mercadoPago?.message || (error as any)?.data?.message || null,
      mpError: (error as any)?.mercadoPago?.error || (error as any)?.data?.error || null,
      mpCause: sanitizeMercadoPagoPayload((error as any)?.mercadoPago?.cause || (error as any)?.data?.cause || null),
      externalReference: registrationIdForLog || null,
    });
    return json({
      code,
      message,
    }, status, headers);
  }
});
