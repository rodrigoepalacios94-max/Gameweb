import { Edit3, Plus, ToggleLeft } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { mockCategories } from "../../mocks/mockCategories";

export function AdminCategoriesPage() {
  const branches = ["Masculino", "Femenino"];

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions">
        <div>
          <span className="eyebrow">Configuracion</span>
          <h1>Categorias</h1>
        </div>
        <Button icon={Plus}>Crear</Button>
      </header>
      <div className="detail-grid">
        {branches.map((branch) => (
          <Card key={branch}>
            <h2>{branch}</h2>
            <div className="category-list">
              {mockCategories.filter((category) => category.branch === branch).sort((a, b) => a.level - b.level).map((category) => (
                <div key={category.id} className="category-line">
                  <strong>{category.name}</strong>
                  <span>Nivel {category.level}</span>
                  <Badge tone={category.status === "Activa" ? "success" : "neutral"}>{category.status}</Badge>
                  <Button variant="ghost" size="icon" icon={Edit3}>Editar</Button>
                  <Button variant="ghost" size="icon" icon={ToggleLeft}>Estado</Button>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
