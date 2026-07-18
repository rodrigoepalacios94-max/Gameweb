import { Link, useParams } from "react-router-dom";
import { Ban, Pencil, RotateCcw, ShieldAlert } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { mockDescentRequests } from "../../mocks/mockAdmin";
import { mockDiscipline } from "../../mocks/mockDiscipline";
import { matchService } from "../../services/matchService";
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";
import { formatDate } from "../../utils/formatters";

export function AdminPlayerDetailPage() {
  const { id } = useParams();
  const player = playerService.getPlayerById(id);

  if (!player) {
    return <EmptyState title="Jugador no encontrado" description="No existe un jugador mock con ese identificador." />;
  }

  const matches = matchService.getMatches().filter((match) => match.playerAId === id || match.playerBId === id);
  const tournaments = tournamentService.getTournaments().filter((tournament) => tournament.participants?.includes(id));
  const requests = mockDescentRequests.filter((request) => request.playerId === id);
  const faults = mockDiscipline.faults.filter((fault) => fault.playerId === id);

  return (
    <div className="page-stack">
      <section className="profile-header">
        <Avatar src={player.avatar} name={player.fullName} size="xl" />
        <div>
          <span className="eyebrow">Detalle jugador</span>
          <h1>{player.fullName}</h1>
          <p>{player.categoryName} / Ranking #{player.ranking} / {player.points} pts</p>
          <div className="hero-meta-row">
            <Badge tone={player.status === "Activo" ? "success" : player.status.includes("Bloqueado") ? "danger" : "warning"}>{player.status}</Badge>
            <Badge tone={player.discipline.faults >= 3 ? "danger" : player.discipline.faults > 0 ? "warning" : "success"}>
              Disciplina {player.discipline.faults}/{player.discipline.limit}
            </Badge>
          </div>
        </div>
      </section>

      <div className="card-actions">
        <Button variant="secondary" icon={Pencil}>Cambiar categoria</Button>
        <Button variant="secondary" icon={Pencil}>Modificar ranking/puntos</Button>
        <Button variant="ghost" icon={Ban}>Bloquear</Button>
        <Button variant="ghost" icon={RotateCcw}>Desbloquear</Button>
      </div>

      <div className="detail-grid">
        <Card>
          <h2>Informacion personal</h2>
          <div className="info-list">
            <span>DNI: {player.dni || "No informado"}</span>
            <span>Fecha de nacimiento: {player.birthDate ? formatDate(player.birthDate) : "No informada"}</span>
            <span>Sexo: {player.gender || "No informado"}</span>
            <span>Telefono: {player.phone || "No informado"}</span>
            <span>Email: {player.email || "No informado"}</span>
          </div>
        </Card>
        <Card>
          <h2>Historial deportivo</h2>
          <div className="info-list">
            <span>Partidos: {player.stats.played}</span>
            <span>Victorias: {player.stats.wins}</span>
            <span>Derrotas: {player.stats.losses}</span>
            <span>Torneos: {player.stats.tournaments}</span>
            <span>Estado disciplinario: {player.discipline.status}</span>
          </div>
        </Card>
      </div>

      <div className="detail-grid">
        <Card>
          <h2>Torneos</h2>
          <div className="compact-list">
            {tournaments.map((tournament) => (
              <Link key={tournament.id} className="compact-item" to={`/admin/tournaments/${tournament.id}`}>
                <strong>{tournament.name}</strong>
                <span>{tournament.type} / {tournament.status}</span>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <h2>Partidos</h2>
          <div className="compact-list">
            {matches.map((match) => (
              <Link key={match.id} className="compact-item" to={`/admin/matches/${match.id}`}>
                <strong>{match.playerA} vs {match.playerB}</strong>
                <span>{match.tournament} / {match.round} / {match.status}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="detail-grid">
        <Card>
          <h2>Faltas y bloqueos</h2>
          {faults.length ? (
            <div className="compact-list">
              {faults.map((fault) => (
                <div key={fault.id} className="discipline-match-row">
                  <ShieldAlert size={18} />
                  <div>
                    <strong>{fault.reason}</strong>
                    <span>{formatDate(fault.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Sin faltas confirmadas en los mocks.</p>
          )}
        </Card>
        <Card>
          <h2>Solicitudes de descenso</h2>
          {requests.length ? (
            <div className="compact-list">
              {requests.map((request) => (
                <Link key={request.id} className="compact-item" to="/admin/requests">
                  <strong>{request.currentCategoryName} a {request.requestedCategoryName}</strong>
                  <span>{formatDate(request.date)} / {request.status}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted">No hay solicitudes registradas para este jugador.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
