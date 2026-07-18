import { useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { Tabs } from "../../components/common/Tabs";
import { NotificationItem } from "../../components/player/NotificationItem";
import { notificationService } from "../../services/notificationService";

const filters = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "No leidas" },
  { id: "Disciplina", label: "Disciplina" },
  { id: "Categoria", label: "Solicitudes" },
  { id: "Partido", label: "Partidos" },
];

export function AdminNotificationsPage() {
  const baseNotifications = useMemo(() => notificationService.getNotificationsByRole("admin"), []);
  const [notifications, setNotifications] = useState(baseNotifications);
  const [tab, setTab] = useState("all");
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const filtered = notifications.filter((notification) => {
    if (tab === "all") return true;
    if (tab === "unread") return !notification.read;
    return notification.type === tab;
  });

  function markRead(id) {
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }

  function markAllRead() {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Administrador</span>
          <h1>Avisos</h1>
          <p>Eventos relevantes para el profesor: descensos, reclamos, limite de faltas, conflictos y resultados pendientes.</p>
        </div>
        <Button variant="secondary" icon={CheckCheck} disabled={!unreadCount} onClick={markAllRead}>Marcar todas</Button>
      </header>
      <div className="surface-toolbar">
        <Tabs tabs={filters} activeTab={tab} onChange={setTab} />
        <span>{unreadCount} sin leer</span>
      </div>
      {filtered.length ? (
        <section className="notification-list" aria-label="Avisos administrativos">
          {filtered.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} onMarkRead={markRead} />
          ))}
        </section>
      ) : (
        <EmptyState title="Sin avisos para este filtro" description="Los eventos nuevos del circuito apareceran aca." />
      )}
    </div>
  );
}
