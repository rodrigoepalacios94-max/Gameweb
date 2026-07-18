import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Pencil, Plus, XCircle } from "lucide-react";
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
  { id: "Inscripciones abiertas", label: "Inscripciones" },
  { id: "En juego", label: "En juego" },
  { id: "Proximamente", label: "Proximos" },
  { id: "Finalizado", label: "Finalizados" },
];

export function AdminTournamentsPage() {
  const [tab, setTab] = useState("all");
  const { data: tournaments, loading, error, reload } = useAsyncData(() => tournamentService.getTournaments(), []);
  const filtered = useMemo(() => (tournaments || []).filter((tournament) => tab === "all" || tournament.status === tab), [tab, tournaments]);

  if (loading) return <LoadingState message="Cargando torneos..." />;
  if (error) return <ErrorState title="No pudimos cargar torneos." onRetry={reload} />;

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Gestion</span>
          <h1>Torneos</h1>
          <p>Crear, editar, cancelar, finalizar y consultar competencias sin perder historial.</p>
        </div>
        <Link className="button button--orange button--lg" to="/admin/tournaments/new">
          <Plus size={18} />
          <span>Nuevo torneo</span>
        </Link>
      </header>

      <div className="surface-toolbar">
        <Tabs tabs={filters} activeTab={tab} onChange={setTab} />
        <Badge tone="info">{filtered.length} torneos</Badge>
      </div>

      {filtered.length ? (
        <div className="tournament-grid">
          {filtered.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              actions={
                <>
                  <Link className="button button--outline-green button--sm" to={`/admin/tournaments/${tournament.id}`}>
                    <Eye size={16} />
                    <span>Ver detalle</span>
                  </Link>
                  <Button variant="ghost" size="sm" icon={Pencil}>Editar</Button>
                  <Button variant="ghost" size="sm" icon={XCircle}>Cancelar</Button>
                </>
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState title="Sin torneos para este filtro" description="Cambia el filtro o crea un torneo nuevo." />
      )}
    </div>
  );
}
