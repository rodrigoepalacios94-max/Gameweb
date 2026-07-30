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
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { enrollmentService } from "../../services/enrollmentService";
import { matchService } from "../../services/matchService";
import { playerService } from "../../services/playerService";
import { regulationDocumentService } from "../../services/regulationDocumentService";
import { tournamentService } from "../../services/tournamentService";

async function loadOptional(label, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    console.error(`[GAME Player] ${label}`, {
      code: error.code || error.cause?.code || null,
      message: error.message || error.cause?.message || null,
      details: error.details || error.cause?.details || null,
      hint: error.hint || error.cause?.hint || null,
    });
    return fallback;
  }
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
  const { data, loading, error, reload } = useAsyncData(async () => {
    const player = await playerService.getCurrentPlayer();
    if (!player) throw new Error("No pudimos cargar tu ficha de jugador.");
    const [matches, tournaments, categoryRules, regulationDocuments, activeCategories, enrollments] = await Promise.all([
      loadOptional("matches", () => matchService.getPlayerMatches(user.id), []),
      loadOptional("tournaments", () => tournamentService.getTournaments(), []),
      loadOptional("category rules", () => categoryService.getCategoryRulesForPlayer(user.id), { lowerCategories: [] }),
      loadOptional("regulations", () => regulationDocumentService.getRegulationDocuments({ activeOnly: true }), []),
      loadOptional("active categories", () => categoryService.getActiveCategories(), []),
      loadOptional("enrollments", () => enrollmentService.getEnrollmentsByPlayer(user.id), []),
    ]);
    return {
      player,
      matches,
      tournaments: tournaments.filter((tournament) => tournament.participants?.includes(user.id)),
      lowerCategories: categoryRules.lowerCategories,
      regulationDocuments,
      activeCategories,
      enrollments,
      allTournaments: tournaments,
    };
  }, [user.id]);

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
    });
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
    await playerService.updateOwnProfile(data.player.id, profileForm);
    refreshSession?.();
    setEditOpen(false);
    reload();
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
          <form className="modal-form" onSubmit={saveProfile}>
            <div className="form-grid">
              <label>Nombre<input required value={profileForm.firstName} onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
              <label>Apellido<input required value={profileForm.lastName} onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
              <label>DNI<input value={profileForm.dni} onChange={(event) => setProfileForm((current) => ({ ...current, dni: event.target.value }))} /></label>
              <label>Fecha de nacimiento<input type="date" value={profileForm.birthDate} onChange={(event) => setProfileForm((current) => ({ ...current, birthDate: event.target.value }))} /></label>
              <label>Teléfono<input value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} /></label>
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
