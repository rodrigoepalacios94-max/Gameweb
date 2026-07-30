import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "../../components/common/Button";
import { LoadingState } from "../../components/common/LoadingState";
import { useAuth } from "../../context/AuthContext";
import { categoryService } from "../../services/categoryService";
import logoGame from "../../assets/logo-game.png";

function FieldError({ message }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function CompleteGoogleProfilePage() {
  const navigate = useNavigate();
  const { authLoading, completeGooglePlayerProfile, isPlayer, loading, needsProfileCompletion, user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    document: "",
    address: "",
    phone: "",
    birthDate: "",
    gender: "",
    categoryId: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");

  useEffect(() => {
    setForm((current) => ({
      ...current,
      firstName: current.firstName || user?.firstName || "",
      lastName: current.lastName || user?.lastName || "",
      email: user?.email || "",
    }));
  }, [user?.email, user?.firstName, user?.lastName]);

  useEffect(() => {
    categoryService
      .getActiveCategories()
      .then((activeCategories) => {
        setCategories(activeCategories);
        setLoadError("");
        setForm((current) => ({ ...current, categoryId: current.categoryId || activeCategories[0]?.id || "" }));
      })
      .catch(() => {
        setCategories([]);
        setLoadError("NO PUDIMOS CARGAR LAS CATEGORIAS");
      });
  }, []);

  if (loading) return <LoadingState message="Resolviendo acceso..." />;
  if (isPlayer) return <Navigate to="/player" replace />;
  if (!needsProfileCompletion) return <Navigate to="/login" replace />;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setGeneralError("");
  }

  function updateDigitsField(field, value) {
    const clean = value.replace(/\D/g, "");
    setForm((current) => ({ ...current, [field]: clean }));
    setFieldErrors((current) => ({
      ...current,
      [field]: clean === value ? "" : field === "document" ? "EL DOCUMENTO SOLO PUEDE CONTENER NUMEROS" : "EL TELEFONO SOLO PUEDE CONTENER NUMEROS",
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setFieldErrors({});
    setGeneralError("");
    if (!form.firstName.trim()) return setFieldErrors({ firstName: "INGRESA TU NOMBRE" });
    if (!form.lastName.trim()) return setFieldErrors({ lastName: "INGRESA TU APELLIDO" });
    if (!form.categoryId) return setFieldErrors({ categoryId: "SELECCIONA UNA CATEGORIA" });
    try {
      await completeGooglePlayerProfile(form);
      navigate("/player", { replace: true });
    } catch (error) {
      if (error.field) setFieldErrors({ [error.field]: error.message });
      else setGeneralError(error.message || "No pudimos completar tu perfil.");
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel login-panel--wide" aria-labelledby="complete-google-title">
        <img className="login-logo" src={logoGame} alt="GAME" />
        <div className="login-copy">
          <h1 id="complete-google-title">Completa tu perfil</h1>
        </div>
        <form className="modal-form" onSubmit={submit} noValidate>
          {loadError ? <div className="form-alert">{loadError}</div> : null}
          {generalError ? <div className="form-alert">{generalError}</div> : null}
          <div className="form-grid">
            <label className={fieldErrors.firstName ? "field-has-error" : ""}>Nombre
              <input required value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
              <FieldError message={fieldErrors.firstName} />
            </label>
            <label className={fieldErrors.lastName ? "field-has-error" : ""}>Apellido
              <input required value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
              <FieldError message={fieldErrors.lastName} />
            </label>
            <label>Correo de acceso
              <input readOnly disabled type="email" value={form.email} />
            </label>
            <label className={fieldErrors.document ? "field-has-error" : ""}>Documento
              <input inputMode="numeric" value={form.document} onChange={(event) => updateDigitsField("document", event.target.value)} />
              <FieldError message={fieldErrors.document} />
            </label>
            <label>Fecha nacimiento
              <input type="date" value={form.birthDate} onChange={(event) => updateField("birthDate", event.target.value)} />
            </label>
            <label className={fieldErrors.phone ? "field-has-error" : ""}>Telefono
              <input inputMode="numeric" value={form.phone} onChange={(event) => updateDigitsField("phone", event.target.value)} />
              <FieldError message={fieldErrors.phone} />
            </label>
            <label>Domicilio
              <input value={form.address} onChange={(event) => updateField("address", event.target.value)} />
            </label>
            <label>Sexo
              <select value={form.gender} onChange={(event) => updateField("gender", event.target.value)}>
                <option value="">No informado</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
                <option value="Mixto">Mixto</option>
              </select>
            </label>
            <label className={fieldErrors.categoryId ? "field-has-error" : ""}>Categoria
              <select required value={form.categoryId} onChange={(event) => updateField("categoryId", event.target.value)}>
                <option value="">Selecciona una categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name} {category.branch}</option>
                ))}
              </select>
              <FieldError message={fieldErrors.categoryId} />
            </label>
          </div>
          <button className="login-submit" disabled={authLoading || Boolean(loadError)} type="submit">
            {authLoading ? "GUARDANDO..." : "FINALIZAR REGISTRO"}
          </button>
        </form>
      </section>
    </main>
  );
}
