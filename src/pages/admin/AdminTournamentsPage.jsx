import { Link } from "react-router-dom";
import { Eye, Pencil, Plus, XCircle } from "lucide-react";
import { Button } from "../../components/common/Button";
import { TournamentCard } from "../../components/tournaments/TournamentCard";
import { tournamentService } from "../../services/tournamentService";

export function AdminTournamentsPage() {
  const tournaments = tournamentService.getTournaments();

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions">
        <div>
          <span className="eyebrow">Gestion</span>
          <h1>Torneos</h1>
        </div>
        <Link className="button button--primary button--md" to="/admin/tournaments/new">
          <Plus size={18} />
          <span>Nuevo torneo</span>
        </Link>
      </header>
      <div className="card-grid">
        {tournaments.map((tournament) => (
          <TournamentCard
            key={tournament.id}
            tournament={tournament}
            actions={
              <>
                <Button variant="ghost" size="sm" icon={Eye}>Ver</Button>
                <Button variant="ghost" size="sm" icon={Pencil}>Editar</Button>
                <Button variant="ghost" size="sm" icon={XCircle}>Cancelar</Button>
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
