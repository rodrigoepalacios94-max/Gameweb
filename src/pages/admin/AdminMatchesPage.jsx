import { useMemo, useState } from "react";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { Select } from "../../components/common/Select";
import { matchService } from "../../services/matchService";
import { tournamentService } from "../../services/tournamentService";

const states = ["Todos", "Pendiente", "Programado", "En juego", "Finalizado", "Suspendido", "Pausado", "Reprogramado", "W.O.", "Doble W.O."];

export function AdminMatchesPage() {
  const [state, setState] = useState("Todos");
  const [tournamentId, setTournamentId] = useState("Todos");
  const matches = matchService.getMatches();
  const tournaments = tournamentService.getTournaments();
  const filtered = useMemo(
    () => matches.filter((match) => (state === "Todos" || match.status === state) && (tournamentId === "Todos" || match.tournamentId === tournamentId)),
    [matches, state, tournamentId],
  );

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Programacion</span>
        <h1>Partidos</h1>
      </header>
      <Card>
        <div className="toolbar">
          <Select value={tournamentId} onChange={setTournamentId} options={[{ value: "Todos", label: "Todos los torneos" }, ...tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }))]} />
          <Select value={state} onChange={setState} options={states.map((item) => ({ value: item, label: item }))} />
        </div>
        <div className="table-list">
          {filtered.map((match) => (
            <div key={match.id} className="admin-match-row">
              <strong>{match.tournament}</strong>
              <span>{match.category}</span>
              <span>{match.round}</span>
              <span>{match.date} {match.time}</span>
              <span>{match.court}</span>
              <Badge tone={match.status === "Finalizado" ? "neutral" : "info"}>{match.status}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
