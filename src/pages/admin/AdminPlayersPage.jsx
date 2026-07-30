import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { SearchInput } from "../../components/common/SearchInput";
import { Select } from "../../components/common/Select";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../context/AuthContext";
import { categoryService } from "../../services/categoryService";
import { playerService } from "../../services/playerService";
import { normalizeText } from "../../utils/formatters";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function AdminPlayersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user, refreshSession } = useAuth();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [categoryId, setCategoryId] = useState("Todos");
  const [playerFormOpen, setPlayerFormOpen] = useState(false);
  const [playerFormError, setPlayerFormError] = useState("");
  const [createdPlayerAccess, setCreatedPlayerAccess] = useState(null);
  const [linkCandidate, setLinkCandidate] = useState(null);
  const [linkingPlayer, setLinkingPlayer] = useState(false);
  const [linkFeedback, setLinkFeedback] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState("");
  const [pageMessage, setPageMessage] = useState(location.state?.message || "");
  const listScrollRef = useRef(null);
  const [playerForm, setPlayerForm] = useState({
    firstName: "",
    lastName: "",
    dni: "",
    birthDate: "",
    gender: "",
    phone: "",
    email: "",
    address: "",
    categoryId: "",
  });
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [players, categories] = await Promise.all([
      playerService.getPlayers(),
      categoryService.getCategories(),
    ]);
    return { players, categories };
  }, []);
  const players = data?.players || [];
  const categories = data?.categories || [];
  const filteredPlayers = useMemo(
    () =>
      players.filter((player) => {
        const matchesQuery = normalizeText(player.fullName).includes(normalizeText(query));
        const matchesStatus = status === "Todos" || player.status === status;
        const matchesCategory = categoryId === "Todos" || player.categoryId === categoryId;
        return matchesQuery && matchesStatus && matchesCategory;
      }),
    [players, query, status, categoryId],
  );

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [query, status, categoryId]);

  useEffect(() => {
    if (!location.state?.message) return;
    window.history.replaceState({}, document.title);
  }, [location.state?.message]);

  if (loading) return <LoadingState message="Cargando jugadores..." />;
  if (error) return <ErrorState title="NO PUDIMOS CARGAR LOS JUGADORES" description="Reintentá en unos segundos." onRetry={reload} />;
  const activeCategories = categories.filter((category) => category.status === "Activa");

  function openPlayerForm() {
    setPlayerFormError("");
    setPlayerForm((current) => ({ ...current, categoryId: "" }));
    setPlayerFormOpen(true);
  }

  function isAuthenticatedAdminEmail(email) {
    if (profile?.role !== "admin") return false;
    const currentEmail = normalizeEmail(profile.email || user?.email);
    return Boolean(currentEmail && normalizeEmail(email) === currentEmail);
  }

  async function createPlayer(event) {
    event.preventDefault();
    setPlayerFormError("");
    try {
      const isOwnAdminPlayer = isAuthenticatedAdminEmail(playerForm.email);
      const existingPlayer = isOwnAdminPlayer ? await playerService.getPlayerByEmail(playerForm.email) : null;
      if (existingPlayer) {
        setPlayerFormOpen(false);
        setLinkFeedback("");
        setLinkCandidate(existingPlayer);
        return;
      }
      const createdPlayer = await playerService.createPlayer(
        { ...playerForm, allowMissingCategory: isOwnAdminPlayer },
        { createTemporaryAccess: !isOwnAdminPlayer },
      );
      setPlayerFormOpen(false);
      if (isOwnAdminPlayer) {
        setLinkFeedback("");
        setLinkCandidate(createdPlayer);
      } else {
        setCreatedPlayerAccess({
          id: createdPlayer.id,
          email: createdPlayer.email,
          status: createdPlayer.accountStatus || "SIN CUENTA",
        });
      }
      setInviteFeedback("");
      setPlayerForm({
        firstName: "",
        lastName: "",
        dni: "",
        birthDate: "",
        gender: "",
        phone: "",
        email: "",
        address: "",
        categoryId: "",
      });
      reload();
    } catch (createError) {
      setPlayerFormError(createError.message || "NO PUDIMOS CREAR EL JUGADOR");
    }
  }

  async function sendPlayerInvite() {
    if (!createdPlayerAccess?.id) return;
    setInviteSending(true);
    setInviteFeedback("");
    try {
      await playerService.invitePlayerAccount(createdPlayerAccess.id);
      setCreatedPlayerAccess((current) => current ? { ...current, status: "INVITACION ENVIADA" } : current);
      setInviteFeedback("Invitacion enviada. El jugador podra definir su contrasena desde el correo.");
    } catch (inviteError) {
      setInviteFeedback(inviteError.message || "NO PUDIMOS ENVIAR LA INVITACION");
    } finally {
      setInviteSending(false);
    }
  }

  async function linkAdminPlayer() {
    if (!linkCandidate?.id) return;
    setLinkingPlayer(true);
    setLinkFeedback("");
    try {
      await playerService.linkAdminProfilePlayer(linkCandidate.id);
      await refreshSession?.();
      setLinkCandidate(null);
      setPageMessage("PERFIL DE JUGADOR VINCULADO. Ya podés alternar entre Administrador y Jugador.");
      reload();
    } catch (linkError) {
      setLinkFeedback(linkError.message || "NO PUDIMOS VINCULAR EL PERFIL DE JUGADOR");
    } finally {
      setLinkingPlayer(false);
    }
  }

  return (
    <div className="page-stack admin-players-page">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Gestion</span>
          <h1>Jugadores</h1>
          <p>Consulta estado deportivo, categoria vigente, ranking, puntos, faltas y bloqueos.</p>
        </div>
        <Button icon={Plus} onClick={openPlayerForm}>Nuevo jugador</Button>
      </header>

      <Card className="admin-players-toolbar-card">
        {pageMessage ? <div className="info-band"><strong>{pageMessage}</strong><button type="button" onClick={() => setPageMessage("")}>Cerrar</button></div> : null}
        <div className="toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar jugador" />
          <Select value={categoryId} onChange={setCategoryId} options={[{ value: "Todos", label: "Todas las categorias" }, ...categories.map((category) => ({ value: category.id, label: `${category.name} ${category.branch}` }))]} />
          <Select value={status} onChange={setStatus} options={["Todos", "Activo", "Suspendido", "Bloqueado por faltas"].map((item) => ({ value: item, label: item }))} />
        </div>
      </Card>

      <Card className="admin-players-list-card">
        {filteredPlayers.length ? (
          <div className="admin-players-scroll" ref={listScrollRef}>
            <div className="admin-table admin-players-table">
              <div className="admin-table-row admin-table-row--players admin-table-row--head admin-players-table-head">
                <span>Jugador</span>
                <span>Categoría</span>
                <span>Ranking</span>
                <span>Puntos</span>
                <span>Faltas</span>
                <span>Estado</span>
              </div>
              {filteredPlayers.map((player) => (
                <button
                  key={player.id}
                  className={player.status.includes("Bloqueado") ? "admin-table-row admin-table-row--players admin-table-row--clickable is-danger" : "admin-table-row admin-table-row--players admin-table-row--clickable"}
                  type="button"
                  onClick={() => navigate(`/admin/players/${player.id}`)}
                >
                  <div className="table-identity">
                    <Avatar src={player.avatar} name={player.fullName} size="sm" />
                    <strong>{player.fullName}</strong>
                  </div>
                  <span>{player.categoryName}</span>
                  <span>{player.ranking ? `#${player.ranking}` : "-"}</span>
                  <span>{player.points} pts</span>
                  <span>{player.discipline.faults}/{player.discipline.limit}</span>
                  <Badge tone={player.status === "Activo" ? "success" : player.status.includes("Bloqueado") ? "danger" : "warning"}>{player.status}</Badge>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="Sin jugadores para este filtro" description="Cambia los filtros o registra un nuevo jugador." />
        )}
      </Card>

      <Modal open={playerFormOpen} title="Nuevo jugador" onClose={() => setPlayerFormOpen(false)} size="lg">
        <form className="modal-form" onSubmit={createPlayer}>
            {playerFormError ? <div className="form-alert">{playerFormError}</div> : null}
            <div className="form-grid">
              <label>Nombre<input required value={playerForm.firstName} onChange={(event) => setPlayerForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
              <label>Apellido<input required value={playerForm.lastName} onChange={(event) => setPlayerForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
              <label>DNI<input inputMode="numeric" value={playerForm.dni} onChange={(event) => setPlayerForm((current) => ({ ...current, dni: event.target.value }))} /></label>
              <label>Fecha de nacimiento<input type="date" value={playerForm.birthDate} onChange={(event) => setPlayerForm((current) => ({ ...current, birthDate: event.target.value }))} /></label>
              <label>Sexo
                <select value={playerForm.gender} onChange={(event) => setPlayerForm((current) => ({ ...current, gender: event.target.value }))}>
                  <option value="">No informado</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Mixto">Mixto</option>
                </select>
              </label>
              <label>Telefono<input inputMode="numeric" value={playerForm.phone} onChange={(event) => setPlayerForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label>Domicilio<input value={playerForm.address} onChange={(event) => setPlayerForm((current) => ({ ...current, address: event.target.value }))} /></label>
              <label>Email<input required type="email" value={playerForm.email} onChange={(event) => setPlayerForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label>Categoria
                <select value={playerForm.categoryId} onChange={(event) => setPlayerForm((current) => ({ ...current, categoryId: event.target.value }))}>
                  <option value="">Sin categoría definida</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name} {category.branch}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setPlayerFormOpen(false)}>Cancelar</Button>
              <Button type="submit">Crear jugador</Button>
            </div>
          </form>
      </Modal>
      <Modal open={Boolean(linkCandidate)} title="VINCULAR PERFIL DE JUGADOR" onClose={() => setLinkCandidate(null)}>
        {linkCandidate ? (
          <div className="registration-success">
            <h3>{linkCandidate.fullName}</h3>
            <p>Esta ficha deportiva quedará asociada a tu cuenta de administrador.</p>
            <p>Podrás alternar entre Administrador y Jugador sin cerrar sesión.</p>
            {linkFeedback ? <div className="form-alert">{linkFeedback}</div> : null}
            <div className="wizard-actions">
              <Button variant="ghost" onClick={() => setLinkCandidate(null)}>CANCELAR</Button>
              <Button variant="outline-green" onClick={linkAdminPlayer} disabled={linkingPlayer}>
                {linkingPlayer ? "VINCULANDO..." : "VINCULAR"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal open={Boolean(createdPlayerAccess)} title="JUGADOR CREADO" onClose={() => setCreatedPlayerAccess(null)}>
        {createdPlayerAccess ? (
          <div className="registration-success">
            <h3>El jugador fue creado correctamente.</h3>
            <div className="info-panel">
              <strong>Acceso inicial</strong>
              <span>Correo: {createdPlayerAccess.email}</span>
              <span>Estado: {createdPlayerAccess.status}</span>
            </div>
            <p>No se genero una contrasena temporal. El jugador debe recibir una invitacion para definir su contrasena.</p>
            {inviteFeedback ? <div className="form-alert">{inviteFeedback}</div> : null}
            <div className="wizard-actions">
              <Button variant="ghost" onClick={() => setCreatedPlayerAccess(null)}>CERRAR</Button>
              <Button variant="outline-green" onClick={sendPlayerInvite} disabled={inviteSending}>
                {inviteSending ? "ENVIANDO..." : "ENVIAR INVITACION"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
