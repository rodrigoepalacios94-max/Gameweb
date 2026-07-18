import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { Avatar } from "../common/Avatar";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { Modal } from "../common/Modal";
import { matchService } from "../../services/matchService";
import { formatDate } from "../../utils/formatters";
import { describeMatchFormat, getMatchFormatRows } from "../../utils/matchFormat";

function buildRows(match) {
  const existingSets = match?.sets?.length ? match.sets : match?.resultDetail?.sets || [];
  return getMatchFormatRows(match?.matchFormat).map((row, index) => {
    const existing = existingSets[index];
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

export function MatchResultModal({ open, matchId, onClose, onSaved }) {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [resultRows, setResultRows] = useState([]);
  const [formError, setFormError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [earlyFinish, setEarlyFinish] = useState(false);
  const [earlyFinishReason, setEarlyFinishReason] = useState("");
  const [manualWinnerId, setManualWinnerId] = useState("");
  const [walkoverOpen, setWalkoverOpen] = useState(false);
  const [walkoverMode, setWalkoverMode] = useState("playerA");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadMatch() {
      if (!open || !matchId) return;
      setLoading(true);
      setLoadError("");
      setFormError("");
      try {
        const loaded = await matchService.getMatchById(matchId);
        if (!active) return;
        setMatch(loaded);
        setResultRows(buildRows(loaded));
        setEarlyFinish(Boolean(loaded?.completedEarly || loaded?.resultDetail?.completedEarly));
        setEarlyFinishReason(loaded?.earlyFinishReason || loaded?.resultDetail?.earlyFinishReason || "");
        setManualWinnerId(loaded?.winnerId || loaded?.playerAId || "");
        setWalkoverMode(loaded?.walkoverPlayerId === loaded?.playerBId ? "playerB" : "playerA");
        setWalkoverOpen(false);
        setDirty(false);
      } catch (error) {
        if (active) setLoadError(error.message || "No pudimos cargar el partido.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadMatch();
    return () => {
      active = false;
    };
  }, [open, matchId]);

  const normalizedRows = useMemo(() => normalizeRows(resultRows), [resultRows]);
  const resultPreview = useMemo(() => {
    if (!match || !normalizedRows.length) return null;
    return matchService.calculateMatchWinner({ ...match, sets: normalizedRows });
  }, [match, normalizedRows]);
  const formatDescription = match ? describeMatchFormat(match.matchFormat) : null;
  const winnerId = resultPreview?.valid ? resultPreview.winnerId : manualWinnerId;
  const confirmedWinnerId = match?.status === "Finalizado" || match?.status === "W.O." ? match.winnerId : null;

  function updateResultRow(index, field, value) {
    setResultRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
    setDirty(true);
  }

  function updateEarlyFinish(value) {
    setEarlyFinish(value);
    setDirty(true);
  }

  function closeClean() {
    setDirty(false);
    onClose?.();
  }

  async function runAction(actionName, action) {
    setFormError("");
    setBusyAction(actionName);
    try {
      const updated = await action();
      setMatch(updated);
      setResultRows(buildRows(updated));
      setDirty(false);
      await onSaved?.(updated);
      return updated;
    } catch (error) {
      setFormError(error.message || "No pudimos guardar el resultado.");
      return null;
    } finally {
      setBusyAction("");
    }
  }

  async function savePartial() {
    await runAction("partial", () => matchService.savePartialResult(match.id, { sets: normalizedRows }));
  }

  async function finalizeResult() {
    if (!earlyFinish && resultPreview && !resultPreview.valid) {
      setFormError(resultPreview.error);
      return;
    }
    if (!earlyFinish && !resultPreview?.valid) {
      setFormError("Carga el resultado completo antes de finalizar.");
      return;
    }
    if (earlyFinish && !earlyFinishReason.trim()) {
      setFormError("Indica el motivo de finalizacion anticipada.");
      return;
    }
    const action = match.status === "Finalizado" || match.status === "W.O." || match.status === "Doble W.O."
      ? matchService.editResult
      : matchService.finalizeMatch;
    await runAction("finalize", () => action.call(matchService, match.id, {
      sets: normalizedRows,
      completedEarly: earlyFinish,
      earlyFinishReason,
      manualWinnerId: winnerId,
    }));
  }

  async function saveWalkover() {
    const doubleWalkover = walkoverMode === "double";
    const walkoverPlayerId = walkoverMode === "playerA" ? match.playerAId : walkoverMode === "playerB" ? match.playerBId : null;
    await runAction("walkover", () => matchService.registerWalkover(match.id, { walkoverPlayerId, doubleWalkover }));
  }

  return (
    <Modal open={open} title={match?.result ? "Editar resultado" : "Cargar resultado"} size="xl" onClose={onClose} isDirty={dirty} confirmOnClose>
      {loading ? <LoadingState message="Cargando partido..." /> : null}
      {loadError ? <ErrorState title={loadError} /> : null}
      {!loading && !loadError && match ? (
        <div className="match-result-modal">
          <div className="match-result-modal__meta">
            <Badge tone={match.status === "Finalizado" ? "success" : match.status === "Doble W.O." ? "danger" : match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
            <span>{match.tournament}</span>
            <span>{match.category}</span>
            <span>{match.round}</span>
            <span>{formatDate(match.date)} / {match.time}</span>
            <span>{match.court}</span>
          </div>

          <div className="matchup-panel">
            <div className={confirmedWinnerId === match.playerAId ? "matchup-player is-winner" : "matchup-player"}>
              <Avatar src={match.playerAAvatar} name={match.playerA} />
              <div>
                <strong>{match.playerA}</strong>
                <span>Jugador A</span>
              </div>
            </div>
            <span className="matchup-versus">VS</span>
            <div className={confirmedWinnerId === match.playerBId ? "matchup-player is-winner" : "matchup-player"}>
              <Avatar src={match.playerBAvatar} name={match.playerB} />
              <div>
                <strong>{match.playerB}</strong>
                <span>Jugador B</span>
              </div>
            </div>
          </div>

          <div className="match-format-summary">
            <span>{formatDescription.sets}</span>
            <span>{formatDescription.games}</span>
            <span>{formatDescription.decidingSet}</span>
          </div>

          <div className="scoreboard-table-wrap">
            <table className="scoreboard-table">
              <thead>
                <tr>
                  <th>Jugador</th>
                  {resultRows.map((row) => (
                    <th key={row.label}>{row.type === "super_tiebreak" ? "Super Tie-Break" : row.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>{match.playerA}</th>
                  {resultRows.map((row, index) => (
                    <td key={`${row.label}-a`}>
                      <input aria-label={`${match.playerA} ${row.label}`} type="number" min="0" value={row.playerAScore} onChange={(event) => updateResultRow(index, "playerAScore", event.target.value)} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>{match.playerB}</th>
                  {resultRows.map((row, index) => (
                    <td key={`${row.label}-b`}>
                      <input aria-label={`${match.playerB} ${row.label}`} type="number" min="0" value={row.playerBScore} onChange={(event) => updateResultRow(index, "playerBScore", event.target.value)} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <label className={earlyFinish ? "check-pill is-selected match-result-toggle" : "check-pill match-result-toggle"}>
            <input type="checkbox" checked={earlyFinish} onChange={(event) => updateEarlyFinish(event.target.checked)} />
            <strong>Finalizacion anticipada</strong>
            <span>Usar cuando hubo retiro, lesion u otro cierre confirmado.</span>
          </label>

          {earlyFinish ? (
            <div className="early-finish-panel">
              <label>Motivo
                <textarea value={earlyFinishReason} onChange={(event) => { setEarlyFinishReason(event.target.value); setDirty(true); }} placeholder="Ejemplo: retiro por lesion en el segundo set." />
              </label>
              <label>Ganador
                <select value={winnerId} onChange={(event) => { setManualWinnerId(event.target.value); setDirty(true); }}>
                  <option value={match.playerAId}>{match.playerA}</option>
                  <option value={match.playerBId}>{match.playerB}</option>
                </select>
              </label>
            </div>
          ) : null}

          {resultPreview?.error && !earlyFinish ? (
            <p className="field-error">{resultPreview.error}</p>
          ) : null}
          {match.resultDetail?.earlyFinishReason ? <p className="mock-note">Motivo registrado: {match.resultDetail.earlyFinishReason}</p> : null}
          {formError ? <p className="field-error">{formError}</p> : null}

          <div className="match-result-actions">
            <div className="match-result-actions__primary">
              <Button icon={CheckCircle2} disabled={Boolean(busyAction)} onClick={finalizeResult}>
                {busyAction === "finalize" ? "Finalizando..." : "Finalizar partido"}
              </Button>
              <Button variant="ghost" icon={Save} disabled={Boolean(busyAction)} onClick={savePartial}>
                {busyAction === "partial" ? "Guardando..." : "Guardar parcial"}
              </Button>
              <Button variant="secondary" icon={AlertTriangle} disabled={Boolean(busyAction)} onClick={() => { setWalkoverOpen((current) => !current); setDirty(true); }}>
                Registrar W.O.
              </Button>
            </div>
            <Button className="match-result-actions__close" variant="ghost" onClick={closeClean}>Cerrar</Button>
          </div>

          {walkoverOpen ? (
            <div className="walkover-panel">
              <label>Tipo de W.O.
                <select value={walkoverMode} onChange={(event) => { setWalkoverMode(event.target.value); setDirty(true); }}>
                  <option value="playerA">W.O. {match.playerA}</option>
                  <option value="playerB">W.O. {match.playerB}</option>
                  <option value="double">Doble W.O.</option>
                </select>
              </label>
              <p className="muted">En doble W.O. no avanza ningun jugador automaticamente.</p>
              <Button variant="secondary" disabled={Boolean(busyAction)} onClick={saveWalkover}>
                {busyAction === "walkover" ? "Registrando..." : "Confirmar W.O."}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
