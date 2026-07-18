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
  { id: "read", label: "Leidas" },
  { id: "Partido", label: "Partidos" },
  { id: "Disciplina", label: "Disciplina" },
];

export function PlayerNotificationsPage() {
  const baseNotifications = useMemo(() => notificationService.getNotificationsByRole("player"), []);
  const [notifications, setNotifications] = useState(baseNotifications);
  const [tab, setTab] = useState("all");

  const filtered = notifications.filter((item) => {
    if (tab === "unread") return !item.read;
    if (tab === "read") return item.read;
    if (tab === "all") return true;
    return item.type === tab;
  });

  const unreadCount = notifications.filter((item) => !item.read).length;

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
          <span className="eyebrow">Centro de notificaciones</span>
          <h1>Avisos</h1>
          <p>Eventos mock del circuito: partidos, cambios de cancha, inscripciones, resultados, ranking y disciplina.</p>
        </div>
        <Button variant="secondary" icon={CheckCheck} onClick={markAllRead} disabled={!unreadCount}>
          Marcar todas
        </Button>
      </header>

      <div className="surface-toolbar">
        <Tabs tabs={filters} activeTab={tab} onChange={setTab} />
        <span>{unreadCount} sin leer</span>
      </div>

      {filtered.length ? (
        <section className="notification-list" aria-label="Listado de avisos">
          {filtered.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} onMarkRead={markRead} />
          ))}
        </section>
      ) : (
        <EmptyState title="No hay avisos para este filtro" description="Cuando se publique un nuevo evento del circuito aparecera en esta seccion." />
      )}
    </div>
  );
}
