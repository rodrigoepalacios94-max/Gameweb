import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const MAX_ATTEMPTS = 3;

type Delivery = {
  id: string;
  event_type: string;
  recipient_email: string;
  player_id: string | null;
  tournament_id: string | null;
  match_id: string | null;
  registration_id: string | null;
  dedupe_key: string;
  template_payload: Record<string, unknown>;
  attempts: number;
};

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, cors);

  try {
    const supabaseUrl = mustEnv("SUPABASE_URL");
    const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = mustEnv("RESEND_API_KEY");
    const from = mustEnv("GAME_EMAIL_FROM");
    const appUrl = mustEnv("GAME_APP_URL").replace(/\/+$/, "");
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    await assertCanProcess(req, serviceClient);

    const body = await req.json().catch(() => ({}));
    if (body.enqueueScheduled !== false) {
      const { error: enqueueError } = await serviceClient.rpc("game_enqueue_scheduled_emails");
      if (enqueueError) throw enqueueError;
    }

    const { data: deliveries, error: deliveriesError } = await serviceClient
      .from("email_deliveries")
      .select("id, event_type, recipient_email, player_id, tournament_id, match_id, registration_id, dedupe_key, template_payload, attempts")
      .in("status", ["queued", "failed"])
      .lt("attempts", MAX_ATTEMPTS)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(Number(body.limit || 25));
    if (deliveriesError) throw deliveriesError;

    const results = [];
    for (const delivery of (deliveries || []) as Delivery[]) {
      results.push(await sendDelivery(serviceClient, resendApiKey, from, appUrl, delivery));
    }

    return json({
      ok: true,
      processed: results.length,
      sent: results.filter((item) => item.status === "sent").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
    }, 200, cors);
  } catch (error) {
    console.error("[GAME Email] process failed", safeError(error));
    return json({ error: "GAME_EMAIL_PROCESS_FAILED", message: error instanceof Error ? error.message : "Unknown error" }, 500, cors);
  }
});

async function assertCanProcess(req: Request, serviceClient: any) {
  const configuredSecret = String(Deno.env.get("GAME_CRON_SECRET") || "").trim();
  const requestSecret = String(req.headers.get("x-game-cron-secret") || "").trim();
  if (configuredSecret && requestSecret && configuredSecret === requestSecret) return;

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw new Error("AUTH_REQUIRED");

  const supabaseUrl = mustEnv("SUPABASE_URL");
  const anonKey = mustEnv("SUPABASE_ANON_KEY");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new Error("AUTH_REQUIRED");

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.role !== "admin") throw new Error("ADMIN_REQUIRED");
}

async function sendDelivery(serviceClient: any, resendApiKey: string, from: string, appUrl: string, delivery: Delivery) {
  await serviceClient
    .from("email_deliveries")
    .update({ status: "sending", attempts: Number(delivery.attempts || 0) + 1, error_message: null })
    .eq("id", delivery.id);

  try {
    const message = buildMessage(appUrl, delivery);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [delivery.recipient_email],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.message || payload?.error || `RESEND_${response.status}`));
    }

    await serviceClient
      .from("email_deliveries")
      .update({
        status: "sent",
        provider_message_id: payload?.id || null,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", delivery.id);

    return { id: delivery.id, status: "sent", providerMessageId: payload?.id || null };
  } catch (error) {
    const attempts = Number(delivery.attempts || 0) + 1;
    await serviceClient
      .from("email_deliveries")
      .update({
        status: "failed",
        next_attempt_at: attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + attempts * 15 * 60 * 1000).toISOString(),
        error_message: limitError(error),
      })
      .eq("id", delivery.id);
    return { id: delivery.id, status: "failed", error: limitError(error) };
  }
}

