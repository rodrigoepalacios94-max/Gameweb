import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, MapPin, ShieldAlert, Trophy } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { MatchScore } from "../../components/player/MatchScore";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { availabilityService } from "../../services/availabilityService";
import { disciplineService } from "../../services/disciplineService";
import { matchService } from "../../services/matchService";
import { formatDate } from "../../utils/formatters";
import { describeMatchFormat } from "../../utils/matchFormat";

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

export function PlayerMatchDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimDescription, setClaimDescription] = useState("");
  const [claimError, setClaimError] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [selectedAvailableSlots, setSelectedAvailableSlots] = useState([]);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [match, claims, faults, availability] = await Promise.all([
      matchService.getMatchById(id),
      disciplineService.getClaims({ matchId: id }),
      disciplineService.getFaults({ matchId: id }),
      loadOptional("match availability", () => availabilityService.getMatchAvailability(id, user.id), null),
    ]);
    return { match, claims, faults, availability };
  }, [id, user.id]);

  if (loading) return <LoadingState message="Cargando partido..." />;
  if (error) return <ErrorState title="No pudimos cargar el partido." onRetry={reload} />;

  const match = data?.match;
  const claims = data?.claims || [];
  const faults = data?.faults || [];
  const availability = data?.availability || null;

  if (!match) {
    return <EmptyState title="Partido no encontrado" description="El partido solicitado no existe." />;
  }

  const currentPlayerId = user?.id || user?.playerId;
  const isPlayerA = currentPlayerId && currentPlayerId === match.playerAId;
  const isPlayerB = currentPlayerId && currentPlayerId === match.playerBId;
  const isOwnMatch = Boolean(isPlayerA || isPlayerB);
  const opponentName = isPlayerA ? match.playerB : isPlayerB ? match.playerA : "";
  const canClaimFault = isOwnMatch && match.playerAId && match.playerBId;
  const pendingOwnClaim = claims.find((claim) => claim.reporterPlayerId === currentPlayerId && claim.statusRaw === "pending");
  const winnerName = match.winnerId === match.playerAId ? match.playerA : match.winnerId === match.playerBId ? match.playerB : null;
  const walkoverName = match.walkoverPlayerId === match.playerAId ? match.playerA : match.walkoverPlayerId === match.playerBId ? match.playerB : null;
  const formatDescription = describeMatchFormat(match.matchFormat);
  const canDefineAvailability = isOwnMatch && availability?.needsAttendanceConfirmation;

  function toggleAvailableSlot(slot) {
    setSelectedAvailableSlots((current) => (current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]));
  }

  function openAvailabilityModal() {
    setAvailabilityError("");
    setSelectedAvailableSlots(availability?.selectedAvailableSlots || []);
    setAvailabilityModalOpen(true);
  }

  async function saveAvailability() {
    if (!canDefineAvailability) return;
    setAvailabilitySaving(true);
    setAvailabilityError("");
    try {
      await availabilityService.confirmAttendance(match.id, currentPlayerId, selectedAvailableSlots);
      setAvailabilityModalOpen(false);
      await reload();
    } catch (saveError) {
      setAvailabilityError(saveError.message || "No pudimos guardar tu disponibilidad.");
    } finally {
      setAvailabilitySaving(false);
    }
  }

  async function submitDisciplineClaim(event) {
    event.preventDefault();
    const description = claimDescription.trim();
    setClaimError("");
    if (!description) {
      setClaimError("Describi brevemente la falta reclamada.");
      return;
    }
    setClaimSubmitting(true);
    try {
      await disciplineService.createClaim({ matchId: id, description });
      setClaimModalOpen(false);
      setClaimDescription("");
      await reload();
    } catch (claimCreateError) {
      setClaimError(claimCreateError.message || "No pudimos registrar el reclamo.");
    } finally {
      setClaimSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="detail-hero match-detail-hero">
        <div>
          <span className="eyebrow">{match.tournament}</span>
          <h1>{match.round}</h1>
          <p>{match.category} / {match.phase}</p>
          <div className="hero-meta-row">
            <Badge tone={match.status === "Finalizado" ? "success" : match.status === "Doble W.O." ? "danger" : match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
            <span><CalendarDays size={16} /> {formatDate(match.date)} - {match.time}</span>
            <span><MapPin size={16} /> {match.court}</span>
          </div>
        </div>
      </header>

      <Card className="versus-card">
        <div className="competitor">
          <Avatar src={match.playerAAvatar} name={match.playerA} size="xl" />
          <strong>{match.playerA}</strong>
          {match.winnerId === match.playerAId ? <Badge tone="success">Ganador</Badge> : null}
          {match.walkoverPlayerId === match.playerAId ? <Badge tone="warning">No se presento</Badge> : null}
        </div>
        <div className="versus-score">
          <span>VS</span>
          <MatchScore match={match} />
        </div>
        <div className="competitor">
          <Avatar src={match.playerBAvatar} name={match.playerB} size="xl" />
          <strong>{match.playerB}</strong>
          {match.winnerId === match.playerBId ? <Badge tone="success">Ganador</Badge> : null}
          {match.walkoverPlayerId === match.playerBId ? <Badge tone="warning">No se presento</Badge> : null}
        </div>
      </Card>

      <div className="detail-grid">
        <Card>
          <h2>Estado deportivo</h2>
          <div className="info-list">
            <span><Trophy size={17} /> Torneo: {match.tournament}</span>
            <span>Ronda/Fase: {match.round} / {match.phase}</span>
            <span>Fecha: {formatDate(match.date)}</span>
            <span>Hora: {match.time}</span>
            <span>Cancha: {match.court}</span>
            {winnerName ? <span>Ganador: {winnerName}</span> : <span>Ganador: pendiente</span>}
            {walkoverName ? <span>W.O.: {walkoverName}</span> : null}
            {match.earlyFinishReason || match.resultDetail?.earlyFinishReason ? <span>Finalizacion anticipada: {match.earlyFinishReason || match.resultDetail.earlyFinishReason}</span> : null}
            {match.pointsEarned ? <span>Puntos obtenidos: +{match.pointsEarned}</span> : null}
          </div>
        </Card>
        <Card>
          <h2>Formato y disciplina</h2>
          <div className="info-list">
            <span>Sets: {formatDescription.sets}</span>
            <span>Games: {formatDescription.games}</span>
            <span>Set decisivo: {formatDescription.decidingSet}</span>
            <span>Estado: {match.status}</span>
          </div>
          <div className="card-actions card-actions--left">
            {canDefineAvailability ? (
              <Button variant="outline-green" icon={CalendarDays} onClick={openAvailabilityModal}>Definir disponibilidad</Button>
            ) : null}
            {canClaimFault && !pendingOwnClaim ? (
              <Button variant="outline-orange" icon={ShieldAlert} onClick={() => setClaimModalOpen(true)}>Reclamar falta</Button>
            ) : null}
            {pendingOwnClaim ? <Badge tone="warning">Reclamo pendiente</Badge> : null}
          </div>
          {claims.length || faults.length ? (
            <div className="compact-list">
              {claims.map((claim) => (
                <div key={claim.id} className="discipline-match-row">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{claim.reason || claim.description || "Reclamo de falta"}</strong>
                    <span>{claim.claimant} reclamo falta de {claim.reportedPlayer}. Estado: {claim.status}</span>
                  </div>
                </div>
              ))}
              {faults.map((fault) => (
                <Badge key={fault.id} tone="warning">
                  Falta confirmada: {fault.playerName}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="muted">No hay reclamos ni faltas confirmadas para este partido.</p>
          )}
        </Card>
      </div>

      <Link className="inline-link" to={`/player/tournaments/${match.tournamentId}`}>
        Volver al torneo
      </Link>

      <Modal open={availabilityModalOpen} title="Definir disponibilidad" onClose={() => setAvailabilityModalOpen(false)} size="lg">
        {availability ? (
          <div className="match-result-modal">
            <p className="muted">Marca los horarios en los que podes jugar. GAME programa el partido solo cuando haya coincidencia valida entre ambos jugadores.</p>
            {availabilityError ? <div className="form-alert">{availabilityError}</div> : null}
            <div className="availability-days">
              {(availability.availableSlotsByDay || []).map((day) => (
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
              <Button variant="ghost" onClick={() => setAvailabilityModalOpen(false)}>Cancelar</Button>
              <Button onClick={saveAvailability} disabled={availabilitySaving}>{availabilitySaving ? "Guardando..." : "Guardar disponibilidad"}</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={claimModalOpen} title="Reclamar falta" onClose={() => setClaimModalOpen(false)} size="sm" isDirty={Boolean(claimDescription.trim())} confirmOnClose>
        <form className="modal-form" onSubmit={submitDisciplineClaim}>
          <div className="info-band info-band--warning">
            <strong>Jugador reportado: {opponentName || "Oponente"}</strong>
            <span>GAME deriva automaticamente el acusado desde este partido. No se puede elegir otro jugador.</span>
          </div>
          <label>
            Motivo del reclamo
            <textarea value={claimDescription} onChange={(event) => setClaimDescription(event.target.value)} placeholder="Describe que ocurrio en el partido." rows={4} />
          </label>
          {claimError ? <div className="form-alert">{claimError}</div> : null}
          <div className="wizard-actions">
            <Button type="button" variant="ghost" onClick={() => setClaimModalOpen(false)}>Cancelar</Button>
            <Button type="submit" icon={ShieldAlert} disabled={claimSubmitting}>{claimSubmitting ? "Enviando..." : "Enviar reclamo"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
