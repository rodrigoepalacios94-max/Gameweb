import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Pencil, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { categoryRequestService } from "../../services/categoryRequestService";
import { disciplineService } from "../../services/disciplineService";
import { enrollmentService } from "../../services/enrollmentService";
import { matchService } from "../../services/matchService";
import { playerService } from "../../services/playerService";
import { rankingService } from "../../services/rankingService";
import { tournamentService } from "../../services/tournamentService";
import { queryKeys } from "../../query/queryKeys";
import { formatDate } from "../../utils/formatters";

async function loadOptional(label, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    console.error(`[GAME Admin] ${label}`, {
      code: error.code || error.cause?.code || null,
      message: error.message || error.cause?.message || null,
      details: error.details || error.cause?.details || null,
      hint: error.hint || error.cause?.hint || null,
    });
    return fallback;
  }
}

function parseDeleteErrorPayload(error) {
  const responseBody = error?.cause?.responseBody;
  if (!responseBody) return null;
  try {
    return JSON.parse(responseBody);
  } catch {
    return null;
  }
}

function getDeleteErrorCode(error) {
  const payload = parseDeleteErrorPayload(error);
  return payload?.error || error.code || error.cause?.code || null;
}

function getDeleteErrorMessage(error) {
  const payload = parseDeleteErrorPayload(error);
  return payload?.message || error.message || "NO PUDIMOS ELIMINAR EL JUGADOR";
}

