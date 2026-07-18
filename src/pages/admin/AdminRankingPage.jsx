import { useState } from "react";
import { Pencil } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Select } from "../../components/common/Select";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { rankingService } from "../../services/rankingService";

export function AdminRankingPage() {
  const [categoryId, setCategoryId] = useState("cat-m4");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [categories, entries] = await Promise.all([
      categoryService.getCategories(),
      rankingService.getRankingByCategory(categoryId),
    ]);
    return { categories, entries };
  }, [categoryId]);

  if (loading) return <LoadingState message="Cargando ranking admin..." />;
  if (error) return <ErrorState title="No pudimos cargar ranking admin." onRetry={reload} />;

  const { categories, entries } = data;

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Gestion</span>
          <h1>Ranking</h1>
          <p>Posiciones, jugadores, categorias y puntos administrables del circuito.</p>
        </div>
        <Button icon={Pencil}>Ajustar puntos</Button>
      </header>

      <Card>
        <Select label="Categoria" value={categoryId} onChange={setCategoryId} options={categories.map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` }))} />
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
    </div>
  );
}
