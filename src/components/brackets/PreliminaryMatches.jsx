import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";

export function PreliminaryMatches({ preliminaries = [], title = "Preliminares", detailBasePath = "/player/matches", actionLabel, actionDisabled = false, onAction, onMatchOpen }) {
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
          const isDoubleWalkover = match.status === "Doble W.O." || match.result?.includes("Doble W.O.");
          const CardComponent = match.matchId && !onMatchOpen ? Link : match.matchId ? "button" : "div";
          const cardProps = match.matchId && onMatchOpen
            ? { type: "button", onClick: () => onMatchOpen(match.matchId) }
            : match.matchId
              ? { to: `${detailBasePath}/${match.matchId}` }
              : {};
          return (
            <CardComponent key={match.matchId || `${match.playerA}-${match.playerB}-${index}`} className={isDoubleWalkover ? "preliminary-card preliminary-card--compact is-double-walkover" : "preliminary-card preliminary-card--compact"} {...cardProps}>
              <strong>{match.playerA}</strong>
              <span>vs</span>
              <strong>{match.playerB}</strong>
              <Badge tone={isDoubleWalkover ? "danger" : match.winner ? "success" : "info"}>{isDoubleWalkover ? "Doble W.O." : match.winner ? `Gana ${match.winner}` : match.status}</Badge>
              {match.result ? <small>{match.result}</small> : null}
            </CardComponent>
          );
        })}
      </div>
    </section>
  );
}
