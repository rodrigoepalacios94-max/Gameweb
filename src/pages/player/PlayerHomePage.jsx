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
import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { StatCard } from "../../components/common/StatCard";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { availabilityService } from "../../services/availabilityService";
import { matchService } from "../../services/matchService";
import { notificationService } from "../../services/notificationService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency, formatDate } from "../../utils/formatters";

export function PlayerHomePage() {
  const { user } = useAuth();
  const [selectedUnavailableSlots, setSelectedUnavailableSlots] = useState([]);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [matches, tournaments, notifications, attendanceRequests] = await Promise.all([
      matchService.getPlayerMatches(user.id),
      tournamentService.getTournaments(),
      notificationService.getNotificationsByRole("player"),
      availabilityService.getPlayerAttendanceRequests(user.id),
    ]);
    return { matches, tournaments, notifications, attendanceRequests };
  }, [user.id]);

  if (loading) return <LoadingState message="Cargando tu dashboard..." />;
  if (error) return <ErrorState title="No pudimos cargar el inicio del jugador." onRetry={reload} />;

  const scheduledNextMatch = data.matches.find((match) => match.status !== "Finalizado");
  const featuredTournament = data.tournaments.find((tournament) => tournament.status === "Inscripciones abiertas");
  const latestResults = data.matches.filter((match) => match.status === "Finalizado");
  const importantNotifications = data.notifications.filter((notification) => !notification.read).slice(0, 3);
  const attendanceRequest = data.attendanceRequests.find((match) => match.needsAttendanceConfirmation) || data.attendanceRequests[0];
  const nextMatch = attendanceRequest || scheduledNextMatch;

  function toggleUnavailableSlot(slot) {
    setSelectedUnavailableSlots((current) => (current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]));
  }

  async function confirmAttendance() {
    if (!attendanceRequest) return;
    await availabilityService.confirmAttendance(attendanceRequest.id, user.id, selectedUnavailableSlots);
    setSelectedUnavailableSlots([]);
    setAttendanceModalOpen(false);
    reload();
  }

  function getNextMatchBadge(match) {
    if (match.needsAttendanceConfirmation) return { tone: "warning", label: "Asistencia pendiente" };
    if (match.status === "Programado") return { tone: "warning", label: "Programado" };
    if (match.status === "Listo para programar") return { tone: "success", label: "Listo para programar" };
    if (match.attendance && match.pendingRival) return { tone: "info", label: "Esperando rival" };
    if (match.attendance) return { tone: "success", label: "Disponibilidad enviada" };
    return { tone: "info", label: match.status };
  }

  const nextMatchBadge = nextMatch ? getNextMatchBadge(nextMatch) : null;

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
              <Badge tone={nextMatchBadge.tone}>{nextMatchBadge.label}</Badge>
            </div>
            <div className="match-rival-block">
              <Avatar src={nextMatch.opponentAvatar} name={nextMatch.opponent || "A definir"} />
              <div>
                <span>Rival</span>
                <strong>{nextMatch.pendingRival ? "A definir" : nextMatch.opponent}</strong>
              </div>
            </div>
            <div className="feature-divider" />
            <h2>{nextMatch.tournament}</h2>
            <p>
              {nextMatch.category} / {nextMatch.round}
            </p>
            {nextMatch.status === "Programado" ? (
              <div className="feature-meta">
                <span>
                  <CalendarDays size={17} /> {formatDate(nextMatch.date)} - {nextMatch.time}
                </span>
                <span>
                  <MapPin size={17} /> {nextMatch.court}
                </span>
              </div>
            ) : null}
            {nextMatch.needsAttendanceConfirmation ? (
              <Button className="button--full" onClick={() => setAttendanceModalOpen(true)}>Confirmar asistencia</Button>
            ) : nextMatch.status === "Programado" ? (
              <Link className="button button--orange button--lg button--full" to={`/player/matches/${nextMatch.id}`}>
                <span>Ver partido</span>
              </Link>
            ) : (
              <div className="info-band">
                <strong>{nextMatch.attendance ? "Disponibilidad enviada" : nextMatch.status}</strong>
                <span>{nextMatch.pendingRival ? "Esperando rival" : nextMatch.status === "Listo para programar" ? "Listo para programar" : "GAME esta procesando el proximo paso del partido."}</span>
              </div>
            )}
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

      <Modal open={attendanceModalOpen} title="Confirmar asistencia" size="lg" onClose={() => setAttendanceModalOpen(false)}>
        {attendanceRequest ? (
          <div className="match-result-modal">
            <div className="match-format-panel">
              <div className="info-list">
                <span>Torneo: {attendanceRequest.tournament}</span>
                <span>Categoria: {attendanceRequest.category}</span>
                <span>Ronda: {attendanceRequest.round}</span>
                <span>Rival: {attendanceRequest.pendingRival ? "A definir" : attendanceRequest.opponent}</span>
              </div>
            </div>
            <p className="muted">Marca unicamente los horarios en los que no podes jugar.</p>
            <div className="availability-days">
              {(attendanceRequest.availableSlotsByDay || []).map((day) => (
                <section key={day.key} className="availability-day">
                  <strong>{day.label}</strong>
                  <span>{day.date ? formatDate(day.date) : ""}</span>
                  <div className="slot-grid slot-grid--compact">
                    {day.slots.map((slot) => (
                      <label key={slot.id} className={selectedUnavailableSlots.includes(slot.value) ? "check-pill is-selected" : "check-pill"}>
                        <input type="checkbox" checked={selectedUnavailableSlots.includes(slot.value)} onChange={() => toggleUnavailableSlot(slot.value)} />
                        <strong>{slot.time}</strong>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="wizard-actions">
              <Button variant="ghost" onClick={() => setAttendanceModalOpen(false)}>Cancelar</Button>
              <Button onClick={confirmAttendance}>Confirmar asistencia</Button>
            </div>
          </div>
        ) : null}
      </Modal>

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
