import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { passwordService } from "../../services/passwordService";
import { Button } from "../common/Button";
import { Modal } from "../common/Modal";

const initialForm = {
  currentPassword: "",
  newPassword: "",
  repeatPassword: "",
};

function FieldError({ message }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function ChangePasswordModal({ open, onClose, title = "Cambiar contraseña" }) {
  const { role, user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setGeneralError("");
  }

  function close() {
    setForm(initialForm);
    setFieldErrors({});
    setGeneralError("");
    setSuccess(false);
    setSaving(false);
    onClose?.();
  }

  async function submit(event) {
    event.preventDefault();
    setFieldErrors({});
    setGeneralError("");
    setSaving(true);
    try {
      await passwordService.changeCurrentUserPassword(form, {
        role,
        userId: user?.id,
        email: user?.email,
      });
      setForm(initialForm);
      setSuccess(true);
    } catch (changeError) {
      if (changeError.field) {
        setFieldErrors({ [changeError.field]: changeError.message });
      } else {
        setGeneralError(changeError.message || "No pudimos cambiar la contraseña.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={close}>
      {success ? (
        <div className="registration-success">
          <CheckCircle2 size={58} />
          <h3>Contraseña actualizada</h3>
          <p>Tu nueva contraseña fue guardada correctamente.</p>
          <Button variant="outline-green" onClick={close}>Cerrar</Button>
        </div>
      ) : (
        <form className="modal-form" onSubmit={submit} noValidate>
          {generalError ? <div className="form-alert">{generalError}</div> : null}
          <label className={fieldErrors.currentPassword ? "field-has-error" : ""}>Contraseña actual
            <input autoComplete="current-password" type="password" value={form.currentPassword} onChange={(event) => updateField("currentPassword", event.target.value)} />
            <FieldError message={fieldErrors.currentPassword} />
          </label>
          <label className={fieldErrors.newPassword ? "field-has-error" : ""}>Nueva contraseña
            <input autoComplete="new-password" type="password" value={form.newPassword} onChange={(event) => updateField("newPassword", event.target.value)} />
            <FieldError message={fieldErrors.newPassword} />
          </label>
          <label className={fieldErrors.repeatPassword ? "field-has-error" : ""}>Repetir nueva contraseña
            <input autoComplete="new-password" type="password" value={form.repeatPassword} onChange={(event) => updateField("repeatPassword", event.target.value)} />
            <FieldError message={fieldErrors.repeatPassword} />
          </label>
          <div className="wizard-actions">
            <Button variant="ghost" type="button" onClick={close}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar contraseña"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
