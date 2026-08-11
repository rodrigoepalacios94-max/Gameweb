import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CalendarX, CloudRain, GitBranch, RotateCcw, Settings, ShieldAlert, Trash2, Trophy, UsersRound } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { Tabs } from "../../components/common/Tabs";
import { PreliminaryMatches } from "../../components/brackets/PreliminaryMatches";
import { TournamentBracket } from "../../components/brackets/TournamentBracket";
import { ZoneStageBoard } from "../../components/brackets/ZoneStageBoard";
import { MatchResultModal } from "../../components/matches/MatchResultModal";
import { useAsyncData } from "../../hooks/useAsyncData";
import { disciplineService } from "../../services/disciplineService";
import { enrollmentService } from "../../services/enrollmentService";
import { matchService } from "../../services/matchService";
import { playerService } from "../../services/playerService";
import { schedulingService } from "../../services/schedulingService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { getPaymentStatusLabel, getPaymentStatusTone, isPaymentPending } from "../../utils/paymentRules";
import { TOURNAMENT_FORMATS } from "../../services/tournamentCategoryService";
import { getVisibleTournamentDescription } from "../../utils/tournamentDescription";

const FINAL_MATCH_STATUSES = new Set(["Finalizado", "W.O.", "W.O"]);

function logTournamentDetailLoadError(error, stage = "unknown") {
  if (!import.meta.env.DEV || !error) return;
  const source = error.cause || error;
  console.error(
    "[GAME Admin] tournament detail load error",
    JSON.stringify({
      stage: error.stage ?? source.stage ?? stage ?? null,
      table: error.table ?? source.table ?? null,
      select: error.select ?? source.select ?? null,
      filters: error.filters ?? error.filter ?? source.filters ?? source.filter ?? null,
      code: error.code ?? source.code ?? null,
      message: error.message ?? source.message ?? null,
      details: error.details ?? source.details ?? null,
      hint: error.hint ?? source.hint ?? null,
      status: error.status ?? source.status ?? null,
      name: error.name ?? source.name ?? null,
      causeName: source !== error ? source.name ?? null : null,
      causeMessage: source !== error ? source.message ?? null : null,
    }, null, 2)
  );
}

async function loadOptional(label, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    const source = error.cause || error;
    console.error(
      `[GAME Admin] ${label}`,
      JSON.stringify({
        stage: label,
        table: error.table ?? source.table ?? null,
        select: error.select ?? source.select ?? null,
        filters: error.filters ?? error.filter ?? source.filters ?? source.filter ?? null,
        code: error.code ?? source.code ?? null,
        message: error.message ?? source.message ?? null,
        details: error.details ?? source.details ?? null,
        hint: error.hint ?? source.hint ?? null,
        status: error.status ?? source.status ?? null,
        name: error.name ?? source.name ?? null,
        causeName: source !== error ? source.name ?? null : null,
        causeMessage: source !== error ? source.message ?? null : null,
      }, null, 2)
    );
    return fallback;
  }
}

async function loadRequired(label, loader) {
  try {
    return await loader();
  } catch (error) {
    error.stage = label;
    throw error;
  }
}

function todayLocalDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function AdminTournamentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") || "bracket");
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => searchParams.get("category") || "");
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmSuspendDayOpen, setConfirmSuspendDayOpen] = useState(false);
  const [confirmSuspendWeekendOpen, setConfirmSuspendWeekendOpen] = useState(false);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletingTournament, setDeletingTournament] = useState(false);
  const [preparingTournament, setPreparingTournament] = useState(false);
  const [prepareResult, setPrepareResult] = useState(null);
  const [prepareError, setPrepareError] = useState("");
  const [scheduleResultMessage, setScheduleResultMessage] = useState("");
  const [zoneGenerationMessage, setZoneGenerationMessage] = useState("");
  const [participantPaymentFilter, setParticipantPaymentFilter] = useState("all");
  const [selectedPaymentParticipant, setSelectedPaymentParticipant] = useState(null);
  const [confirmManualPaymentOpen, setConfirmManualPaymentOpen] = useState(false);
  const [confirmReopenOpen, setConfirmReopenOpen] = useState(false);
  const [reopenError, setReopenError] = useState("");
  const [registrationActionBusy, setRegistrationActionBusy] = useState(false);
  const { data, loading, error, reload } = useAsyncData(async () => {
    try {
      const tournament = await loadRequired("tournament", () => tournamentService.getTournamentById(id));
      const stages = tournament
        ? await loadOptional("tournament stages", () => tournamentService.getTournamentCategoryStages(id), tournament.categoryStages || [])
        : [];
      const activeCategoryId = selectedCategoryId || tournament?.playerCategoryId || stages[0]?.categoryId || null;
      const [matches, allMatches, bracket, registrations, scheduleInfo, participants, categories, claims, faults, players] = await Promise.all([
        loadOptional("category matches", () => matchService.getMatchesByTournament(id, activeCategoryId), []),
        loadOptional("all matches", () => matchService.getMatchesByTournament(id), []),
        loadOptional("bracket", () => tournamentService.getTournamentBracket(id, activeCategoryId), null),
        loadOptional("registrations", () => enrollmentService.getEnrollmentsByTournament(id), []),
        loadOptional("schedule", () => schedulingService.getScheduleByTournament(id), { slots: [], distribution: [] }),
        loadOptional("participants", () => tournamentService.getTournamentParticipants(id, activeCategoryId), []),
        loadOptional("categories", () => tournamentService.getTournamentCategories(id), []),
        loadOptional("discipline claims", () => disciplineService.getClaims(), []),
        loadOptional("discipline faults", () => disciplineService.getFaults(), []),
        loadOptional("players", () => playerService.getPlayers(), []),
      ]);
      return { tournament, stages, activeCategoryId, matches, allMatches, bracket, registrations, scheduleInfo, participants, categories, claims, faults, players };
    } catch (loadError) {
      logTournamentDetailLoadError(loadError);
      throw loadError;
    }
  }, [id, selectedCategoryId]);

  if (loading) return <LoadingState message="Cargando detalle de torneo..." />;
  if (error) return <ErrorState title="No pudimos cargar el detalle de torneo." onRetry={reload} />;

  const { tournament, stages, activeCategoryId, matches, allMatches, bracket, registrations, scheduleInfo, participants, categories, claims, faults, players } = data;

  if (!tournament) {
    return <EmptyState title="Torneo no encontrado" description="No existe un torneo con ese identificador." />;
  }

  const tabs = [
    { id: "bracket", label: "Cuadro" },
    { id: "matches", label: "Partidos" },
    { id: "participants", label: "Participantes" },
    { id: "schedule", label: "Programacion" },
    { id: "discipline", label: "Disciplina" },
  ];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "bracket";
  const activeStage = stages.find((stage) => stage.categoryId === activeCategoryId) || stages[0];
  const categoryScheduleSlots = (scheduleInfo.slots || []).filter((slot) => slot.categoryId === activeCategoryId);
  const categoryDistribution = (scheduleInfo.distribution || []).filter((item) => item.categoryId === activeCategoryId);
  const categoryPlayerIds = new Set(participants.map((player) => player.id));
  const categoryPlayerNames = new Set(participants.map((player) => player.fullName));
  const categoryMatchIds = new Set(matches.map((match) => match.id));
  const categoryClaims = claims.filter((claim) =>
    claim.categoryId === activeCategoryId ||
    categoryMatchIds.has(claim.matchId) ||
    categoryPlayerIds.has(claim.reportedPlayerId) ||
    categoryPlayerIds.has(claim.claimantPlayerId) ||
    categoryPlayerNames.has(claim.reportedPlayer) ||
    categoryPlayerNames.has(claim.claimant)
  );
  const categoryFaults = faults.filter((fault) => categoryPlayerIds.has(fault.playerId));
  const pendingMatchesCount = allMatches.filter((match) => !FINAL_MATCH_STATUSES.has(match.status)).length;
  const participantRows = participants.map((player) => {
    const enrollment = registrations.find((registration) =>
      registration.playerId === player.id &&
      registration.categoryId === activeCategoryId &&
      registration.registrationStatus !== "cancelled" &&
      registration.status !== "Rechazada",
    );
    return {
      player,
      enrollment,
      paymentStatus: enrollment?.paymentStatus || (enrollment?.paymentState === "APPROVED" ? "paid" : "unknown"),
      pending: enrollment ? isPaymentPending(enrollment) : false,
    };
  }).filter((row) => {
    if (participantPaymentFilter === "pending") return row.pending;
    if (participantPaymentFilter === "paid") return row.paymentStatus === "paid";
    if (participantPaymentFilter === "waived") return row.paymentStatus === "waived";
    return true;
  });
  const pendingParticipantCount = registrations.filter((registration) => registration.categoryId === activeCategoryId && isPaymentPending(registration)).length;
  const description = getVisibleTournamentDescription(tournament.description);

  async function updateZoneQualifiers(zoneId, qualifiers) {
    setZoneGenerationMessage("");
    await tournamentService.updateZoneQualifiers(tournament.id, activeCategoryId, zoneId, qualifiers);
    reload();
  }

  async function generateZoneBracket() {
    const result = await tournamentService.generateZoneEliminationBracket(tournament.id, activeCategoryId);
    setZoneGenerationMessage(result?.message || "");
    setTab("bracket");
    reload();
  }

  async function closeRegistrations() {
    setRegistrationActionBusy(true);
    try {
      const result = await tournamentService.closeRegistrations(tournament.id);
      if (result?.regenerationResult) {
        setPrepareResult({
          generatedCategories: stages.map((stage) => stage.categoryName),
          skippedCategories: [],
          generatedStages: result.regenerationResult.generatedStages,
          schedule: result.regenerationResult,
        });
      }
      reload();
    } finally {
      setRegistrationActionBusy(false);
    }
  }

  async function reopenRegistrations() {
    setRegistrationActionBusy(true);
    setReopenError("");
    try {
      await tournamentService.reopenRegistrations(tournament.id);
      setConfirmReopenOpen(false);
      setSettingsOpen(false);
      reload();
    } catch (error) {
      setReopenError(error.cause?.message || error.message || "No pudimos reabrir inscripciones.");
    } finally {
      setRegistrationActionBusy(false);
    }
  }

  async function updateFormat(categoryId, format) {
    await tournamentService.updateCategoryFormat(tournament.id, categoryId, format);
    reload();
  }

  async function confirmAllFormats() {
    setPreparingTournament(true);
    setPrepareError("");
    try {
      const result = await tournamentService.confirmAllCategoryFormats(tournament.id);
      setPrepareResult(result);
      setSettingsOpen(false);
      setTab("bracket");
      reload();
    } catch (error) {
      setPrepareError(error.cause?.message || error.message || "No pudimos preparar el torneo.");
    } finally {
      setPreparingTournament(false);
    }
  }

  async function suspendMatch(matchId) {
    await schedulingService.suspendMatch(matchId, "Suspension individual desde detalle de torneo");
    reload();
  }

  async function suspendDay() {
    const result = await schedulingService.suspendDay(tournament.id, todayLocalDate(), null, "Lluvia o imprevisto de jornada");
    const moved = result?.suspendedMatches?.length || 0;
    const unscheduled = result?.recalculated?.unscheduledCount || 0;
    setScheduleResultMessage(result?.recalculated?.requiresAvailability
      ? `${moved} partido(s) suspendido(s). Se libero la cancha y los jugadores deberan cargar nueva disponibilidad.`
      : unscheduled
      ? `${moved} partido(s) suspendido(s). ${unscheduled} quedaron sin turno disponible.`
      : `${moved} partido(s) suspendido(s) y reprogramado(s) automaticamente.`);
    setConfirmSuspendDayOpen(false);
    setSettingsOpen(false);
    setTab("schedule");
    reload();
  }

  async function suspendWeekend() {
    const result = await schedulingService.suspendWeekend(tournament.id, tournament.semifinalsDate || tournament.startDate, "Suspension de fin de semana completo");
    const moved = result?.suspendedMatches?.length || 0;
    const unscheduled = result?.recalculated?.unscheduledCount || 0;
    setScheduleResultMessage(result?.recalculated?.requiresAvailability
      ? `${moved} partido(s) suspendido(s). Se libero la cancha y los jugadores deberan cargar nueva disponibilidad.`
      : unscheduled
      ? `${moved} partido(s) suspendido(s). ${unscheduled} quedaron sin turno disponible.`
      : `${moved} partido(s) suspendido(s) y reprogramado(s) automaticamente.`);
    setConfirmSuspendWeekendOpen(false);
    setSettingsOpen(false);
    setTab("schedule");
    reload();
  }

  async function finalizeTournament() {
    await tournamentService.finalizeTournament(tournament.id, { pendingCount: pendingMatchesCount });
    setFinishModalOpen(false);
    setTab("bracket");
    reload();
  }

  async function deleteOpenTournament() {
    setDeletingTournament(true);
    setDeleteError("");
    try {
      await tournamentService.deleteOpenTournament(tournament.id);
      setDeleteModalOpen(false);
      setSettingsOpen(false);
      navigate("/admin/tournaments");
    } catch (error) {
      if (import.meta.env.DEV) {
        const source = error.cause || error;
        console.error(
          "[GAME Admin] tournament delete modal error",
          JSON.stringify({
            table: error.table ?? source.table ?? null,
            filters: error.filters ?? error.filter ?? source.filters ?? source.filter ?? null,
            code: error.code ?? source.code ?? null,
            message: error.message ?? source.message ?? null,
            details: error.details ?? source.details ?? null,
            hint: error.hint ?? source.hint ?? null,
            status: error.status ?? source.status ?? null,
            name: error.name ?? source.name ?? null,
          }, null, 2)
        );
      }
      setDeleteError("No pudimos eliminar el torneo. Intentá nuevamente.");
    } finally {
      setDeletingTournament(false);
    }
  }

  async function markSelectedParticipantPaid() {
    if (!selectedPaymentParticipant?.enrollment?.registrationId) return;
    await enrollmentService.markRegistrationAsPaid(selectedPaymentParticipant.enrollment.registrationId, {
      method: "manual",
      actor: "admin-1",
    });
    setConfirmManualPaymentOpen(false);
    setSelectedPaymentParticipant(null);
    reload();
  }

  return (
    <div className="page-stack">
      <Link className="back-link" to="/admin/tournaments">
        <ArrowLeft size={18} />
        <span>Volver a torneos</span>
      </Link>

      <header className="detail-hero tournament-detail-hero">
        <div>
          <span className="eyebrow">{tournament.scoringSystem}</span>
          <h1>{tournament.name}</h1>
          {description ? <p>{description}</p> : null}
          <div className="hero-meta-row">
            <Badge tone={tournament.status === "En juego" ? "info" : tournament.status === "Inscripciones abiertas" ? "success" : "neutral"}>{tournament.status}</Badge>
            <span><CalendarDays size={16} /> {formatDate(tournament.startDate)}</span>
            <span>{activeStage?.format || activeStage?.recommendedFormat || "Formato pendiente"}</span>
            <span>{formatCurrency(tournament.price)}</span>
          </div>
        </div>
        <div className="tournament-admin-actions">
          <Button variant="secondary" icon={Settings} onClick={() => setSettingsOpen(true)}>Ajustes</Button>
          <Button variant="danger" icon={Trophy} disabled={tournament.status === "Finalizado"} onClick={() => setFinishModalOpen(true)}>Finalizar torneo</Button>
        </div>
      </header>

      <Card className="category-nav-card">
        <div className="section-title">
          <span>Categoría seleccionada</span>
          <Badge tone="info">{activeStage?.format || activeStage?.recommendedFormat || "Formato pendiente"}</Badge>
        </div>
        <div className="category-selector-row">
          <select value={activeCategoryId || ""} onChange={(event) => setSelectedCategoryId(event.target.value)}>
            {stages.map((stage) => (
              <option key={stage.categoryId} value={stage.categoryId}>{stage.categoryName}</option>
            ))}
          </select>
          <span>{activeStage?.inscriptionsCount || participants.length || 0} inscriptos</span>
        </div>
      </Card>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setTab} />

      {activeTab === "participants" ? (
        <Card>
          <div className="section-title">
            <span>Participantes</span>
            <div className="card-actions">
              <Badge tone={pendingParticipantCount ? "danger" : "success"}>Pendientes: {pendingParticipantCount}</Badge>
              <UsersRound size={18} />
            </div>
          </div>
          <div className="payment-filter-row">
            {[
              ["all", "Todos"],
              ["paid", "Pagados"],
              ["pending", "Pendientes"],
              ["waived", "Liberados"],
            ].map(([value, label]) => (
              <button key={value} className={participantPaymentFilter === value ? "is-active" : ""} type="button" onClick={() => setParticipantPaymentFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="participant-grid">
            {participantRows.map(({ player, enrollment, pending }) => (
              <button
                key={player.id}
                className={pending ? "participant-card participant-card--payment-pending" : "participant-card"}
                type="button"
                aria-disabled={!pending}
                onClick={() => pending ? setSelectedPaymentParticipant({ player, enrollment }) : null}
              >
                <Avatar src={player.avatar} name={player.fullName} />
                <div>
                  <strong>{player.fullName}</strong>
                  <span>{player.categoryName} / Ranking #{player.ranking}</span>
                  {enrollment ? <Badge tone={getPaymentStatusTone(enrollment)}>{getPaymentStatusLabel(enrollment)}</Badge> : null}
                </div>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {activeTab === "schedule" ? (
        <Card>
          <div className="section-title">
            <span>Programacion - {activeStage?.categoryName}</span>
            <div className="card-actions">
              <Button size="sm" variant="secondary" icon={CalendarX} onClick={() => setConfirmSuspendDayOpen(true)}>Suspender jornada</Button>
              <Button size="sm" variant="ghost" icon={CloudRain} onClick={() => setConfirmSuspendWeekendOpen(true)}>Suspender fin de semana</Button>
            </div>
          </div>
          {scheduleResultMessage ? <div className="info-band">{scheduleResultMessage}</div> : null}
          <div className="distribution-grid">
            {categoryDistribution.map((item) => (
              <div key={item.categoryId} className="distribution-card">
                <strong>{item.categoryName}</strong>
                <span>{item.programmed} de {item.pending} partidos pendientes programados.</span>
                <small>Peso aproximado: {Math.round(item.weight * 100)}%</small>
              </div>
            ))}
          </div>
          {categoryScheduleSlots.length ? (
            <div className="schedule-board">
              {categoryScheduleSlots.map((slot) => (
                <div key={slot.id} className="schedule-slot">
                  <span>{slot.weekend} / {slot.date}</span>
                  <strong>{slot.day} / {slot.time}</strong>
                  <small>{slot.court} / {slot.category}</small>
                  <Badge tone="info">{slot.round}</Badge>
                  <p>{slot.players || slot.load}</p>
                  {slot.matchId ? <Link className="inline-link inline-link--compact" to={`/admin/matches/${slot.matchId}`}>Ver partido</Link> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin turnos para esta categoria" description="No hay partidos programados para la categoria seleccionada." />
          )}
        </Card>
      ) : null}

      {activeTab === "matches" ? (
        <Card>
          <h2>Partidos - {activeStage?.categoryName}</h2>
          {matches.length ? (
            <div className="table-list">
              {matches.map((match) => (
                <div key={match.id} className="tournament-match-row tournament-match-row--admin">
                  <button className="tournament-match-row__main" type="button" onClick={() => setSelectedMatchId(match.id)}>
                    <span>{match.round}</span>
                    <strong>{match.playerA} vs {match.playerB}</strong>
                    <Badge tone={match.status === "Finalizado" ? "success" : match.status === "Doble W.O." ? "danger" : match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
                  </button>
                  {!["Finalizado", "W.O.", "Doble W.O."].includes(match.status) ? (
                    <Button variant="ghost" size="sm" onClick={() => suspendMatch(match.id)}>Suspender</Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin partidos" description="La categoría seleccionada todavía no tiene partidos generados." />
          )}
        </Card>
      ) : null}

      {activeTab === "bracket" ? (
        <Card className="bracket-card" key={activeCategoryId}>
          <div className="section-title">
            <span>Cuadro / llave - {activeStage?.categoryName}</span>
            <GitBranch size={18} />
          </div>
          <div className="definition-date-strip">
            <div>
              <span>Semifinal</span>
              <strong>{formatDate(tournament.semifinalsDate)}</strong>
            </div>
            <div>
              <span>Final</span>
              <strong>{formatDate(tournament.finalsDate)}</strong>
            </div>
          </div>
          <ZoneStageBoard
            bracket={bracket}
            editable
            generationMessage={zoneGenerationMessage}
            onGenerateBracket={generateZoneBracket}
            onQualifierChange={updateZoneQualifiers}
          />
          <PreliminaryMatches preliminaries={bracket?.preliminaries || []} detailBasePath="/admin/matches" onMatchOpen={setSelectedMatchId} />
          {bracket?.rounds?.length ? (
            <TournamentBracket bracket={bracket} detailBasePath="/admin/matches" onMatchOpen={setSelectedMatchId} />
          ) : (
            <EmptyState title="Cuadro pendiente" description="La llave todavía no fue generada para este torneo." />
          )}
        </Card>
      ) : null}

      {activeTab === "zones" ? (
        <Card>
          <h2>Zonas - {activeStage?.categoryName}</h2>
          {bracket?.zones?.length ? (
            <ZoneStageBoard
              bracket={bracket}
              editable
              generationMessage={zoneGenerationMessage}
              onGenerateBracket={generateZoneBracket}
              onQualifierChange={updateZoneQualifiers}
            />
          ) : (
            <EmptyState title="Sin zonas generadas" description="La categoría activa no usa formato Zonas o todavía no fue confirmado." />
          )}
        </Card>
      ) : null}

      {activeTab === "discipline" ? (
        <Card>
          <div className="section-title">
            <span>Disciplina - {activeStage?.categoryName}</span>
            <ShieldAlert size={18} />
          </div>
          {categoryClaims.length || categoryFaults.length ? (
            <div className="compact-list">
              {categoryClaims.map((claim) => (
                <Link key={claim.id} className="claim-row" to="/admin/discipline">
                  <strong>{claim.reportedPlayer}</strong>
                  <span>{claim.match}</span>
                  <span>{claim.reason}</span>
                  <Badge tone={claim.status === "Pendiente" ? "warning" : "success"}>{claim.status}</Badge>
                </Link>
              ))}
              {categoryFaults.map((fault) => {
                const player = players.find((item) => item.id === fault.playerId);
                return (
                  <Link key={fault.id} className="claim-row" to="/admin/discipline">
                    <strong>{player?.fullName || "Jugador"}</strong>
                    <span>{fault.date}</span>
                    <span>{fault.reason}</span>
                    <Badge tone="warning">Falta</Badge>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Sin novedades disciplinarias" description="No hay reclamos ni faltas para la categoria seleccionada." />
          )}
        </Card>
      ) : null}
      <MatchResultModal
        open={Boolean(selectedMatchId)}
        matchId={selectedMatchId}
        onClose={() => setSelectedMatchId(null)}
        onSaved={reload}
      />
      <Modal open={settingsOpen} title="Configuración del torneo" size="lg" onClose={() => setSettingsOpen(false)}>
        <div className="match-result-modal">
          <div className="info-list">
            <span>Inicio: {formatDate(tournament.startDate)}</span>
            <span>Semifinales previstas: {formatDate(tournament.semifinalsDate)}</span>
            <span>Dia de finales: {formatDate(tournament.finalsDate)}</span>
            <span>Categorías: {categories.map((category) => `${category.name} ${category.branch}`).join(", ")}</span>
            <span>Canchas: {tournament.courts.join(", ")}</span>
          </div>

          <div className="section-title">
            <span>Formatos por categoria</span>
            <Button variant="outline-green" size="sm" disabled={tournament.status === "Inscripciones abiertas" || preparingTournament} onClick={confirmAllFormats}>
              {preparingTournament ? "Generando torneo..." : "Confirmar formatos"}
            </Button>
          </div>
          {prepareError ? <div className="form-alert">{prepareError}</div> : null}
          {tournament.status === "Inscripciones abiertas" ? (
            <div className="info-band">
              <strong>Inscripciones abiertas</strong>
              <span>Cerra inscripciones para que GAME cuente participantes y proponga formatos por categoria.</span>
              <Button variant="outline-green" size="sm" disabled={registrationActionBusy} onClick={closeRegistrations}>
                {registrationActionBusy ? "Cerrando..." : "Cerrar inscripciones"}
              </Button>
            </div>
          ) : null}
          {tournament.status === "Inscripciones cerradas" ? (
            <div className="info-band">
              <strong>Inscripciones cerradas</strong>
              <span>Si el torneo todavia no comenzo, podes reabrirlas y GAME regenerara la estructura al volver a cerrar.</span>
              <Button variant="outline-green" size="sm" icon={RotateCcw} onClick={() => setConfirmReopenOpen(true)}>Reabrir inscripciones</Button>
            </div>
          ) : null}
          <div className="admin-table">
            <div className="admin-table-row admin-table-row--formats admin-table-row--head">
              <strong>Categoría</strong>
              <span>Participantes</span>
              <span>Formato</span>
            </div>
            {stages.map((stage) => {
              const participantCount = Number(stage.inscriptionsCount || 0);
              const selectedFormat = stage.format || stage.recommendedFormat || "";
              const hasParticipants = participantCount > 0;
              return (
                <div key={stage.categoryId} className="admin-table-row admin-table-row--formats">
                  <strong>{stage.categoryName}</strong>
                  <span>{hasParticipants ? participantCount : "Sin inscriptos"}</span>
                  <div className="format-select-cell">
                    <select value={selectedFormat} disabled={tournament.status === "Inscripciones abiertas" || !hasParticipants} onChange={(event) => updateFormat(stage.categoryId, event.target.value)}>
                      <option value="" disabled>Formato pendiente</option>
                      {TOURNAMENT_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="section-title">
            <span>Programacion</span>
          </div>
          {scheduleResultMessage ? <div className="info-band">{scheduleResultMessage}</div> : null}
          <div className="wizard-actions">
            <Button variant="secondary" icon={CalendarX} onClick={() => setConfirmSuspendDayOpen(true)}>Suspender resto de jornada</Button>
            <Button variant="ghost" icon={CloudRain} onClick={() => setConfirmSuspendWeekendOpen(true)}>Suspender fin de semana</Button>
          </div>

          {tournament.status === "Inscripciones abiertas" ? (
            <div className="danger-zone">
              <div>
                <strong>Eliminar torneo</strong>
                <span>Disponible solo mientras las inscripciones estan abiertas. Borra inscripciones, partidos, cuadro y programacion de este torneo.</span>
              </div>
              <Button variant="danger" icon={Trash2} onClick={() => setDeleteModalOpen(true)}>Eliminar torneo</Button>
            </div>
          ) : null}
        </div>
      </Modal>
      <Modal open={deleteModalOpen} title="Eliminar torneo" onClose={() => setDeleteModalOpen(false)}>
        <div className="match-result-modal">
          <p className="muted">Esta acción elimina definitivamente el torneo abierto "{tournament.name}" y sus datos dependientes. No se eliminan jugadores, categorías ni rankings.</p>
          {deleteError ? <div className="form-alert">{deleteError}</div> : null}
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" icon={Trash2} onClick={deleteOpenTournament} disabled={deletingTournament}>
              {deletingTournament ? "Eliminando..." : "Si, eliminar torneo"}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={confirmReopenOpen} title="REABRIR INSCRIPCIONES" onClose={() => setConfirmReopenOpen(false)}>
        <div className="match-result-modal">
          <p className="muted">Las inscripciones volveran a estar disponibles para los jugadores.</p>
          <p className="muted">Si se suman o eliminan participantes, GAME regenerara automaticamente las estructuras deportivas al volver a cerrar las inscripciones.</p>
          {reopenError ? <div className="form-alert">{reopenError}</div> : null}
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setConfirmReopenOpen(false)}>Cancelar</Button>
            <Button variant="outline-green" icon={RotateCcw} disabled={registrationActionBusy} onClick={reopenRegistrations}>
              {registrationActionBusy ? "Reabriendo..." : "Reabrir"}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={Boolean(prepareResult)} title="TORNEO PREPARADO" onClose={() => setPrepareResult(null)}>
        {prepareResult ? (
          <div className="match-result-modal">
            <div className="info-list">
              <span>Categorias generadas: {prepareResult.generatedCategories?.length || 0}</span>
              <span>Categorias sin inscriptos: {prepareResult.skippedCategories?.length || 0}</span>
              <span>Fases persistidas: {prepareResult.generatedStages || 0}</span>
              <span>Partidos programados: {prepareResult.schedule?.scheduledCount || 0}</span>
              <span>Sin turno disponible: {prepareResult.schedule?.unscheduledCount || 0}</span>
            </div>
            <p className="muted">La llave quedo generada y la programacion inicial se creo automaticamente con los inscriptos reales.</p>
            <div className="wizard-actions">
              <Button variant="outline-green" onClick={() => setPrepareResult(null)}>Entendido</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal open={confirmSuspendDayOpen} title="Suspender jornada" onClose={() => setConfirmSuspendDayOpen(false)}>
        <div className="match-result-modal">
          <p className="muted">¿Estás seguro que querés suspender el resto de los partidos de hoy?</p>
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setConfirmSuspendDayOpen(false)}>No</Button>
            <Button variant="secondary" icon={CalendarX} onClick={suspendDay}>Si</Button>
          </div>
        </div>
      </Modal>
      <Modal open={confirmSuspendWeekendOpen} title="Suspender fin de semana" onClose={() => setConfirmSuspendWeekendOpen(false)}>
        <div className="match-result-modal">
          <p className="muted">¿Estás seguro que querés suspender todos los partidos del fin de semana?</p>
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setConfirmSuspendWeekendOpen(false)}>No</Button>
            <Button variant="secondary" icon={CloudRain} onClick={suspendWeekend}>Si</Button>
          </div>
        </div>
      </Modal>
      <Modal open={finishModalOpen} title={pendingMatchesCount ? "Todavia quedan partidos sin finalizar" : "Finalizar torneo"} onClose={() => setFinishModalOpen(false)}>
        <div className="match-result-modal">
          <p className="muted">
            {pendingMatchesCount
              ? `Quedan ${pendingMatchesCount} partidos pendientes. ¿Seguro que querés finalizar el torneo igualmente?`
              : "Esta acción cerrará definitivamente el torneo."}
          </p>
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setFinishModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" icon={Trophy} onClick={finalizeTournament}>Finalizar torneo</Button>
          </div>
        </div>
      </Modal>
      <Modal open={Boolean(selectedPaymentParticipant)} title="Pago pendiente" onClose={() => setSelectedPaymentParticipant(null)}>
        {selectedPaymentParticipant ? (
          <div className="match-result-modal">
            <div className="info-list">
              <strong>{selectedPaymentParticipant.player.fullName}</strong>
              <span>Estado: PAGO PENDIENTE</span>
              <span>Torneo: {tournament.name}</span>
              <span>Categorías: {(registrations.filter((registration) => registration.registrationId === selectedPaymentParticipant.enrollment.registrationId).map((registration) => registration.categoryName)).join(", ")}</span>
              <span>Total pendiente: {formatCurrency(selectedPaymentParticipant.enrollment.totalAmount || selectedPaymentParticipant.enrollment.price || 0)}</span>
            </div>
            <div className="wizard-actions">
              <Button variant="ghost" onClick={() => setSelectedPaymentParticipant(null)}>Cancelar</Button>
              <Button variant="orange" onClick={() => setConfirmManualPaymentOpen(true)}>Marcar como pagado</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal open={confirmManualPaymentOpen} title="Confirmar pago" onClose={() => setConfirmManualPaymentOpen(false)}>
        {selectedPaymentParticipant ? (
          <div className="match-result-modal">
            <p className="muted">Confirmas que {selectedPaymentParticipant.player.fullName} abono {formatCurrency(selectedPaymentParticipant.enrollment.totalAmount || selectedPaymentParticipant.enrollment.price || 0)}?</p>
            <div className="wizard-actions">
              <Button variant="ghost" onClick={() => setConfirmManualPaymentOpen(false)}>Cancelar</Button>
              <Button variant="orange" onClick={markSelectedParticipantPaid}>Confirmar pago</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
