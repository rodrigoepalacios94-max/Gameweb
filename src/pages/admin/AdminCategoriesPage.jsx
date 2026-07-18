import { Edit3, Plus, ToggleLeft } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { mockCategories } from "../../mocks/mockCategories";
import { playerService } from "../../services/playerService";

export function AdminCategoriesPage() {
  const branches = ["Masculino", "Femenino"];
  const players = playerService.getPlayers();

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Configuracion</span>
          <h1>Categorias</h1>
          <p>Las categorias son configurables y se comparan por nivel jerarquico, no por nombre.</p>
        </div>
        <Button icon={Plus}>Crear categoria</Button>
      </header>

      <div className="info-band">
        <strong>Regla aplicada</strong>
        <span>Un jugador puede disputar su categoria o superiores. Las categorias inferiores requieren solicitud de descenso aprobada por el profesor.</span>
      </div>

      <div className="detail-grid">
        {branches.map((branch) => (
          <Card key={branch}>
            <h2>{branch}</h2>
            <div className="category-list">
              {mockCategories.filter((category) => category.branch === branch).sort((a, b) => a.level - b.level).map((category) => {
                const count = players.filter((player) => player.categoryId === category.id).length;
                return (
                  <div key={category.id} className="category-line">
                    <strong>{category.name}</strong>
                    <span>Nivel {category.level}</span>
                    <span>{count} jugadores</span>
                    <Badge tone={category.status === "Activa" ? "success" : "neutral"}>{category.status}</Badge>
                    <Button variant="ghost" size="icon" icon={Edit3}>Editar</Button>
                    <Button variant="ghost" size="icon" icon={ToggleLeft}>Estado</Button>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
