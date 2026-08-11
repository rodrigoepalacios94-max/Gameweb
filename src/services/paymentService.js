import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";

const paymentMessages = {
  AUTH_REQUIRED: "Tu sesion vencio. Volve a iniciar sesion.",
  PROFILE_REQUIRED: "No encontramos tu perfil de GAME.",
  REGISTRATION_REQUIRED: "No pudimos identificar la inscripcion a pagar.",
  REGISTRATION_NOT_FOUND: "No encontramos la inscripcion a pagar.",
  REGISTRATION_FORBIDDEN: "No tenes permiso para pagar esta inscripcion.",
  REGISTRATION_CANCELLED: "Esta inscripcion esta cancelada.",
  REGISTRATION_ALREADY_PAID: "Esta inscripcion ya esta pagada.",
  MERCADOPAGO_ACCESS_TOKEN_MISSING: "No pudimos iniciar el pago. Intenta nuevamente.",
  MERCADOPAGO_API_ERROR: "No pudimos iniciar el pago. Intenta nuevamente.",
  MERCADOPAGO_CHECKOUT_URL_MISSING: "No pudimos iniciar el pago. Intenta nuevamente.",
  MERCADOPAGO_QR_DATA_MISSING: "No pudimos generar el QR de Mercado Pago. Intenta nuevamente.",
};

async function readFunctionErrorBody(error) {
  if (!error?.context?.clone) return null;
  const response = error.context.clone();
  return response.json().catch(() => null);
}

function getPaymentErrorMessage(body, fallbackMessage, status = null) {
  const code = body?.code || body?.error || "";
  if (status === 401 && !paymentMessages[code]) return paymentMessages.AUTH_REQUIRED;
  if (status === 403 && !paymentMessages[code]) return paymentMessages.REGISTRATION_FORBIDDEN;
  return body?.message || paymentMessages[code] || fallbackMessage;
}

async function getAuthHeaders(client) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    logSupabaseDataError("mercadopago session lookup", error);
    throw createDataError("Tu sesion vencio. Volve a iniciar sesion.", {
      code: "AUTH_REQUIRED",
      cause: error,
    });
  }
  const token = data.session?.access_token;
  if (!token) {
    throw createDataError("Tu sesion vencio. Volve a iniciar sesion.", {
      code: "AUTH_REQUIRED",
    });
  }
  return { Authorization: `Bearer ${token}` };
}

async function unwrapFunctionError(context, error, data, fallbackMessage) {
  const errorBody = data?.code || data?.error ? data : await readFunctionErrorBody(error);
  if (!error && !errorBody) return;
  const cause = error || errorBody || data;
  const status = error?.context?.status || error?.status || null;
  logSupabaseDataError(context, {
    ...cause,
    code: errorBody?.code || errorBody?.error || error?.name || error?.code || "PAYMENT_ERROR",
    message: errorBody?.message || error?.message || fallbackMessage,
    status,
  });
  throw createDataError(getPaymentErrorMessage(errorBody, fallbackMessage, status), {
    code: errorBody?.code || errorBody?.error || error?.name || "PAYMENT_ERROR",
    cause,
  });
}

export const paymentService = {
  async createMercadoPagoPreference(registrationId, paymentMethod = "checkout") {
    const client = ensureSupabaseDataClient();
    const headers = await getAuthHeaders(client);
    const { data, error } = await client.functions.invoke("mercadopago-create-preference", {
      headers,
      body: { registrationId, paymentMethod },
    });
    await unwrapFunctionError(
      "mercadopago create preference",
      error,
      data,
      "No pudimos iniciar el checkout de Mercado Pago.",
    );
    return data;
  },

  async getMercadoPagoPaymentStatus({ registrationId, providerPaymentId, providerOrderId, orderId }) {
    const client = ensureSupabaseDataClient();
    const headers = await getAuthHeaders(client);
    const { data, error } = await client.functions.invoke("mercadopago-payment-status", {
      headers,
      body: { registrationId, providerPaymentId, providerOrderId: providerOrderId || orderId },
    });
    await unwrapFunctionError(
      "mercadopago payment status",
      error,
      data,
      "No pudimos verificar el estado del pago.",
    );
    return data;
  },
};