function FieldError({ message }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function validateEditForm(form, activeCategories) {
  if (!form.phone.trim()) return { field: "phone", message: "INGRESA EL TELEFONO" };
  if (!/^\d+$/.test(form.phone.trim())) return { field: "phone", message: "EL TELEFONO SOLO PUEDE CONTENER NUMEROS" };
  if (!form.birthDate) return { field: "birthDate", message: "INGRESA LA FECHA DE NACIMIENTO" };
  if (!form.gender) return { field: "gender", message: "SELECCIONA EL SEXO" };
  if (!["Masculino", "Femenino"].includes(form.gender)) return { field: "gender", message: "SELECCIONA MASCULINO O FEMENINO" };
  if (!form.categoryId || !activeCategories.some((category) => category.id === form.categoryId)) return { field: "categoryId", message: "SELECCIONA UNA CATEGORIA ACTIVA" };
  if (!form.status) return { field: "status", message: "SELECCIONA EL ESTADO" };
  return null;
}

export function AdminPlayerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [confirmAction, setConfirmAction] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [deleteProtectionMessage, setDeleteProtectionMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingPlayer, setDeletingPlayer] = useState(false);
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [pointsForm, setPointsForm] = useState({ mode: "sumar", points: "", reason: "" });
  const [benefitForm, setBenefitForm] = useState({ percentage: "0", months: "1", indefinite: false });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [editGeneralError, setEditGeneralError] = useState("");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const player = await playerService.getPlayerById(id, { includeDiscipline: false });
    if (!player) return { player: null, matches: [], tournaments: [], requests: [], faults: [], enrollments: [], categories: [] };
    const [matches, tournaments, requests, discipline, enrollments, categories] = await Promise.all([
      loadOptional("player matches", () => matchService.getMatchesByPlayer(id), []),
      loadOptional("player tournaments", () => tournamentService.getTournaments(), []),
      loadOptional("player requests", () => categoryRequestService.getRequestsByPlayer(id), []),
      loadOptional("player discipline", () => disciplineService.getPlayerDiscipline(id), { faults: [] }),
      loadOptional("player enrollments", () => enrollmentService.getEnrollmentsByPlayer(id), []),
      loadOptional("categories", () => categoryService.getCategories(), []),
    ]);
    const playerWithDiscipline = {
      ...player,
      discipline: {
        ...player.discipline,
        faults: discipline.activeFaultCount ?? discipline.faults?.length ?? 0,
        status: discipline.status || player.discipline.status,
      },
    };
    return {
      player: playerWithDiscipline,
      matches,
      tournaments: tournaments.filter((tournament) =>
        tournament.participants?.includes(id) ||
        tournament.categoryStages?.some((stage) => stage.participants?.includes(id))
      ),
      requests,
      faults: discipline.faults,
      enrollments,
      categories,
    };
  }, [id], { cacheKey: `admin-player-detail:${id}` });
  const loadedPlayer = data?.player;

  useEffect(() => {
    if (!loadedPlayer) return;
    setBenefitForm({
      percentage: String(loadedPlayer.benefit?.percentage ?? 0),
      months: String(loadedPlayer.benefit?.months ?? 1),
      indefinite: Boolean(loadedPlayer.benefit?.indefinite),
    });
  }, [loadedPlayer?.id, loadedPlayer?.benefit?.percentage, loadedPlayer?.benefit?.months, loadedPlayer?.benefit?.indefinite]);

  if (loading) return <LoadingState message="Cargando jugador..." />;
  if (error) return <ErrorState title="No pudimos cargar el jugador." onRetry={reload} />;

  const { player, matches, tournaments, requests, faults, categories } = data;

  if (!player) {
    return <EmptyState title="Jugador no encontrado" description="No existe un jugador con ese identificador." />;
  }

  const isBlocked = player.status.includes("Bloqueado");
  const categoryRankings = player.categoryRankings || [];
  const benefitPercentage = Number(player.benefit?.percentage || 0);
  const isWaived = benefitPercentage === 100;
  const hasActiveTournament = tournaments.some((tournament) => !["Finalizado", "Cancelado"].includes(tournament.status));
  const isLinkedAdminPlayer = profile?.role === "admin" && profile?.player_id === player.id;
  const faultExpulsions = (data.enrollments || []).filter((enrollment) =>
    enrollment.participationStatus === "eliminated_faults" ||
    enrollment.eliminationReason === "three_faults"
  );
  const activeCategories = (categories || []).filter((category) => category.status === "Activa");

  function updateEditField(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }));
    setEditErrors((current) => ({ ...current, [field]: "" }));
    setEditGeneralError("");
  }

  function openEditPlayer() {
    setEditForm({
      phone: player.phone || "",
      birthDate: player.birthDate || "",
      gender: player.gender || "",
      categoryId: player.categoryId || "",
      status: player.status || "Activo",
      address: player.address || "",
    });
    setEditErrors({});
    setEditGeneralError("");
    setEditOpen(true);
  }

  async function savePlayerDetails(event) {
    event.preventDefault();
    setEditErrors({});
    setEditGeneralError("");
    const validationError = validateEditForm(editForm, activeCategories);
    if (validationError) {
      setEditErrors({ [validationError.field]: validationError.message });
      return;
    }
    try {
      await playerService.updatePlayer(player.id, {
        phone: editForm.phone,
        birthDate: editForm.birthDate,
        gender: editForm.gender,
        categoryId: editForm.categoryId,
        status: editForm.status,
        address: editForm.address,
        categoryChangeReason: "Edicion administrativa de jugador",
      });
      setEditOpen(false);
      reload();
    } catch (saveError) {
      if (saveError.field) setEditErrors({ [saveError.field]: saveError.message });
      else setEditGeneralError(saveError.message || "NO PUDIMOS ACTUALIZAR EL JUGADOR");
    }
  }

  async function blockPlayer() {
    await playerService.setPlayerStatus(player.id, "Bloqueado por faltas");
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

  async function deletePlayer() {
    setDeletingPlayer(true);
    setDeleteError("");
    setDeleteBlocked(false);
    try {
      await playerService.deletePlayer(player.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminPlayers() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminDashboard() }),
      ]);
      setDeleteModalOpen(false);
      navigate("/admin/players", {
        replace: true,
        state: { message: "JUGADOR ELIMINADO" },
      });
    } catch (error) {
      const deleteErrorCode = getDeleteErrorCode(error);
      if (deleteErrorCode === "PLAYER_ACTIVE_TOURNAMENT") {
        setDeleteBlocked(true);
        setDeleteProtectionMessage("El jugador actualmente está activo en un torneo.");
        setDeleteError("");
      } else if (deleteErrorCode === "ADMIN_PLAYER_DELETE_FORBIDDEN") {
        setDeleteBlocked(true);
        setDeleteProtectionMessage("Esta ficha deportiva está vinculada a una cuenta administradora. Si deja de jugar, desvinculá o desactivá la ficha; no elimines la cuenta Admin.");
        setDeleteError("");
      } else if (["PLAYER_HAS_SPORT_HISTORY", "PLAYER_HAS_SPORT_ACTIVITY"].includes(deleteErrorCode)) {
        setDeleteError("NO SE PUEDE ELIMINAR EL JUGADOR PORQUE TIENE HISTORIAL DEPORTIVO REGISTRADO.");
      } else {
        setDeleteError(getDeleteErrorMessage(error));
      }
    } finally {
      setDeletingPlayer(false);
    }
  }

  function openDeletePlayerModal() {
    setDeleteError("");
    if (isLinkedAdminPlayer) {
      setDeleteBlocked(true);
      setDeleteProtectionMessage("Esta ficha deportiva está vinculada a tu cuenta administradora. Para dejar de jugar, conviene desvincular o desactivar la ficha, no eliminar la cuenta Admin.");
    } else {
      setDeleteBlocked(hasActiveTournament);
      setDeleteProtectionMessage(hasActiveTournament ? "El jugador actualmente está activo en un torneo." : "");
    }
    setDeleteModalOpen(true);
  }

  return (
    <div className="page-stack">
      <Link className="back-link" to="/admin/players">
        <ArrowLeft size={18} />
        <span>Volver</span>
      </Link>

      <section className={isBlocked ? "profile-header profile-header--danger" : "profile-header"}>
        <Avatar src={player.avatar} name={player.fullName} size="xl" />
        <div>
          <span className="eyebrow">Detalle jugador</span>
          <h1>{player.fullName}</h1>
          <p>{categoryRankings.length > 1 ? `${categoryRankings.length} categorias con ranking independiente` : `${player.categoryName} / Ranking ${player.ranking ? `#${player.ranking}` : "sin datos"} / ${player.points} pts`}</p>
          <div className="hero-meta-row">
            <Badge tone={player.status === "Activo" ? "success" : player.status.includes("Bloqueado") ? "danger" : "warning"}>{player.status}</Badge>
            <Badge tone={player.discipline.faults >= 3 ? "danger" : player.discipline.faults > 0 ? "warning" : "success"}>
              Disciplina {player.discipline.faults}/{player.discipline.limit}
            </Badge>
          </div>
        </div>
      </section>

      <div className="player-detail-actions">
        <div className="card-actions">
          <Button variant="outline-green" icon={Pencil} onClick={openEditPlayer}>Editar datos</Button>
          <Button variant="secondary" icon={Pencil} onClick={() => setPointsModalOpen(true)}>Modificar puntos</Button>
          {isBlocked ? (
            <Button variant="outline-green" icon={RotateCcw} onClick={() => setConfirmAction("unblock")}>Desbloquear jugador</Button>
          ) : (
            <Button variant="danger" icon={Ban} onClick={() => setConfirmAction("block")}>Bloquear jugador</Button>
          )}
        </div>
        <Button variant="danger-outline" icon={Trash2} onClick={openDeletePlayerModal}>Eliminar jugador</Button>
      </div>

      <div className="detail-grid">
        <Card>
          <h2>Información personal</h2>
          <div className="info-list">
            <span>DNI: {player.dni || "No informado"}</span>
            <span>Fecha de nacimiento: {player.birthDate ? formatDate(player.birthDate) : "No informada"}</span>
            <span>Sexo: {player.gender || "No informado"}</span>
            <span>Teléfono: {player.phone || "No informado"}</span>
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

      {categoryRankings.length ? (
        <Card>
          <div className="section-title">
            <span>Rankings por categoria</span>
            <Badge tone="info">{categoryRankings.length} participacion{categoryRankings.length > 1 ? "es" : ""}</Badge>
          </div>
          <div className="compact-list">
            {categoryRankings.map((entry) => (
              <Link key={`${entry.tournamentId}-${entry.categoryId}`} className="compact-item" to={`/admin/tournaments/${entry.tournamentId}`}>
                <strong>{entry.categoryName}</strong>
                <span>{entry.tournamentName} / Ranking #{entry.position} / {entry.points} pts</span>
                <span>{entry.resultSummary || "Participacion registrada"}</span>
                <div className="hero-meta-row">
                  {entry.seed ? <Badge tone="success">Cabeza de serie</Badge> : <Badge tone="neutral">No cabeza de serie</Badge>}
                  {entry.ascended ? <Badge tone="warning">Ascenso reciente</Badge> : null}
                  {entry.note ? <Badge tone="info">{entry.note}</Badge> : null}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {faultExpulsions.length ? (
        <Card>
          <div className="section-title">
            <span>Expulsiones disciplinarias</span>
            <Badge tone="danger">3 faltas</Badge>
          </div>
          <div className="compact-list">
            {faultExpulsions.map((enrollment) => (
              <Link key={enrollment.id} className="compact-item" to={`/admin/tournaments/${enrollment.tournamentId}`}>
                <strong>{enrollment.tournamentName || "Torneo"}</strong>
                <span>{enrollment.categoryName || "Categoria"} / EXPULSADO POR 3 FALTAS</span>
                <span>{enrollment.eliminatedAt ? formatDate(String(enrollment.eliminatedAt).slice(0, 10)) : "Fecha no informada"}</span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="section-title">
          <span>Beneficio</span>
          {isWaived ? <Badge tone="info">Liberado</Badge> : player.benefit ? <Badge tone="success">{player.benefit.percentage}% descuento</Badge> : <Badge tone="neutral">Sin beneficio</Badge>}
        </div>
        <form className="benefit-grid" onSubmit={saveBenefit}>
          <label>Porcentaje de descuento
            <select value={benefitForm.percentage} onChange={(event) => setBenefitForm((current) => ({ ...current, percentage: event.target.value }))}>
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
            </select>
          </label>
          <label>Duracion
            <select disabled={Number(benefitForm.percentage) === 100} value={Number(benefitForm.percentage) === 100 ? "anual" : benefitForm.indefinite ? "indefinido" : benefitForm.months} onChange={(event) => setBenefitForm((current) => ({ ...current, indefinite: event.target.value === "indefinido", months: event.target.value === "indefinido" ? current.months : event.target.value }))}>
              {Number(benefitForm.percentage) === 100 ? <option value="anual">Hasta 31/12/{new Date().getFullYear()}</option> : null}
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
            <span>Total de inscripcion: {isWaived ? "$0 por liberacion anual" : `paga ${100 - player.benefit.percentage}% del valor.`}</span>
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
            <p className="muted">Sin faltas confirmadas.</p>
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

      <Modal open={editOpen} title="Editar datos del jugador" onClose={() => setEditOpen(false)} size="lg">
        {editForm ? (
          <form className="modal-form" onSubmit={savePlayerDetails} noValidate>
            {editGeneralError ? <div className="form-alert">{editGeneralError}</div> : null}
            <div className="form-grid">
              <label className={editErrors.phone ? "field-has-error" : ""}>Telefono
                <input inputMode="numeric" value={editForm.phone} onChange={(event) => updateEditField("phone", event.target.value.replace(/\D/g, ""))} />
                <FieldError message={editErrors.phone} />
              </label>
              <label className={editErrors.birthDate ? "field-has-error" : ""}>Fecha de nacimiento
                <input type="date" value={editForm.birthDate} onChange={(event) => updateEditField("birthDate", event.target.value)} />
                <FieldError message={editErrors.birthDate} />
              </label>
              <label className={editErrors.gender ? "field-has-error" : ""}>Sexo
                <select value={editForm.gender} onChange={(event) => updateEditField("gender", event.target.value)}>
                  <option value="">Selecciona sexo</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                </select>
                <FieldError message={editErrors.gender} />
              </label>
              <label className={editErrors.categoryId ? "field-has-error" : ""}>Categoria actual
                <select value={editForm.categoryId} onChange={(event) => updateEditField("categoryId", event.target.value)}>
                  <option value="">Selecciona una categoria</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name} {category.branch}</option>
                  ))}
                </select>
                <FieldError message={editErrors.categoryId} />
              </label>
              <label className={editErrors.status ? "field-has-error" : ""}>Estado
                <select value={editForm.status} onChange={(event) => updateEditField("status", event.target.value)}>
                  <option value="Activo">Activo</option>
                  <option value="Suspendido">Suspendido</option>
                  <option value="Bloqueado por faltas">Bloqueado por faltas</option>
                </select>
                <FieldError message={editErrors.status} />
              </label>
              <label>Domicilio
                <input value={editForm.address} onChange={(event) => updateEditField("address", event.target.value)} />
              </label>
            </div>
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit">Guardar datos</Button>
            </div>
          </form>
        ) : null}
      </Modal>

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
        message="¿Estás seguro que querés bloquear a este jugador?"
        confirmLabel="Sí, bloquear"
        cancelLabel="No"
        onConfirm={blockPlayer}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction === "unblock"}
        title="Desbloquear jugador"
        message="¿Estás seguro que querés desbloquear a este jugador?"
        confirmLabel="Sí, desbloquear"
        cancelLabel="No"
        tone="success"
        onConfirm={unblockPlayer}
        onCancel={() => setConfirmAction(null)}
      />
      <Modal open={deleteModalOpen} title={deleteBlocked ? "NO SE PUEDE ELIMINAR EL JUGADOR" : "ELIMINAR JUGADOR"} onClose={() => setDeleteModalOpen(false)}>
        <div className="match-result-modal">
          {deleteBlocked ? (
            <>
              <p className="muted">{deleteProtectionMessage || "No se puede eliminar este jugador."}</p>
              <div className="wizard-actions">
                <Button variant="outline-green" onClick={() => setDeleteModalOpen(false)}>CERRAR</Button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">¿Seguro que querés eliminar a {player.fullName}?</p>
              <p className="muted">Esta acción no se puede deshacer.</p>
              {deleteError ? <div className="form-alert">{deleteError}</div> : null}
              <div className="wizard-actions">
                <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>CANCELAR</Button>
                <Button variant="danger" icon={Trash2} disabled={deletingPlayer} onClick={deletePlayer}>
                  {deletingPlayer ? "ELIMINANDO..." : "ELIMINAR JUGADOR"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
