import { Link } from "react-router-dom";
import { Badge } from "../common/Badge";

export function BracketMatch({ match, detailBasePath = "/player/matches" }) {
  const content = (
    <>
      <div className={match.winner === match.playerA ? "bracket-player is-winner" : "bracket-player"}>
        <span>{match.playerA}</span>
        {match.playerANote ? <small>{match.playerANote}</small> : null}
      </div>
      <div className={match.bye ? "bracket-player is-bye" : match.winner === match.playerB ? "bracket-player is-winner" : "bracket-player"}>
        <span>{match.playerB === "BYE" ? "BYE" : match.playerB}</span>
        {match.playerBNote ? <small>{match.playerBNote}</small> : null}
      </div>
      <Badge tone={match.walkover ? "warning" : match.bye ? "neutral" : match.winner ? "success" : "info"}>{match.score}</Badge>
      {match.connectionNote ? <small className="bracket-note">{match.connectionNote}</small> : null}
    </>
  );

  if (match.matchId) {
    return (
      <Link className="bracket-match" to={`${detailBasePath}/${match.matchId}`}>
        {content}
      </Link>
    );
  }

  return <div className="bracket-match is-disabled">{content}</div>;
}
