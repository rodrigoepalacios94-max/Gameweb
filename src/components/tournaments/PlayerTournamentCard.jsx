import { Link } from "react-router-dom";
import { CalendarDays, CreditCard, Trophy } from "lucide-react";
import { Badge } from "../common/Badge";
import { Card } from "../common/Card";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { getVisibleTournamentDescription } from "../../utils/tournamentDescription";

const statusLabels = {
  "Inscripciones abiertas": "INSCRIPCIONES ABIERTAS",
  "En juego": "EN CURSO",
  Finalizado: "FINALIZADO",
};

const statusTone = {
  "Inscripciones abiertas": "success",
  "En juego": "info",
  Finalizado: "neutral",
  Cancelado: "danger",
};

export function PlayerTournamentCard({ tournament, personalStatus = "NO INSCRIPTO", onRegister }) {
  const isOpen = tournament.status === "Inscripciones abiertas";
  const isRegistered = Boolean(tournament.existingEnrollments?.length) || personalStatus.startsWith("INSCRIPTO");
  const isExpelled = Boolean(tournament.expelledByFaults) || personalStatus === "EXPULSADO POR 3 FALTAS";
  const canRegister = isOpen && !isRegistered && !isExpelled;
  const description = getVisibleTournamentDescription(tournament.description);

  return (
    <Card className="player-tournament-card" as="article">
      <div className="player-tournament-card__top">
        <Trophy size={22} />
        <Badge tone={statusTone[tournament.status] || "neutral"}>{statusLabels[tournament.status] || tournament.status}</Badge>
      </div>

      <div className="player-tournament-card__body">
        <h3>{tournament.name}</h3>
        {description ? <p>{description}</p> : null}
      </div>

      <div className="player-tournament-card__meta">
        <span>
          <CalendarDays size={16} />
          {formatDate(tournament.startDate)}
        </span>
        <span>
          <CreditCard size={16} />
          {formatCurrency(tournament.price)}
        </span>
        <Badge tone={isExpelled ? "danger" : isRegistered ? "success" : "neutral"}>{personalStatus}</Badge>
      </div>

      <div className="card-actions player-tournament-card__actions">
        {canRegister ? (
          <button className="button button--orange button--sm" type="button" onClick={onRegister}>
            <span>INSCRIBIRME</span>
          </button>
        ) : null}
        <Link className="button button--outline-green button--sm" to={`/player/tournaments/${tournament.id}`}>
          <span>VER TORNEO</span>
        </Link>
      </div>
    </Card>
  );
}
