export function MatchScore({ match }) {
  if (!match?.sets?.length) {
    return <span className="score-pill">{match?.result || "Sin resultado"}</span>;
  }

  return (
    <div className="match-score">
      {match.sets.map((set, index) => (
        <div key={`${match.id}-set-${index}`} className={set.superTieBreak ? "score-set is-super" : "score-set"}>
          <span>{set.a}</span>
          <span>{set.b}</span>
        </div>
      ))}
    </div>
  );
}
