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
          const statusLabel = isDoubleWalkover ? "Doble W.O." : match.status || (match.winner ? "Finalizado" : "Pendiente");
          const CardComponent = match.matchId && !onMatchOpen ? Link : match.matchId ? "button" : "div";
          const cardProps = match.matchId && onMatchOpen
            ? { type: "button", onClick: () => onMatchOpen(match.matchId) }
            : match.matchId
              ? { to: `${detailBasePath}/${match.matchId}` }
              : {};
          return (
            <CardComponent key={match.matchId || `${match.playerA}-${match.playerB}-${index}`} className={isDoubleWalkover ? "preliminary-card preliminary-card--compact is-double-walkover" : "preliminary-card preliminary-card--compact"} {...cardProps}>
              <div className="preliminary-card__players">
                <strong title={match.playerA}>{match.playerA}</strong>
                <span>vs</span>
                <strong title={match.playerB}>{match.playerB}</strong>
              </div>
              <Badge tone={isDoubleWalkover ? "danger" : match.winner ? "success" : "info"}>{statusLabel}</Badge>
              {match.result ? <small>{match.result}</small> : null}
            </CardComponent>
          );
        })}
      </div>
    </section>
  );
}
