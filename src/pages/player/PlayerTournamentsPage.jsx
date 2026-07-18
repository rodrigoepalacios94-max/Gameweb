import { TournamentCard } from "../../components/tournaments/TournamentCard";
import { tournamentService } from "../../services/tournamentService";

export function PlayerTournamentsPage() {
  const tournaments = tournamentService.getTournaments();

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Jugador</span>
        <h1>Torneos</h1>
        <p>Explora torneos abiertos, proximos, en juego y finalizados.</p>
      </header>
      <div className="card-grid">
        {tournaments.map((tournament) => (
          <TournamentCard key={tournament.id} tournament={tournament} to={`/player/tournaments/${tournament.id}`} />
        ))}
      </div>
    </div>
  );
}
