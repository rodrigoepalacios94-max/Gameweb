import { AlertTriangle, CalendarCheck, ShieldAlert, Trophy, UserCheck, UsersRound } from "lucide-react";
import { Card } from "../../components/common/Card";
import { StatCard } from "../../components/common/StatCard";
import { mockDiscipline } from "../../mocks/mockDiscipline";
import { matchService } from "../../services/matchService";
import { notificationService } from "../../services/notificationService";
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";

export function AdminDashboardPage() {
  const tournaments = tournamentService.getTournaments();
  const players = playerService.getPlayers();
  const matches = matchService.getMatches();
  const activity = notificationService.getNotificationsByRole("admin");

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Administrador</span>
        <h1>Dashboard</h1>
        <p>Estado operativo del circuito GAME.</p>
      </header>
      <div className="stats-grid admin-stats">
        <StatCard label="Torneos activos" value={tournaments.filter((item) => item.status === "En juego").length} icon={Trophy} />
        <StatCard label="Inscripciones abiertas" value={tournaments.filter((item) => item.status === "Inscripciones abiertas").length} icon={UserCheck} tone="orange" />
        <StatCard label="Partidos pendientes" value={matches.filter((item) => item.status !== "Finalizado").length} icon={CalendarCheck} />
        <StatCard label="Jugadores registrados" value={players.length} icon={UsersRound} tone="orange" />
        <StatCard label="Descensos pendientes" value="2" icon={AlertTriangle} />
        <StatCard label="Reclamos pendientes" value={mockDiscipline.claims.filter((claim) => claim.status === "Pendiente").length} icon={ShieldAlert} tone="orange" />
        <StatCard label="Jugadores bloqueados" value={players.filter((player) => player.status.includes("Bloqueado")).length} icon={ShieldAlert} />
      </div>
      <Card>
        <div className="section-title">
          <span>Actividad reciente</span>
        </div>
        <div className="compact-list">
          {activity.map((item) => (
            <div key={item.id} className="compact-item">
              <strong>{item.title}</strong>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
