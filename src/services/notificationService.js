import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { mockRequest } from "./serviceUtils";

export const notificationService = {
  async getNotifications({ role, type, unreadOnly } = {}) {
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
    return mockRequest(() =>
      mutateMockData((db) => {
        const notification = db.notifications.find((item) => item.id === id);
        if (notification) notification.read = true;
        return notification;
      }), "No pudimos marcar la notificacion.");
  },
  async markAllAsRead(role) {
    return mockRequest(() =>
      mutateMockData((db) => {
        db.notifications.forEach((notification) => {
          if (!role || notification.role === role) notification.read = true;
        });
        return db.notifications.filter((notification) => !role || notification.role === role);
      }), "No pudimos marcar las notificaciones.");
  },
};
