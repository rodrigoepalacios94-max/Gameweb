import { Clock, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar } from "../common/Avatar";
import { Badge } from "../common/Badge";
import { Card } from "../common/Card";
import { formatDate } from "../../utils/formatters";

export function MatchCard({ match }) {
  return (
    <Card className="match-card">
      <div className="match-card__rival">
        <Avatar src={match.opponentAvatar} name={match.opponent} />
        <div>
          <span>Rival</span>
          <strong>{match.opponent}</strong>
        </div>
        <Badge tone={match.status === "Finalizado" ? "neutral" : "info"}>{match.status}</Badge>
      </div>
      <div className="match-card__body">
        <h3>{match.tournament}</h3>
        <p>
          {match.category} / {match.round}
        </p>
        <div className="meta-grid">
          <span>
            <Clock size={16} /> {formatDate(match.date)} - {match.time}
          </span>
          <span>
            <MapPin size={16} /> {match.court}
          </span>
        </div>
        {match.result ? <strong className="result">Resultado: {match.result}</strong> : null}
      </div>
      <Link className="button button--outline-green button--md" to={`/player/matches/${match.id}`}>
        <span>Ver detalle</span>
      </Link>
    </Card>
  );
}
