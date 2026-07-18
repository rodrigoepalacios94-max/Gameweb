import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, GitBranch, ListFilter, Trophy } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Tabs } from "../../components/common/Tabs";
import { TournamentCard } from "../../components/tournaments/TournamentCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import { tournamentService } from "../../services/tournamentService";

const filters = [
  { id: "all", label: "Todos" },
  { id: "open", label: "Inscripciones abiertas" },
  { id: "mine", label: "Mis torneos" },
  { id: "active", label: "En curso" },
  { id: "finished", label: "Finalizados" },
];

export function PlayerTournamentsPage() {
  const [filter, setFilter] = useState("all");
  const { data: tournaments, loading, error, reload } = useAsyncData(() => tournamentService.getTournaments(), []);
  const filteredTournaments = useMemo(
    () =>
      (tournaments || []).filter((tournament) => {
        if (filter === "open") return tournament.status === "Inscripciones abiertas";
        if (filter === "mine") return tournament.registrationStatus === "Inscripto" || tournament.registrationStatus === "Finalizado";
        if (filter === "active") return tournament.status === "En juego";
        if (filter === "finished") return tournament.status === "Finalizado";
        return true;
      }),
    [filter, tournaments],
  );

  if (loading) return <LoadingState message="Cargando torneos..." />;
  if (error) return <ErrorState title="No pudimos cargar los torneos." onRetry={reload} />;

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Portal jugador</span>
        <h1>Torneos</h1>
        <p>Segui torneos abiertos, tus inscripciones, competencias en curso y el historial finalizado.</p>
      </header>

      <div className="surface-toolbar">
        <ListFilter size={18} />
        <Tabs tabs={filters} activeTab={filter} onChange={setFilter} />
      </div>

      {filteredTournaments.length ? (
        <div className="tournament-grid">
          {filteredTournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              to={`/player/tournaments/${tournament.id}`}
              actions={
                <>
                  {tournament.status === "Inscripciones abiertas" ? (
                    <Link className="button button--orange button--sm" to={`/player/tournaments/${tournament.id}/register`}>
                      <span>Inscribirme</span>
                    </Link>
                  ) : null}
                  {tournament.status === "En juego" ? (
                    <>
                      <Link className="button button--ghost button--sm" to={`/player/tournaments/${tournament.id}`}>
                        <GitBranch size={16} />
                        <span>Ver cuadro</span>
                      </Link>
                      <Link className="button button--ghost button--sm" to="/player/matches">
                        <CalendarDays size={16} />
                        <span>Ver partidos</span>
                      </Link>
                    </>
                  ) : null}
                  <Badge tone={tournament.registrationStatus === "Inscripto" ? "success" : "neutral"}>{tournament.registrationStatus}</Badge>
                </>
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No hay torneos para este filtro" description="Cambia el filtro para ver otras competencias del circuito." />
      )}

      <section className="info-band">
        <Trophy size={22} />
        <p>
          Las inscripciones usan datos mock. La regla visual respeta tu categoria actual y categorias superiores; la integracion de pago real queda para una etapa posterior.
        </p>
        <Button variant="ghost">Ver reglamento</Button>
      </section>
    </div>
  );
}
