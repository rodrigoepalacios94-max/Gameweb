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
  { id: "Resultado", label: "Resultados" },
  { id: "Programacion", label: "Programacion" },
];

export function AdminNotificationsPage() {
  const { data: notifications, loading, error, reload } = useAsyncData(() => notificationService.getNotificationsByRole("admin"), []);
  const [tab, setTab] = useState("all");
  const unreadCount = (notifications || []).filter((notification) => !notification.read).length;
  const filtered = (notifications || []).filter((notification) => {
    if (tab === "all") return true;
    if (tab === "unread") return !notification.read;
    return notification.type === tab;
  });

  async function markRead(id) {
    await notificationService.markAsRead(id);
    reload();
  }

  async function markAllRead() {
    await notificationService.markAllAsRead("admin");
    reload();
  }

  if (loading) return <LoadingState message="Cargando avisos admin..." />;
  if (error) return <ErrorState title="No pudimos cargar avisos admin." onRetry={reload} />;

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Administrador</span>
          <h1>Avisos</h1>
          <p>Eventos operativos importantes calculados desde los partidos.</p>
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
        <EmptyState title="Sin avisos para este filtro" description="Los eventos nuevos del circuito aparecerán acá." />
      )}
    </div>
  );
}
