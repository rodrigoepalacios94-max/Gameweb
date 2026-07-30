import { useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { Select } from "../../components/common/Select";
import { RankingTable } from "../../components/player/RankingTable";
import { RankingPodium } from "../../components/ranking/RankingPodium";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { rankingService } from "../../services/rankingService";

export function PlayerRankingPage() {
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState(user.categoryId || "");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [categories, entries] = await Promise.all([
      categoryService.getCategories(),
      categoryId ? rankingService.getRankingByCategory(categoryId) : Promise.resolve([]),
    ]);
    return { categories, entries };
  }, [categoryId]);

  if (loading) return <LoadingState message="Cargando ranking..." />;
  if (error) return <ErrorState title="No pudimos cargar el ranking." onRetry={reload} />;

  const { categories, entries } = data;
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const currentEntry = entries.find((entry) => entry.playerId === user.id);
  const currentRankingPlayerId = currentEntry?.playerId || null;

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Ranking</span>
        <h1>Ranking del circuito</h1>
        <p>Consulta las posiciones de cada categoria.</p>
      </header>

      <Card>
        <Select
          label="Categoría"
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: "", label: "Seleccioná una categoría" },
            ...categories.filter((category) => category.status === "Activa").map((category) => ({
              value: category.id,
              label: `${category.name} ${category.branch}`,
            })),
          ]}
        />
      </Card>

      {entries.length ? (
        <>
          <RankingPodium entries={entries} currentPlayerId={currentRankingPlayerId} onPlayerClick={setSelectedPlayer} />

          <Card>
            <div className="section-title">
              <span>Ranking completo - {selectedCategory ? `${selectedCategory.name} ${selectedCategory.branch}` : "Categoría"}</span>
              <strong>{currentEntry ? `TU POSICION #${currentEntry.position}` : `${entries.length} jugadores`}</strong>
            </div>
            <RankingTable entries={entries} currentPlayerId={currentRankingPlayerId} onPlayerClick={setSelectedPlayer} />
          </Card>
        </>
      ) : (
        <EmptyState title="EL RANKING TODAVÍA NO TIENE DATOS" description="Cuando haya puntos registrados, la tabla se mostrará acá." />
      )}

      <Modal open={Boolean(selectedPlayer)} title="Perfil deportivo" onClose={() => setSelectedPlayer(null)}>
        {selectedPlayer ? (
          <div className="profile-modal">
            <Avatar src={selectedPlayer.avatar} name={selectedPlayer.fullName} size="lg" />
            <h3>{selectedPlayer.fullName}</h3>
            <div className="info-list">
              <span>Categoría: {selectedPlayer.categoryName}</span>
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
