import { LoaderCircle } from "lucide-react";

export function LoadingState({ message = "Cargando datos de GAME..." }) {
  return (
    <div className="loading-state loading-state--panel" role="status">
      <LoaderCircle size={24} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
