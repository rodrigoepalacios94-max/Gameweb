import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export { corsHeaders, getCorsHeaders } from "./cors.ts";

export function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export function gameError(code: string, message: string, status = 500, details: Record<string, unknown> = {}) {
  const error = new Error(code);
  (error as any).code = code;
  (error as any).publicMessage = message;
  (error as any).status = status;
  Object.entries(details).forEach(([key, value]) => {
    (error as any)[key] = value;
  });
  return error;
}

export function safeEdgeLog(label: string, payload: Record<string, unknown> = {}) {
  console.log(label, payload);
}

function optionalEdgeLog(label: string | null, suffix: string, payload: Record<string, unknown> = {}) {
  if (!label) return;
  safeEdgeLog(`${label}:${suffix}`, payload);
}

export function createServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_SERVICE_CONFIG_MISSING");
  return createClient(supabaseUrl, serviceRoleKey);
}

export function createUserClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  if (!supabaseUrl || !anonKey) throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

export async function getAuthenticatedProfile(req: Request, serviceClient: any, options: { logContext?: string } = {}) {
  const userClient = createUserClient(req);
  const authHeader = req.headers.get("Authorization") || "";
  const logContext = options.logContext || null;
  optionalEdgeLog(logContext, "start", {
    authorizationHeaderExists: Boolean(authHeader),
    authorizationHeaderType: authHeader.toLowerCase().startsWith("bearer ") ? "Bearer" : authHeader ? "Other" : "Missing",
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    optionalEdgeLog(logContext, "auth_failed", {
      authorizationHeaderExists: Boolean(authHeader),
      message: authError?.message || null,
      status: authError?.status || null,
    });
    throw gameError("AUTH_REQUIRED", "Tu sesion vencio. Volve a iniciar sesion.", 401);
  }
  optionalEdgeLog(logContext, "auth_user", {
    authUserId: authData.user.id,
  });

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("auth_user_id, role, player_id, email")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    optionalEdgeLog(logContext, "profile_failed", {
      authUserId: authData.user.id,
      code: profileError?.code || null,
      message: profileError?.message || null,
      details: profileError?.details || null,
      hint: profileError?.hint || null,
      profileFound: Boolean(profile),
    });
    throw gameError("PROFILE_REQUIRED", "No encontramos tu perfil de GAME.", 403);
  }
  optionalEdgeLog(logContext, "profile", {
    authUserId: authData.user.id,
    profileRole: profile.role,
    profilePlayerId: profile.player_id || null,
  });
  return { authUser: authData.user, profile };
}

export async function fetchRegistration(serviceClient: any, registrationId: string) {
  const { data, error } = await serviceClient
    .from("registrations")
    .select(`
      id,
      player_id,
      tournament_id,
      status,
      payment_status,
      payment_due_at,
      unit_price,
      category_count,
      subtotal_amount,
      discount_percent,
      discount_amount,
      total_amount,
      amount_breakdown,
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
        unit_price
      )
    `)
    .eq("id", registrationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function assertRegistrationAccess(registration: any, profile: any) {
  if (!registration) {
    throw gameError("REGISTRATION_NOT_FOUND", "No encontramos la inscripcion a pagar.", 404);
  }
  if (profile.role === "admin") return;
  if (profile.role === "player" && profile.player_id === registration.player_id) return;
  throw gameError("REGISTRATION_FORBIDDEN", "No tenes permiso para pagar esta inscripcion.", 403);
}

export function assertRegistrationPaymentAccess(registration: any, profile: any) {
  if (!registration) {
    throw gameError("REGISTRATION_NOT_FOUND", "No encontramos la inscripcion a pagar.", 404);
  }
  const profilePlayerId = profile?.player_id || null;
  const registrationPlayerId = registration?.player_id || null;
  if ((profile.role === "player" || profile.role === "admin") && profilePlayerId && profilePlayerId === registrationPlayerId) return;
  throw gameError("REGISTRATION_FORBIDDEN", "No tenes permiso para pagar esta inscripcion.", 403, {
    profileRole: profile?.role || null,
    profilePlayerId,
    registrationPlayerId,
  });
}

export function mercadoPagoAccessToken() {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN_MISSING");
  return token;
}

export async function mercadoPagoFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("MERCADOPAGO_API_ERROR");
    (error as any).status = response.status;
    (error as any).data = data;
    throw error;
  }
  return data;
}

export function mapMercadoPagoStatus(status: string) {
  if (status === "approved") return "approved";
  if (["pending", "in_process", "authorized", "in_mediation"].includes(status)) return "pending";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  if (status === "charged_back") return "charged_back";
  return status || "unknown";
}

export function safeMercadoPagoMetadata(payment: any) {
  return {
    id: payment?.id ? String(payment.id) : null,
    live_mode: Boolean(payment?.live_mode),
    status: payment?.status || null,
    status_detail: payment?.status_detail || null,
    transaction_amount: Number(payment?.transaction_amount || 0),
    currency_id: payment?.currency_id || null,
    external_reference: payment?.external_reference || null,
    preference_id: payment?.preference_id || payment?.order?.id || null,
    payment_method_id: payment?.payment_method_id || null,
    payment_type_id: payment?.payment_type_id || null,
    date_approved: payment?.date_approved || null,
    date_last_updated: payment?.date_last_updated || null,
  };
}

export function amountToCents(value: unknown) {
  return Math.round(Number(value || 0) * 100);
}

