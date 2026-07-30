import {
  corsHeaders,
  createServiceClient,
  json,
  mercadoPagoFetch,
  syncMercadoPagoPayment,
  validateMercadoPagoSignature,
} from "../_shared/mercadopago.ts";

function paymentIdFromRequest(req: Request, body: any) {
  const url = new URL(req.url);
  return String(
    url.searchParams.get("data.id") ||
      url.searchParams.get("data_id") ||
      url.searchParams.get("id") ||
      body?.data?.id ||
      body?.id ||
      "",
  ).trim();
}

function isPaymentNotification(req: Request, body: any) {
  const url = new URL(req.url);
  const type = String(body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "").toLowerCase();
  return type === "payment";
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, headers);

  try {
    const body = await req.json().catch(() => ({}));
    const providerPaymentId = paymentIdFromRequest(req, body);
    const validSignature = await validateMercadoPagoSignature(req, providerPaymentId || null);
    if (!validSignature) return json({ error: "INVALID_SIGNATURE" }, 401, headers);

    if (!isPaymentNotification(req, body)) {
      return json({ ok: true, ignored: true }, 200, headers);
    }
    if (!providerPaymentId) return json({ error: "PAYMENT_ID_REQUIRED" }, 400, headers);

    const serviceClient = createServiceClient();
    const mercadoPagoPayment = await mercadoPagoFetch(`/v1/payments/${encodeURIComponent(providerPaymentId)}`);
    const result = await syncMercadoPagoPayment(serviceClient, mercadoPagoPayment);

    return json({ ok: true, ...result }, 200, headers);
  } catch (error) {
    console.error("[GAME Mercado Pago] webhook failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
      status: (error as any)?.status || null,
      mpStatus: (error as any)?.data?.status || null,
      mpMessage: (error as any)?.data?.message || null,
    });
    return json({ error: error instanceof Error ? error.message : "WEBHOOK_FAILED" }, (error as any)?.status || 500, headers);
  }
});
