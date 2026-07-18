import { useMemo, useState } from "react";
import { EmptyState } from "../../components/common/EmptyState";
import { Tabs } from "../../components/common/Tabs";
import { MatchCard } from "../../components/player/MatchCard";
import { matchService } from "../../services/matchService";

const filters = [
  { id: "all", label: "Todos" },
  { id: "upcoming", label: "Proximos" },
  { id: "pending", label: "Pendientes" },
  { id: "finished", label: "Finalizados" },
];

export function PlayerMatchesPage() {
  const [tab, setTab] = useState("all");
  const matches = matchService.getPlayerMatches();
  const filtered = useMemo(
    () =>
      matches.filter((match) => {
        if (tab === "upcoming") return match.status === "Programado";
        if (tab === "pending") return match.status === "Pendiente" || match.status === "Reprogramado";
        if (tab === "finished") return match.status === "Finalizado" || match.status === "W.O." || match.status === "Doble W.O.";
        return true;
      }),
    [matches, tab],
  );

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Jugador</span>
        <h1>Mis partidos</h1>
        <p>Consulta proximos encuentros, partidos pendientes de programacion y resultados cargados.</p>
      </header>
      <Tabs tabs={filters} activeTab={tab} onChange={setTab} />
      {filtered.length ? (
        <div className="match-grid">
          {filtered.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <EmptyState title="No hay partidos para este filtro" description="Cuando se publiquen nuevos cruces van a aparecer aca." />
      )}
    </div>
  );
}
