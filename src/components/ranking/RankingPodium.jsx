import { Medal } from "lucide-react";
import { Avatar } from "../common/Avatar";
import { Badge } from "../common/Badge";
import { Card } from "../common/Card";

const podiumLabels = {
  1: "Primer puesto",
  2: "Segundo puesto",
  3: "Tercer puesto",
};

export function RankingPodium({ entries = [], currentPlayerId = null, onPlayerClick }) {
  const topThree = entries.slice(0, 3);

  return (
    <section className="ranking-podium">
      {topThree.map((entry) => {
        const isCurrent = entry.playerId === currentPlayerId;
        const content = (
          <>
            <span className="feature-icon"><Medal size={24} /></span>
            <strong>{podiumLabels[entry.position] || `${entry.position} puesto`}</strong>
            <Avatar src={entry.player.avatar} name={entry.player.fullName} size="lg" />
            <h2>{entry.player.fullName}</h2>
            <span>{entry.player.categoryName}</span>
            <b>{entry.points} pts</b>
            {isCurrent ? <Badge tone="success">VOS</Badge> : null}
          </>
        );

        if (onPlayerClick) {
          return (
            <Card
              key={entry.playerId}
              as="button"
              className={`ranking-podium-card ranking-podium-card--${entry.position} ${isCurrent ? "is-current" : ""}`}
              onClick={() => onPlayerClick(entry.player)}
              type="button"
            >
              {content}
            </Card>
          );
        }

        return (
          <Card key={entry.playerId} className={`ranking-podium-card ranking-podium-card--${entry.position} ${isCurrent ? "is-current" : ""}`}>
            {content}
          </Card>
        );
      })}
    </section>
  );
}
