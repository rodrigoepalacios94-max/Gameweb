import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, Edit3, MapPin, Save, Trophy } from "lucide-react";
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
import { schedulingService } from "../../services/schedulingService";
import { formatDate } from "../../utils/formatters";
import { describeMatchFormat, getMatchFormatRows } from "../../utils/matchFormat";

function buildRows(match) {
  const formatRows = getMatchFormatRows(match.matchFormat);
  return formatRows.map((row, index) => {
    const existing = match.sets?.[index];
    return {
      ...row,
      playerAScore: existing?.playerAScore ?? existing?.a ?? "",
      playerBScore: existing?.playerBScore ?? existing?.b ?? "",
    };
  });
}

function normalizeRows(rows) {
  return rows
    .filter((row) => row.playerAScore !== "" || row.playerBScore !== "")
    .map((row) => ({
      type: row.type,
      playerAScore: row.playerAScore === "" ? "" : Number(row.playerAScore),
      playerBScore: row.playerBScore === "" ? "" : Number(row.playerBScore),
    }));
}

export function AdminMatchDetailPage() {
  const { id } = useParams();
  const [modal, setModal] = useState(null);
  const [resultRows, setResultRows] = useState([]);
  const [formError, setFormError] = useState("");
  const [walkoverMode, setWalkoverMode] = useState("playerA");
  const { data: match, loading, error, reload } = useAsyncData(() => matchService.getMatchById(id), [id]);

  useEffect(() => {
    if (match) {
      setResultRows(buildRows(match));
      setWalkoverMode(match.walkoverPlayerId === match.playerBId ? "playerB" : "playerA");
      setFormError("");
    }
  }, [match]);

  const resultPreview = useMemo(() => {
    if (!match) return null;
    const filledRows = normalizeRows(resultRows);
    if (!filledRows.length) return null;
    return matchService.calculateMatchWinner({ ...match, sets: filledRows });
  }, [match, resultRows]);

  if (loading) return <LoadingState message="Cargando detalle de partido..." />;
  if (error) return <ErrorState title="No pudimos cargar el partido admin." onRetry={reload} />;

  if (!match) {
    return <EmptyState title="Partido no encontrado" description="No existe un partido con ese identificador." />;
  }

  const winnerName = match.winnerId === match.playerAId ? match.playerA : match.winnerId === match.playerBId ? match.playerB : "Pendiente";
  const walkoverOptions = [
    { value: "playerA", label: `W.O. ${match.playerA}` },
    { value: "playerB", label: `W.O. ${match.playerB}` },
    { value: "double", label: "Doble W.O." },
  ];
  const formatDescription = describeMatchFormat(match.matchFormat);

  function updateResultRow(index, field, value) {
    setResultRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  async function savePartial() {
    setFormError("");
    await matchService.savePartialResult(match.id, { sets: normalizeRows(resultRows) });
    setModal(null);
    reload();
  }

  async function finalizeResult() {
    setFormError("");
    const rows = normalizeRows(resultRows);
    const preview = matchService.calculateMatchWinner({ ...match, sets: rows });
    if (!preview.valid) {
      setFormError(preview.error);
      return;
    }
    const action = match.status === "Finalizado" || match.status === "W.O." ? matchService.editResult : matchService.finalizeMatch;
    await action.call(matchService, match.id, { sets: rows });
    setModal(null);
    reload();
  }

  async function saveWalkover() {
    const doubleWalkover = walkoverMode === "double";
    const walkoverPlayerId = walkoverMode === "playerA" ? match.playerAId : walkoverMode === "playerB" ? match.playerBId : null;
    await matchService.registerWalkover(match.id, { walkoverPlayerId, doubleWalkover });
    setModal(null);
    reload();
  }

  async function saveSchedule() {
    await matchService.rescheduleMatch(match.id, { date: "2026-07-20", time: "12:00", court: "Cancha 3" });
    setModal(null);
    reload();
  }

  async function suspendMatch() {
    await schedulingService.suspendMatch(match.id, "Suspension individual desde detalle de partido");
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
            <Badge tone={match.status === "Finalizado" ? "success" : match.status === "Doble W.O." ? "danger" : match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
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
        <Button icon={Trophy} onClick={() => setModal("result")}>{match.result ? "Editar resultado" : "Cargar resultado"}</Button>
        <Button variant="secondary" icon={AlertTriangle} onClick={() => setModal("walkover")}>Registrar W.O.</Button>
        <Button variant="ghost" icon={Edit3} onClick={() => setModal("schedule")}>Reprogramar</Button>
        {!["Finalizado", "W.O.", "Doble W.O."].includes(match.status) ? <Button variant="ghost" icon={AlertTriangle} onClick={suspendMatch}>Suspender partido</Button> : null}
      </div>

      <div className="detail-grid">
        <Card>
          <h2>Estado deportivo</h2>
          <div className="info-list">
            <span>Torneo: {match.tournament}</span>
            <span>Categoría: {match.category}</span>
            <span>Ronda: {match.round}</span>
            <span>Fecha: {formatDate(match.date)}</span>
            <span>Hora: {match.time}</span>
            <span>Cancha: {match.court}</span>
            <span>Ganador: {winnerName}</span>
            <span>Resultado: {match.result || "Pendiente"}</span>
            {match.earlyFinishReason || match.resultDetail?.earlyFinishReason ? <span>Finalizacion anticipada: {match.earlyFinishReason || match.resultDetail.earlyFinishReason}</span> : null}
          </div>
        </Card>
        <Card>
          <h2>Formato de partido</h2>
          <div className="info-list">
            <span>Sets: {formatDescription.sets}</span>
            <span>Games por set: {formatDescription.games}</span>
            <span>Set decisivo: {formatDescription.decidingSet}</span>
          </div>
        </Card>
      </div>

      <Modal open={modal === "result"} title={match.result ? "Editar resultado" : "Cargar resultado"} onClose={() => setModal(null)}>
        <div className="page-stack compact">
          <div className="result-entry">
            <div className="result-entry__head">
              <span>Set</span>
              <strong>{match.playerA}</strong>
              <strong>{match.playerB}</strong>
            </div>
            {resultRows.map((row, index) => (
              <div key={row.label} className={row.type === "super_tiebreak" ? "result-entry__row is-super" : "result-entry__row"}>
                <strong>{row.type === "super_tiebreak" ? "SUPER TIE-BREAK" : row.label}</strong>
                <input type="number" min="0" value={row.playerAScore} onChange={(event) => updateResultRow(index, "playerAScore", event.target.value)} />
                <input type="number" min="0" value={row.playerBScore} onChange={(event) => updateResultRow(index, "playerBScore", event.target.value)} />
              </div>
            ))}
          </div>
          {resultPreview?.error ? (
            <p className="field-error">{resultPreview.error}</p>
          ) : null}
          {formError ? <p className="field-error">{formError}</p> : null}
          <div className="card-actions">
            <Button variant="ghost" icon={Save} onClick={savePartial}>Guardar parcial</Button>
            <Button onClick={finalizeResult}>Finalizar partido</Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "walkover"} title="Registrar W.O." onClose={() => setModal(null)}>
        <div className="page-stack compact">
          <Select label="Tipo de W.O." value={walkoverMode} onChange={setWalkoverMode} options={walkoverOptions} />
          <p className="mock-note">
            En doble W.O. el partido queda pendiente de resolucion y no avanza ningun jugador automaticamente.
          </p>
          <Button variant="secondary" onClick={saveWalkover}>Confirmar W.O.</Button>
        </div>
      </Modal>

      <Modal open={modal === "schedule"} title="Reprogramar partido" onClose={() => setModal(null)}>
        <div className="page-stack compact">
          <div className="form-grid">
            <label>Fecha<input type="date" defaultValue="2026-07-20" /></label>
            <label>Hora<input defaultValue="12:00" /></label>
            <label>Cancha<select defaultValue="Cancha 3"><option>Cancha 1</option><option>Cancha 2</option><option>Cancha 3</option></select></label>
          </div>
          <Button variant="outline-green" onClick={saveSchedule}>Guardar reprogramacion</Button>
        </div>
      </Modal>
    </div>
  );
}
