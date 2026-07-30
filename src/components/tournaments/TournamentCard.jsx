import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, Trophy } from "lucide-react";
import { Badge } from "../common/Badge";
import { Card } from "../common/Card";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { getVisibleTournamentDescription } from "../../utils/tournamentDescription";

const statusTone = {
  "Inscripciones abiertas": "success",
  Proximamente: "warning",
  "En juego": "info",
  Finalizado: "neutral",
  Cancelado: "danger",
};

export function TournamentCard({ tournament, to, actions }) {
  const navigate = useNavigate();
  const cardTarget = to || (actions ? `/admin/tournaments/${tournament.id}` : null);
  const description = getVisibleTournamentDescription(tournament.description);

  function openCard() {
    if (cardTarget) navigate(cardTarget);
  }

  function stopNestedNavigation(event) {
    event.stopPropagation();
  }

  return (
    <Card
      className={cardTarget ? "tournament-card tournament-card--premium tournament-card--clickable" : "tournament-card tournament-card--premium"}
      as="article"
      role={cardTarget ? "button" : undefined}
      tabIndex={cardTarget ? 0 : undefined}
      onClick={openCard}
      onKeyDown={(event) => {
        if (cardTarget && (event.key === "Enter" || event.key === " ")) openCard();
      }}
    >
      <div className="tournament-card__top">
        <Trophy size={22} />
        <Badge tone={statusTone[tournament.status] || "neutral"}>{tournament.status}</Badge>
      </div>
      <h3>{tournament.name}</h3>
      {description ? <p>{description}</p> : null}
      <div className="meta-grid">
        <span>
          <CalendarDays size={16} /> {formatDate(tournament.startDate)}
        </span>
        <span>{tournament.type}</span>
        <span>{tournament.scoringSystem}</span>
        <span>{formatCurrency(tournament.price)}</span>
        {tournament.categoryLabels?.length ? <span>{tournament.categoryLabels.join(", ")}</span> : null}
        {tournament.playerCategoryName ? <span>{tournament.playerCategoryName}</span> : null}
        {tournament.registrationStatus ? <span>{tournament.registrationStatus}</span> : null}
      </div>
      {to ? (
        <Link className="button button--outline-green button--md" to={to} onClick={stopNestedNavigation}>
          <span>Ver torneo</span>
        </Link>
      ) : null}
      {actions ? <div className="card-actions" onClick={stopNestedNavigation}>{actions}</div> : null}
    </Card>
  );
}
