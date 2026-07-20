import { useEffect, useState } from "react";
import { Camera, ChevronDown, Pencil, Send } from "lucide-react";
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
import { adminService } from "../../services/adminService";
import { categoryService } from "../../services/categoryService";
import { matchService } from "../../services/matchService";
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";

export function PlayerProfilePage() {
  const { user, refreshSession } = useAuth();
  const [descentCategoryId, setDescentCategoryId] = useState("cat-m5");
  const [requestStatus, setRequestStatus] = useState("Sin solicitud enviada");
  const [editOpen, setEditOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(null);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [player, matches, tournaments, categoryRules, regulation] = await Promise.all([
      playerService.getCurrentPlayer(),
      matchService.getPlayerMatches(user.id),
      tournamentService.getTournaments(),
      categoryService.getCategoryRulesForPlayer(user.id),
      adminService.getRegulation(),
    ]);
    return {
      player,
      matches,
      tournaments: tournaments.filter((tournament) => tournament.participants?.includes(user.id)),
      lowerCategories: categoryRules.lowerCategories,
      regulation,
    };
  }, [user.id]);

  useEffect(() => {
    if (data?.lowerCategories?.[0]) setDescentCategoryId(data.lowerCategories[0].id);
  }, [data]);

  async function requestDescent() {
    const request = await playerService.requestCategoryDowngrade(user.id, descentCategoryId);
    setRequestStatus(`Solicitud pendiente para ${request?.requestedCategoryName || "categoria seleccionada"}`);
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

  const { player, matches, tournaments, lowerCategories, regulation } = data;
  const winRate = player.stats.played ? Math.round((player.stats.wins / player.stats.played) * 100) : 0;
  const lowerCategoryOptions = lowerCategories.map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` }));

  return (
    <div className="page-stack">
      <section className="profile-header">
        <Avatar src={player.avatar} name={player.fullName} size="xl" />
        <div>
          <span className="eyebrow">Perfil jugador</span>
          <h1>{player.fullName}</h1>
          <p>{player.categoryName} / Ranking #{player.ranking} / {player.points} pts</p>
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
          <small>Calculado desde estadisticas mock</small>
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
            <span>Telefono: {player.phone}</span>
            <span>Email: {player.email}</span>
            <span>Categoria actual: {player.categoryName}</span>
          </div>
        </Card>

        <Card>
          <h2>Estado disciplinario</h2>
          <div className="info-list">
            <span>Estado: {player.discipline.status}</span>
            <span>Faltas confirmadas: {player.discipline.faults}/{player.discipline.limit}</span>
            <span>Bloqueo automatico al llegar a 3 faltas confirmadas</span>
          </div>
        </Card>
      </div>

      <div className="detail-grid">
        <Card className="descent-card">
          <div>
            <span className="eyebrow">Categorias</span>
            <h2>Solicitud de descenso</h2>
            <p>El jugador no puede inscribirse directamente en una categoria inferior. La solicitud queda pendiente para revision del profesor.</p>
          </div>
          <Select label="Categoria inferior" value={descentCategoryId} onChange={setDescentCategoryId} options={lowerCategoryOptions} />
          <Button variant="outline-green" icon={Send} onClick={requestDescent}>Solicitar descenso</Button>
          <Badge tone={requestStatus.includes("pendiente") ? "warning" : "neutral"}>{requestStatus}</Badge>
        </Card>

        <Card>
          <h2>Ultimos partidos</h2>
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
          <span>Reglamento vigente</span>
        </div>
        {regulation ? (
          <article className="regulation-preview">
            <h2>{regulation.title}</h2>
            <p>{regulation.content}</p>
          </article>
        ) : (
          <p className="muted">No hay reglamento publicado.</p>
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
              <label>Telefono<input value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label>Email<input type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} /></label>
            </div>
            <p className="muted">Categoria actual: {player.categoryName}. La categoria no se edita desde el perfil.</p>
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit">Guardar perfil</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
