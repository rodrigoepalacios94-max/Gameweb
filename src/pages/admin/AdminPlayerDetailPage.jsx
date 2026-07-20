import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { Ban, Pencil, RotateCcw, ShieldAlert } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryRequestService } from "../../services/categoryRequestService";
import { disciplineService } from "../../services/disciplineService";
import { matchService } from "../../services/matchService";
import { playerService } from "../../services/playerService";
import { rankingService } from "../../services/rankingService";
import { tournamentService } from "../../services/tournamentService";
import { formatDate } from "../../utils/formatters";

export function AdminPlayerDetailPage() {
  const { id } = useParams();
  const [confirmAction, setConfirmAction] = useState(null);
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [pointsForm, setPointsForm] = useState({ mode: "sumar", points: "", reason: "" });
  const [benefitForm, setBenefitForm] = useState({ percentage: "0", months: "1", indefinite: false });
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [player, matches, tournaments, requests, discipline] = await Promise.all([
      playerService.getPlayerById(id),
      matchService.getMatchesByPlayer(id),
      tournamentService.getTournaments(),
      categoryRequestService.getRequestsByPlayer(id),
      disciplineService.getPlayerDiscipline(id),
    ]);
    return {
      player,
      matches,
      tournaments: tournaments.filter((tournament) => tournament.participants?.includes(id)),
      requests,
      faults: discipline.faults,
    };
  }, [id]);

  if (loading) return <LoadingState message="Cargando jugador..." />;
  if (error) return <ErrorState title="No pudimos cargar el jugador." onRetry={reload} />;

  const { player, matches, tournaments, requests, faults } = data;

  if (!player) {
    return <EmptyState title="Jugador no encontrado" description="No existe un jugador mock con ese identificador." />;
  }

  const isBlocked = player.status.includes("Bloqueado");

  async function blockPlayer() {
    await disciplineService.blockPlayer(player.id);
    setConfirmAction(null);
    reload();
  }

  async function unblockPlayer() {
    await disciplineService.unblockPlayer(player.id);
    setConfirmAction(null);
    reload();
  }

  async function submitPoints(event) {
    event.preventDefault();
    const rawPoints = Number(pointsForm.points);
    const points = pointsForm.mode === "restar" ? -Math.abs(rawPoints) : Math.abs(rawPoints);
    await rankingService.adjustPoints({
      playerId: player.id,
      concept: "Ajuste manual de puntos",
      points,
      reason: pointsForm.reason.trim(),
    });
    setPointsModalOpen(false);
    setPointsForm({ mode: "sumar", points: "", reason: "" });
    reload();
  }

  async function saveBenefit(event) {
    event.preventDefault();
    await playerService.saveBenefit(player.id, benefitForm);
    reload();
  }

  async function resetBenefit() {
    await playerService.resetBenefit(player.id);
    reload();
  }

  return (
    <div className="page-stack">
      <section className={isBlocked ? "profile-header profile-header--danger" : "profile-header"}>
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
        <Button variant="secondary" icon={Pencil} onClick={() => setPointsModalOpen(true)}>Modificar puntos</Button>
        {isBlocked ? (
          <Button variant="outline-green" icon={RotateCcw} onClick={() => setConfirmAction("unblock")}>Desbloquear jugador</Button>
        ) : (
          <Button variant="danger" icon={Ban} onClick={() => setConfirmAction("block")}>Bloquear jugador</Button>
        )}
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

      <Card>
        <div className="section-title">
          <span>Beneficio</span>
          {player.benefit ? <Badge tone="success">{player.benefit.percentage}% descuento</Badge> : <Badge tone="neutral">Sin beneficio</Badge>}
        </div>
        <form className="benefit-grid" onSubmit={saveBenefit}>
          <label>Porcentaje de descuento
            <select value={benefitForm.percentage} onChange={(event) => setBenefitForm((current) => ({ ...current, percentage: event.target.value }))}>
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
            </select>
          </label>
          <label>Duracion
            <select value={benefitForm.indefinite ? "indefinido" : benefitForm.months} onChange={(event) => setBenefitForm((current) => ({ ...current, indefinite: event.target.value === "indefinido", months: event.target.value === "indefinido" ? current.months : event.target.value }))}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} mes{value > 1 ? "es" : ""}</option>)}
              <option value="indefinido">Indefinido</option>
            </select>
          </label>
          <div className="card-actions">
            <Button type="submit">Guardar beneficio</Button>
            <Button variant="ghost" type="button" onClick={resetBenefit}>Restablecer beneficio</Button>
          </div>
        </form>
        {player.benefit ? (
          <div className="info-list">
            <span>Inicio: {formatDate(player.benefit.startedAt)}</span>
            <span>Vencimiento: {player.benefit.indefinite ? "Indefinido" : formatDate(player.benefit.expiresAt)}</span>
            <span>Ejemplo: con {player.benefit.percentage}% de beneficio paga {100 - player.benefit.percentage}%.</span>
          </div>
        ) : null}
      </Card>

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

      <Modal open={pointsModalOpen} title="Modificar puntos" onClose={() => setPointsModalOpen(false)}>
        <form className="modal-form" onSubmit={submitPoints}>
          <label>Tipo de ajuste
            <select value={pointsForm.mode} onChange={(event) => setPointsForm((current) => ({ ...current, mode: event.target.value }))}>
              <option value="sumar">Sumar puntos</option>
              <option value="restar">Restar puntos</option>
            </select>
          </label>
          <label>Puntos<input type="number" required min="1" value={pointsForm.points} onChange={(event) => setPointsForm((current) => ({ ...current, points: event.target.value }))} /></label>
          <label>Motivo obligatorio<textarea required value={pointsForm.reason} onChange={(event) => setPointsForm((current) => ({ ...current, reason: event.target.value }))} /></label>
          <p className="muted">La posicion del ranking no se edita manualmente: GAME la recalcula por puntos.</p>
          <div className="wizard-actions">
            <Button variant="ghost" type="button" onClick={() => setPointsModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Guardar ajuste</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={confirmAction === "block"}
        title="Bloquear jugador"
        message="Estas seguro que queres bloquear a este jugador?"
        confirmLabel="Si, bloquear"
        cancelLabel="No"
        onConfirm={blockPlayer}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction === "unblock"}
        title="Desbloquear jugador"
        message="Estas seguro que queres desbloquear a este jugador?"
        confirmLabel="Si, desbloquear"
        cancelLabel="No"
        tone="success"
        onConfirm={unblockPlayer}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
