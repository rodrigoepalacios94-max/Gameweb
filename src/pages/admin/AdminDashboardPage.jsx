import { Link } from "react-router-dom";
import { AlertTriangle, CalendarCheck, MessageSquareWarning, ShieldAlert, Trophy, UserCheck, UsersRound } from "lucide-react";
import { Badge } from "../../components/common/Badge";
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
    activeTournaments,
    openTournaments,
    pendingMatches,
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
          <h1>Resumen general</h1>
          <p>Vista rapida del circuito, torneos activos y pendientes reales de gestion.</p>
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

        <Card>
          <div className="section-title">
            <span>Resumen de pendientes</span>
          </div>
          <div className="compact-list">
            <Link className="notice-row" to="/admin/matches">
              <span className="notice-icon notice-icon--partido"><CalendarCheck size={21} /></span>
              <div>
                <strong>Partidos pendientes</strong>
                <span>{pendingMatches.length} partidos entre pendientes, programados o reprogramados.</span>
              </div>
              <Badge tone="info">{pendingMatches.length}</Badge>
            </Link>
            <Link className="notice-row" to="/admin/requests">
              <span className="notice-icon notice-icon--categoria"><MessageSquareWarning size={21} /></span>
              <div>
                <strong>Solicitudes pendientes</strong>
                <span>{pendingDescents.length} solicitudes de descenso por revisar.</span>
              </div>
              <Badge tone={pendingDescents.length ? "warning" : "neutral"}>{pendingDescents.length}</Badge>
            </Link>
            <Link className="notice-row" to="/admin/discipline">
              <span className="notice-icon notice-icon--disciplina"><ShieldAlert size={21} /></span>
              <div>
                <strong>Disciplina pendiente</strong>
                <span>{pendingClaims.length} reclamos pendientes y {blockedPlayers.length} jugadores bloqueados.</span>
              </div>
              <Badge tone={pendingClaims.length ? "warning" : "neutral"}>{pendingClaims.length}</Badge>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
