import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Tabs } from "../../components/common/Tabs";
import { NotificationItem } from "../../components/player/NotificationItem";
import { useAsyncData } from "../../hooks/useAsyncData";
import { notificationService } from "../../services/notificationService";

const filters = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "No leidas" },
  { id: "read", label: "Leidas" },
  { id: "Partido", label: "Partidos" },
  { id: "Disciplina", label: "Disciplina" },
];

export function PlayerNotificationsPage() {
  const { data: notifications, loading, error, reload } = useAsyncData(() => notificationService.getNotificationsByRole("player"), []);
  const [tab, setTab] = useState("all");

  const filtered = (notifications || []).filter((item) => {
    if (tab === "unread") return !item.read;
    if (tab === "read") return item.read;
    if (tab === "all") return true;
    return item.type === tab;
  });

  const unreadCount = (notifications || []).filter((item) => !item.read).length;

  async function markRead(id) {
    await notificationService.markAsRead(id);
    reload();
  }

  async function markAllRead() {
    await notificationService.markAllAsRead("player");
    reload();
  }

  if (loading) return <LoadingState message="Cargando notificaciones..." />;
  if (error) return <ErrorState title="No pudimos cargar tus notificaciones." onRetry={reload} />;

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Centro de notificaciones</span>
          <h1>Notificaciones</h1>
          <p>Eventos del circuito: partidos, cambios de cancha, inscripciones, resultados, ranking y disciplina.</p>
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
        <section className="notification-list" aria-label="Listado de notificaciones">
          {filtered.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} onMarkRead={markRead} />
          ))}
        </section>
      ) : (
        <EmptyState title="No hay notificaciones para este filtro" description="Cuando se publique un nuevo evento del circuito aparecera en esta seccion." />
      )}
    </div>
  );
}
