import { useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { Card } from "../../components/common/Card";
import { Modal } from "../../components/common/Modal";
import { Select } from "../../components/common/Select";
import { RankingTable } from "../../components/player/RankingTable";
import { useAuth } from "../../context/AuthContext";
import { mockCategories } from "../../mocks/mockCategories";
import { rankingService } from "../../services/rankingService";

export function PlayerRankingPage() {
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState(user.categoryId);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const entries = rankingService.getRankingByCategory(categoryId);

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Ranking</span>
        <h1>Ranking por categoria</h1>
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
        <RankingTable entries={entries} currentPlayerId={user.id} onPlayerClick={setSelectedPlayer} />
      </Card>
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
