import { SearchX } from "lucide-react";

export function EmptyState({ title = "Sin datos", description = "No hay informacion para mostrar." }) {
  return (
    <div className="empty-state">
      <SearchX size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
