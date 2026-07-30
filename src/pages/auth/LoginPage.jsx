import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { StartupLoader } from "../../components/common/StartupLoader";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/authService";
import { categoryService } from "../../services/categoryService";
import logoGame from "../../assets/logo-game.png";

const MIN_REGISTER_PASSWORD_LENGTH = 6;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialRegisterForm = {
  firstName: "",
  lastName: "",
  email: "",
  document: "",
  address: "",
  phone: "",
  birthDate: "",
  gender: "",
  categoryId: "",
  password: "",
  repeatPassword: "",
};

function getTargetPath(role) {
  return role === "admin" ? "/admin" : "/player";
}

function getPlayerRedirectPath(location) {
  const fromPath = location.state?.from?.pathname;
  return fromPath?.startsWith("/player") ? fromPath : "/player";
}

function FieldError({ message }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function validateRegisterForm(form, categories) {
  if (!form.firstName.trim()) return { field: "firstName", message: "INGRESA TU NOMBRE" };
  if (!form.lastName.trim()) return { field: "lastName", message: "INGRESA TU APELLIDO" };
  if (!emailPattern.test(form.email.trim())) return { field: "email", message: "INGRESA UN CORREO VÁLIDO" };
  if (form.document.trim() && !/^\d+$/.test(form.document.trim())) return { field: "document", message: "EL DOCUMENTO SOLO PUEDE CONTENER NÚMEROS" };
  if (form.phone.trim() && !/^\d+$/.test(form.phone.trim())) return { field: "phone", message: "EL TELÉFONO SOLO PUEDE CONTENER NÚMEROS" };
  if (!form.categoryId || !categories.some((category) => category.id === form.categoryId)) return { field: "categoryId", message: "SELECCIONÁ UNA CATEGORÍA" };
  if (!form.password) return { field: "password", message: "COMPLETA ESTE CAMPO" };
  if (form.password.length < MIN_REGISTER_PASSWORD_LENGTH) {
    return { field: "password", message: `LA CONTRASEÑA DEBE TENER AL MENOS ${MIN_REGISTER_PASSWORD_LENGTH} CARACTERES` };
  }
  if (!form.repeatPassword) return { field: "repeatPassword", message: "COMPLETA ESTE CAMPO" };
  if (form.password !== form.repeatPassword) return { field: "repeatPassword", message: "LAS CONTRASEÑAS NO COINCIDEN" };
  return null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authLoading, authTransitioning, error, registerPlayer, signInAdmin, signInPlayer, signInWithGoogle } = useAuth();
  const [playerForm, setPlayerForm] = useState({ email: "", password: "" });
  const [playerErrors, setPlayerErrors] = useState({});
  const [playerGeneralError, setPlayerGeneralError] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryLoadError, setCategoryLoadError] = useState("");
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [registerErrors, setRegisterErrors] = useState({});
  const [registerGeneralError, setRegisterGeneralError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetSending, setResetSending] = useState(false);

  const isBusy = authLoading || authTransitioning;

  useEffect(() => {
    categoryService
      .getActiveCategories()
      .then((activeCategories) => {
        setCategories(activeCategories);
        setCategoryLoadError("");
        setRegisterForm((current) => ({ ...current, categoryId: current.categoryId || activeCategories[0]?.id || "" }));
      })
      .catch(() => {
        setCategories([]);
        setCategoryLoadError("NO PUDIMOS CARGAR LAS CATEGORÍAS");
      });
  }, []);

  function updatePlayerField(field, value) {
    setPlayerForm((current) => ({ ...current, [field]: value }));
    setPlayerErrors((current) => ({ ...current, [field]: "" }));
    setPlayerGeneralError("");
  }

  function updateRegisterField(field, value) {
    setRegisterForm((current) => ({ ...current, [field]: value }));
    setRegisterErrors((current) => ({ ...current, [field]: "" }));
    setRegisterGeneralError("");
    setRegisterSuccess("");
  }

  function updateDigitsField(field, value) {
    if (/\D/.test(value)) {
      setRegisterErrors((current) => ({
        ...current,
        [field]: field === "document" ? "EL DOCUMENTO SOLO PUEDE CONTENER NÚMEROS" : "EL TELÉFONO SOLO PUEDE CONTENER NÚMEROS",
      }));
    } else {
      setRegisterErrors((current) => ({ ...current, [field]: "" }));
    }
    setRegisterForm((current) => ({ ...current, [field]: value.replace(/\D/g, "") }));
    setRegisterGeneralError("");
    setRegisterSuccess("");
  }

  async function submitPlayer(event) {
    event.preventDefault();
    setPlayerErrors({});
    setPlayerGeneralError("");

    if (!playerForm.email.trim()) {
      setPlayerErrors({ email: "No existe una cuenta asociada a ese correo." });
      return;
    }
    if (!playerForm.password) {
      setPlayerErrors({ password: "CONTRASEÑA INCORRECTA" });
      return;
    }

    try {
      const sessionState = await signInPlayer(playerForm);
      navigate(sessionState.role === "player" ? getPlayerRedirectPath(location) : getTargetPath(sessionState.role), { replace: true });
    } catch (loginError) {
      if (loginError.field) setPlayerErrors({ [loginError.field]: loginError.message });
      else setPlayerGeneralError(loginError.message || error || "No pudimos iniciar sesión.");
    }
  }

  async function submitGoogle() {
    setPlayerErrors({});
    setPlayerGeneralError("");
    try {
      await signInWithGoogle();
    } catch (googleError) {
      setPlayerGeneralError(googleError.message || "No pudimos iniciar sesión con Google.");
    }
  }

  async function submitAdmin(event) {
    event.preventDefault();
    setAdminError("");

    try {
      const sessionState = await signInAdmin({ password: adminPassword });
      setAdminOpen(false);
      navigate(getTargetPath(sessionState.role), { replace: true });
    } catch (loginError) {
      setAdminError(loginError.message || "CONTRASENA INCORRECTA");
    }
  }

  async function submitRegister(event) {
    event.preventDefault();
    setRegisterErrors({});
    setRegisterGeneralError("");
    setRegisterSuccess("");

    const validationError = validateRegisterForm(registerForm, categories);
    if (validationError) {
      setRegisterErrors({ [validationError.field]: validationError.message });
      return;
    }

    try {
      const sessionState = await registerPlayer(registerForm);
      setRegisterForm(initialRegisterForm);
      if (sessionState.pendingEmailConfirmation) {
        setRegisterSuccess(sessionState.message || "CUENTA CREADA. Revisa tu correo para confirmar tu cuenta.");
        return;
      }
      setRegisterOpen(false);
      navigate(getTargetPath(sessionState.role), { replace: true });
    } catch (registerError) {
      if (registerError.field) setRegisterErrors({ [registerError.field]: registerError.message });
      else setRegisterGeneralError(registerError.message || error || "No pudimos crear la cuenta.");
    }
  }

  async function submitReset(event) {
    event.preventDefault();
    setResetError("");
    setResetSuccess("");
    if (!emailPattern.test(resetEmail.trim())) {
      setResetError("INGRESA UN CORREO VÁLIDO");
      return;
    }
    setResetSending(true);
    try {
      await authService.sendPasswordResetEmail(resetEmail);
      setResetSuccess("TE ENVIAMOS UN CORREO PARA RESTABLECER TU CONTRASEÑA.");
    } catch (resetRequestError) {
      setResetError(authService.getSafeAuthMessage(resetRequestError));
    } finally {
      setResetSending(false);
    }
  }

  return (
    <main className="login-page">
      {authTransitioning ? <StartupLoader onComplete={() => {}} /> : null}
      <section className="login-panel" aria-labelledby="login-title">
        <img className="login-logo" src={logoGame} alt="GAME" />
        <div className="login-copy">
          <h1 id="login-title">Bienvenido</h1>
        </div>

        <button className="login-google-button" type="button" disabled={isBusy} onClick={submitGoogle}>
          <svg className="login-google-mark" aria-hidden="true" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.29h6.47a5.53 5.53 0 0 1-2.4 3.63v2.96h3.89c2.27-2.09 3.53-5.18 3.53-8.61Z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.89-2.96c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.05A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.28 14.33A7.2 7.2 0 0 1 4.9 12c0-.81.14-1.6.38-2.33V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4.01-3.05Z" />
            <path fill="#EA4335" d="M12 4.72c1.76 0 3.34.61 4.58 1.8l3.45-3.45A11.57 11.57 0 0 0 12 0 12 12 0 0 0 1.27 6.62l4.01 3.05C6.23 6.83 8.88 4.72 12 4.72Z" />
          </svg>
          <span>Continuar con Google</span>
        </button>
        <div className="login-separator" aria-hidden="true"><span />o<span /></div>

        <form className="login-form" onSubmit={submitPlayer} noValidate>
          {playerGeneralError ? <div className="form-alert">{playerGeneralError}</div> : null}
          <label className={playerErrors.email ? "field-has-error" : ""}>
            Correo
            <input autoComplete="email" inputMode="email" name="email" onChange={(event) => updatePlayerField("email", event.target.value)} required type="text" value={playerForm.email} />
            <FieldError message={playerErrors.email} />
          </label>
          <label className={playerErrors.password ? "field-has-error" : ""}>
            Contraseña
            <input autoComplete="current-password" name="password" onChange={(event) => updatePlayerField("password", event.target.value)} required type="password" value={playerForm.password} />
            <FieldError message={playerErrors.password} />
          </label>
          <button className="login-submit" disabled={isBusy} type="submit">
            {authLoading ? "VALIDANDO..." : "INICIAR SESIÓN"}
          </button>
          <button className="login-link" type="button" onClick={() => setResetOpen(true)}>Olvidé mi contraseña</button>
        </form>

        <button className="login-register-link" type="button" onClick={() => setRegisterOpen(true)}>
          <span>¿Usuario nuevo?</span>
          <strong>Registrate</strong>
        </button>
      </section>
      <button className="login-admin-lock" type="button" onClick={() => setAdminOpen(true)} aria-label="Acceso profesor">
        <LockKeyhole size={34} />
      </button>

      {adminOpen ? (
        <div className="modal-backdrop">
          <div className="modal login-admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
            <div className="modal__header">
              <div>
                <span className="section-kicker">Profesor</span>
                <h2 id="admin-login-title">Acceso administrador</h2>
              </div>
            </div>
            <form className="modal-form" onSubmit={submitAdmin}>
              <label className={adminError ? "field-has-error" : ""}>
                Contrasena
                <input autoComplete="current-password" autoFocus onChange={(event) => {
                  setAdminPassword(event.target.value);
                  setAdminError("");
                }} required type="password" value={adminPassword} />
                <FieldError message={adminError} />
              </label>
              <div className="match-result-actions">
                <button className="button button--ghost" type="button" onClick={() => setAdminOpen(false)}>Cancelar</button>
                <button className="button button--orange" disabled={isBusy} type="submit">
                  {authLoading ? "Validando..." : "Ingresar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <Modal open={registerOpen} title="Crear cuenta" size="lg" onClose={() => setRegisterOpen(false)}>
        <form className="modal-form" onSubmit={submitRegister} noValidate>
          {categoryLoadError ? <div className="form-alert">{categoryLoadError}</div> : null}
          {registerGeneralError ? <div className="form-alert">{registerGeneralError}</div> : null}
          {registerSuccess ? <div className="info-band">{registerSuccess}</div> : null}
          <div className="form-grid">
            <label className={registerErrors.firstName ? "field-has-error" : ""}>Nombre
              <input required value={registerForm.firstName} onChange={(event) => updateRegisterField("firstName", event.target.value)} />
              <FieldError message={registerErrors.firstName} />
            </label>
            <label className={registerErrors.lastName ? "field-has-error" : ""}>Apellido
              <input required value={registerForm.lastName} onChange={(event) => updateRegisterField("lastName", event.target.value)} />
              <FieldError message={registerErrors.lastName} />
            </label>
            <label className={registerErrors.email ? "field-has-error" : ""}>Correo
              <input required inputMode="email" type="text" value={registerForm.email} onChange={(event) => updateRegisterField("email", event.target.value)} />
              <FieldError message={registerErrors.email} />
            </label>
            <label className={registerErrors.document ? "field-has-error" : ""}>Documento
              <input inputMode="numeric" pattern="[0-9]*" value={registerForm.document} onChange={(event) => updateDigitsField("document", event.target.value)} />
              <FieldError message={registerErrors.document} />
            </label>
            <label>Domicilio
              <input value={registerForm.address} onChange={(event) => updateRegisterField("address", event.target.value)} />
            </label>
            <label className={registerErrors.phone ? "field-has-error" : ""}>Teléfono
              <input inputMode="numeric" pattern="[0-9]*" value={registerForm.phone} onChange={(event) => updateDigitsField("phone", event.target.value)} />
              <FieldError message={registerErrors.phone} />
            </label>
            <label>Fecha nacimiento
              <input type="date" value={registerForm.birthDate} onChange={(event) => updateRegisterField("birthDate", event.target.value)} />
            </label>
            <label>Sexo
              <select value={registerForm.gender} onChange={(event) => updateRegisterField("gender", event.target.value)}>
                <option value="">No informado</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
                <option value="Mixto">Mixto</option>
              </select>
            </label>
            <label className={registerErrors.categoryId ? "field-has-error" : ""}>Categoría
              <select required value={registerForm.categoryId} onChange={(event) => updateRegisterField("categoryId", event.target.value)}>
                <option value="">Seleccioná una categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <FieldError message={registerErrors.categoryId} />
            </label>
            <label className={registerErrors.password ? "field-has-error" : ""}>Contraseña
              <input required type="password" value={registerForm.password} onChange={(event) => updateRegisterField("password", event.target.value)} />
              <FieldError message={registerErrors.password} />
            </label>
            <label className={registerErrors.repeatPassword ? "field-has-error" : ""}>Repetir contraseña
              <input required type="password" value={registerForm.repeatPassword} onChange={(event) => updateRegisterField("repeatPassword", event.target.value)} />
              <FieldError message={registerErrors.repeatPassword} />
            </label>
          </div>
          <div className="wizard-actions">
            <Button variant="ghost" type="button" onClick={() => setRegisterOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isBusy || Boolean(categoryLoadError)}>Crear cuenta</Button>
          </div>
        </form>
      </Modal>

      <Modal open={resetOpen} title="Recuperar contraseña" onClose={() => setResetOpen(false)}>
        <form className="modal-form" onSubmit={submitReset} noValidate>
          {resetError ? <div className="form-alert">{resetError}</div> : null}
          {resetSuccess ? <div className="info-band">{resetSuccess}</div> : null}
          <label>Correo
            <input inputMode="email" type="text" value={resetEmail} onChange={(event) => {
              setResetEmail(event.target.value);
              setResetError("");
              setResetSuccess("");
            }} />
          </label>
          <div className="wizard-actions">
            <Button variant="ghost" type="button" onClick={() => setResetOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={resetSending}>{resetSending ? "Enviando..." : "Enviar correo"}</Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
