import { useState } from "react";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { Tabs } from "../../components/common/Tabs";
import { notificationService } from "../../services/notificationService";

export function PlayerNotificationsPage() {
  const [tab, setTab] = useState("unread");
  const notifications = notificationService.getNotificationsByRole("player").filter((item) => (tab === "read" ? item.read : !item.read));

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Centro de notificaciones</span>
        <h1>Notificaciones</h1>
      </header>
      <Tabs tabs={[{ id: "unread", label: "No leidas" }, { id: "read", label: "Leidas" }]} activeTab={tab} onChange={setTab} />
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