function buildMessage(appUrl: string, delivery: Delivery) {
  const payload = delivery.template_payload || {};
  const tournamentName = textValue(payload.tournamentName, "GAME");
  const playerName = textValue(payload.playerName, "");
  const link = `${appUrl}${textValue(payload.linkPath, "/player")}`;

  if (delivery.event_type === "match_suspended") {
    return wrapMessage({
      subject: "Tu partido ha sido suspendido | GAME",
      title: "TU PARTIDO HA SIDO SUSPENDIDO",
      body: [
        "El partido que tenias programado fue suspendido.",
        "Entra a GAME y actualiza los horarios en los que podes jugar para que podamos reprogramarlo.",
      ],
      button: "ACTUALIZAR DISPONIBILIDAD",
      link,
      playerName,
    });
  }

  if (delivery.event_type === "tournament_open") {
    return wrapMessage({
      subject: `Inscripciones abiertas: ${tournamentName} | GAME`,
      title: `LA INSCRIPCION PARA ${tournamentName} YA COMENZO`,
      body: ["Ya podes inscribirte desde tu cuenta en GAME."],
      button: "INSCRIBIRME",
      link,
      playerName,
    });
  }

  if (delivery.event_type === "payment_deadline_7d") {
    return wrapMessage({
      subject: `Estan por cerrar las inscripciones de ${tournamentName} | GAME`,
      title: "ESTAN POR CERRAR LAS INSCRIPCIONES",
      body: [
        `Tu inscripcion a ${tournamentName} todavia tiene un pago pendiente.`,
        "Recorda completar el pago antes del cierre de inscripciones.",
        "Una vez cerradas las inscripciones, las inscripciones que continuen impagas seran eliminadas automaticamente del torneo segun las reglas actuales de GAME.",
      ],
      button: "PAGAR INSCRIPCION",
      link,
      playerName,
    });
  }

  if (delivery.event_type === "match_reminder_1d") {
    const scheduledAt = formatArgentinaDateTime(String(payload.scheduledAt || ""));
    const rivalName = textValue(payload.rivalName, "");
    const court = textValue(payload.court, "");
    const matchLine = rivalName
      ? `Tenes un partido programado para manana a las ${scheduledAt.time} contra ${rivalName}.`
      : `Tenes un partido programado para manana a las ${scheduledAt.time}.`;
    return wrapMessage({
      subject: "A darlo todo! Manana tenes partido | GAME",
      title: "A DARLO TODO!",
      body: [
        matchLine,
        `Torneo: ${tournamentName}.`,
        `Fecha y hora: ${scheduledAt.date} ${scheduledAt.time}.`,
        court ? `Cancha: ${court}.` : "",
      ].filter(Boolean),
      button: "VER PARTIDO",
      link,
      playerName,
    });
  }

  return wrapMessage({
    subject: "Novedad de GAME",
    title: "NOVEDAD DE GAME",
    body: ["Tenes una nueva notificacion en GAME."],
    button: "VER GAME",
    link,
    playerName,
  });
}

function wrapMessage({ subject, title, body, button, link, playerName }: any) {
  const greeting = playerName ? `<p>Hola ${escapeHtml(playerName)},</p>` : "";
  const paragraphs = body.map((line: string) => `<p>${escapeHtml(line)}</p>`).join("");
  const html = `
    <div style="margin:0;padding:28px;background:#070809;color:#f5f7f8;font-family:Arial,sans-serif">
      <div style="max-width:620px;margin:0 auto;border:1px solid #cfdb2f;border-radius:18px;padding:28px;background:#101216">
        <h1 style="margin:0 0 18px;color:#cfdb2f;font-size:24px">${escapeHtml(title)}</h1>
        ${greeting}
        ${paragraphs}
        <p style="margin:28px 0">
          <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#cfdb2f;color:#111;text-decoration:none;font-weight:800">${escapeHtml(button)}</a>
        </p>
      </div>
    </div>
  `;
  const text = [
    title,
    playerName ? `Hola ${playerName},` : "",
    ...body,
    `${button}: ${link}`,
  ].filter(Boolean).join("\n\n");
  return { subject, html, text };
}

function formatArgentinaDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "fecha a definir", time: "hora a definir" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.day}/${parts.month}/${parts.year}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function textValue(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  return text || fallback;
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mustEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function safeError(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    code: typeof error === "object" && error !== null && "code" in error ? String((error as any).code) : null,
  };
}

function limitError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 600);
}

function json(payload: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
