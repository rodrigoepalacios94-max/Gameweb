import { createClient } from "@supabase/supabase-js";
import { SUPABASE_AUTH_ENABLED } from "../config/auth";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (SUPABASE_AUTH_ENABLED && !isSupabaseConfigured && import.meta.env.DEV) {
  console.error("Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.");
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

export function getSupabaseConfigStatus() {
  return {
    configured: isSupabaseConfigured,
    hasUrl: Boolean(supabaseUrl),
    hasPublishableKey: Boolean(supabasePublishableKey),
  };
}

export async function validateSupabaseClient() {
  if (!supabase) {
    return {
      ok: false,
      reason: "Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.",
    };
  }

  return {
    ok: true,
    reason: "Cliente Supabase inicializado. La prueba de consulta queda lista para la primera tabla real.",
  };
}
