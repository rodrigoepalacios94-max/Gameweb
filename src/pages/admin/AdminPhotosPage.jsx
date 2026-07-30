import { useState } from "react";
import { ExternalLink, Images, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { isSafePhotoAlbumUrl, photoAlbumService } from "../../services/photoAlbumService";

const EMPTY_FORM = { name: "", link: "" };

export function AdminPhotosPage() {
  const { role } = useAuth();
  const { data: albums = [], loading, error, reload } = useAsyncData(() => photoAlbumService.getPhotoAlbums(), []);
  const [modalMode, setModalMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingAlbum, setEditingAlbum] = useState(null);
  const [albumToDelete, setAlbumToDelete] = useState(null);
  const [formError, setFormError] = useState("");
  const [openError, setOpenError] = useState("");
  const [saving, setSaving] = useState(false);

  if (loading) return <LoadingState message="Cargando albumes..." />;
  if (error) return <ErrorState title="No pudimos cargar los albumes." onRetry={reload} />;

  function openCreateModal() {
    setEditingAlbum(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalMode("create");
  }

  function openEditModal(album) {
    setEditingAlbum(album);
    setForm({ name: album.name, link: album.link });
    setFormError("");
    setModalMode("edit");
  }

  function closeModal() {
    if (saving) return;
    setModalMode(null);
    setEditingAlbum(null);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function validateForm() {
    if (!form.name.trim()) return "El nombre del album es obligatorio.";
    if (!form.link.trim()) return "El link del album es obligatorio.";
    if (!isSafePhotoAlbumUrl(form.link)) return "El link debe ser una URL valida que empiece con https://.";
    return "";
  }

  async function saveAlbum(event) {
    event.preventDefault();
    if (saving) return;
    const validation = validateForm();
    if (validation) {
      setFormError(validation);
      return;
    }
    setSaving(true);
    try {
      if (modalMode === "edit" && editingAlbum) {
        await photoAlbumService.updatePhotoAlbum(editingAlbum.id, form, role);
      } else {
        await photoAlbumService.createPhotoAlbum(form, role);
      }
      setModalMode(null);
      setEditingAlbum(null);
      setForm(EMPTY_FORM);
      setFormError("");
      reload();
    } catch (saveError) {
      setFormError(saveError.message || "No pudimos guardar el album.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteAlbum() {
    if (!albumToDelete) return;
    await photoAlbumService.deletePhotoAlbum(albumToDelete.id, role);
    setAlbumToDelete(null);
    reload();
  }

  function validateAlbumClick(event, album) {
    setOpenError("");
    if (!isSafePhotoAlbumUrl(album.link)) {
      event.preventDefault();
      setOpenError("El link de este album no es valido.");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide page-header--actions">
        <div>
          <span className="eyebrow">Gestion</span>
          <h1>Fotos</h1>
          <p>Administra los albumes de fotos publicados para todos los jugadores.</p>
        </div>
        <Button icon={Plus} onClick={openCreateModal}>Nuevo album</Button>
      </header>

      {openError ? <div className="form-alert">{openError}</div> : null}

      {albums.length ? (
        <div className="photo-album-grid photo-album-grid--admin">
          {albums.map((album) => (
            <Card key={album.id} className="photo-album-card photo-album-card--admin">
              <span className="photo-album-card__icon"><Images size={22} /></span>
              <strong>{album.name}</strong>
              <small>Actualizado: {new Date(album.updatedAt).toLocaleDateString("es-AR")}</small>
              <div className="photo-album-actions">
                <a
                  className="button button--outline-green button--sm"
                  href={isSafePhotoAlbumUrl(album.link) ? album.link : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => validateAlbumClick(event, album)}
                >
                  <ExternalLink size={18} aria-hidden="true" />
                  <span>Abrir</span>
                </a>
                <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openEditModal(album)}>Editar</Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setAlbumToDelete(album)}>Eliminar</Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState title="No hay albumes cargados. Crea el primer album." description="Usa Nuevo album para publicar el primer link de fotos." />
        </Card>
      )}

      <Modal open={Boolean(modalMode)} title={modalMode === "edit" ? "Editar album" : "Nuevo album"} onClose={closeModal}>
        <form className="modal-form" onSubmit={saveAlbum}>
          <label>
            Nombre del album
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Link del album
            <input value={form.link} onChange={(event) => setForm((current) => ({ ...current, link: event.target.value }))} placeholder="https://..." />
          </label>
          {formError ? <div className="field-error">{formError}</div> : null}
          <div className="wizard-actions">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(albumToDelete)} title="Eliminar album" onClose={() => setAlbumToDelete(null)}>
        <div className="confirm-modal">
          <Trash2 size={30} />
          <p>¿Seguro que querés eliminar el álbum "{albumToDelete?.name}"?</p>
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setAlbumToDelete(null)}>Cancelar</Button>
            <Button variant="danger" icon={Trash2} onClick={confirmDeleteAlbum}>Eliminar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