export async function timingSafeEqualHex(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

export async function validateMercadoPagoSignature(req: Request, dataId: string | null) {
  const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  if (!secret) throw new Error("MERCADOPAGO_WEBHOOK_SECRET_MISSING");

  const xSignature = req.headers.get("x-signature") || "";
  const xRequestId = req.headers.get("x-request-id") || "";
  const signatureParts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [String(key || "").trim(), String(value || "").trim()];
    }),
  );
  const ts = signatureParts.ts;
  const v1 = signatureParts.v1;
  if (!ts || !v1) return false;

  let manifest = "";
  if (dataId) manifest += `id:${dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const calculated = Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualHex(calculated, v1);
}

export async function findMercadoPagoPaymentRow(serviceClient: any, payment: any, registrationId: string) {
  const providerPaymentId = payment?.id ? String(payment.id) : null;
  if (providerPaymentId) {
    const { data, error } = await serviceClient
      .from("payments")
      .select("*")
      .eq("provider", "mercadopago")
      .eq("provider_payment_id", providerPaymentId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const preferenceId = payment?.preference_id ? String(payment.preference_id) : null;
  if (preferenceId) {
    const { data, error } = await serviceClient
      .from("payments")
      .select("*")
      .eq("provider", "mercadopago")
      .eq("registration_id", registrationId)
      .eq("provider_preference_id", preferenceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await serviceClient
    .from("payments")
    .select("*")
    .eq("provider", "mercadopago")
    .eq("registration_id", registrationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function syncMercadoPagoPayment(serviceClient: any, payment: any) {
  const externalReference = String(payment?.external_reference || "");
  const providerPaymentId = payment?.id ? String(payment.id) : null;
  const providerPreferenceId = payment?.preference_id ? String(payment.preference_id) : null;
  if (!externalReference) throw new Error("PAYMENT_EXTERNAL_REFERENCE_MISSING");

  const registration = await fetchRegistration(serviceClient, externalReference);
  if (!registration) throw new Error("REGISTRATION_NOT_FOUND_FOR_PAYMENT");

  const existingPayment = await findMercadoPagoPaymentRow(serviceClient, payment, registration.id);
  const mappedStatus = mapMercadoPagoStatus(payment?.status || "");
  const metadata = safeMercadoPagoMetadata(payment);
  const reviewReasons = [];
  const isApproved = mappedStatus === "approved";
  const amountMatches = amountToCents(payment?.transaction_amount) === amountToCents(registration.total_amount);
  const currencyMatches = String(payment?.currency_id || "").toUpperCase() === "ARS";
  const samePaymentAlreadyApplied = existingPayment?.provider_payment_id === providerPaymentId && existingPayment?.status === "approved";

  if (isApproved && !amountMatches) reviewReasons.push("AMOUNT_MISMATCH");
  if (isApproved && !currencyMatches) reviewReasons.push("CURRENCY_MISMATCH");
  if (isApproved && registration.status === "cancelled") reviewReasons.push("REGISTRATION_CANCELLED");
  if (isApproved && ["paid", "waived"].includes(registration.payment_status) && !samePaymentAlreadyApplied) {
    reviewReasons.push("REGISTRATION_ALREADY_SETTLED");
  }
  if (["refunded", "charged_back"].includes(mappedStatus) && registration.payment_status === "paid") {
    reviewReasons.push(mappedStatus === "refunded" ? "PAYMENT_REFUNDED" : "PAYMENT_CHARGED_BACK");
  }

  const reviewRequired = reviewReasons.length > 0;
  const paymentPayload = {
    registration_id: registration.id,
    player_id: registration.player_id,
    tournament_id: registration.tournament_id,
    provider: "mercadopago",
    provider_payment_id: providerPaymentId,
    provider_preference_id: providerPreferenceId || existingPayment?.provider_preference_id || null,
    external_reference: externalReference,
    amount: Number(payment?.transaction_amount || registration.total_amount || 0),
    status: mappedStatus,
    raw_status: payment?.status || null,
    status_detail: payment?.status_detail || null,
    payment_method: payment?.payment_type_id || payment?.payment_method_id || null,
    amount_breakdown: registration.amount_breakdown || {},
    approved_at: payment?.date_approved || (isApproved ? new Date().toISOString() : null),
    last_provider_update_at: payment?.date_last_updated || new Date().toISOString(),
    review_required: reviewRequired,
    review_reason: reviewReasons.join(",") || null,
    provider_metadata: metadata,
    updated_at: new Date().toISOString(),
  };

  let paymentRow = existingPayment;
  if (paymentRow?.id) {
    const { data, error } = await serviceClient
      .from("payments")
      .update(paymentPayload)
      .eq("id", paymentRow.id)
      .select("*")
      .single();
    if (error) throw error;
    paymentRow = data;
  } else {
    const { data, error } = await serviceClient
      .from("payments")
      .insert(paymentPayload)
      .select("*")
      .single();
    if (error) throw error;
    paymentRow = data;
  }

  if (isApproved && !reviewRequired && registration.payment_status === "pending" && registration.status !== "cancelled") {
    const { error } = await serviceClient
      .from("registrations")
      .update({ payment_status: "paid", updated_at: new Date().toISOString() })
      .eq("id", registration.id);
    if (error) throw error;
  }

  return {
    registrationId: registration.id,
    paymentId: paymentRow.id,
    providerPaymentId,
    status: mappedStatus,
    reviewRequired,
    reviewReasons,
  };
}
