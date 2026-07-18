import { useMemo, useState } from "react";
import { Camera, ChevronDown, Pencil, Send } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Select } from "../../components/common/Select";
import { useAuth } from "../../context/AuthContext";
import { mockCategories } from "../../mocks/mockCategories";
import { matchService } from "../../services/matchService";
import { tournamentService } from "../../services/tournamentService";

export function PlayerProfilePage() {
  const { user } = useAuth();
  const [descentCategoryId, setDescentCategoryId] = useState("cat-m5");
  const [requestStatus, setRequestStatus] = useState("Sin solicitud enviada");
  const matches = matchService.getPlayerMatches();
  const tournaments = tournamentService.getTournaments().filter((tournament) => tournament.participants?.includes(user.id));
  const winRate = user.stats.played ? Math.round((user.stats.wins / user.stats.played) * 100) : 0;
  const lowerCategories = useMemo(
    () =>
      mockCategories
        .filter((category) => category.status === "Activa" && category.branch === user.gender && category.level > 4)
        .map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` })),
    [user.gender],
  );

  function requestDescent() {
    const category = mockCategories.find((item) => item.id === descentCategoryId);
    setRequestStatus(`Solicitud pendiente para ${category?.name || "categoria seleccionada"}`);
  }

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
          <Select label="Categoria inferior" value={descentCategoryId} onChange={setDescentCategoryId} options={lowerCategories} />
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
