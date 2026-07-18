import { Card } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";
import { notificationService } from "../../services/notificationService";

export function AdminNotificationsPage() {
  const notifications = notificationService.getNotificationsByRole("admin");

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Administrador</span>
        <h1>Notificaciones</h1>
      </header>
      <div className="compact-list">
        {notifications.map((notification) => (
          <Card key={notification.id} className="notification-card">
            <Badge tone={notification.read ? "neutral" : "warning"}>{notification.type}</Badge>
            <div>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
              <small>{notification.date}</small>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
