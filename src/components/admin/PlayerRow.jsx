import { Avatar } from "../common/Avatar";
import { Badge } from "../common/Badge";

export function PlayerRow({ player, onClick }) {
  const tone = player.status.includes("Bloqueado") ? "danger" : player.status === "Suspendido" ? "warning" : "success";

  return (
    <button className="player-row" onClick={() => onClick?.(player)} type="button">
      <Avatar src={player.avatar} name={player.fullName} />
      <span className="player-row__name">{player.fullName}</span>
      <span>{player.categoryName}</span>
      <strong>#{player.ranking}</strong>
      <strong>{player.points} pts</strong>
      <Badge tone={tone}>{player.status}</Badge>
    </button>
  );
}
