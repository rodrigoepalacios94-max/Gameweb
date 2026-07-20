import { useState } from "react";
import { Edit3, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
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
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [categories, players] = await Promise.all([
      categoryService.getCategories(),
      playerService.getPlayers(),
    ]);
    return { categories, players };
  }, []);

  if (loading) return <LoadingState message="Cargando categorias..." />;
  if (error) return <ErrorState title="No pudimos cargar categorias." onRetry={reload} />;

  const { categories, players } = data;
  const branches = [...new Set(["Masculino", "Femenino", "Mixto", ...categories.map((category) => category.branch)])];

  function openForm(category = null) {
    setForm(category ? { ...emptyCategoryForm, ...category } : { ...emptyCategoryForm });
  }

  async function saveCategory(event) {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      branch: form.branch,
      level: Number(form.level),
      status: form.status,
    };
    if (form.id) await categoryService.updateCategory(form.id, payload);
    else await categoryService.createCategory(payload);
    setForm(null);
    reload();
  }

  async function toggleCategory(category) {
    await categoryService.updateCategory(category.id, { status: category.status === "Activa" ? "Inactiva" : "Activa" });
    reload();
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Configuracion</span>
          <h1>Categorias</h1>
          <p>Gestion de ramas, niveles jerarquicos y estados activos del circuito.</p>
        </div>
        <Button icon={Plus} onClick={() => openForm()}>Nueva categoria</Button>
      </header>

      <div className="detail-grid">
        {branches.map((branch) => {
          const branchCategories = categories.filter((category) => category.branch === branch).sort((a, b) => a.level - b.level);
          if (!branchCategories.length && branch === "Mixto") return null;
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
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={Boolean(form)} title={form?.id ? "Editar categoria" : "Nueva categoria"} onClose={() => setForm(null)}>
        {form ? (
          <form className="modal-form" onSubmit={saveCategory}>
            <div className="form-grid">
              <label>Nombre<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Rama
                <select value={form.branch} onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))}>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Mixto">Mixto</option>
                </select>
              </label>
              <label>Nivel jerarquico<input type="number" required min="1" value={form.level} onChange={(event) => setForm((current) => ({ ...current, level: event.target.value }))} /></label>
              <label>Estado
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="Activa">Activa</option>
                  <option value="Inactiva">Inactiva</option>
                </select>
              </label>
            </div>
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setForm(null)}>Cancelar</Button>
              <Button type="submit">Guardar categoria</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
