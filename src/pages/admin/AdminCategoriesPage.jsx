import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Edit3, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { playerService } from "../../services/playerService";

const emptyCategoryForm = {
  id: null,
  name: "",
  branch: "Masculino",
  level: "",
  status: "Activa",
};

export function AdminCategoriesPage() {
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [blockedDelete, setBlockedDelete] = useState(null);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [categories, players] = await Promise.all([
      categoryService.getCategories(),
      playerService.getPlayers(),
    ]);
    return { categories, players };
  }, []);

  if (loading) return <LoadingState message="Cargando categorías..." />;
  if (error) return <ErrorState title="NO PUDIMOS CARGAR LAS CATEGORÍAS" description="Reintentá en unos segundos." onRetry={reload} />;

  const { categories, players } = data;
  const branches = [...new Set(["Masculino", "Femenino", "Mixto", ...categories.map((category) => category.branch)])];

  function openForm(category = null) {
    setFormError("");
    setForm(category ? { ...emptyCategoryForm, ...category } : { ...emptyCategoryForm });
  }

  async function saveCategory(event) {
    event.preventDefault();
    setFormError("");
    const payload = {
      name: form.name.trim(),
      branch: form.branch,
      level: Number(form.level),
      status: form.status,
    };
    try {
      if (form.id) await categoryService.updateCategory(form.id, payload);
      else await categoryService.createCategory(payload);
      setForm(null);
      reload();
    } catch (saveError) {
      setFormError(saveError.message || "NO PUDIMOS GUARDAR LA CATEGORÍA");
    }
  }

  async function toggleCategory(category) {
    await categoryService.setCategoryActive(category.id, category.status !== "Activa");
    reload();
  }

  async function confirmDeleteCategory() {
    const result = await categoryService.deleteCategory(deleteTarget.id);
    setDeleteTarget(null);
    if (result.blocked) {
      setBlockedDelete(result);
      return;
    }
    reload();
  }

  return (
    <div className="page-stack">
      <Link className="back-link" to="/admin/settings">
        <ArrowLeft size={18} />
        <span>Volver</span>
      </Link>

      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Configuración</span>
          <h1>Categorías</h1>
          <p>Gestión de ramas, niveles jerárquicos y estados activos del circuito.</p>
        </div>
        <Button icon={Plus} onClick={() => openForm()}>Nueva categoría</Button>
      </header>

      <div className="detail-grid">
        {branches.map((branch) => {
          const branchCategories = categories.filter((category) => category.branch === branch).sort((a, b) => a.level - b.level);
          if (!branchCategories.length) return null;
          return (
            <Card key={branch}>
              <h2>{branch}</h2>
              <div className="category-list">
                {branchCategories.map((category) => {
                  const count = players.filter((player) => player.categoryId === category.id).length;
                  const isActive = category.status === "Activa";
                  return (
                    <div key={category.id} className="category-line">
                      <strong>{category.name}</strong>
                      <span>Nivel {category.level}</span>
                      <span>{count} jugadores</span>
                      <Badge tone={isActive ? "success" : "neutral"}>{category.status}</Badge>
                      <Button variant="ghost" size="icon" icon={Edit3} onClick={() => openForm(category)}>Editar</Button>
                      <Button variant="ghost" size="icon" icon={isActive ? ToggleRight : ToggleLeft} onClick={() => toggleCategory(category)}>
                        {isActive ? "Desactivar" : "Activar"}
                      </Button>
                      <Button variant="danger" size="icon" icon={Trash2} onClick={() => setDeleteTarget(category)}>Eliminar</Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={Boolean(form)} title={form?.id ? "Editar categoría" : "Nueva categoría"} onClose={() => setForm(null)}>
        {form ? (
          <form className="modal-form" onSubmit={saveCategory}>
            {formError ? <div className="form-alert">{formError}</div> : null}
            <div className="form-grid">
              <label>Nombre<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Rama
                <select value={form.branch} onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))}>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Mixto">Mixto</option>
                </select>
              </label>
              <label>Nivel jerárquico<input type="number" required min="1" value={form.level} onChange={(event) => setForm((current) => ({ ...current, level: event.target.value }))} /></label>
              <label>Estado
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="Activa">Activa</option>
                  <option value="Inactiva">Inactiva</option>
                </select>
              </label>
            </div>
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setForm(null)}>Cancelar</Button>
              <Button type="submit">Guardar categoría</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Eliminar categoría"
        message={deleteTarget ? `¿Seguro que querés eliminar "${deleteTarget.name}"? Esta acción no se puede deshacer.` : ""}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDeleteCategory}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal open={Boolean(blockedDelete)} title="NO SE PUEDE ELIMINAR LA CATEGORÍA" onClose={() => setBlockedDelete(null)} size="sm">
        {blockedDelete ? (
          <div className="confirm-modal">
            <p>Esta categoría tiene jugadores asociados.</p>
            <div className="info-list">
              {(blockedDelete.reasons || ["Esta categoría tiene jugadores asociados."]).map((reason) => (
                <span key={reason}>{reason}</span>
              ))}
            </div>
            <p>Podés desactivarla para impedir que se use en nuevas altas.</p>
            <div className="wizard-actions">
              <Button onClick={() => setBlockedDelete(null)}>Cerrar</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
