import { Link } from "react-router-dom";
import { Badge } from "../common/Badge";

export function BracketMatch({ match }) {
  const content = (
    <>
      <div className={match.winner === match.playerA ? "bracket-player is-winner" : "bracket-player"}>
        <span>{match.playerA}</span>
      </div>
      <div className={match.bye ? "bracket-player is-bye" : match.winner === match.playerB ? "bracket-player is-winner" : "bracket-player"}>
        <span>{match.playerB === "BYE" ? "BYE" : match.playerB}</span>
      </div>
      <Badge tone={match.walkover ? "warning" : match.bye ? "neutral" : match.winner ? "success" : "info"}>{match.score}</Badge>
    </>
  );

  if (match.matchId) {
    return (
      <Link className="bracket-match" to={`/player/matches/${match.matchId}`}>
        {content}
      </Link>
    );
  }

  return <div className="bracket-match is-disabled">{content}</div>;
}
