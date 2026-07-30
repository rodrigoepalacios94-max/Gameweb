import { useEffect, useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Select } from "../../components/common/Select";
import { RankingPodium } from "../../components/ranking/RankingPodium";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { rankingService } from "../../services/rankingService";

export function AdminRankingPage() {
  const [categoryId, setCategoryId] = useState("");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const categories = await categoryService.getCategories();
    let selectedCategoryId = categoryId || categories.find((category) => category.status === "Activa")?.id || categories[0]?.id || "";
    let entries = selectedCategoryId ? await rankingService.getRankingByCategory(selectedCategoryId) : [];
    if (!categoryId && !entries.length) {
      for (const category of categories) {
        const categoryEntries = await rankingService.getRankingByCategory(category.id);
        if (categoryEntries.length) {
          selectedCategoryId = category.id;
          entries = categoryEntries;
          break;
        }
      }
    }
    return { categories, entries, selectedCategoryId };
  }, [categoryId]);

  useEffect(() => {
    if (!categoryId && data?.selectedCategoryId) setCategoryId(data.selectedCategoryId);
  }, [categoryId, data]);

  if (loading) return <LoadingState message="Cargando ranking admin..." />;
  if (error) return <ErrorState title="No pudimos cargar ranking admin." onRetry={reload} />;

  const { categories, entries } = data;
  const selectedCategory = categories.find((category) => category.id === categoryId);

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Gestion</span>
        <h1>Ranking</h1>
        <p>La posicion se calcula automaticamente por puntos dentro de la categoria seleccionada.</p>
      </header>

      <Card>
        <Select label="Categoría" value={categoryId} onChange={setCategoryId} options={categories.map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` }))} />
      </Card>

      {entries.length ? (
        <>
          <RankingPodium entries={entries} />

          <Card>
            <div className="section-title">
              <span>Listado completo - {selectedCategory ? `${selectedCategory.name} ${selectedCategory.branch}` : "Categoría"}</span>
              <Badge tone="info">{entries.length} jugadores con puntos</Badge>
            </div>
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
        </>
      ) : (
        <EmptyState title="EL RANKING TODAVÍA NO TIENE DATOS" description="Los jugadores con 0 puntos no aparecen en el Ranking Global activo." />
      )}
    </div>
  );
}
