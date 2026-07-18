import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { operationalAlertService } from "./operationalAlertService";
import { mockRequest } from "./serviceUtils";

export const notificationService = {
  async getNotifications({ role, type, unreadOnly } = {}) {
    if (role === "admin") {
      const alerts = await operationalAlertService.getOperationalAlerts();
      return alerts.filter((notification) => {
        const matchesType = !type || notification.type === type;
        const matchesUnread = !unreadOnly || !notification.read;
        return matchesType && matchesUnread;
      });
    }
    return mockRequest(() =>
      readMockData((db) =>
        db.notifications.filter((notification) => {
          const matchesRole = !role || notification.role === role;
          const matchesType = !type || notification.type === type;
          const matchesUnread = !unreadOnly || !notification.read;
          return matchesRole && matchesType && matchesUnread;
        }),
      ), "No pudimos cargar las notificaciones.");
  },
  async getNotificationsByRole(role) {
    return this.getNotifications({ role });
  },
  async markAsRead(id) {
    if (id.startsWith("operational-")) return operationalAlertService.markAsRead(id);
    return mockRequest(() =>
      mutateMockData((db) => {
        const notification = db.notifications.find((item) => item.id === id);
        if (notification) notification.read = true;
        return notification;
      }), "No pudimos marcar la notificacion.");
  },
  async markAllAsRead(role) {
    if (role === "admin") return operationalAlertService.markAllAsRead();
    return mockRequest(() =>
      mutateMockData((db) => {
        db.notifications.forEach((notification) => {
          if (!role || notification.role === role) notification.read = true;
        });
        return db.notifications.filter((notification) => !role || notification.role === role);
      }), "No pudimos marcar las notificaciones.");
  },
  async getAdminSidebarCounts() {
    const [alerts, counts] = await Promise.all([
      operationalAlertService.getOperationalAlerts(),
      mockRequest(() =>
        readMockData((db) => ({
          discipline: db.disciplineClaims.filter((claim) => claim.status === "Pendiente").length,
          requests: db.categoryChangeRequests.filter((request) => request.status === "Pendiente").length,
        })), "No pudimos calcular los pendientes del sidebar."),
    ]);
    return {
      ...counts,
      notifications: alerts.filter((alert) => !alert.read).length,
    };
  },
};
