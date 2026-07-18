import { useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { Modal } from "../../components/common/Modal";
import { Select } from "../../components/common/Select";
import { useAuth } from "../../context/AuthContext";
import { mockCategories } from "../../mocks/mockCategories";
import { rankingService } from "../../services/rankingService";

export function PlayerRankingPage() {
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState(user.categoryId);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const entries = rankingService.getRankingByCategory(categoryId);
  const podium = entries.slice(0, 3);
  const tableEntries = entries.slice(3);

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Ranking</span>
        <h1>Ranking del circuito</h1>
        <p>Vista mock por categoria. El ranking general se reserva para cabezas de serie y desempates segun estructura.md.</p>
      </header>

      <Card>
        <Select
          label="Categoria"
          value={categoryId}
          onChange={setCategoryId}
          options={mockCategories.filter((category) => category.status === "Activa").map((category) => ({
            value: category.id,
            label: `${category.name} ${category.branch}`,
          }))}
        />
      </Card>

      {entries.length ? (
        <>
          <section className="podium-grid">
            {podium.map((entry) => (
              <button key={entry.playerId} className={`podium-card position-${entry.position}`} type="button" onClick={() => setSelectedPlayer(entry.player)}>
                <Badge tone={entry.position === 1 ? "success" : "warning"}>#{entry.position}</Badge>
                <Avatar src={entry.player.avatar} name={entry.player.fullName} size="lg" />
                <strong>{entry.player.fullName}</strong>
                <span>{entry.player.categoryName}</span>
                <b>{entry.points} pts</b>
              </button>
            ))}
          </section>

          <Card>
            <div className="ranking-pro-list">
              {tableEntries.map((entry) => (
                <button
                  key={entry.playerId}
                  className={entry.playerId === user.id ? "ranking-pro-row is-current" : "ranking-pro-row"}
                  type="button"
                  onClick={() => setSelectedPlayer(entry.player)}
                >
                  <strong>#{entry.position}</strong>
                  <Avatar src={entry.player.avatar} name={entry.player.fullName} size="sm" />
                  <span>{entry.player.fullName}</span>
                  <span>{entry.player.categoryName}</span>
                  <b>{entry.points} pts</b>
                </button>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <EmptyState title="Sin ranking para esta categoria" description="Cuando haya puntos registrados, la tabla se mostrara aca." />
      )}

      <Modal open={Boolean(selectedPlayer)} title="Perfil deportivo" onClose={() => setSelectedPlayer(null)}>
        {selectedPlayer ? (
          <div className="profile-modal">
            <Avatar src={selectedPlayer.avatar} name={selectedPlayer.fullName} size="lg" />
            <h3>{selectedPlayer.fullName}</h3>
            <div className="info-list">
              <span>Categoria: {selectedPlayer.categoryName}</span>
              <span>Ranking: #{selectedPlayer.ranking}</span>
              <span>Puntos: {selectedPlayer.points}</span>
              <span>Partidos: {selectedPlayer.stats.played}</span>
              <span>Victorias: {selectedPlayer.stats.wins}</span>
              <span>Derrotas: {selectedPlayer.stats.losses}</span>
              <span>Torneos: {selectedPlayer.stats.tournaments}</span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
