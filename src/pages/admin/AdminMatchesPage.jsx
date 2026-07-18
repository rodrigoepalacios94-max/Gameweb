import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { Select } from "../../components/common/Select";
import { matchService } from "../../services/matchService";
import { tournamentService } from "../../services/tournamentService";
import { formatDate } from "../../utils/formatters";

const states = ["Todos", "Pendiente", "Programado", "En juego", "Finalizado", "Suspendido", "Pausado", "Reprogramado", "W.O.", "Doble W.O."];

export function AdminMatchesPage() {
  const [state, setState] = useState("Todos");
  const [tournamentId, setTournamentId] = useState("Todos");
  const [category, setCategory] = useState("Todos");
  const matches = matchService.getMatches();
  const tournaments = tournamentService.getTournaments();
  const categories = Array.from(new Set(matches.map((match) => match.category)));
  const filtered = useMemo(
    () =>
      matches.filter(
        (match) =>
          (state === "Todos" || match.status === state) &&
          (tournamentId === "Todos" || match.tournamentId === tournamentId) &&
          (category === "Todos" || match.category === category),
      ),
    [matches, state, tournamentId, category],
  );

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Programacion y resultados</span>
        <h1>Partidos</h1>
        <p>Consulta, reprograma, registra resultados, W.O. y faltas desde el detalle administrativo.</p>
      </header>

      <Card>
        <div className="toolbar">
          <Select value={tournamentId} onChange={setTournamentId} options={[{ value: "Todos", label: "Todos los torneos" }, ...tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }))]} />
          <Select value={category} onChange={setCategory} options={[{ value: "Todos", label: "Todas las categorias" }, ...categories.map((item) => ({ value: item, label: item }))]} />
          <Select value={state} onChange={setState} options={states.map((item) => ({ value: item, label: item }))} />
        </div>

        <div className="admin-table">
          {filtered.map((match) => (
            <div key={match.id} className="admin-table-row admin-table-row--matches">
              <strong>{match.tournament}</strong>
              <span>{match.category}</span>
              <span>{match.round}</span>
              <span>{formatDate(match.date)} {match.time}</span>
              <span>{match.court}</span>
              <Badge tone={match.status === "Finalizado" ? "success" : match.status === "W.O." ? "warning" : "info"}>{match.status}</Badge>
              <Link className="button button--outline-green button--sm" to={`/admin/matches/${match.id}`}>
                <Eye size={16} />
                <span>Detalle</span>
              </Link>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
