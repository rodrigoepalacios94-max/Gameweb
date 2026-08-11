import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, ChevronDown, Eye, FileText, KeyRound, Pencil, Send } from "lucide-react";
import { ChangePasswordModal } from "../../components/auth/ChangePasswordModal";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { Select } from "../../components/common/Select";
import { useAuth } from "../../context/AuthContext";
import { playerService } from "../../services/playerService";
import { usePlayerProfileQuery } from "../../query/pageQueries";

function FieldError({ message }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function validateProfileForm(form) {
  if (!form.firstName.trim()) return { field: "firstName", message: "INGRESA TU NOMBRE" };
  if (!form.lastName.trim()) return { field: "lastName", message: "INGRESA TU APELLIDO" };
  if (!form.dni.trim()) return { field: "dni", message: "INGRESA TU DOCUMENTO" };
  if (!/^\d+$/.test(form.dni.trim())) return { field: "dni", message: "EL DOCUMENTO SOLO PUEDE CONTENER NUMEROS" };
  if (!form.birthDate) return { field: "birthDate", message: "INGRESA TU FECHA DE NACIMIENTO" };
  if (!form.phone.trim()) return { field: "phone", message: "INGRESA TU TELEFONO" };
  if (!/^\d+$/.test(form.phone.trim())) return { field: "phone", message: "EL TELEFONO SOLO PUEDE CONTENER NUMEROS" };
  if (!form.gender) return { field: "gender", message: "SELECCIONA TU SEXO" };
  if (!["Masculino", "Femenino"].includes(form.gender)) return { field: "gender", message: "SELECCIONA MASCULINO O FEMENINO" };
  return null;
}

export function PlayerProfilePage() {
  const { profile, realRole, user, refreshSession } = useAuth();
  const [descentCategoryId, setDescentCategoryId] = useState("cat-m5");
  const [requestStatus, setRequestStatus] = useState("Sin solicitud enviada");
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [profileForm, setProfileForm] = useState(null);
  const [profileErrors, setProfileErrors] = useState({});
  const [profileGeneralError, setProfileGeneralError] = useState("");
  const { data, isLoading: loading, error, refetch: reload } = usePlayerProfileQuery(user);

  useEffect(() => {
    if (data?.lowerCategories?.[0]) setDescentCategoryId(data.lowerCategories[0].id);
  }, [data]);

  async function requestDescent() {
    const request = await playerService.requestCategoryDowngrade(user.id, descentCategoryId);
    setRequestStatus(`Solicitud pendiente para ${request?.requestedCategoryName || "categoría seleccionada"}`);
  }

  function openEdit() {
    const player = data.player;
    setProfileForm({
      firstName: player.firstName || "",
      lastName: player.lastName || "",
      birthDate: player.birthDate || "",
      phone: player.phone || "",
      email: player.email || "",
      dni: player.dni || "",
      gender: player.gender || "",
      address: player.address || "",
    });
    setProfileErrors({});
    setProfileGeneralError("");
    setEditOpen(true);
  }

  function openCategorySelector() {
    setSelectedCategoryId(data.player.categoryId || data.activeCategories[0]?.id || "");
    setCategoryError("");
    setCategoryOpen(true);
  }

  async function saveCategory(event) {
    event.preventDefault();
    setCategoryError("");
    const activeTournamentById = new Map((data.allTournaments || []).map((tournament) => [tournament.id, tournament]));
    const hasActiveCompetition = (data.enrollments || []).some((enrollment) => {
      const tournament = activeTournamentById.get(enrollment.tournamentId);
      return tournament && !["Finalizado", "Cancelado"].includes(tournament.status);
    });
    if (hasActiveCompetition) {
      setCategoryError("NO PODÉS CAMBIAR TU CATEGORÍA. Actualmente estás participando en un torneo activo.");
      return;
    }
    await playerService.updatePlayer(data.player.id, {
      categoryId: selectedCategoryId,
      categoryChangeReason: "Cambio de categoría elegido por jugador administrador.",
    });
    refreshSession?.();
    setCategoryOpen(false);
    reload();
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileErrors({});
    setProfileGeneralError("");
    const validationError = validateProfileForm(profileForm);
    if (validationError) {
      setProfileErrors({ [validationError.field]: validationError.message });
      return;
    }
    try {
      await playerService.updateOwnProfile(data.player.id, profileForm);
      refreshSession?.();
      setEditOpen(false);
      reload();
    } catch (profileError) {
      if (profileError.field) setProfileErrors({ [profileError.field]: profileError.message });
      else setProfileGeneralError(profileError.message || "No pudimos guardar el perfil.");
    }
  }

  async function changeAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await playerService.updateAvatar(data.player.id, reader.result);
      refreshSession?.();
      reload();
    };
    reader.readAsDataURL(file);
  }

  if (loading) return <LoadingState message="Cargando perfil..." />;
  if (error) return <ErrorState title="No pudimos cargar tu perfil." onRetry={reload} />;

  const { player, matches, tournaments, lowerCategories, regulationDocuments } = data;
  const winRate = player.stats.played ? Math.round((player.stats.wins / player.stats.played) * 100) : 0;
  const lowerCategoryOptions = lowerCategories.map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` }));
  const canManageOwnAdminCategory = realRole === "admin" && profile?.player_id && profile.player_id === player.id;

  return (
    <div className="page-stack">
      <section className="profile-header">
        <Avatar src={player.avatar} name={player.fullName} size="xl" />
        <div>
          <span className="eyebrow">Perfil jugador</span>
          <h1>{player.fullName}</h1>
          <p>{player.categoryName || "Sin categoría"} / Ranking {player.ranking ? `#${player.ranking}` : "sin datos"} / {player.points} pts</p>
          <div className="hero-meta-row">
            <Badge tone={player.status === "Activo" ? "success" : "warning"}>{player.status}</Badge>
            <Badge tone={player.discipline.faults >= 3 ? "danger" : player.discipline.faults > 0 ? "warning" : "success"}>
              Disciplina {player.discipline.faults}/{player.discipline.limit}
            </Badge>
          </div>
        </div>
      </section>

      <div className="card-actions">
        <Button variant="secondary" icon={Pencil} onClick={openEdit}>Editar perfil</Button>
        {canManageOwnAdminCategory ? <Button variant="outline-green" onClick={openCategorySelector}>{player.categoryId ? "CAMBIAR CATEGORÍA" : "ELEGIR CATEGORÍA"}</Button> : null}
        <Button variant="ghost" icon={KeyRound} onClick={() => setPasswordOpen(true)}>Cambiar contraseña</Button>
        <label className="button button--ghost button--md">
          <Camera size={18} />
          <span>Cambiar foto</span>
          <input className="visually-hidden" type="file" accept="image/*" onChange={changeAvatar} />
        </label>
      </div>

      <section className="profile-stat-grid">
        <Card className="stat-card">
          <span>Partidos</span>
          <strong>{player.stats.played}</strong>
          <small>{player.stats.wins} victorias / {player.stats.losses} derrotas</small>
        </Card>
        <Card className="stat-card stat-card--orange">
          <span>Efectividad</span>
          <strong>{winRate}%</strong>
          <small>Calculado desde estadísticas registradas</small>
        </Card>
        <Card className="stat-card">
          <span>Torneos</span>
          <strong>{player.stats.tournaments}</strong>
          <small>{tournaments.length} visibles en el portal</small>
        </Card>
      </section>

      <div className="detail-grid">
        <Card>
          <h2>Datos personales</h2>
          <div className="info-list">
            <span>Nombre: {player.firstName}</span>
            <span>Apellido: {player.lastName}</span>
            <span>DNI: {player.dni}</span>
            <span>Fecha de nacimiento: {player.birthDate || "No informada"}</span>
            <span>Teléfono: {player.phone}</span>
            <span>Email: {player.email}</span>
            <span>Categoría actual: {player.categoryName || "Sin categoría"}</span>
          </div>
        </Card>

        <Card>
          <h2>Estado disciplinario</h2>
          <div className="info-list">
            <span>Estado: {player.discipline.status}</span>
            <span>Faltas confirmadas: {player.discipline.faults}/{player.discipline.limit}</span>
            <span>Bloqueo automático al llegar a 3 faltas confirmadas</span>
          </div>
        </Card>
      </div>

      <div className="detail-grid">
        <Card className="descent-card">
          <div>
            <span className="eyebrow">Categorías</span>
            <h2>Solicitud de descenso</h2>
            <p>El jugador no puede inscribirse directamente en una categoría inferior. La solicitud queda pendiente para revisión del profesor.</p>
          </div>
          <Select label="Categoría inferior" value={descentCategoryId} onChange={setDescentCategoryId} options={lowerCategoryOptions} />
          <Button variant="outline-green" icon={Send} onClick={requestDescent}>Solicitar descenso</Button>
          <Badge tone={requestStatus.includes("pendiente") ? "warning" : "neutral"}>{requestStatus}</Badge>
        </Card>

        <Card>
          <h2>Últimos partidos</h2>
          <div className="history-list">
            {matches.slice(0, 4).map((match) => (
              <span key={match.id}>
                <ChevronDown size={15} />
                {match.tournament} / {match.round} / {match.status}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="section-title">
          <span>Reglamentos y Formatos vigentes</span>
        </div>
        {regulationDocuments?.length ? (
          <div className="document-list">
            {regulationDocuments.map((document) => (
              <article key={document.id} className="document-row document-row--player">
                <FileText size={20} />
                <div>
                  <strong>{document.title}</strong>
                  <span>{document.fileName}</span>
                </div>
                <Link className="button button--outline-green button--sm" to={`/player/regulations/${document.id}`}>
                  <Eye size={16} />
                  <span>Ver</span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">NO HAY REGLAMENTOS PUBLICADOS</p>
        )}
      </Card>

      <Modal open={editOpen} title="Editar perfil" onClose={() => setEditOpen(false)} size="lg">
        {profileForm ? (
          <form className="modal-form" onSubmit={saveProfile} noValidate>
            {profileGeneralError ? <div className="form-alert">{profileGeneralError}</div> : null}
            <div className="form-grid">
              <label className={profileErrors.firstName ? "field-has-error" : ""}>Nombre
                <input required value={profileForm.firstName} onChange={(event) => {
                  setProfileForm((current) => ({ ...current, firstName: event.target.value }));
                  setProfileErrors((current) => ({ ...current, firstName: "" }));
                }} />
                <FieldError message={profileErrors.firstName} />
              </label>
              <label className={profileErrors.lastName ? "field-has-error" : ""}>Apellido
                <input required value={profileForm.lastName} onChange={(event) => {
                  setProfileForm((current) => ({ ...current, lastName: event.target.value }));
                  setProfileErrors((current) => ({ ...current, lastName: "" }));
                }} />
                <FieldError message={profileErrors.lastName} />
              </label>
              <label className={profileErrors.dni ? "field-has-error" : ""}>DNI
                <input inputMode="numeric" value={profileForm.dni} onChange={(event) => {
                  setProfileForm((current) => ({ ...current, dni: event.target.value.replace(/\D/g, "") }));
                  setProfileErrors((current) => ({ ...current, dni: "" }));
                }} />
                <FieldError message={profileErrors.dni} />
              </label>
              <label className={profileErrors.birthDate ? "field-has-error" : ""}>Fecha de nacimiento
                <input type="date" value={profileForm.birthDate} onChange={(event) => {
                  setProfileForm((current) => ({ ...current, birthDate: event.target.value }));
                  setProfileErrors((current) => ({ ...current, birthDate: "" }));
                }} />
                <FieldError message={profileErrors.birthDate} />
              </label>
              <label className={profileErrors.phone ? "field-has-error" : ""}>Teléfono
                <input inputMode="numeric" value={profileForm.phone} onChange={(event) => {
                  setProfileForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "") }));
                  setProfileErrors((current) => ({ ...current, phone: "" }));
                }} />
                <FieldError message={profileErrors.phone} />
              </label>
              <label className={profileErrors.gender ? "field-has-error" : ""}>Sexo
                <select value={profileForm.gender} onChange={(event) => {
                  setProfileForm((current) => ({ ...current, gender: event.target.value }));
                  setProfileErrors((current) => ({ ...current, gender: "" }));
                }}>
                  <option value="">Selecciona sexo</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                </select>
                <FieldError message={profileErrors.gender} />
              </label>
              <label>Domicilio
                <input value={profileForm.address} onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))} />
              </label>
              <label>Correo de acceso<input disabled type="email" value={profileForm.email} readOnly /></label>
            </div>
            <p className="muted">Categoría actual: {player.categoryName || "Sin categoría"}. La categoría no se edita desde el perfil. El correo de acceso se cambia desde un flujo de seguridad separado.</p>
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit">Guardar perfil</Button>
            </div>
          </form>
        ) : null}
      </Modal>
      <ChangePasswordModal open={passwordOpen} title="Cambiar contraseña" onClose={() => setPasswordOpen(false)} />
      <Modal open={categoryOpen} title={player.categoryId ? "Cambiar categoría" : "Elegir categoría"} onClose={() => setCategoryOpen(false)}>
        <form className="modal-form" onSubmit={saveCategory}>
          {categoryError ? <div className="form-alert">{categoryError}</div> : null}
          <label>Categoría
            <select required value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
              <option value="">Seleccioná una categoría</option>
              {(data.activeCategories || []).map((category) => (
                <option key={category.id} value={category.id}>{category.name} {category.branch}</option>
              ))}
            </select>
          </label>
          <div className="wizard-actions">
            <Button variant="ghost" type="button" onClick={() => setCategoryOpen(false)}>Cancelar</Button>
            <Button type="submit">Guardar categoría</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
