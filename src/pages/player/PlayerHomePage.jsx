import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  MapPin,
  Medal,
  Star,
  Trophy,
  UsersRound,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { StatCard } from "../../components/common/StatCard";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { matchService } from "../../services/matchService";
import { notificationService } from "../../services/notificationService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency, formatDate } from "../../utils/formatters";

export function PlayerHomePage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [matches, tournaments, notifications] = await Promise.all([
      matchService.getPlayerMatches(user.id),
      tournamentService.getTournaments(),
      notificationService.getNotificationsByRole("player"),
    ]);
    return { matches, tournaments, notifications };
  }, [user.id]);

  if (loading) return <LoadingState message="Cargando tu dashboard..." />;
  if (error) return <ErrorState title="No pudimos cargar el inicio del jugador." onRetry={reload} />;

  const nextMatch = data.matches.find((match) => match.status !== "Finalizado");
  const featuredTournament = data.tournaments.find((tournament) => tournament.status === "Inscripciones abiertas");
  const latestResults = data.matches.filter((match) => match.status === "Finalizado");
  const importantNotifications = data.notifications.filter((notification) => !notification.read).slice(0, 3);

  return (
    <div className="page-stack player-dashboard">
      <section className="player-hero">
        <div className="hero-copy">
          <span className="eyebrow">Circuito activo</span>
          <h1>
            Hola, <strong>{user.firstName}</strong>
          </h1>
        </div>
        <div className="hero-sport-graphic" aria-hidden="true">
          <span className="tennis-ball" />
          <span className="speed-line speed-line--one" />
          <span className="speed-line speed-line--two" />
          <span className="speed-line speed-line--three" />
        </div>
      </section>

      <div className="stats-grid">
        <StatCard label="Categoria" value={user.categoryName} description="Tu categoria actual" icon={UsersRound} />
        <StatCard label="Ranking" value={`#${user.ranking}`} description="Entre los mejores" icon={Medal} tone="orange" />
        <StatCard label="Puntos" value={user.points} description="Puntos acumulados" icon={Star} />
      </div>

      <section className="dashboard-columns dashboard-columns--featured">
        {nextMatch ? (
          <Card className="feature-card next-match-card">
            <div className="section-title">
              <span>Proximo partido</span>
              <Badge tone="warning">Programado</Badge>
            </div>
            <div className="match-rival-block">
              <Avatar src={nextMatch.opponentAvatar} name={nextMatch.opponent} />
              <div>
                <span>Rival</span>
                <strong>{nextMatch.opponent}</strong>
              </div>
            </div>
            <div className="feature-divider" />
            <h2>{nextMatch.tournament}</h2>
            <p>
              {nextMatch.category} / {nextMatch.round}
            </p>
            <div className="feature-meta">
              <span>
                <CalendarDays size={17} /> {formatDate(nextMatch.date)} - {nextMatch.time}
              </span>
              <span>
                <MapPin size={17} /> {nextMatch.court}
              </span>
            </div>
            <Link className="button button--orange button--lg button--full" to={`/player/matches/${nextMatch.id}`}>
              <span>Ver partido</span>
            </Link>
          </Card>
        ) : null}

        {featuredTournament ? (
          <Card className="feature-card open-tournament-card">
            <div className="section-title">
              <span>Torneos abiertos</span>
              <Badge tone="success">Inscripciones abiertas</Badge>
            </div>
            <div className="tournament-feature-title">
              <div className="feature-icon">
                <Trophy size={28} />
              </div>
              <div>
                <h2>{featuredTournament.name}</h2>
                <p>{featuredTournament.description}</p>
              </div>
            </div>
            <div className="feature-divider" />
            <div className="tournament-metrics">
              <span>
                <CalendarDays size={17} />
                <b>{formatDate(featuredTournament.startDate)}</b>
                {featuredTournament.type}
              </span>
              <span>
                <b>Categoria</b>
                GAME 1000
              </span>
              <span>
                <b>Inscripcion</b>
                {formatCurrency(featuredTournament.price)}
              </span>
            </div>
            <Link className="button button--outline-green button--lg button--full" to={`/player/tournaments/${featuredTournament.id}`}>
              <span>Ver torneo</span>
            </Link>
          </Card>
        ) : null}
      </section>

      <section className="dashboard-columns">
        <Card className="results-card">
          <div className="section-title">
            <span>Ultimos resultados</span>
          </div>
          <div className="compact-list">
            {latestResults.map((match, index) => (
              <div key={match.id} className="result-row">
                <div>
                  <strong>{match.opponent}</strong>
                  <span>
                    {match.tournament} - {match.result}
                  </span>
                </div>
                <Badge tone="success">Victoria</Badge>
                <b>+{index === 0 ? 120 : 90} pts</b>
              </div>
            ))}
          </div>
          <Link className="inline-link" to="/player/matches">
            Ver todos <ArrowRight size={18} />
          </Link>
        </Card>
        <Card className="important-card">
          <div className="section-title">
            <span>Importantes</span>
            <Bell size={18} />
          </div>
          <div className="compact-list">
            {importantNotifications.map((notification) => (
              <Link key={notification.id} className="notice-row" to="/player/notifications">
                <span className={`notice-icon notice-icon--${notification.type.toLowerCase()}`}>
                  {notification.type === "Disciplina" ? (
                    <AlertTriangle size={22} />
                  ) : notification.type === "Cambio" ? (
                    <Zap size={22} />
                  ) : (
                    <CalendarDays size={22} />
                  )}
                </span>
                <div>
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
          <Link className="inline-link" to="/player/notifications">
            Ver todas <ArrowRight size={18} />
          </Link>
        </Card>
      </section>
    </div>
  );
}
