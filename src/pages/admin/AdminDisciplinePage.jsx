import { useState } from "react";
import { Check, RotateCcw, ShieldAlert, X } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { useAsyncData } from "../../hooks/useAsyncData";
import { disciplineService } from "../../services/disciplineService";
import { playerService } from "../../services/playerService";
import { formatDate } from "../../utils/formatters";

export function AdminDisciplinePage() {
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [disciplineResolution, setDisciplineResolution] = useState(null);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [claims, faults, players] = await Promise.all([
      disciplineService.getClaims(),
      disciplineService.getFaults(),
      playerService.getPlayers(),
    ]);
    return { claims, faults, players };
  }, []);

  if (loading) return <LoadingState message="Cargando disciplina..." />;
  if (error) return <ErrorState title="No pudimos cargar disciplina." onRetry={reload} />;

  const { claims, faults, players } = data;
  const watchedPlayers = players.filter((player) => player.discipline.faults > 0);

  async function updateClaim(status) {
    let result = null;
    if (status === "Confirmado") result = await disciplineService.confirmClaim(selectedClaim.id);
    if (status === "Rechazado") await disciplineService.rejectClaim(selectedClaim.id);
    setSelectedClaim(null);
    if (result?.disciplinaryElimination?.triggered && !result.disciplinaryElimination.alreadyProcessed) {
      setDisciplineResolution(result.disciplinaryElimination);
    }
    reload();
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Sistema disciplinario</span>
        <h1>Disciplina</h1>
        <p>GAME contempla partidos sin árbitro permanente. Los reclamos quedan pendientes hasta revisión del profesor.</p>
      </header>

      <div className="detail-grid">
        <Card>
          <h2>Reclamos</h2>
          <div className="compact-list">
            {claims.map((claim) => (
              <button key={claim.id} className="claim-row" onClick={() => setSelectedClaim(claim)} type="button">
                <strong>{claim.reportedPlayer}</strong>
                <span>{claim.match}</span>
                <span>{claim.reason}</span>
                <Badge tone={claim.status === "Pendiente" ? "warning" : claim.status === "Confirmado" ? "success" : "neutral"}>{claim.status}</Badge>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2>Jugadores advertidos y bloqueados</h2>
          <div className="compact-list">
            {watchedPlayers.map((player) => (
              <div key={player.id} className="discipline-row">
                <strong>{player.fullName}</strong>
                <span>{player.discipline.faults}/{player.discipline.limit}</span>
                <Badge tone={player.discipline.faults >= 3 ? "danger" : "warning"}>{player.discipline.status}</Badge>
                {player.discipline.faults >= player.discipline.limit ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={RotateCcw}
                    onClick={async () => {
                      await disciplineService.unblockPlayer(player.id);
                      reload();
                    }}
                  >
                    Desbloquear jugador
                  </Button>
                ) : (
                  <span className="muted">Seguimiento</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h2>Faltas confirmadas</h2>
        <div className="admin-table">
          {faults.map((fault) => {
            const player = players.find((item) => item.id === fault.playerId);
            return (
              <div key={fault.id} className="admin-table-row admin-table-row--faults">
                <ShieldAlert size={18} />
                <strong>{player?.fullName}</strong>
                <span>{fault.reason}</span>
                <span>{formatDate(fault.date)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Modal open={Boolean(selectedClaim)} title="Revisar reclamo" onClose={() => setSelectedClaim(null)}>
        {selectedClaim ? (
          <div className="page-stack compact">
            <div className="info-list">
              <span>Partido: {selectedClaim.match}</span>
              <span>Jugador denunciado: {selectedClaim.reportedPlayer}</span>
              <span>Reclamante: {selectedClaim.claimant}</span>
              <span>Motivo: {selectedClaim.reason}</span>
              <span>Fecha: {formatDate(selectedClaim.date)}</span>
            </div>
            <div className="card-actions">
              <Button icon={Check} onClick={() => updateClaim("Confirmado")}>Confirmar falta</Button>
              <Button variant="secondary" icon={X} onClick={() => updateClaim("Rechazado")}>Rechazar reclamo</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal open={Boolean(disciplineResolution)} title="JUGADOR ELIMINADO" onClose={() => setDisciplineResolution(null)}>
        {disciplineResolution ? (
          <div className="match-result-modal">
            <p className="muted">{disciplineResolution.playerName} alcanzó el límite de 3 faltas y quedó eliminado del torneo.</p>
            <p className="muted">GAME actualizará automáticamente los partidos pendientes.</p>
            <div className="wizard-actions">
              <Button variant="outline-green" onClick={() => setDisciplineResolution(null)}>ENTENDIDO</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
