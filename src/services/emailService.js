import { supabase } from "../lib/supabase";
import { logSupabaseDataError } from "./supabaseDataUtils";

export const emailService = {
  async processQueuedGameEmails(reason = "manual") {
    if (!supabase?.functions) return null;
    try {
      const { data, error } = await supabase.functions.invoke("send-game-emails", {
        body: { reason, enqueueScheduled: false },
      });
      if (error) {
        logSupabaseDataError("process game emails", error);
        return null;
      }
      return data;
    } catch (error) {
      logSupabaseDataError("process game emails", error);
      return null;
    }
  },
};
