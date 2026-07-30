import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  CreditCard,
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
import { TournamentRegistrationModal } from "../../components/tournaments/TournamentRegistrationModal";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { availabilityService } from "../../services/availabilityService";
import { categoryService } from "../../services/categoryService";
import { enrollmentService } from "../../services/enrollmentService";
import { matchService } from "../../services/matchService";
import { notificationService } from "../../services/notificationService";
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { buildPlayerTournamentViews } from "../../utils/playerTournamentView";
import { getVisibleTournamentDescription } from "../../utils/tournamentDescription";

async function loadOptional(label, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    console.error(`[GAME Player] ${label}`, {
      code: error.code || error.cause?.code || null,
      message: error.message || error.cause?.message || null,
      details: error.details || error.cause?.details || null,
      hint: error.hint || error.cause?.hint || null,
    });
    return fallback;
  }
}

export function PlayerHomePage() {
  const { user } = useAuth();
  const [selectedAvailableSlots, setSelectedAvailableSlots] = useState([]);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [registrationTournament, setRegistrationTournament] = useState(null);
  const [pendingPaymentAction, setPendingPaymentAction] = useState("");
  const [pendingPaymentError, setPendingPaymentError] = useState("");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const currentPlayer = await loadOptional("current player", () => playerService.getCurrentPlayer(), user);
    const [matches, tournaments, categories, enrollments, notifications, attendanceRequests, pendingPayments] = await Promise.all([
      loadOptional("matches", () => matchService.getPlayerMatches(user.id), []),
      loadOptional("visible tournaments", () => tournamentService.getVisibleTournamentsForPlayer(user.id), []),
      loadOptional("categories", () => categoryService.getCategories(), []),
      loadOptional("enrollments", () => enrollmentService.getEnrollmentsByPlayer(user.id), []),
      loadOptional("notifications", () => notificationService.getNotificationsByRole("player"), []),
      loadOptional("attendance requests", () => availabilityService.getPlayerAttendanceRequests(user.id), []),
      loadOptional("pending payments", () => enrollmentService.getPendingPaymentsByPlayer(user.id), []),
    ]);
    return {
      matches,
      tournaments: buildPlayerTournamentViews({ tournaments, categories, currentPlayer, enrollments }),
      currentPlayer,
      enrollments,
      pendingPayments,
      notifications,
      attendanceRequests,
    };
  }, [user.id]);

  if (loading) return <LoadingState message="Cargando tu dashboard..." />;
  if (error) return <ErrorState title="No pudimos cargar el inicio del jugador." onRetry={reload} />;

  const scheduledNextMatch = data.matches.find((match) => match.status !== "Finalizado");
  const openTournaments = data.tournaments.filter(
    (tournament) =>
      tournament.status === "Inscripciones abiertas" &&
      (tournament.eligibleCategories?.length > 0 || tournament.existingEnrollments?.length > 0),
  );
  const latestResults = data.matches.filter((match) => match.status === "Finalizado");
  const importantNotifications = data.notifications.filter((notification) => !notification.read).slice(0, 3);
  const attendanceRequest = data.attendanceRequests.find((match) => match.needsAttendanceConfirmation) || data.attendanceRequests[0];
  const nextMatch = attendanceRequest || scheduledNextMatch;
  const currentPlayer = data.currentPlayer || user;

  function toggleAvailableSlot(slot) {
    setSelectedAvailableSlots((current) => (current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]));
  }

  async function confirmAttendance() {
    if (!attendanceRequest) return;
    await availabilityService.confirmAttendance(attendanceRequest.id, user.id, selectedAvailableSlots);
    setSelectedAvailableSlots([]);
    setAttendanceModalOpen(false);
    reload();
  }

  async function payPendingRegistration(registrationId) {
    setPendingPaymentAction(registrationId);
    setPendingPaymentError("");
    try {
      const result = await enrollmentService.payPendingRegistration(registrationId, user.id);
      if (result.status === "waived") {
        reload();
        return;
      }
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      throw new Error("Mercado Pago no devolvio una URL de checkout.");
    } catch (error) {
      setPendingPaymentError(error.cause?.message || error.message || "No pudimos iniciar Mercado Pago.");
    } finally {
      setPendingPaymentAction("");
    }
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
        <StatCard label="Categoría" value={user.categoryName || "Sin categoría"} description="Tu categoría actual" icon={UsersRound} />
        <StatCard label="Ranking" value={user.ranking ? `#${user.ranking}` : "Sin datos"} description="Entre los mejores" icon={Medal} tone="orange" />
        <StatCard label="Puntos" value={user.points} description="Puntos acumulados" icon={Star} />
      </div>

      {data.pendingPayments?.length ? (
        <section className="pending-payment-stack">
          {pendingPaymentError ? <div className="form-alert">{pendingPaymentError}</div> : null}
          {data.pendingPayments.map((payment) => (
            <Card key={payment.registrationId} className="pending-payment-card">
              <div>
                <span className="eyebrow">Pago pendiente</span>
                <h2>{payment.tournamentName}</h2>
                <p>Tenés una inscripción pendiente de pago.</p>
                <div className="info-list">
                  <span>Categorías: {payment.categories.map((category) => category.name).join(", ")}</span>
                  <span>Total: {formatCurrency(payment.totalAmount)}</span>
                  {payment.paymentDueAt ? <span>Vence: {formatDate(payment.paymentDueAt.slice(0, 10))}</span> : null}
                </div>
              </div>
              <Button variant="orange" disabled={pendingPaymentAction === payment.registrationId} onClick={() => payPendingRegistration(payment.registrationId)}>
                {pendingPaymentAction === payment.registrationId ? "Abriendo..." : "Pagar ahora"}
              </Button>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="dashboard-columns dashboard-columns--featured">
        {nextMatch ? (
          <Card className="feature-card next-match-card">
            <div className="section-title">
              <span>Próximo partido</span>
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
              <Button className="button--full" onClick={() => {
                setSelectedAvailableSlots(nextMatch.selectedAvailableSlots || []);
                setAttendanceModalOpen(true);
              }}>Seleccionar horarios</Button>
            ) : nextMatch.status === "Programado" ? (
              <Link className="button button--orange button--lg button--full" to={`/player/matches/${nextMatch.id}`}>
                <span>Ver partido</span>
              </Link>
            ) : (
              <div className="info-band">
                <strong>{nextMatch.attendance ? "Disponibilidad enviada" : nextMatch.status}</strong>
                <span>{nextMatch.pendingRival ? "Esperando rival" : nextMatch.status === "Listo para programar" ? "Listo para programar" : "GAME está procesando el próximo paso del partido."}</span>
              </div>
            )}
          </Card>
        ) : null}

        {openTournaments.length ? (
          <Card className="feature-card open-tournament-card">
            <div className="section-title">
              <span>Torneos abiertos</span>
              <Badge tone="success">Inscripciones abiertas</Badge>
            </div>
            <div className="dashboard-tournament-list">
              {openTournaments.map((tournament) => {
                const isRegistered = tournament.personalStatus === "INSCRIPTO";
                const canRegister = !isRegistered && tournament.eligibleCategories?.length > 0;
                const description = getVisibleTournamentDescription(tournament.description);
                return (
                  <article key={tournament.id} className="dashboard-tournament-item">
                    <div className="tournament-feature-title">
                      <div className="feature-icon">
                        <Trophy size={28} />
                      </div>
                      <div>
                        <h2>{tournament.name}</h2>
                        {description ? <p>{description}</p> : null}
                      </div>
                    </div>
                    <div className="dashboard-tournament-meta">
                      <span>
                        <CalendarDays size={17} />
                        {formatDate(tournament.startDate)}
                      </span>
                      <span>
                        <CreditCard size={17} />
                        {formatCurrency(tournament.price)}
                      </span>
                      <Badge tone={isRegistered ? "success" : "neutral"}>{tournament.personalStatus}</Badge>
                    </div>
                    <div className="card-actions dashboard-tournament-actions">
                      {canRegister ? (
                        <Button size="sm" variant="primary" onClick={() => setRegistrationTournament(tournament)}>
                          INSCRIBIRME
                        </Button>
                      ) : null}
                      <Link className="button button--outline-green button--sm" to={`/player/tournaments/${tournament.id}`}>
                        <span>VER TORNEO</span>
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </Card>
        ) : null}
      </section>

      <TournamentRegistrationModal
        open={Boolean(registrationTournament)}
        tournament={registrationTournament}
        player={currentPlayer}
        categories={registrationTournament?.playerTournamentCategories || []}
        existingEnrollments={registrationTournament?.existingEnrollments || []}
        onClose={() => setRegistrationTournament(null)}
        onConfirmed={reload}
      />

      <Modal open={attendanceModalOpen} title="Definir disponibilidad" size="lg" onClose={() => setAttendanceModalOpen(false)}>
        {attendanceRequest ? (
          <div className="match-result-modal">
            <div className="match-format-panel">
              <div className="info-list">
                <span>Torneo: {attendanceRequest.tournament}</span>
                <span>Categoría: {attendanceRequest.category}</span>
                <span>Ronda: {attendanceRequest.round}</span>
                <span>Rival: {attendanceRequest.pendingRival ? "A definir" : attendanceRequest.opponent}</span>
              </div>
            </div>
            <p className="muted">Marca los horarios en los que podes jugar. GAME los cruza con los del rival y asigna automaticamente el primer turno compatible.</p>
            <div className="availability-days">
              {(attendanceRequest.availableSlotsByDay || []).map((day) => (
                <section key={day.key} className="availability-day">
                  <strong>{day.label}</strong>
                  <span>{day.date ? formatDate(day.date) : ""}</span>
                  <div className="slot-grid slot-grid--compact">
                    {day.slots.map((slot) => (
                      <label key={slot.id} className={selectedAvailableSlots.includes(slot.value) ? "check-pill is-selected" : !slot.selectable ? "check-pill is-disabled" : "check-pill"}>
                        <input type="checkbox" disabled={!slot.selectable} checked={selectedAvailableSlots.includes(slot.value)} onChange={() => toggleAvailableSlot(slot.value)} />
                        <strong>{slot.time}</strong>
                        <span>{selectedAvailableSlots.includes(slot.value) ? "Seleccionado" : slot.selectable ? "Disponible" : "No disponible"}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="wizard-actions">
              <Button variant="ghost" onClick={() => setAttendanceModalOpen(false)}>Cancelar</Button>
              <Button onClick={confirmAttendance}>Guardar disponibilidad</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <section className="dashboard-columns">
        <Card className="results-card">
          <div className="section-title">
            <span>Últimos resultados</span>
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
