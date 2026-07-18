import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

export function ErrorState({ title = "No pudimos cargar los datos.", actionLabel = "Reintentar", onRetry }) {
  return (
    <div className="error-state error-state--panel" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>{actionLabel}</Button> : null}
      </div>
    </div>
  );
}
