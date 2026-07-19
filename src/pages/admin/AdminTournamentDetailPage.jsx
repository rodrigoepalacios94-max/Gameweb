import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CalendarX, CloudRain, GitBranch, RefreshCw, Settings, ShieldAlert, Trophy, UsersRound } from "lucide-react";
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
import { MatchResultModal } from "../../components/matches/MatchResultModal";
import { useAsyncData } from "../../hooks/useAsyncData";
import { disciplineService } from "../../services/disciplineService";
import { enrollmentService } from "../../services/enrollmentService";
import { matchService } from "../../services/matchService";
import { playerService } from "../../services/playerService";
import { schedulingService } from "../../services/schedulingService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { TOURNAMENT_FORMATS } from "../../services/tournamentCategoryService";

const FINAL_MATCH_STATUSES = new Set(["Finalizado", "W.O.", "W.O"]);

export function AdminTournamentDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") || "bracket");
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => searchParams.get("category") || "");
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmSuspendDayOpen, setConfirmSuspendDayOpen] = useState(false);
  const [confirmSuspendWeekendOpen, setConfirmSuspendWeekendOpen] = useState(false);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const tournament = await tournamentService.getTournamentById(id);
    const stages = tournament ? await tournamentService.getTournamentCategoryStages(id) : [];
    const activeCategoryId = selectedCategoryId || tournament?.playerCategoryId || stages[0]?.categoryId || null;
    const [matches, allMatches, bracket, registrations, scheduleInfo, participants, categories, claims, faults, players] = await Promise.all([
      matchService.getMatchesByTournament(id, activeCategoryId),
      matchService.getMatchesByTournament(id),
      tournamentService.getTournamentBracket(id, activeCategoryId),
      enrollmentService.getEnrollmentsByTournament(id),
      schedulingService.getScheduleByTournament(id),
      tournamentService.getTournamentParticipants(id, activeCategoryId),
      tournamentService.getTournamentCategories(id),
      disciplineService.getClaims(),
      disciplineService.getFaults(),
      playerService.getPlayers(),
    ]);
    return { tournament, stages, activeCategoryId, matches, allMatches, bracket, registrations, scheduleInfo, participants, categories, claims, faults, players };
  }, [id, selectedCategoryId]);

  if (loading) return <LoadingState message="Cargando detalle de torneo..." />;
  if (error) return <ErrorState title="No pudimos cargar el detalle de torneo." onRetry={reload} />;

  const { tournament, stages, activeCategoryId, matches, allMatches, bracket, registrations, scheduleInfo, participants, categories, claims, faults, players } = data;

  if (!tournament) {
    return <EmptyState title="Torneo no encontrado" description="No existe un torneo admin con ese identificador mock." />;
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

  async function simulatePreliminaries() {
    await tournamentService.simulateTestPreliminaries(tournament.id, activeCategoryId);
    setTab("bracket");
    reload();
  }

  async function closeRegistrations() {
    await tournamentService.closeRegistrations(tournament.id);
    reload();
  }

  async function updateFormat(categoryId, format) {
    await tournamentService.updateCategoryFormat(tournament.id, categoryId, format);
    reload();
  }

  async function confirmAllFormats() {
    await tournamentService.confirmAllCategoryFormats(tournament.id);
    setSettingsOpen(false);
    setTab("bracket");
    reload();
  }

  async function recalculateSchedule() {
    await schedulingService.recalculateSchedule(tournament.id);
    setTab("schedule");
    reload();
  }

  async function suspendMatch(matchId) {
    await schedulingService.suspendMatch(matchId, "Suspension individual desde detalle de torneo");
    reload();
  }

  async function suspendDay() {
    await schedulingService.suspendDay(tournament.id, tournament.startDate, null, "Lluvia o imprevisto de jornada");
    setConfirmSuspendDayOpen(false);
    setSettingsOpen(false);
    setTab("schedule");
    reload();
  }

  async function suspendWeekend() {
    await schedulingService.suspendWeekend(tournament.id, tournament.startDate, "Suspension de fin de semana completo");
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
          <p>{tournament.description}</p>
          <div className="hero-meta-row">
            <Badge tone={tournament.status === "En juego" ? "info" : tournament.status === "Inscripciones abiertas" ? "success" : "neutral"}>{tournament.status}</Badge>
            <span><CalendarDays size={16} /> {formatDate(tournament.startDate)}</span>
            <span>{activeStage?.format || activeStage?.recommendedFormat || "Formato pendiente"}</span>
            <span>{formatCurrency(tournament.price)}</span>
            {tournament.isDevTest ? <Badge tone="warning">DEV TEST</Badge> : null}
          </div>
        </div>
        <div className="tournament-admin-actions">
          <Button variant="secondary" icon={Settings} onClick={() => setSettingsOpen(true)}>Ajustes</Button>
          <Button variant="danger" icon={Trophy} disabled={tournament.status === "Finalizado"} onClick={() => setFinishModalOpen(true)}>Finalizar torneo</Button>
        </div>
      </header>

      <Card className="category-nav-card">
        <div className="section-title">
          <span>Categoria seleccionada</span>
          <Badge tone="info">{activeStage?.format || activeStage?.recommendedFormat || "Formato pendiente"}</Badge>
        </div>
        <div className="category-selector-row">
          <select value={activeCategoryId || ""} onChange={(event) => setSelectedCategoryId(event.target.value)}>
            {stages.map((stage) => (
              <option key={stage.categoryId} value={stage.categoryId}>{stage.categoryName}</option>
            ))}
          </select>
          <span>{activeStage?.inscriptionsCount || 0} inscriptos</span>
        </div>
      </Card>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setTab} />

      {activeTab === "participants" ? (
        <Card>
          <div className="section-title">
            <span>Participantes</span>
            <UsersRound size={18} />
          </div>
          <div className="participant-grid">
            {participants.map((player) => (
              <Link key={player.id} className="participant-card" to={`/admin/players/${player.id}`}>
                <Avatar src={player.avatar} name={player.fullName} />
                <div>
                  <strong>{player.fullName}</strong>
                  <span>{player.categoryName} / Ranking #{player.ranking}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {activeTab === "schedule" ? (
        <Card>
          <div className="section-title">
            <span>Programacion - {activeStage?.categoryName}</span>
            <div className="card-actions">
              <Button size="sm" icon={RefreshCw} onClick={recalculateSchedule}>Recalcular programacion</Button>
              <Button size="sm" variant="secondary" icon={CalendarX} onClick={() => setConfirmSuspendDayOpen(true)}>Suspender jornada</Button>
              <Button size="sm" variant="ghost" icon={CloudRain} onClick={() => setConfirmSuspendWeekendOpen(true)}>Suspender fin de semana</Button>
            </div>
          </div>
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
            <EmptyState title="Sin partidos" description="La categoria seleccionada todavia no tiene partidos generados." />
          )}
        </Card>
      ) : null}

      {activeTab === "bracket" ? (
        <Card className="bracket-card">
          <div className="section-title">
            <span>Cuadro / llave - {activeStage?.categoryName}</span>
            <GitBranch size={18} />
          </div>
          {tournament.isDevTest ? (
            <div className="dev-test-panel">
              <div>
                <strong>Torneo Prueba</strong>
                <span>{participants.length} bots inscriptos en {activeStage?.categoryName} / {(bracket?.preliminaries || []).filter((match) => match.matchId).length} preliminares generadas.</span>
              </div>
              <Button disabled={tournament.testSimulationStatus === "Simulado" || !matches.some((match) => match.phase === "Preliminar")} onClick={simulatePreliminaries}>
                {tournament.testSimulationStatus === "Simulado" ? "Preliminares simuladas" : matches.some((match) => match.phase === "Preliminar") ? "Simular preliminares" : "Sin preliminares"}
              </Button>
            </div>
          ) : null}
          {bracket?.zones?.length ? (
            <div className="zone-grid">
              {bracket.zones.map((zone) => (
                <div key={zone.id} className="zone-card">
                  <strong>{zone.name}</strong>
                  <span>Clasifican {zone.qualifiers} jugadores</span>
                  {zone.players.map((player) => <span key={player}>{player}</span>)}
                </div>
              ))}
            </div>
          ) : null}
          <PreliminaryMatches preliminaries={bracket?.preliminaries || []} detailBasePath="/admin/matches" onMatchOpen={setSelectedMatchId} />
          {bracket?.rounds?.length ? (
            <TournamentBracket bracket={bracket} detailBasePath="/admin/matches" onMatchOpen={setSelectedMatchId} />
          ) : (
            <EmptyState title="Cuadro pendiente" description="La llave todavia no fue generada para este torneo mock." />
          )}
        </Card>
      ) : null}

      {activeTab === "zones" ? (
        <Card>
          <h2>Zonas - {activeStage?.categoryName}</h2>
          {bracket?.zones?.length ? (
            <div className="zone-grid">
              {bracket.zones.map((zone) => (
                <div key={zone.id} className="zone-card">
                  <strong>{zone.name}</strong>
                  <span>Clasifican {zone.qualifiers} jugadores</span>
                  {zone.players.map((player) => <span key={player}>{player}</span>)}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin zonas generadas" description="La categoria activa no usa formato Zonas o todavia no fue confirmado." />
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
      <Modal open={settingsOpen} title="Configuracion del torneo" size="lg" onClose={() => setSettingsOpen(false)}>
        <div className="match-result-modal">
          <div className="info-list">
            <span>Inicio: {formatDate(tournament.startDate)}</span>
            <span>Semifinales previstas: {formatDate(tournament.semifinalsDate)}</span>
            <span>Dia de finales: {formatDate(tournament.finalsDate)}</span>
            <span>Categorias: {categories.map((category) => `${category.name} ${category.branch}`).join(", ")}</span>
            <span>Canchas: {tournament.courts.join(", ")}</span>
          </div>

          <div className="section-title">
            <span>Formatos por categoria</span>
            <Button variant="outline-green" size="sm" disabled={tournament.status === "Inscripciones abiertas"} onClick={confirmAllFormats}>Confirmar formatos</Button>
          </div>
          {tournament.status === "Inscripciones abiertas" ? (
            <div className="info-band">
              <strong>Inscripciones abiertas</strong>
              <span>Cerra inscripciones para que GAME cuente participantes y proponga formatos por categoria.</span>
              <Button variant="outline-green" size="sm" onClick={closeRegistrations}>Cerrar inscripciones</Button>
            </div>
          ) : null}
          <div className="admin-table">
            <div className="admin-table-row admin-table-row--formats admin-table-row--head">
              <strong>Categoria</strong>
              <span>Participantes</span>
              <span>Formato</span>
            </div>
            {stages.map((stage) => {
              const participantCount = registrations.filter((registration) => registration.categoryId === stage.categoryId && registration.status !== "Rechazada").length || stage.inscriptionsCount || 0;
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
            <Button size="sm" icon={RefreshCw} onClick={recalculateSchedule}>Recalcular programacion</Button>
          </div>
          <div className="wizard-actions">
            <Button variant="secondary" icon={CalendarX} onClick={() => setConfirmSuspendDayOpen(true)}>Suspender resto de jornada</Button>
            <Button variant="ghost" icon={CloudRain} onClick={() => setConfirmSuspendWeekendOpen(true)}>Suspender fin de semana</Button>
          </div>
        </div>
      </Modal>
      <Modal open={confirmSuspendDayOpen} title="Suspender jornada" onClose={() => setConfirmSuspendDayOpen(false)}>
        <div className="match-result-modal">
          <p className="muted">Estas seguro que queres suspender el resto de los partidos de hoy?</p>
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setConfirmSuspendDayOpen(false)}>No</Button>
            <Button variant="secondary" icon={CalendarX} onClick={suspendDay}>Si</Button>
          </div>
        </div>
      </Modal>
      <Modal open={confirmSuspendWeekendOpen} title="Suspender fin de semana" onClose={() => setConfirmSuspendWeekendOpen(false)}>
        <div className="match-result-modal">
          <p className="muted">Estas seguro que queres suspender todos los partidos del fin de semana?</p>
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
              ? `Quedan ${pendingMatchesCount} partidos pendientes. Seguro que queres finalizar el torneo igualmente?`
              : "Esta accion cerrara definitivamente el torneo."}
          </p>
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setFinishModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" icon={Trophy} onClick={finalizeTournament}>Finalizar torneo</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
