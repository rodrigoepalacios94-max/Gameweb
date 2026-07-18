import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Modal } from "../../components/common/Modal";
import { mockDiscipline } from "../../mocks/mockDiscipline";
import { playerService } from "../../services/playerService";

export function AdminDisciplinePage() {
  const [selectedClaim, setSelectedClaim] = useState(null);
  const players = playerService.getPlayers();
  const watchedPlayers = players.filter((player) => player.discipline.faults > 0);

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Sistema disciplinario</span>
        <h1>Disciplina</h1>
      </header>
      <div className="detail-grid">
        <Card>
          <h2>Reclamos pendientes</h2>
          <div className="compact-list">
            {mockDiscipline.claims.map((claim) => (
              <button key={claim.id} className="claim-row" onClick={() => setSelectedClaim(claim)} type="button">
                <strong>{claim.reportedPlayer}</strong>
                <span>{claim.reason}</span>
                <Badge tone={claim.status === "Pendiente" ? "warning" : "success"}>{claim.status}</Badge>
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
                {player.discipline.faults >= 3 ? <Button variant="ghost" size="sm" icon={RotateCcw}>Desbloquear jugador</Button> : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Modal open={Boolean(selectedClaim)} title="Revisar reclamo" onClose={() => setSelectedClaim(null)}>
        {selectedClaim ? (
          <div className="page-stack compact">
            <div className="info-list">
              <span>Partido: {selectedClaim.match}</span>
              <span>Jugador denunciado: {selectedClaim.reportedPlayer}</span>
              <span>Reclamante: {selectedClaim.claimant}</span>
              <span>Motivo: {selectedClaim.reason}</span>
            </div>
            <div className="card-actions">
              <Button icon={Check}>Confirmar falta</Button>
              <Button variant="secondary" icon={X}>Rechazar reclamo</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
