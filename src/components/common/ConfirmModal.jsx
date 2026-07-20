import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function ConfirmModal({
  open,
  title = "Confirmar accion",
  message,
  confirmLabel = "Si",
  cancelLabel = "No",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} size="sm">
      <div className="confirm-modal">
        <AlertTriangle size={28} />
        <p>{message}</p>
        <div className="wizard-actions">
          <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
