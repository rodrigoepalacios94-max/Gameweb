import { Avatar } from "../common/Avatar";

export function RankingTable({ entries, currentPlayerId, onPlayerClick }) {
  return (
    <div className="ranking-table" role="table">
      <div className="ranking-row ranking-row--head" role="row">
        <span>#</span>
        <span>Jugador</span>
        <span>Puntos</span>
      </div>
      {entries.map((entry) => (
        <button
          key={entry.playerId}
          className={`ranking-row ${entry.position <= 3 ? "is-top" : ""} ${entry.playerId === currentPlayerId ? "is-current" : ""}`}
          onClick={() => onPlayerClick?.(entry.player)}
          type="button"
        >
          <strong>{entry.position}</strong>
          <span className="ranking-player">
            <Avatar src={entry.player.avatar} name={entry.player.fullName} size="sm" />
            {entry.player.fullName}
          </span>
          <strong>{entry.points}</strong>
        </button>
      ))}
    </div>
  );
}
