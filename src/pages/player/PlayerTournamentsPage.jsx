import { useMemo, useState } from "react";
import { ListFilter } from "lucide-react";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Tabs } from "../../components/common/Tabs";
import { PlayerTournamentCard } from "../../components/tournaments/PlayerTournamentCard";
import { TournamentRegistrationModal } from "../../components/tournaments/TournamentRegistrationModal";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { enrollmentService } from "../../services/enrollmentService";
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";
import { buildPlayerTournamentViews } from "../../utils/playerTournamentView";

async function loadOptional(label, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    console.error(`[GAME Player] ${label}`, {
      code: error.code || error.cause?.code || null,
      message: error.message || error.cause?.message || null,
      details: error.details || error.cause?.details || null,
      hint: error.hint || error.cause?.hint || null,
    });
    return fallback;
  }
}

const filters = [
  { id: "all", label: "Todos" },
  { id: "open", label: "Inscripciones abiertas" },
  { id: "mine", label: "Mis torneos" },
  { id: "active", label: "En curso" },
  { id: "finished", label: "Finalizados" },
];

export function PlayerTournamentsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [registrationTournament, setRegistrationTournament] = useState(null);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const currentPlayer = await loadOptional("current player", () => playerService.getCurrentPlayer(), user);
    const [tournaments, categories, enrollments] = await Promise.all([
      loadOptional("visible tournaments", () => tournamentService.getVisibleTournamentsForPlayer(user.id), []),
      loadOptional("categories", () => categoryService.getCategories(), []),
      loadOptional("enrollments", () => enrollmentService.getEnrollmentsByPlayer(user.id), []),
    ]);
    const enrichedTournaments = buildPlayerTournamentViews({ tournaments, categories, currentPlayer, enrollments });
    return { tournaments: enrichedTournaments, currentPlayer };
  }, [user.id]);
  const tournaments = data?.tournaments || [];
  const currentPlayer = data?.currentPlayer || user;
  const filteredTournaments = useMemo(
    () =>
      (tournaments || []).filter((tournament) => {
        if (filter === "open") return tournament.status === "Inscripciones abiertas" && tournament.eligibleCategories.length > 0;
        if (filter === "mine") return Boolean(tournament.existingEnrollments?.length) || tournament.participants?.includes(user.id);
        if (filter === "active") return tournament.status === "En juego" && (Boolean(tournament.existingEnrollments?.length) || tournament.participants?.includes(user.id));
        if (filter === "finished") return tournament.status === "Finalizado" && (Boolean(tournament.existingEnrollments?.length) || tournament.participants?.includes(user.id));
        return true;
      }),
    [filter, tournaments],
  );

  if (loading) return <LoadingState message="Cargando torneos..." />;
  if (error) return <ErrorState title="No pudimos cargar los torneos." onRetry={reload} />;

  const missingTournamentProfileData = !currentPlayer?.gender || !currentPlayer?.categoryId;

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

      {missingTournamentProfileData ? (
        <div className="info-band info-band--warning">
          <strong>Completá tu sexo y categoría actual para ver los torneos disponibles.</strong>
        </div>
      ) : null}

      {filteredTournaments.length ? (
        <div className="tournament-grid">
          {filteredTournaments.map((tournament) => (
            <PlayerTournamentCard
              key={tournament.id}
              tournament={tournament}
              personalStatus={tournament.personalStatus}
              onRegister={() => setRegistrationTournament(tournament)}
            />
          ))}
        </div>
      ) : (
        <EmptyState title={tournaments.length ? "No hay torneos para este filtro" : "NO HAY TORNEOS DISPONIBLES"} description={tournaments.length ? "Cambiá el filtro para ver otras competencias del circuito." : "Cuando el administrador abra inscripciones, los torneos aparecerán acá."} />
      )}
      <TournamentRegistrationModal
        open={Boolean(registrationTournament)}
        tournament={registrationTournament}
        player={currentPlayer}
        categories={registrationTournament?.playerTournamentCategories || []}
        existingEnrollments={registrationTournament?.existingEnrollments || []}
        onClose={() => setRegistrationTournament(null)}
        onConfirmed={reload}
      />
    </div>
  );
}
