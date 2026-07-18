import { useState } from "react";
import { Pencil } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Select } from "../../components/common/Select";
import { mockCategories } from "../../mocks/mockCategories";
import { rankingService } from "../../services/rankingService";

export function AdminRankingPage() {
  const [categoryId, setCategoryId] = useState("cat-m4");
  const entries = rankingService.getRankingByCategory(categoryId);
  const movements = rankingService.getMovementsByPlayer("player-1");

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Gestion</span>
          <h1>Ranking</h1>
          <p>Ranking por categoria, movimientos de puntos y ajustes manuales auditables para futuras integraciones.</p>
        </div>
        <Button icon={Pencil}>Ajustar puntos</Button>
      </header>

      <div className="detail-grid">
        <Card>
          <Select label="Categoria" value={categoryId} onChange={setCategoryId} options={mockCategories.map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` }))} />
          <div className="admin-table ranking-admin-table">
            {entries.map((entry) => (
              <div key={entry.playerId} className="admin-table-row admin-table-row--ranking">
                <strong>#{entry.position}</strong>
                <Avatar src={entry.player.avatar} name={entry.player.fullName} size="sm" />
                <span>{entry.player.fullName}</span>
                <span>{entry.player.categoryName}</span>
                <b>{entry.points} pts</b>
                <Badge tone={entry.position <= 4 ? "info" : "neutral"}>{entry.position <= 4 ? "Siembra" : "Ranking"}</Badge>
              </div>
            ))}
          </div>
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
          <div className="info-band">
            <strong>Regla aplicada</strong>
            <span>El ranking general se usa para cabezas de serie y desempates. No otorga byes ni reemplaza el orden de preliminares.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
