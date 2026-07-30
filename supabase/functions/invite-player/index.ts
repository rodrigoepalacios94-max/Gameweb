import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publicAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const appUrl = Deno.env.get("GAME_APP_URL");

    if (!supabaseUrl || !serviceRoleKey || !publicAnonKey || !appUrl) {
      return json({ error: "INVITE_CONFIG_MISSING" }, 500, cors);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401, cors);

    const userClient = createClient(supabaseUrl, publicAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "AUTH_REQUIRED" }, 401, cors);

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (profileError || profile?.role !== "admin") return json({ error: "ADMIN_REQUIRED" }, 403, cors);

    const body = await req.json();
    const playerId = String(body.playerId || "").trim();
    if (!playerId) return json({ error: "PLAYER_REQUIRED" }, 400, cors);

    const { data: player, error: playerError } = await serviceClient
      .from("players")
      .select("id, email")
      .eq("id", playerId)
      .maybeSingle();
    if (playerError || !player?.email) return json({ error: "PLAYER_NOT_FOUND" }, 404, cors);

    const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(player.email, {
      redirectTo: `${appUrl}/reset-password`,
      data: {
        game_role: "player",
        player_id: player.id,
      },
    });
    if (inviteError) return json({ error: "INVITE_FAILED", message: inviteError.message }, 400, cors);

    if (invited.user?.id) {
      const { error: upsertError } = await serviceClient
        .from("profiles")
        .upsert({
          auth_user_id: invited.user.id,
          email: player.email.toLowerCase(),
          role: "player",
          player_id: player.id,
        }, { onConflict: "auth_user_id" });
      if (upsertError) return json({ error: "PROFILE_LINK_FAILED", message: upsertError.message }, 400, cors);
    }

    return json({ ok: true, email: player.email }, 200, cors);
  } catch (error) {
    return json({ error: "INVITE_UNEXPECTED", message: error instanceof Error ? error.message : "Unknown error" }, 500, cors);
  }
});

function json(payload: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
