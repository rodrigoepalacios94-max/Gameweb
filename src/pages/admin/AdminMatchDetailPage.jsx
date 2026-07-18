import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, Edit3, MapPin, Trophy } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { Select } from "../../components/common/Select";
import { MatchScore } from "../../components/player/MatchScore";
import { useAsyncData } from "../../hooks/useAsyncData";
import { matchService } from "../../services/matchService";
import { formatDate } from "../../utils/formatters";

export function AdminMatchDetailPage() {
  const { id } = useParams();
  const [modal, setModal] = useState(null);
  const [winnerId, setWinnerId] = useState("");
  const [walkoverPlayerId, setWalkoverPlayerId] = useState("");
  const { data: match, loading, error, reload } = useAsyncData(() => matchService.getMatchById(id), [id]);

  useEffect(() => {
    if (match) {
      setWinnerId(match.winnerId || match.playerAId || "");
      setWalkoverPlayerId(match.walkoverPlayerId || match.playerBId || "");
    }
  }, [match]);

  if (loading) return <LoadingState message="Cargando detalle de partido..." />;
  if (error) return <ErrorState title="No pudimos cargar el partido admin." onRetry={reload} />;

  if (!match) {
    return <EmptyState title="Partido no encontrado" description="No existe un partido mock con ese identificador." />;
  }

  const winnerName = match.winnerId === match.playerAId ? match.playerA : match.winnerId === match.playerBId ? match.playerB : "Pendiente";
  const playerOptions = [
    { value: match.playerAId, label: match.playerA },
    { value: match.playerBId, label: match.playerB },
  ];

  async function saveResult() {
    await matchService.saveResult(match.id, { winnerId });
    setModal(null);
    reload();
  }

  async function saveWalkover() {
    await matchService.registerWalkover(match.id, { walkoverPlayerId });
    setModal(null);
    reload();
  }

  async function saveSchedule() {
    await matchService.rescheduleMatch(match.id, { date: "2026-07-20", time: "12:00", court: "Cancha 3" });
    setModal(null);
    reload();
  }

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
          <Link className="inline-link inline-link--compact" to={`/admin/players/${match.playerAId}`}>Ver jugador</Link>
        </div>
        <div className="versus-score">
          <span>VS</span>
          <MatchScore match={match} />
        </div>
        <div className="competitor">
          <Avatar src={match.playerBAvatar} name={match.playerB} size="xl" />
          <strong>{match.playerB}</strong>
          <Link className="inline-link inline-link--compact" to={`/admin/players/${match.playerBId}`}>Ver jugador</Link>
        </div>
      </Card>

      <div className="card-actions">
        <Button icon={Trophy} onClick={() => setModal("result")}>Cargar resultado</Button>
        <Button variant="secondary" icon={AlertTriangle} onClick={() => setModal("walkover")}>Registrar W.O.</Button>
        <Button variant="ghost" icon={Edit3} onClick={() => setModal("schedule")}>Modificar programacion</Button>
      </div>

      <div className="detail-grid">
        <Card>
          <h2>Estado deportivo</h2>
          <div className="info-list">
            <span>Torneo: {match.tournament}</span>
            <span>Fecha: {formatDate(match.date)}</span>
            <span>Hora: {match.time}</span>
            <span>Cancha: {match.court}</span>
            <span>Ganador: {winnerName}</span>
            <span>Resultado: {match.result || "Pendiente"}</span>
          </div>
        </Card>
        <Card>
          <h2>Auditoria y disciplina</h2>
          <div className="info-list">
            <span>Los resultados pueden corregirse solo por el profesor.</span>
            <span>Toda modificacion importante debera registrarse en historial cuando exista backend.</span>
            <span>Reclamos: {match.discipline?.claims?.length || 0}</span>
            <span>Faltas confirmadas: {match.discipline?.confirmedFaults?.length || 0}</span>
          </div>
        </Card>
      </div>

      <Modal open={modal === "result"} title="Cargar resultado" onClose={() => setModal(null)}>
        <div className="page-stack compact">
          <Select label="Ganador" value={winnerId} onChange={setWinnerId} options={playerOptions} />
          <div className="form-grid">
            <label>Set 1<input defaultValue="6-4" /></label>
            <label>Set 2<input defaultValue="7-5" /></label>
            <label>Super tie-break<input placeholder="Opcional" /></label>
          </div>
          <p className="mock-note">Validacion visual: el profesor ingresa sets, games y super tie-break si corresponde. El ganador se determina en esta version por seleccion mock.</p>
          <Button onClick={saveResult}>Confirmar resultado</Button>
        </div>
      </Modal>

      <Modal open={modal === "walkover"} title="Registrar W.O." onClose={() => setModal(null)}>
        <div className="page-stack compact">
          <Select label="Jugador que no se presenta" value={walkoverPlayerId} onChange={setWalkoverPlayerId} options={playerOptions} />
          <p className="mock-note">El W.O. actualiza visualmente ganador y estado. Puntos y llave quedan indicados como consecuencia deportiva pendiente de motor real.</p>
          <Button variant="secondary" onClick={saveWalkover}>Confirmar W.O.</Button>
        </div>
      </Modal>

      <Modal open={modal === "schedule"} title="Modificar fecha, hora o cancha" onClose={() => setModal(null)}>
        <div className="page-stack compact">
          <div className="form-grid">
            <label>Fecha<input type="date" defaultValue="2026-07-20" /></label>
            <label>Hora<input defaultValue="12:00" /></label>
            <label>Cancha<select defaultValue="Cancha 3"><option>Cancha 1</option><option>Cancha 2</option><option>Cancha 3</option></select></label>
          </div>
          <p className="mock-note">La interfaz representa la revision de conflictos de horario, cancha, jugadores y descanso. En esta etapa permite guardar bajo responsabilidad del profesor.</p>
          <Button variant="outline-green" onClick={saveSchedule}>Guardar reprogramacion</Button>
        </div>
      </Modal>
    </div>
  );
}
