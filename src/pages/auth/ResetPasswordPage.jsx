import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/common/Button";
import { authService } from "../../services/authService";
import logoGame from "../../assets/logo-game.png";

const MIN_PASSWORD_LENGTH = 6;

function FieldError({ message }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: "", repeatPassword: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setGeneralError("");
  }

  async function submit(event) {
    event.preventDefault();
    setFieldErrors({});
    setGeneralError("");

    if (!form.password) {
      setFieldErrors({ password: "COMPLETA ESTE CAMPO" });
      return;
    }
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setFieldErrors({ password: `LA CONTRASEÑA DEBE TENER AL MENOS ${MIN_PASSWORD_LENGTH} CARACTERES` });
      return;
    }
    if (form.password !== form.repeatPassword) {
      setFieldErrors({ repeatPassword: "LAS CONTRASENAS NO COINCIDEN" });
      return;
    }

    setSaving(true);
    try {
      await authService.updateRecoveryPassword(form.password);
      setSuccess(true);
    } catch (error) {
      setGeneralError(authService.getSafeAuthMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="reset-title">
        <img className="login-logo" src={logoGame} alt="GAME" />
        {success ? (
          <div className="registration-success">
            <CheckCircle2 size={58} />
            <h1 id="reset-title">Contrasena actualizada</h1>
            <p>Ya podes ingresar con tu nueva contrasena.</p>
            <Button onClick={() => navigate("/login", { replace: true })}>Ir al login</Button>
          </div>
        ) : (
          <>
            <div className="login-copy">
              <h1 id="reset-title">Nueva contrasena</h1>
            </div>
            <form className="login-form" onSubmit={submit} noValidate>
              {generalError ? <div className="form-alert">{generalError}</div> : null}
              <label className={fieldErrors.password ? "field-has-error" : ""}>
                Nueva contrasena
                <input autoComplete="new-password" type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} />
                <FieldError message={fieldErrors.password} />
              </label>
              <label className={fieldErrors.repeatPassword ? "field-has-error" : ""}>
                Repetir nueva contrasena
                <input autoComplete="new-password" type="password" value={form.repeatPassword} onChange={(event) => updateField("repeatPassword", event.target.value)} />
                <FieldError message={fieldErrors.repeatPassword} />
              </label>
              <button className="login-submit" disabled={saving} type="submit">
                {saving ? "GUARDANDO..." : "GUARDAR CONTRASENA"}
              </button>
              <Link className="login-link" to="/login">volver al login</Link>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
