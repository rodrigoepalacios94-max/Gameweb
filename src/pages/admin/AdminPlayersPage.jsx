import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Plus } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { SearchInput } from "../../components/common/SearchInput";
import { Select } from "../../components/common/Select";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { playerService } from "../../services/playerService";
import { normalizeText } from "../../utils/formatters";

export function AdminPlayersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [categoryId, setCategoryId] = useState("Todos");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [players, categories] = await Promise.all([
      playerService.getPlayers(),
      categoryService.getCategories(),
    ]);
    return { players, categories };
  }, []);
  const players = data?.players || [];
  const categories = data?.categories || [];
  const filteredPlayers = useMemo(
    () =>
      players.filter((player) => {
        const matchesQuery = normalizeText(player.fullName).includes(normalizeText(query));
        const matchesStatus = status === "Todos" || player.status === status;
        const matchesCategory = categoryId === "Todos" || player.categoryId === categoryId;
        return matchesQuery && matchesStatus && matchesCategory;
      }),
    [players, query, status, categoryId],
  );

  if (loading) return <LoadingState message="Cargando jugadores..." />;
  if (error) return <ErrorState title="No pudimos cargar jugadores." onRetry={reload} />;

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Gestion</span>
          <h1>Jugadores</h1>
          <p>Consulta estado deportivo, categoria vigente, ranking, puntos, faltas y bloqueos.</p>
        </div>
        <Button icon={Plus}>Nuevo jugador</Button>
      </header>

      <Card>
        <div className="toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar jugador" />
          <Select value={categoryId} onChange={setCategoryId} options={[{ value: "Todos", label: "Todas las categorias" }, ...categories.map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` }))]} />
          <Select value={status} onChange={setStatus} options={["Todos", "Activo", "Suspendido", "Bloqueado por faltas"].map((item) => ({ value: item, label: item }))} />
        </div>

        {filteredPlayers.length ? (
          <div className="admin-table">
            {filteredPlayers.map((player) => (
              <div key={player.id} className="admin-table-row admin-table-row--players">
                <div className="table-identity">
                  <Avatar src={player.avatar} name={player.fullName} size="sm" />
                  <strong>{player.fullName}</strong>
                </div>
                <span>{player.categoryName}</span>
                <span>#{player.ranking}</span>
                <span>{player.points} pts</span>
                <span>{player.discipline.faults}/{player.discipline.limit}</span>
                <Badge tone={player.status === "Activo" ? "success" : player.status.includes("Bloqueado") ? "danger" : "warning"}>{player.status}</Badge>
                <Link className="button button--outline-green button--sm" to={`/admin/players/${player.id}`}>
                  <Eye size={16} />
                  <span>Ver</span>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Sin jugadores para este filtro" description="Cambia los filtros o registra un nuevo jugador." />
        )}
      </Card>
    </div>
  );
}
