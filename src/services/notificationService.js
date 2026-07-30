import { operationalAlertService } from "./operationalAlertService";
import { createDataError, ensureSupabaseDataClient, logSupabaseDataError } from "./supabaseDataUtils";

const NOTIFICATIONS_UPDATED_EVENT = "game:notifications-updated";

function emitNotificationsUpdated(role) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT, { detail: { role } }));
}

function mapPlayerNotification(row) {
  const createdAt = row.created_at ? new Date(row.created_at) : null;
  const typeByEvent = {
    match_suspended: "Partido",
    match_reminder_1d: "Partido",
    tournament_open: "Torneos",
    payment_deadline_7d: "Inscripcion",
  };
  return {
    id: row.id,
    role: "player",
    type: typeByEvent[row.event_type] || "Sistema",
    title: row.title,
    message: row.message,
    link: row.link_path || "/player/notifications",
    actionTo: row.link_path || null,
    read: Boolean(row.read_at),
    createdAt: row.created_at,
    date: createdAt ? createdAt.toLocaleDateString("es-AR") : "",
    time: createdAt ? createdAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "",
  };
}

export const notificationService = {
  NOTIFICATIONS_UPDATED_EVENT,

  async getNotifications({ role, type, unreadOnly } = {}) {
    if (role === "admin") {
      const alerts = await operationalAlertService.getOperationalAlerts();
      return alerts.filter((notification) => {
        const matchesType = !type || notification.type === type;
        const matchesUnread = !unreadOnly || !notification.read;
        return matchesType && matchesUnread;
      });
    }
    const client = ensureSupabaseDataClient();
    let query = client
      .from("game_notifications")
      .select("id, event_type, title, message, link_path, read_at, created_at")
      .eq("role", "player")
      .order("created_at", { ascending: false });
    if (unreadOnly) query = query.is("read_at", null);
    const { data, error } = await query;
    if (error) {
      logSupabaseDataError("player notifications", error);
      throw createDataError("No pudimos cargar tus notificaciones.", { cause: error });
    }
    return (data || [])
      .map(mapPlayerNotification)
      .filter((notification) => !type || notification.type === type);
  },
  async getNotificationsByRole(role) {
    return this.getNotifications({ role });
  },
  async markAsRead(id) {
    if (id?.startsWith("operational-")) {
      const result = await operationalAlertService.markAsRead(id);
      emitNotificationsUpdated("admin");
      return result;
    }
    const client = ensureSupabaseDataClient();
    const { error } = await client
      .from("game_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      logSupabaseDataError("player notification read", error);
      throw createDataError("No pudimos marcar la notificacion como leida.", { cause: error });
    }
    emitNotificationsUpdated("player");
    return { id, read: true };
  },
  async markAllAsRead(role) {
    if (role === "admin") {
      const result = await operationalAlertService.markAllAsRead();
      emitNotificationsUpdated("admin");
      return result;
    }
    const client = ensureSupabaseDataClient();
    const { data, error } = await client
      .from("game_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("role", "player")
      .is("read_at", null)
      .select("id");
    if (error) {
      logSupabaseDataError("player notifications mark all read", error);
      throw createDataError("No pudimos marcar tus notificaciones como leidas.", { cause: error });
    }
    emitNotificationsUpdated("player");
    return data || [];
  },
  async getAdminSidebarCounts() {
    const alerts = await operationalAlertService.getOperationalAlerts();
    return {
      discipline: 0,
      requests: 0,
      notifications: alerts.filter((alert) => !alert.read).length,
    };
  },
};
