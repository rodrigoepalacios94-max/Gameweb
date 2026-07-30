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
} from "../_shared/mercadopago.ts";

function appUrlFromRequest(req: Request) {
  const configured = Deno.env.get("GAME_APP_URL");
  if (configured) return configured.replace(/\/+$/, "");
  const origin = req.headers.get("Origin") || "http://localhost:5173";
  return origin.replace(/\/+$/, "");
}

function notificationUrl() {
  const configured = Deno.env.get("MERCADOPAGO_NOTIFICATION_URL");
  if (configured) return configured;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL_MISSING");
  const functionsBase = supabaseUrl.replace(".supabase.co", ".functions.supabase.co");
  return `${functionsBase}/mercadopago-webhook?source_news=webhooks`;
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
    registrationIdForLog = registrationId;
    safeEdgeLog("[GAME Mercado Pago] create preference request", {
      authUserId: authUser.id,
      profileRole: profile.role,
      profilePlayerId: profile.player_id || null,
      registrationId,
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
      .select("id, provider_preference_id, provider_init_point, provider_sandbox_init_point, created_at")
      .eq("registration_id", registration.id)
      .eq("provider", "mercadopago")
      .eq("status", "pending")
      .eq("review_required", false)
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentError) throw recentError;
    const recentCheckoutUrl = recentPayment?.provider_init_point || recentPayment?.provider_sandbox_init_point;
    if (recentPayment?.provider_preference_id && recentCheckoutUrl) {
      return json({
        status: "ready",
        registrationId: registration.id,
        preferenceId: recentPayment.provider_preference_id,
        checkoutUrl: recentCheckoutUrl,
        reused: true,
      }, 200, headers);
    }

    let paymentAttempt = recentPayment;
    if (!paymentAttempt?.id) {
      const { data, error } = await serviceClient
        .from("payments")
        .insert({
          registration_id: registration.id,
          player_id: registration.player_id,
          tournament_id: registration.tournament_id,
          provider: "mercadopago",
          external_reference: registration.id,
          amount: Number(registration.total_amount || 0),
          status: "pending",
          amount_breakdown: registration.amount_breakdown || {},
        })
        .select("id")
        .single();
      if (error) throw error;
      paymentAttempt = data;
    }

    const appUrl = appUrlFromRequest(req);
    const returnUrl = `${appUrl}/payment/return?registration_id=${encodeURIComponent(registration.id)}`;
    const player = registration.players || {};
    const tournament = registration.tournaments || {};
    const categories = (registration.registration_categories || []).map((category: any) => category.category_name).filter(Boolean);

    const preference = await mercadoPagoFetch("/checkout/preferences", {
      method: "POST",
      headers: {
        "X-Idempotency-Key": String(paymentAttempt.id),
      },
      body: JSON.stringify({
        items: [{
          id: registration.id,
          title: `Inscripcion - ${tournament.name || "Torneo GAME"}`,
          description: categories.length ? categories.join(", ") : undefined,
          quantity: 1,
          currency_id: "ARS",
          unit_price: Number(registration.total_amount || 0),
        }],
        payer: {
          email: player.email || undefined,
          name: player.first_name || undefined,
          surname: player.last_name || undefined,
        },
        external_reference: registration.id,
        notification_url: notificationUrl(),
        back_urls: {
          success: returnUrl,
          failure: returnUrl,
          pending: returnUrl,
        },
        auto_return: "approved",
        metadata: {
          game_payment_id: paymentAttempt.id,
          registration_id: registration.id,
          tournament_id: registration.tournament_id,
          player_id: registration.player_id,
        },
      }),
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
      mpStatus: (error as any)?.data?.status || null,
      mpMessage: (error as any)?.data?.message || null,
      mpError: (error as any)?.data?.error || null,
      externalReference: registrationIdForLog || null,
    });
    return json({
      code,
      message,
    }, status, headers);
  }
});
