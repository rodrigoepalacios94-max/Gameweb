import { Link, useParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, MapPin, Trophy } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { MatchScore } from "../../components/player/MatchScore";
import { useAsyncData } from "../../hooks/useAsyncData";
import { matchService } from "../../services/matchService";
import { formatDate } from "../../utils/formatters";

export function PlayerMatchDetailPage() {
  const { id } = useParams();
  const { data: match, loading, error, reload } = useAsyncData(() => matchService.getMatchById(id), [id]);

  if (loading) return <LoadingState message="Cargando partido..." />;
  if (error) return <ErrorState title="No pudimos cargar el partido." onRetry={reload} />;

  if (!match) {
    return <EmptyState title="Partido no encontrado" description="El partido solicitado no existe en los datos mock." />;
  }

  const winnerName = match.winnerId === match.playerAId ? match.playerA : match.winnerId === match.playerBId ? match.playerB : null;
  const walkoverName = match.walkoverPlayerId === match.playerAId ? match.playerA : match.walkoverPlayerId === match.playerBId ? match.playerB : null;

  return (
    <div className="page-stack">
      <header className="detail-hero match-detail-hero">
        <div>
          <span className="eyebrow">{match.tournament}</span>
          <h1>{match.round}</h1>
          <p>{match.category} / {match.phase}</p>
          <div className="hero-meta-row">
            <Badge tone={match.status === "Finalizado" ? "success" : match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
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
            {match.pointsEarned ? <span>Puntos obtenidos: +{match.pointsEarned}</span> : null}
          </div>
        </Card>
        <Card>
          <h2>Disciplina del partido</h2>
          {match.discipline?.claims?.length ? (
            <div className="compact-list">
              {match.discipline.claims.map((claim) => (
                <div key={claim.id} className="discipline-match-row">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{claim.reason}</strong>
                    <span>Estado del reclamo: {claim.status}</span>
                  </div>
                </div>
              ))}
              {match.discipline.confirmedFaults.map((fault) => (
                <Badge key={`${fault.playerId}-${fault.countAfter}`} tone={fault.countAfter >= fault.limit ? "danger" : "warning"}>
                  Faltas confirmadas: {fault.countAfter}/{fault.limit}
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
    </div>
  );
}
