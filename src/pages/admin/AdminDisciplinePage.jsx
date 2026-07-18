import { useState } from "react";
import { Check, RotateCcw, ShieldAlert, X } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Modal } from "../../components/common/Modal";
import { mockSettings } from "../../mocks/mockAdmin";
import { mockDiscipline } from "../../mocks/mockDiscipline";
import { playerService } from "../../services/playerService";
import { formatDate } from "../../utils/formatters";

export function AdminDisciplinePage() {
  const [claims, setClaims] = useState(mockDiscipline.claims);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const players = playerService.getPlayers();
  const watchedPlayers = players.filter((player) => player.discipline.faults > 0);

  function updateClaim(status) {
    setClaims((current) => current.map((claim) => (claim.id === selectedClaim.id ? { ...claim, status } : claim)));
    setSelectedClaim(null);
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Sistema disciplinario</span>
        <h1>Disciplina</h1>
        <p>GAME contempla partidos sin arbitro permanente. Los reclamos quedan pendientes hasta revision del profesor.</p>
      </header>

      <div className="info-band">
        <strong>Limite disciplinario</strong>
        <span>{mockSettings.discipline.faultLimit} faltas confirmadas generan expulsion del torneo actual, bloqueo de nuevas inscripciones y rehabilitacion manual.</span>
      </div>

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
                {player.discipline.faults >= player.discipline.limit ? <Button variant="ghost" size="sm" icon={RotateCcw}>Desbloquear jugador</Button> : <span className="muted">Seguimiento</span>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h2>Faltas confirmadas</h2>
        <div className="admin-table">
          {mockDiscipline.faults.map((fault) => {
            const player = playerService.getPlayerById(fault.playerId);
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
    </div>
  );
}
