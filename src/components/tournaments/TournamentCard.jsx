import { Link } from "react-router-dom";
import { CalendarDays, Trophy } from "lucide-react";
import { Badge } from "../common/Badge";
import { Card } from "../common/Card";
import { formatCurrency, formatDate } from "../../utils/formatters";

const statusTone = {
  "Inscripciones abiertas": "success",
  Proximamente: "warning",
  "En juego": "info",
  Finalizado: "neutral",
  Cancelado: "danger",
};

export function TournamentCard({ tournament, to, actions }) {
  return (
    <Card className="tournament-card">
      <div className="tournament-card__top">
        <Trophy size={22} />
        <Badge tone={statusTone[tournament.status] || "neutral"}>{tournament.status}</Badge>
      </div>
      <h3>{tournament.name}</h3>
      <p>{tournament.description}</p>
      <div className="meta-grid">
        <span>
          <CalendarDays size={16} /> {formatDate(tournament.startDate)}
        </span>
        <span>{tournament.type}</span>
        <span>{tournament.scoringSystem}</span>
        <span>{formatCurrency(tournament.price)}</span>
      </div>
      {to ? (
        <Link className="button button--secondary button--md" to={to}>
          <span>Ver torneo</span>
        </Link>
      ) : null}
      {actions ? <div className="card-actions">{actions}</div> : null}
    </Card>
  );
}
