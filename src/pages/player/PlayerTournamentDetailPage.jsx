import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarDays, CreditCard, GitBranch, Trophy, UsersRound } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Tabs } from "../../components/common/Tabs";
import { PreliminaryMatches } from "../../components/brackets/PreliminaryMatches";
import { TournamentBracket } from "../../components/brackets/TournamentBracket";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { matchService } from "../../services/matchService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency, formatDate } from "../../utils/formatters";

export function PlayerTournamentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState("bracket");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const tournament = await tournamentService.getTournamentById(id);
    const stages = tournament ? await tournamentService.getTournamentCategoryStages(id) : [];
    const playerStages = stages.filter((stage) => (stage.participants || []).includes(user.id));
    const visibleStages = playerStages.length ? playerStages : stages;
    const activeCategoryId = selectedCategoryId || tournament?.playerCategoryId || visibleStages[0]?.categoryId || null;
    const [matches, bracket, categories, participants] = await Promise.all([
      matchService.getMatchesByTournament(id, activeCategoryId),
      tournamentService.getTournamentBracket(id, activeCategoryId),
      tournamentService.getTournamentCategories(id),
      tournamentService.getTournamentParticipants(id, activeCategoryId),
    ]);
    return { tournament, stages: visibleStages, activeCategoryId, matches, bracket, categories, participants };
  }, [id, selectedCategoryId, user.id]);

  if (loading) return <LoadingState message="Cargando torneo..." />;
  if (error) return <ErrorState title="No pudimos cargar el torneo." onRetry={reload} />;

  const { tournament, stages, activeCategoryId, matches, bracket, categories, participants } = data;

  if (!tournament) {
    return <EmptyState title="Torneo no encontrado" description="La competencia solicitada no existe en los datos mock." />;
  }

  const tabs = [
    { id: "bracket", label: "Cuadro" },
    { id: "summary", label: "Resumen" },
    { id: "participants", label: "Participantes" },
    { id: "matches", label: "Partidos" },
    ...(bracket?.zones?.length ? [{ id: "standings", label: "Zonas" }] : []),
  ];
  const activeStage = stages.find((stage) => stage.categoryId === activeCategoryId) || stages[0];
  const visibleCategoryIds = new Set(stages.map((stage) => stage.categoryId));
  const visibleCategories = categories.filter((category) => visibleCategoryIds.has(category.id));
  return (
    <div className="page-stack">
      <header className="detail-hero tournament-detail-hero">
        <div>
          <span className="eyebrow">{tournament.scoringSystem}</span>
          <h1>{tournament.name}</h1>
          <p>{tournament.description}</p>
          <div className="hero-meta-row">
            <Badge tone={tournament.status === "Inscripciones abiertas" ? "success" : tournament.status === "En juego" ? "info" : "neutral"}>{tournament.status}</Badge>
            <span>{formatDate(tournament.startDate)}</span>
            <span>{activeStage?.categoryName}</span>
            <span>{activeStage?.format || tournament.type}</span>
            <span>{formatCurrency(tournament.price)}</span>
          </div>
        </div>
      </header>

      <Card className="category-nav-card">
        <div className="section-title">
          <span>Categoria seleccionada</span>
          <Badge tone="info">{activeStage?.format || tournament.type}</Badge>
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

      <Tabs tabs={tabs} activeTab={tab} onChange={setTab} />

      {tab === "summary" ? (
        <div className="detail-grid">
          <Card>
            <h2>Informacion general</h2>
            <div className="info-list">
              <span><CalendarDays size={17} /> Inicio: {formatDate(tournament.startDate)}</span>
              <span>Semifinales previstas: {formatDate(tournament.semifinalsDate)}</span>
              <span>Dia de finales: {formatDate(tournament.finalsDate)}</span>
              <span><Trophy size={17} /> Formato categoria: {activeStage?.format || tournament.type}</span>
              <span><CreditCard size={17} /> Precio: {formatCurrency(tournament.price)}</span>
            </div>
          </Card>
          <Card>
            <h2>Categorias</h2>
            <div className="badge-cloud">
              {visibleCategories.map((category) => (
                <Badge key={category.id} tone="info">{category.name} {category.branch}</Badge>
              ))}
            </div>
            <p className="muted">Estado de inscripcion: {tournament.registrationStatus}</p>
            {tournament.status === "Inscripciones abiertas" ? (
              <Link className="button button--orange button--lg button--full" to={`/player/tournaments/${id}/register`}>
                <span>Inscribirme</span>
              </Link>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "participants" ? (
        <Card>
          <h2>Participantes mock - {activeStage?.categoryName}</h2>
          <div className="participant-grid">
            {participants.map((player) => (
              <div key={player.id} className="participant-card">
                <Avatar src={player.avatar} name={player.fullName} />
                <div>
                  <strong>{player.fullName}</strong>
                  <span>{player.categoryName} / #{player.ranking}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "matches" ? (
        <Card>
          <h2>Partidos del torneo - {activeStage?.categoryName}</h2>
          {matches.length ? (
            <div className="table-list">
              {matches.map((match) => (
                <Link key={match.id} className="tournament-match-row" to={`/player/matches/${match.id}`}>
                  <span>{match.round}</span>
                  <strong>{match.playerA} vs {match.playerB}</strong>
                  <Badge tone={match.status === "Finalizado" ? "success" : match.status === "Doble W.O." ? "danger" : match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No hay partidos disponibles" description="El cronograma todavia no fue publicado para este torneo." />
          )}
        </Card>
      ) : null}

      {tab === "bracket" ? (
        <Card className="bracket-card">
          <div className="section-title">
            <span>Cuadro / llave - {activeStage?.categoryName}</span>
            <GitBranch size={18} />
          </div>
          {bracket ? (
            <>
              {bracket.zones?.length ? (
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
              <PreliminaryMatches preliminaries={bracket.preliminaries || []} />
              <TournamentBracket bracket={bracket} />
            </>
          ) : (
            <EmptyState title="Cuadro no disponible" description="La llave mock todavia no fue generada para este torneo." />
          )}
        </Card>
      ) : null}

      {tab === "standings" ? (
        <Card>
          <h2>Zonas y clasificacion - {activeStage?.categoryName}</h2>
          <div className="zone-grid">
            {(bracket?.zones || []).map((zone) => (
              <div key={zone.id} className="zone-card">
                <strong>{zone.name}</strong>
                <span>Clasifican {zone.qualifiers} jugadores</span>
                {zone.players.map((player) => <span key={player}>{player}</span>)}
              </div>
            ))}
          </div>
          <p className="muted">Los criterios de desempate definitivos quedan para la etapa de algoritmo/backend.</p>
        </Card>
      ) : null}
    </div>
  );
}
