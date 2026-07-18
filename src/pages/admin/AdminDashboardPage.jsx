import { Link } from "react-router-dom";
import { AlertTriangle, CalendarCheck, MessageSquareWarning, Plus, ShieldAlert, Trophy, UserCheck, UsersRound } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { StatCard } from "../../components/common/StatCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import { adminService } from "../../services/adminService";
import { formatDate } from "../../utils/formatters";

export function AdminDashboardPage() {
  const { data, loading, error, reload } = useAsyncData(() => adminService.getDashboardSummary(), []);

  if (loading) return <LoadingState message="Cargando dashboard admin..." />;
  if (error) return <ErrorState title="No pudimos cargar el dashboard admin." onRetry={reload} />;

  const {
    tournaments,
    players,
    notifications: activity,
    activeTournaments,
    openTournaments,
    pendingMatches,
    pendingResults,
    pendingDescents,
    pendingClaims,
    blockedPlayers,
    enrollments,
  } = data;

  return (
    <div className="page-stack">
      <header className="admin-hero">
        <div>
          <span className="eyebrow">Profesor / administrador</span>
          <h1>Centro operativo GAME</h1>
          <p>Torneos, programacion, resultados, ranking y disciplina en un solo panel de control.</p>
        </div>
        <div className="hero-actions">
          <Link className="button button--orange button--lg" to="/admin/tournaments/new">
            <Plus size={18} />
            <span>Crear torneo</span>
          </Link>
          <Link className="button button--outline-green button--lg" to="/admin/matches">
            <CalendarCheck size={18} />
            <span>Gestionar partidos</span>
          </Link>
        </div>
      </header>

      <div className="stats-grid admin-stats">
        <StatCard label="Torneos activos" value={activeTournaments.length} icon={Trophy} />
        <StatCard label="Inscripciones abiertas" value={openTournaments.length} icon={UserCheck} tone="orange" />
        <StatCard label="Jugadores registrados" value={players.length} icon={UsersRound} />
        <StatCard label="Partidos por atender" value={pendingMatches.length} icon={CalendarCheck} tone="orange" />
        <StatCard label="Descensos pendientes" value={pendingDescents.length} icon={MessageSquareWarning} />
        <StatCard label="Reclamos pendientes" value={pendingClaims.length} icon={ShieldAlert} tone="orange" />
        <StatCard label="Jugadores bloqueados" value={blockedPlayers.length} icon={AlertTriangle} />
      </div>

      <div className="dashboard-columns dashboard-columns--featured">
        <Card className="admin-attention-card">
          <div className="section-title">
            <span>Necesita atencion</span>
          </div>
          <div className="compact-list">
            {pendingDescents.map((request) => (
              <Link key={request.id} className="notice-row" to="/admin/requests">
                <span className="notice-icon notice-icon--categoria"><MessageSquareWarning size={21} /></span>
                <div>
                  <strong>Solicitud de descenso</strong>
                  <span>{request.currentCategoryName} a {request.requestedCategoryName}</span>
                </div>
                <Badge tone="warning">{request.status}</Badge>
              </Link>
            ))}
            {pendingResults.slice(0, 2).map((match) => (
              <Link key={match.id} className="notice-row" to={`/admin/matches/${match.id}`}>
                <span className="notice-icon notice-icon--partido"><CalendarCheck size={21} /></span>
                <div>
                  <strong>{match.playerA} vs {match.playerB}</strong>
                  <span>{match.tournament} / {match.status}</span>
                </div>
                <Badge tone={match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
              </Link>
            ))}
            {pendingClaims.map((claim) => (
              <Link key={claim.id} className="notice-row" to="/admin/discipline">
                <span className="notice-icon notice-icon--disciplina"><ShieldAlert size={21} /></span>
                <div>
                  <strong>Reclamo disciplinario</strong>
                  <span>{claim.reportedPlayer} / {claim.reason}</span>
                </div>
                <Badge tone="warning">Pendiente</Badge>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <div className="section-title">
            <span>Torneos y actividad</span>
            <Link className="inline-link inline-link--compact" to="/admin/tournaments">Ver torneos</Link>
          </div>
          <div className="admin-timeline">
            {tournaments.slice(0, 3).map((tournament) => (
              <Link key={tournament.id} className="admin-timeline-item" to={`/admin/tournaments/${tournament.id}`}>
                <div>
                  <strong>{tournament.name}</strong>
                  <span>{formatDate(tournament.startDate)} / {tournament.type}</span>
                </div>
                <Badge tone={tournament.status === "En juego" ? "info" : tournament.status === "Inscripciones abiertas" ? "success" : "neutral"}>
                  {tournament.status}
                </Badge>
              </Link>
            ))}
          </div>
          <div className="info-band">
            <strong>Inscripciones mock</strong>
            <span>{enrollments.filter((registration) => registration.status === "Pendiente de pago").length} pendientes de pago y {enrollments.filter((registration) => registration.status === "Confirmada").length} confirmadas.</span>
          </div>
        </Card>
      </div>

      <Card>
        <div className="section-title">
          <span>Avisos importantes</span>
          <Link className="inline-link inline-link--compact" to="/admin/notifications">Ver todos</Link>
        </div>
        <div className="admin-event-grid">
          {activity.slice(0, 4).map((item) => (
            <Link key={item.id} className="compact-item" to={item.actionTo || "/admin/notifications"}>
              <Badge tone={item.read ? "neutral" : "warning"}>{item.type}</Badge>
              <strong>{item.title}</strong>
              <span>{item.message}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
