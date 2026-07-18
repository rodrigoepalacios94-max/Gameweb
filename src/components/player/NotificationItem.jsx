import { AlertTriangle, ArrowRight, Bell, CalendarClock, CreditCard, Medal, Trophy, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../common/Badge";

const iconByType = {
  Torneos: Trophy,
  Inscripcion: CreditCard,
  Partido: CalendarClock,
  Cambio: CalendarClock,
  Resultado: Medal,
  Ranking: Medal,
  Disciplina: AlertTriangle,
  Sistema: Wrench,
};

export function NotificationItem({ notification, onMarkRead }) {
  const Icon = iconByType[notification.type] || Bell;
  const Wrapper = notification.actionTo ? Link : "div";
  const wrapperProps = notification.actionTo ? { to: notification.actionTo } : {};

  return (
    <article className={notification.read ? "notification-item" : "notification-item is-unread"}>
      <Wrapper className="notification-item__content" {...wrapperProps}>
        <span className={`notice-icon notice-icon--${notification.type.toLowerCase()}`}>
          <Icon size={22} />
        </span>
        <div>
          <div className="notification-item__title">
            <strong>{notification.title}</strong>
            <Badge tone={notification.read ? "neutral" : "warning"}>{notification.read ? "Leido" : "No leido"}</Badge>
          </div>
          <p>{notification.message}</p>
          <small>
            {notification.date} {notification.time ? `- ${notification.time}` : ""}
          </small>
        </div>
        {notification.actionTo ? <ArrowRight size={18} /> : null}
      </Wrapper>
      {!notification.read ? (
        <button className="text-button" type="button" onClick={() => onMarkRead(notification.id)}>
          Marcar como leido
        </button>
      ) : null}
    </article>
  );
}
