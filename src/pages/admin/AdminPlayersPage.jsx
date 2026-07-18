import { useMemo, useState } from "react";
import { Ban, Pencil, RotateCcw } from "lucide-react";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Modal } from "../../components/common/Modal";
import { SearchInput } from "../../components/common/SearchInput";
import { Select } from "../../components/common/Select";
import { PlayerRow } from "../../components/admin/PlayerRow";
import { playerService } from "../../services/playerService";
import { normalizeText } from "../../utils/formatters";

export function AdminPlayersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const players = playerService.getPlayers();
  const filteredPlayers = useMemo(
    () => players.filter((player) => {
      const matchesQuery = normalizeText(player.fullName).includes(normalizeText(query));
      const matchesStatus = status === "Todos" || player.status === status;
      return matchesQuery && matchesStatus;
    }),
    [players, query, status],
  );

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Gestion</span>
        <h1>Jugadores</h1>
      </header>
      <Card>
        <div className="toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar jugador" />
          <Select value={status} onChange={setStatus} options={["Todos", "Activo", "Suspendido", "Bloqueado por faltas"].map((item) => ({ value: item, label: item }))} />
        </div>
        <div className="table-list">
          {filteredPlayers.map((player) => <PlayerRow key={player.id} player={player} onClick={setSelectedPlayer} />)}
        </div>
      </Card>
      <Modal open={Boolean(selectedPlayer)} title="Detalle del jugador" onClose={() => setSelectedPlayer(null)}>
        {selectedPlayer ? (
          <div className="page-stack compact">
            <h3>{selectedPlayer.fullName}</h3>
            <div className="info-list">
              <span>Categoria: {selectedPlayer.categoryName}</span>
              <span>Ranking: #{selectedPlayer.ranking}</span>
              <span>Puntos: {selectedPlayer.points}</span>
              <span>Partidos: {selectedPlayer.stats.played}</span>
              <span>Torneos: {selectedPlayer.stats.tournaments}</span>
              <span>Estado disciplinario: {selectedPlayer.discipline.status}</span>
            </div>
            <div className="card-actions">
              <Button variant="secondary" icon={Pencil}>Cambiar categoria</Button>
              <Button variant="secondary" icon={Pencil}>Modificar puntos</Button>
              <Button variant="ghost" icon={Ban}>Bloquear</Button>
              <Button variant="ghost" icon={RotateCcw}>Desbloquear</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
