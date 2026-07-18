import { Link, useParams } from "react-router-dom";
import { CalendarDays, CreditCard, Trophy } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { mockCategories } from "../../mocks/mockCategories";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency, formatDate } from "../../utils/formatters";

export function PlayerTournamentDetailPage() {
  const { id } = useParams();
  const tournament = tournamentService.getTournamentById(id);

  if (!tournament) {
    return <Card>Torneo no encontrado.</Card>;
  }

  const categories = mockCategories.filter((category) => tournament.categories.includes(category.id));
  const canRegister = tournament.status === "Inscripciones abiertas";

  return (
    <div className="page-stack">
      <header className="detail-hero">
        <div>
          <span className="eyebrow">{tournament.scoringSystem}</span>
          <h1>{tournament.name}</h1>
          <p>{tournament.description}</p>
        </div>
        <Badge tone={canRegister ? "success" : "neutral"}>{tournament.status}</Badge>
      </header>

      <div className="detail-grid">
        <Card>
          <h2>Informacion general</h2>
          <div className="info-list">
            <span><CalendarDays size={17} /> Inicio: {formatDate(tournament.startDate)}</span>
            <span>Semifinales: {formatDate(tournament.semifinalsDate)}</span>
            <span>Dia de finales: {formatDate(tournament.finalsDate)}</span>
            <span><Trophy size={17} /> Formato: {tournament.type}</span>
            <span><CreditCard size={17} /> Precio: {formatCurrency(tournament.price)}</span>
          </div>
        </Card>
        <Card>
          <h2>Categorias</h2>
          <div className="badge-cloud">
            {categories.map((category) => (
              <Badge key={category.id} tone="info">{category.name} {category.branch}</Badge>
            ))}
          </div>
          <p className="muted">Estado de inscripcion: {tournament.registrationStatus}</p>
        </Card>
      </div>

      <Link className={`button button--primary button--lg ${!canRegister ? "is-disabled" : ""}`} to={`/player/tournaments/${id}/register`}>
        <span>Inscribirme</span>
      </Link>
    </div>
  );
}
