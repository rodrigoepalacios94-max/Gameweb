import { Link } from "react-router-dom";
import { Badge } from "../common/Badge";

function getCompactNote(note = "") {
  if (note.includes("32avos")) return "32A";
  if (note.includes("Ganador preliminar")) return "PRE";
  if (note.includes("Perdedor")) return "PER";
  if (note.includes("CS1")) return "CS1";
  if (note.includes("CS2")) return "CS2";
  return note.slice(0, 4).toUpperCase();
}

function getScoreParts(score = "") {
  if (!score || score === "Pendiente" || score === "A programar" || score === "Programado") return null;
  const sets = score.split("/").map((set) => set.trim()).filter(Boolean);
  const parts = sets.map((set) => set.split("-").map((value) => value.trim()));
  if (!parts.length || parts.some((part) => part.length < 2 || !part[0] || !part[1])) return null;
  return {
    playerA: parts.map((part) => part[0]).join(" "),
    playerB: parts.map((part) => part[1]).join(" "),
  };
}

export function BracketMatch({ match, detailBasePath = "/player/matches", compact = false, onOpen }) {
  const scores = getScoreParts(match.score);
  const playerANote = getCompactNote(match.playerANote);
  const playerBNote = getCompactNote(match.playerBNote);
  const matchClassName = compact ? "bracket-match bracket-match--compact" : "bracket-match";
  const content = (
    <>
      <div className={match.winner === match.playerA ? "bracket-player is-winner" : "bracket-player"}>
        <span title={match.playerA}>{match.playerA}</span>
        {playerANote ? <small>{playerANote}</small> : null}
        {scores ? <b>{scores.playerA}</b> : null}
      </div>
      <div className={match.bye ? "bracket-player is-bye" : match.winner === match.playerB ? "bracket-player is-winner" : "bracket-player"}>
        <span title={match.playerB}>{match.playerB === "BYE" ? "BYE" : match.playerB}</span>
        {playerBNote ? <small>{playerBNote}</small> : null}
        {scores ? <b>{scores.playerB}</b> : null}
      </div>
      {!scores ? <Badge tone={match.walkover ? "warning" : match.bye ? "neutral" : match.winner ? "success" : "info"}>{match.score}</Badge> : null}
    </>
  );

  if (match.matchId && onOpen) {
    return (
      <button className={matchClassName} type="button" title={match.connectionNote || undefined} onClick={() => onOpen(match.matchId)}>
        {content}
      </button>
    );
  }

  if (match.matchId) {
    return (
      <Link className={matchClassName} to={`${detailBasePath}/${match.matchId}`} title={match.connectionNote || undefined}>
        {content}
      </Link>
    );
  }

  return <div className={`${matchClassName} is-disabled`} title={match.connectionNote || undefined}>{content}</div>;
}
