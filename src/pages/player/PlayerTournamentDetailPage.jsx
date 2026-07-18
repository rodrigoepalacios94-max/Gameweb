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
import { useAsyncData } from "../../hooks/useAsyncData";
import { matchService } from "../../services/matchService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency, formatDate } from "../../utils/formatters";

export function PlayerTournamentDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState("summary");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [tournament, matches, bracket, categories, participants] = await Promise.all([
      tournamentService.getTournamentById(id),
      matchService.getMatchesByTournament(id),
      tournamentService.getTournamentBracket(id),
      tournamentService.getTournamentCategories(id),
      tournamentService.getTournamentParticipants(id),
    ]);
    return { tournament, matches, bracket, categories, participants };
  }, [id]);

  if (loading) return <LoadingState message="Cargando torneo..." />;
  if (error) return <ErrorState title="No pudimos cargar el torneo." onRetry={reload} />;

  const { tournament, matches, bracket, categories, participants } = data;

  if (!tournament) {
    return <EmptyState title="Torneo no encontrado" description="La competencia solicitada no existe en los datos mock." />;
  }

  const tabs = [
    { id: "summary", label: "Resumen" },
    { id: "participants", label: "Participantes" },
    { id: "matches", label: "Partidos" },
    ...(tournament.type === "Eliminacion Directa" || tournament.type === "Preliminar" ? [{ id: "bracket", label: "Cuadro" }] : []),
    ...(tournament.type === "Zonas" ? [{ id: "standings", label: "Zonas" }] : []),
  ];
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
            <span>{tournament.playerCategoryName}</span>
            <span>{tournament.type}</span>
            <span>{formatCurrency(tournament.price)}</span>
          </div>
        </div>
      </header>

      <Tabs tabs={tabs} activeTab={tab} onChange={setTab} />

      {tab === "summary" ? (
        <div className="detail-grid">
          <Card>
            <h2>Informacion general</h2>
            <div className="info-list">
              <span><CalendarDays size={17} /> Inicio: {formatDate(tournament.startDate)}</span>
              <span>Semifinales previstas: {formatDate(tournament.semifinalsDate)}</span>
              <span>Dia de finales: {formatDate(tournament.finalsDate)}</span>
              <span><Trophy size={17} /> Formato: {tournament.type}</span>
              <span><CreditCard size={17} /> Precio: {formatCurrency(tournament.price)}</span>
            </div>
          </Card>
          <Card>
            <h2>Categorias</h2>
            <div className="badge-cloud">
              {categories.map((category) => (
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
          <h2>Participantes mock</h2>
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
          <h2>Partidos del torneo</h2>
          {matches.length ? (
            <div className="table-list">
              {matches.map((match) => (
                <Link key={match.id} className="tournament-match-row" to={`/player/matches/${match.id}`}>
                  <span>{match.round}</span>
                  <strong>{match.playerA} vs {match.playerB}</strong>
                  <Badge tone={match.status === "Finalizado" ? "success" : match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
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
            <span>Cuadro / llave</span>
            <GitBranch size={18} />
          </div>
          {bracket ? (
            <>
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
          <h2>Zonas y clasificacion</h2>
          <div className="zone-grid">
            <div className="zone-card">
              <strong>Zona A</strong>
              <span>Tomas Lescano - 2 PG</span>
              <span>Federico Ramos - 1 PG</span>
              <span>Sebastian Gallardo - pendiente</span>
            </div>
            <div className="zone-card">
              <strong>Zona B</strong>
              <span>Nicolas Pereyra - 2 PG</span>
              <span>Diego Soria - 0 PG</span>
            </div>
          </div>
          <p className="muted">Los criterios de desempate definitivos quedan para la etapa de algoritmo/backend.</p>
        </Card>
      ) : null}
    </div>
  );
}
