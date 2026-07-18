import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CalendarDays, CreditCard, GitBranch, Play, ShieldAlert, UsersRound } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Tabs } from "../../components/common/Tabs";
import { BracketMatch } from "../../components/brackets/BracketMatch";
import { useAsyncData } from "../../hooks/useAsyncData";
import { adminService } from "../../services/adminService";
import { disciplineService } from "../../services/disciplineService";
import { enrollmentService } from "../../services/enrollmentService";
import { matchService } from "../../services/matchService";
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency, formatDate } from "../../utils/formatters";

export function AdminTournamentDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") || "summary");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [tournament, matches, bracket, registrations, schedule, participants, categories, claims, players] = await Promise.all([
      tournamentService.getTournamentById(id),
      matchService.getMatchesByTournament(id),
      tournamentService.getTournamentBracket(id),
      enrollmentService.getEnrollmentsByTournament(id),
      adminService.getScheduleByTournament(id),
      tournamentService.getTournamentParticipants(id),
      tournamentService.getTournamentCategories(id),
      disciplineService.getClaims(),
      playerService.getPlayers(),
    ]);
    return { tournament, matches, bracket, registrations, schedule, participants, categories, claims, players };
  }, [id]);

  if (loading) return <LoadingState message="Cargando detalle de torneo..." />;
  if (error) return <ErrorState title="No pudimos cargar el detalle de torneo." onRetry={reload} />;

  const { tournament, matches, bracket, registrations, schedule, participants, categories, claims, players } = data;

  if (!tournament) {
    return <EmptyState title="Torneo no encontrado" description="No existe un torneo admin con ese identificador mock." />;
  }

  const tabs = [
    { id: "summary", label: "Resumen" },
    { id: "registrations", label: "Inscripciones" },
    { id: "participants", label: "Participantes" },
    { id: "schedule", label: "Programacion" },
    { id: "matches", label: "Partidos" },
    ...(tournament.type === "Zonas" ? [{ id: "zones", label: "Zonas" }] : [{ id: "bracket", label: "Cuadro" }]),
    { id: "discipline", label: "Disciplina" },
  ];

  async function simulatePreliminaries() {
    await tournamentService.simulateTestPreliminaries(tournament.id);
    setTab("bracket");
    reload();
  }

  return (
    <div className="page-stack">
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

      <Tabs tabs={tabs} activeTab={tab} onChange={setTab} />

      {tab === "summary" ? (
        <div className="detail-grid">
          <Card>
            <h2>Datos principales</h2>
            <div className="info-list">
              <span>Inicio: {formatDate(tournament.startDate)}</span>
              <span>Semifinales previstas: {formatDate(tournament.semifinalsDate)}</span>
              <span>Dia de finales: {formatDate(tournament.finalsDate)}</span>
              <span>Formato: {tournament.type}</span>
              <span>Sistema de puntaje: {tournament.scoringSystem}</span>
              <span>Valor de inscripcion: {formatCurrency(tournament.price)}</span>
              <span>Categorias: {categories.map((category) => `${category.name} ${category.branch}`).join(", ")}</span>
            </div>
          </Card>
          <Card>
            <h2>Control administrativo</h2>
            <div className="info-list">
              <span>Participantes mock: {participants.length}</span>
              <span>Inscripciones visibles: {registrations.length}</span>
              <span>Canchas: {tournament.courts.join(", ")}</span>
              <span>Edicion: antes de iniciar se pueden modificar todos los datos.</span>
              <span>En juego: fechas, horarios, canchas, reglamentos y resultados quedan editables.</span>
            </div>
            <div className="card-actions">
              <Button variant="secondary">Editar torneo</Button>
              <Button variant="ghost">Finalizar</Button>
              <Button variant="ghost">Cancelar</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "registrations" ? (
        <Card>
          <div className="section-title">
            <span>Inscripciones</span>
            <CreditCard size={18} />
          </div>
          {registrations.length ? (
            <div className="admin-table">
              {registrations.map((registration) => {
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
            <EmptyState title="Sin inscripciones mock" description="Cuando se abra la inscripcion, los jugadores apareceran aca." />
          )}
        </Card>
      ) : null}

      {tab === "participants" ? (
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

      {tab === "schedule" ? (
        <Card>
          <h2>Programacion inteligente mock</h2>
          <p className="muted">El profesor define fechas clave, canchas y turnos. GAME distribuye visualmente, pero toda programacion puede modificarse manualmente.</p>
          <div className="schedule-board">
            {schedule.map((slot) => (
              <div key={slot.id} className="schedule-slot">
                <span>{slot.weekend}</span>
                <strong>{slot.day} / {slot.time}</strong>
                <small>{slot.court} / {slot.category}</small>
                <Badge tone="info">{slot.round}</Badge>
                <p>{slot.load}</p>
                {slot.matchId ? <Link className="inline-link inline-link--compact" to={`/admin/matches/${slot.matchId}`}>Ver partido</Link> : null}
              </div>
            ))}
          </div>
          <div className="info-band">
            <strong>Regla aplicada</strong>
            <span>Finales primero, luego semifinales, cuartos, octavos y preliminares. Las finales se concentran en el dia de finales.</span>
          </div>
        </Card>
      ) : null}

      {tab === "matches" ? (
        <Card>
          <h2>Partidos del torneo</h2>
          <div className="table-list">
            {matches.map((match) => (
              <Link key={match.id} className="tournament-match-row" to={`/admin/matches/${match.id}`}>
                <span>{match.round}</span>
                <strong>{match.playerA} vs {match.playerB}</strong>
                <Badge tone={match.status === "Finalizado" ? "success" : match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "bracket" ? (
        <Card>
          <div className="section-title">
            <span>Cuadro / llave</span>
            <GitBranch size={18} />
          </div>
          {tournament.isDevTest ? (
            <div className="dev-test-panel">
              <div>
                <strong>Torneo Prueba</strong>
                <span>{participants.length} bots inscriptos / {matches.filter((match) => match.phase === "Preliminar").length} preliminares generadas.</span>
              </div>
              <Button icon={Play} disabled={tournament.testSimulationStatus === "Simulado"} onClick={simulatePreliminaries}>
                {tournament.testSimulationStatus === "Simulado" ? "Preliminares simuladas" : "Simular preliminares"}
              </Button>
            </div>
          ) : null}
          {bracket?.preliminaries?.length ? (
            <div className="preliminary-grid">
              {bracket.preliminaries.map((match) => (
                <div key={match.matchId || `${match.playerA}-${match.playerB}`} className="preliminary-card">
                  <strong>{match.playerA} vs {match.playerB}</strong>
                  <span>{match.result || match.status}</span>
                  {match.winner ? <Badge tone="success">Gana {match.winner}</Badge> : <Badge tone="info">{match.status}</Badge>}
                </div>
              ))}
            </div>
          ) : null}
          {bracket?.rounds?.length ? (
            <div className="bracket-scroll">
              <div className="bracket-board">
                {bracket.rounds.map((round) => (
                  <section key={round.id} className="bracket-round">
                    <h3>{round.name}</h3>
                    {round.matches.map((match) => (
                      <BracketMatch key={match.id} match={match} detailBasePath="/admin/matches" />
                    ))}
                  </section>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="Cuadro pendiente" description="La llave todavia no fue generada para este torneo mock." />
          )}
          <p className="muted">La siembra visual respeta la referencia de estructura.md; el algoritmo definitivo queda para backend.</p>
        </Card>
      ) : null}

      {tab === "zones" ? (
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

      {tab === "discipline" ? (
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
    </div>
  );
}
