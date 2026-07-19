import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CalendarX, CloudRain, CreditCard, GitBranch, RefreshCw, ShieldAlert, UsersRound } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
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

export function AdminTournamentDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") || "bracket");
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => searchParams.get("category") || "");
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const tournament = await tournamentService.getTournamentById(id);
    const stages = tournament ? await tournamentService.getTournamentCategoryStages(id) : [];
    const activeCategoryId = selectedCategoryId || tournament?.playerCategoryId || stages[0]?.categoryId || null;
    const [matches, bracket, registrations, scheduleInfo, participants, categories, claims, players] = await Promise.all([
      matchService.getMatchesByTournament(id, activeCategoryId),
      tournamentService.getTournamentBracket(id, activeCategoryId),
      enrollmentService.getEnrollmentsByTournament(id),
      schedulingService.getScheduleByTournament(id),
      tournamentService.getTournamentParticipants(id, activeCategoryId),
      tournamentService.getTournamentCategories(id),
      disciplineService.getClaims(),
      playerService.getPlayers(),
    ]);
    return { tournament, stages, activeCategoryId, matches, bracket, registrations, scheduleInfo, participants, categories, claims, players };
  }, [id, selectedCategoryId]);

  if (loading) return <LoadingState message="Cargando detalle de torneo..." />;
  if (error) return <ErrorState title="No pudimos cargar el detalle de torneo." onRetry={reload} />;

  const { tournament, stages, activeCategoryId, matches, bracket, registrations, scheduleInfo, participants, categories, claims, players } = data;

  if (!tournament) {
    return <EmptyState title="Torneo no encontrado" description="No existe un torneo admin con ese identificador mock." />;
  }

  const tabs = [
    { id: "bracket", label: "Cuadro" },
    { id: "formats", label: "Formatos" },
    { id: "matches", label: "Partidos" },
    { id: "participants", label: "Participantes" },
    { id: "registrations", label: "Inscripciones" },
    { id: "schedule", label: "Programacion" },
    { id: "summary", label: "Resumen" },
    { id: "discipline", label: "Disciplina" },
  ];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "bracket";
  const activeStage = stages.find((stage) => stage.categoryId === activeCategoryId) || stages[0];
  const categoryRegistrations = registrations.filter((registration) => registration.categoryId === activeCategoryId);

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

  async function confirmFormat(categoryId, format) {
    await tournamentService.confirmCategoryFormat(tournament.id, categoryId, format);
    setTab("bracket");
    reload();
  }

  async function confirmAllFormats() {
    await tournamentService.confirmAllCategoryFormats(tournament.id);
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
    setTab("schedule");
    reload();
  }

  async function suspendWeekend() {
    await schedulingService.suspendWeekend(tournament.id, tournament.startDate, "Suspension de fin de semana completo");
    setTab("schedule");
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
            <span>{tournament.type}</span>
            <span>{formatCurrency(tournament.price)}</span>
            {tournament.isDevTest ? <Badge tone="warning">DEV TEST</Badge> : null}
          </div>
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
          <span>Cuadro independiente: {activeStage?.bracketKey}</span>
        </div>
      </Card>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setTab} />

      {activeTab === "summary" ? (
        <div className="detail-grid">
          <Card>
            <h2>Datos principales</h2>
            <div className="info-list">
              <span>Inicio: {formatDate(tournament.startDate)}</span>
              <span>Semifinales previstas: {formatDate(tournament.semifinalsDate)}</span>
              <span>Dia de finales: {formatDate(tournament.finalsDate)}</span>
              <span>Formato general historico: {tournament.type}</span>
              <span>Formato categoria activa: {activeStage?.format}</span>
              <span>Sistema de puntaje: {tournament.scoringSystem}</span>
              <span>Valor de inscripcion: {formatCurrency(tournament.price)}</span>
              <span>Categorias: {categories.map((category) => `${category.name} ${category.branch}`).join(", ")}</span>
            </div>
          </Card>
          <Card>
            <h2>Control administrativo</h2>
            <div className="info-list">
              <span>Participantes categoria activa: {participants.length}</span>
              <span>Inscripciones categoria activa: {categoryRegistrations.length}</span>
              <span>Canchas: {tournament.courts.join(", ")}</span>
              <span>Edicion: antes de iniciar se pueden modificar todos los datos.</span>
              <span>En juego: fechas, horarios, canchas, reglamentos y resultados quedan editables.</span>
            </div>
            <div className="card-actions">
              <Button variant="secondary">Editar torneo</Button>
              <Button variant="outline-green" onClick={closeRegistrations}>Cerrar inscripciones</Button>
              <Button variant="ghost">Finalizar</Button>
              <Button variant="ghost">Cancelar</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "formats" ? (
        <Card>
          <div className="section-title">
            <span>Configurar formatos por categoria</span>
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
              <span>Formato sugerido</span>
              <span>Formato</span>
              <span>Estado</span>
              <span>Accion</span>
            </div>
            {stages.map((stage) => {
              const participantCount = registrations.filter((registration) => registration.categoryId === stage.categoryId && registration.status !== "Rechazada").length || stage.inscriptionsCount || 0;
              const selectedFormat = stage.format || stage.recommendedFormat || "";
              const hasParticipants = participantCount > 0;
              const isConfirmed = stage.formatStatus === "confirmed" || stage.status === "Cuadro generado";
              const isSuggested = stage.formatDecision !== "manual" && selectedFormat && selectedFormat === stage.recommendedFormat;
              return (
                <div key={stage.categoryId} className="admin-table-row admin-table-row--formats">
                  <strong>{stage.categoryName}</strong>
                  <span>{hasParticipants ? participantCount : "Sin inscriptos"}</span>
                  <span>{stage.recommendedFormat || "Sin sugerencia"}</span>
                  <div className="format-select-cell">
                    <select value={selectedFormat} disabled={tournament.status === "Inscripciones abiertas" || !hasParticipants} onChange={(event) => updateFormat(stage.categoryId, event.target.value)}>
                      <option value="" disabled>Formato pendiente</option>
                      {TOURNAMENT_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
                    </select>
                    {isSuggested ? <small>Sugerido por GAME</small> : selectedFormat ? <small>Modificado manualmente</small> : null}
                  </div>
                  <Badge tone={stage.status === "Cuadro generado" || isConfirmed ? "success" : stage.status === "Sin inscriptos" ? "neutral" : "info"}>{stage.status}</Badge>
                   <Button size="sm" variant="secondary" disabled={tournament.status === "Inscripciones abiertas" || !hasParticipants || !selectedFormat || isConfirmed} onClick={() => confirmFormat(stage.categoryId, selectedFormat)}>
                    {isConfirmed ? "Confirmado" : "Confirmar formato"}
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="info-band">
            <strong>Regla aplicada</strong>
            <span>El formato se decide despues del cierre de inscripciones, GAME solo recomienda y el profesor confirma o cambia la eleccion antes de generar la estructura deportiva.</span>
          </div>
        </Card>
      ) : null}

      {activeTab === "registrations" ? (
        <Card>
          <div className="section-title">
            <span>Inscripciones</span>
            <CreditCard size={18} />
          </div>
          {categoryRegistrations.length ? (
            <div className="admin-table">
              {categoryRegistrations.map((registration) => {
                const player = players.find((item) => item.id === registration.playerId);
                return (
                  <div key={registration.id} className="admin-table-row admin-table-row--registrations">
                    <Avatar src={player?.avatar} name={player?.fullName} size="sm" />
                    <strong>{player?.fullName}</strong>
                    <span>{registration.categoryName}</span>
                    <span>{registration.payment}</span>
                    <Badge tone={registration.status === "Confirmada" ? "success" : registration.status === "Lista de espera" ? "warning" : "info"}>{registration.status}</Badge>
                    <Button variant="ghost" size="sm">Revisar</Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Sin inscripciones mock" description="Esta categoria todavia no tiene inscripciones visibles." />
          )}
        </Card>
      ) : null}

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
            <span>Programacion inteligente mock</span>
            <div className="card-actions">
              <Button size="sm" icon={RefreshCw} onClick={recalculateSchedule}>Recalcular programacion</Button>
              <Button size="sm" variant="secondary" icon={CalendarX} onClick={suspendDay}>Suspender jornada</Button>
              <Button size="sm" variant="ghost" icon={CloudRain} onClick={suspendWeekend}>Suspender fin de semana</Button>
            </div>
          </div>
          <p className="muted">Las canchas son compartidas. GAME reparte turnos por carga pendiente, avance relativo y prioridad de rondas finales.</p>
          <div className="distribution-grid">
            {scheduleInfo.distribution.map((item) => (
              <div key={item.categoryId} className="distribution-card">
                <strong>{item.categoryName}</strong>
                <span>{item.programmed} de {item.pending} partidos pendientes programados.</span>
                <small>Peso aproximado: {Math.round(item.weight * 100)}%</small>
              </div>
            ))}
          </div>
          <div className="schedule-board">
            {scheduleInfo.slots.map((slot) => (
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
          <div className="info-band">
            <strong>Regla aplicada</strong>
            <span>Finales primero, luego semifinales, cuartos, octavos y preliminares. Si no hay capacidad real, la final puede desplazarse y queda informada.</span>
          </div>
        </Card>
      ) : null}

      {activeTab === "matches" ? (
        <Card>
          <h2>Partidos del torneo</h2>
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
                <span>{participants.length} bots inscriptos en {activeStage?.categoryName} / {matches.filter((match) => match.phase === "Preliminar").length} preliminares generadas.</span>
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
          <h2>Zonas</h2>
          <div className="zone-grid">
            <div className="zone-card">
              <strong>Zona A</strong>
              <span>Clasifican 2 jugadores</span>
              <span>Desempate: PG, sets, games, ranking general.</span>
            </div>
            <div className="zone-card">
              <strong>Zona B</strong>
              <span>Todos contra todos y luego cuadro final.</span>
              <span>Partido desempate si persiste igualdad.</span>
            </div>
          </div>
        </Card>
      ) : null}

      {activeTab === "discipline" ? (
        <Card>
          <div className="section-title">
            <span>Disciplina del torneo</span>
            <ShieldAlert size={18} />
          </div>
          <div className="compact-list">
            {claims.map((claim) => (
              <Link key={claim.id} className="claim-row" to="/admin/discipline">
                <strong>{claim.reportedPlayer}</strong>
                <span>{claim.match}</span>
                <span>{claim.reason}</span>
                <Badge tone={claim.status === "Pendiente" ? "warning" : "success"}>{claim.status}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
      <MatchResultModal
        open={Boolean(selectedMatchId)}
        matchId={selectedMatchId}
        onClose={() => setSelectedMatchId(null)}
        onSaved={reload}
      />
    </div>
  );
}
