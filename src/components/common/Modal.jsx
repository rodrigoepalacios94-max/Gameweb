import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

export function Modal({ open, title, children, onClose, size = "md", isDirty = false, confirmOnClose = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") requestClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, isDirty, confirmOnClose]);

  if (!open) return null;

  function requestClose() {
    if (confirmOnClose && isDirty && !window.confirm("Hay cambios sin guardar. Queres cerrar igualmente?")) return;
    onClose?.();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={requestClose}>
      <div className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h2>{title}</h2>
          <Button variant="ghost" size="icon" icon={X} onClick={requestClose}>
            Cerrar
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
