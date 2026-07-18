import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";

export function PreliminaryMatches({ preliminaries = [], title = "Preliminares", detailBasePath = "/player/matches", actionLabel, actionDisabled = false, onAction }) {
  if (!preliminaries.length) return null;

  return (
    <section className="bracket-section preliminary-section">
      <div className="section-title">
        <span>{title}</span>
        {onAction ? (
          <Button icon={Play} disabled={actionDisabled} onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
      <div className="preliminary-grid preliminary-grid--compact">
        {preliminaries.map((match, index) => {
          const CardComponent = match.matchId ? Link : "div";
          const cardProps = match.matchId ? { to: `${detailBasePath}/${match.matchId}` } : {};
          return (
            <CardComponent key={match.matchId || `${match.playerA}-${match.playerB}-${index}`} className="preliminary-card preliminary-card--compact" {...cardProps}>
              <strong>{match.playerA}</strong>
              <span>vs</span>
              <strong>{match.playerB}</strong>
              <Badge tone={match.winner ? "success" : "info"}>{match.winner ? `Gana ${match.winner}` : match.status}</Badge>
              {match.result ? <small>{match.result}</small> : null}
            </CardComponent>
          );
        })}
      </div>
    </section>
  );
}
