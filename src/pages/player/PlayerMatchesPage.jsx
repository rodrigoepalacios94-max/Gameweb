import { useMemo, useState } from "react";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Tabs } from "../../components/common/Tabs";
import { MatchCard } from "../../components/player/MatchCard";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { matchService } from "../../services/matchService";

const filters = [
  { id: "all", label: "Todos" },
  { id: "upcoming", label: "Proximos" },
  { id: "pending", label: "Pendientes" },
  { id: "finished", label: "Finalizados" },
];

export function PlayerMatchesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const { data: matches, loading, error, reload } = useAsyncData(() => matchService.getPlayerMatches(user.id), [user.id]);
  const filtered = useMemo(
    () =>
      (matches || []).filter((match) => {
        if (tab === "upcoming") return match.status === "Programado";
        if (tab === "pending") return match.status === "Pendiente" || match.status === "Reprogramado";
        if (tab === "finished") return match.status === "Finalizado" || match.status === "W.O." || match.status === "Doble W.O.";
        return true;
      }),
    [matches, tab],
  );

  if (loading) return <LoadingState message="Cargando partidos..." />;
  if (error) return <ErrorState title="No pudimos cargar tus partidos." onRetry={reload} />;

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
