import { useEffect, useState } from "react";
import { Camera, ChevronDown, Pencil, Send } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Select } from "../../components/common/Select";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { matchService } from "../../services/matchService";
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";

export function PlayerProfilePage() {
  const { user } = useAuth();
  const [descentCategoryId, setDescentCategoryId] = useState("cat-m5");
  const [requestStatus, setRequestStatus] = useState("Sin solicitud enviada");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [matches, tournaments, categoryRules] = await Promise.all([
      matchService.getPlayerMatches(user.id),
      tournamentService.getTournaments(),
      categoryService.getCategoryRulesForPlayer(user.id),
    ]);
    return {
      matches,
      tournaments: tournaments.filter((tournament) => tournament.participants?.includes(user.id)),
      lowerCategories: categoryRules.lowerCategories,
    };
  }, [user.id]);
  const winRate = user.stats.played ? Math.round((user.stats.wins / user.stats.played) * 100) : 0;

  useEffect(() => {
    if (data?.lowerCategories?.[0]) setDescentCategoryId(data.lowerCategories[0].id);
  }, [data]);

  async function requestDescent() {
    const request = await playerService.requestCategoryDowngrade(user.id, descentCategoryId);
    setRequestStatus(`Solicitud pendiente para ${request?.requestedCategoryName || "categoria seleccionada"}`);
  }

  if (loading) return <LoadingState message="Cargando perfil..." />;
  if (error) return <ErrorState title="No pudimos cargar tu perfil." onRetry={reload} />;

  const { matches, tournaments, lowerCategories } = data;
  const lowerCategoryOptions = lowerCategories.map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` }));

  return (
    <div className="page-stack">
      <section className="profile-header">
        <Avatar src={user.avatar} name={user.fullName} size="xl" />
        <div>
          <span className="eyebrow">Perfil jugador</span>
          <h1>{user.fullName}</h1>
          <p>{user.categoryName} / Ranking #{user.ranking} / {user.points} pts</p>
          <div className="hero-meta-row">
            <Badge tone={user.status === "Activo" ? "success" : "warning"}>{user.status}</Badge>
            <Badge tone={user.discipline.faults >= 3 ? "danger" : user.discipline.faults > 0 ? "warning" : "success"}>
              Disciplina {user.discipline.faults}/{user.discipline.limit}
            </Badge>
          </div>
        </div>
      </section>

      <div className="card-actions">
        <Button variant="secondary" icon={Pencil}>Editar perfil</Button>
        <Button variant="ghost" icon={Camera}>Cambiar foto</Button>
      </div>

      <section className="profile-stat-grid">
        <Card className="stat-card">
          <span>Partidos</span>
          <strong>{user.stats.played}</strong>
          <small>{user.stats.wins} victorias / {user.stats.losses} derrotas</small>
        </Card>
        <Card className="stat-card stat-card--orange">
          <span>Efectividad</span>
          <strong>{winRate}%</strong>
          <small>Calculado desde estadisticas mock</small>
        </Card>
        <Card className="stat-card">
          <span>Torneos</span>
          <strong>{user.stats.tournaments}</strong>
          <small>{tournaments.length} visibles en el portal</small>
        </Card>
      </section>

      <div className="detail-grid">
        <Card>
          <h2>Datos personales</h2>
          <div className="info-list">
            <span>Nombre: {user.firstName}</span>
            <span>Apellido: {user.lastName}</span>
            <span>DNI: {user.dni}</span>
            <span>Telefono: {user.phone}</span>
            <span>Email: {user.email}</span>
            <span>Categoria actual: {user.categoryName}</span>
          </div>
        </Card>

        <Card>
          <h2>Estado disciplinario</h2>
          <div className="info-list">
            <span>Estado: {user.discipline.status}</span>
            <span>Faltas confirmadas: {user.discipline.faults}/{user.discipline.limit}</span>
            <span>Bloqueo automatico al llegar a 3 faltas confirmadas</span>
          </div>
        </Card>
      </div>

      <div className="detail-grid">
        <Card className="descent-card">
          <div>
            <span className="eyebrow">Categorias</span>
            <h2>Solicitud de descenso</h2>
            <p>El jugador no puede inscribirse directamente en una categoria inferior. La solicitud queda pendiente para revision del profesor.</p>
          </div>
          <Select label="Categoria inferior" value={descentCategoryId} onChange={setDescentCategoryId} options={lowerCategoryOptions} />
          <Button variant="outline-green" icon={Send} onClick={requestDescent}>Solicitar descenso</Button>
          <Badge tone={requestStatus.includes("pendiente") ? "warning" : "neutral"}>{requestStatus}</Badge>
        </Card>

        <Card>
          <h2>Ultimos partidos</h2>
          <div className="history-list">
            {matches.slice(0, 4).map((match) => (
              <span key={match.id}>
                <ChevronDown size={15} />
                {match.tournament} / {match.round} / {match.status}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
