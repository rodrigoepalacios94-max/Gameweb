import { mockNotifications } from "../mocks/mockNotifications";

export const notificationService = {
  getNotificationsByRole(role) {
    return mockNotifications.filter((notification) => notification.role === role);
  },
};
