import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Select } from "../../components/common/Select";
import { RankingTable } from "../../components/player/RankingTable";
import { mockCategories } from "../../mocks/mockCategories";
import { rankingService } from "../../services/rankingService";

export function AdminRankingPage() {
  const [categoryId, setCategoryId] = useState("cat-m4");
  const entries = rankingService.getRankingByCategory(categoryId);
  const movements = rankingService.getMovementsByPlayer("player-1");

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions">
        <div>
          <span className="eyebrow">Gestion</span>
          <h1>Ranking</h1>
        </div>
        <Button icon={Pencil}>Ajustar puntos</Button>
      </header>
      <div className="detail-grid">
        <Card>
          <Select label="Categoria" value={categoryId} onChange={setCategoryId} options={mockCategories.map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` }))} />
          <RankingTable entries={entries} />
        </Card>
        <Card>
          <h2>Historial de movimientos</h2>
          <div className="compact-list">
            {movements.map((movement) => (
              <div key={movement.id} className="compact-item movement">
                <strong>{movement.concept}</strong>
                <span>{movement.tournament}</span>
                <b>+{movement.points} pts</b>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
