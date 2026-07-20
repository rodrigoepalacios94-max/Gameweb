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
import { Modal } from "../../components/common/Modal";
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
  const [playerFormOpen, setPlayerFormOpen] = useState(false);
  const [playerForm, setPlayerForm] = useState({
    firstName: "",
    lastName: "",
    dni: "",
    birthDate: "",
    gender: "Masculino",
    phone: "",
    email: "",
    categoryId: "",
  });
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
  const activeCategories = categories.filter((category) => category.status === "Activa");

  function openPlayerForm() {
    setPlayerForm((current) => ({ ...current, categoryId: activeCategories[0]?.id || "" }));
    setPlayerFormOpen(true);
  }

  async function createPlayer(event) {
    event.preventDefault();
    await playerService.createPlayer(playerForm);
    setPlayerFormOpen(false);
    setPlayerForm({
      firstName: "",
      lastName: "",
      dni: "",
      birthDate: "",
      gender: "Masculino",
      phone: "",
      email: "",
      categoryId: activeCategories[0]?.id || "",
    });
    reload();
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Gestion</span>
          <h1>Jugadores</h1>
          <p>Consulta estado deportivo, categoria vigente, ranking, puntos, faltas y bloqueos.</p>
        </div>
        <Button icon={Plus} onClick={openPlayerForm}>Nuevo jugador</Button>
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
              <div key={player.id} className={player.status.includes("Bloqueado") ? "admin-table-row admin-table-row--players is-danger" : "admin-table-row admin-table-row--players"}>
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

      <Modal open={playerFormOpen} title="Nuevo jugador" onClose={() => setPlayerFormOpen(false)} size="lg">
        {activeCategories.length ? (
          <form className="modal-form" onSubmit={createPlayer}>
            <div className="form-grid">
              <label>Nombre<input required value={playerForm.firstName} onChange={(event) => setPlayerForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
              <label>Apellido<input required value={playerForm.lastName} onChange={(event) => setPlayerForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
              <label>DNI<input value={playerForm.dni} onChange={(event) => setPlayerForm((current) => ({ ...current, dni: event.target.value }))} /></label>
              <label>Fecha de nacimiento<input type="date" value={playerForm.birthDate} onChange={(event) => setPlayerForm((current) => ({ ...current, birthDate: event.target.value }))} /></label>
              <label>Sexo
                <select value={playerForm.gender} onChange={(event) => setPlayerForm((current) => ({ ...current, gender: event.target.value }))}>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Mixto">Mixto</option>
                </select>
              </label>
              <label>Telefono<input value={playerForm.phone} onChange={(event) => setPlayerForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label>Email<input type="email" value={playerForm.email} onChange={(event) => setPlayerForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label>Categoria
                <select required value={playerForm.categoryId} onChange={(event) => setPlayerForm((current) => ({ ...current, categoryId: event.target.value }))}>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name} {category.branch}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setPlayerFormOpen(false)}>Cancelar</Button>
              <Button type="submit">Crear jugador</Button>
            </div>
          </form>
        ) : (
          <p className="muted">No hay categorias disponibles para registrarse.</p>
        )}
      </Modal>
    </div>
  );
}
