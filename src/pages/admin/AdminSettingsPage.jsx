import { useState } from "react";
import { Link } from "react-router-dom";
import { Edit3, Plus, ScrollText, Tags, Trash2, Trophy } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { useAsyncData } from "../../hooks/useAsyncData";
import { adminService } from "../../services/adminService";
import { formatDate } from "../../utils/formatters";

const scoringFields = [
  ["inscription", "Puntos por inscripcion"],
  ["preliminary", "Puntos por jugar preliminar"],
  ["preliminaryWin", "Bonus por ganar preliminar"],
  ["classification", "Puntos por clasificacion"],
  ["round32", "32avos"],
  ["round16", "16avos"],
  ["octavos", "Octavos"],
  ["cuartos", "Cuartos"],
  ["semifinal", "Semifinal"],
  ["runnerUp", "Final/Subcampeon"],
  ["champion", "Campeon"],
  ["specialBonus", "Bonus especiales"],
];

const emptyScoringForm = {
  id: null,
  name: "",
  status: "Activo",
  inscription: "",
  preliminary: "",
  preliminaryWin: "",
  classification: "",
  round32: "",
  round16: "",
  octavos: "",
  cuartos: "",
  semifinal: "",
  runnerUp: "",
  champion: "",
  specialBonus: "",
};

export function AdminSettingsPage() {
  const [scoringForm, setScoringForm] = useState(null);
  const [regulationForm, setRegulationForm] = useState(null);
  const [deleteRegulationOpen, setDeleteRegulationOpen] = useState(false);
  const { data: settings, loading, error, reload } = useAsyncData(() => adminService.getSettings(), []);

  if (loading) return <LoadingState message="Cargando configuracion..." />;
  if (error) return <ErrorState title="No pudimos cargar configuracion." onRetry={reload} />;

  const regulation = settings.regulation;

  function openScoringForm(system = null) {
    setScoringForm(system ? { ...emptyScoringForm, ...system } : { ...emptyScoringForm });
  }

  async function saveScoring(event) {
    event.preventDefault();
    const payload = {
      ...scoringForm,
      name: scoringForm.name.trim(),
    };
    scoringFields.forEach(([field]) => {
      payload[field] = Number(payload[field] || 0);
    });
    delete payload.id;
    if (scoringForm.id) await adminService.updateScoringSystem(scoringForm.id, payload);
    else await adminService.createScoringSystem(payload);
    setScoringForm(null);
    reload();
  }

  async function toggleScoring(id) {
    await adminService.toggleScoringSystem(id);
    reload();
  }

  async function removeScoring(id) {
    await adminService.removeScoringSystem(id);
    reload();
  }

  function openRegulationForm() {
    setRegulationForm({
      title: regulation?.title || "",
      content: regulation?.content || "",
    });
  }

  async function saveRegulation(event) {
    event.preventDefault();
    await adminService.saveRegulation({
      title: regulationForm.title.trim(),
      content: regulationForm.content.trim(),
    });
    setRegulationForm(null);
    reload();
  }

  async function deleteRegulation() {
    await adminService.deleteRegulation();
    setDeleteRegulationOpen(false);
    reload();
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Configuracion</span>
        <h1>Configuracion general</h1>
        <p>Categorias, sistemas de puntaje y reglamento del circuito. Los formatos, disciplina y notificaciones no se configuran desde aca.</p>
      </header>

      <div className="settings-grid settings-grid--focused">
        <Card className="settings-card">
          <span className="feature-icon"><Tags size={24} /></span>
          <div>
            <h2>Categorias</h2>
            <p>Crear, editar, activar y desactivar categorias por rama y nivel jerarquico.</p>
          </div>
          <Link className="button button--outline-green button--sm" to="/admin/settings/categories">
            <span>Configurar</span>
          </Link>
        </Card>
        <Card className="settings-card">
          <span className="feature-icon"><Trophy size={24} /></span>
          <div>
            <h2>Puntajes</h2>
            <p>Sistemas activos seleccionables al crear torneos.</p>
          </div>
          <Button variant="outline-green" size="sm" icon={Plus} onClick={() => openScoringForm()}>Nuevo sistema</Button>
        </Card>
        <Card className="settings-card">
          <span className="feature-icon"><ScrollText size={24} /></span>
          <div>
            <h2>Reglamento</h2>
            <p>Texto vigente visible para jugadores.</p>
          </div>
          <Button variant="outline-green" size="sm" icon={regulation ? Edit3 : Plus} onClick={openRegulationForm}>
            {regulation ? "Editar" : "Crear reglamento"}
          </Button>
        </Card>
      </div>

      <Card>
        <div className="section-title">
          <span>Sistemas de puntaje</span>
          <Button size="sm" icon={Plus} onClick={() => openScoringForm()}>Crear sistema</Button>
        </div>
        <div className="admin-table">
          {settings.scoringSystems.map((system) => (
            <div key={system.id} className="admin-table-row admin-table-row--scoring">
              <strong>{system.name}</strong>
              <span>Inscripcion {system.inscription}</span>
              <span>Preliminar {system.preliminary}</span>
              <span>Campeon {system.champion}</span>
              <Badge tone={system.status === "Activo" ? "success" : "neutral"}>{system.status}</Badge>
              <div className="card-actions">
                <Button variant="ghost" size="sm" icon={Edit3} onClick={() => openScoringForm(system)}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={() => toggleScoring(system.id)}>{system.status === "Activo" ? "Desactivar" : "Activar"}</Button>
                <Button variant="danger" size="sm" icon={Trash2} onClick={() => removeScoring(system.id)}>Eliminar</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="section-title">
          <span>Reglamento</span>
          <div className="card-actions">
            <Button size="sm" icon={regulation ? Edit3 : Plus} onClick={openRegulationForm}>{regulation ? "Editar" : "Crear reglamento"}</Button>
            {regulation ? <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteRegulationOpen(true)}>Eliminar</Button> : null}
          </div>
        </div>
        {regulation ? (
          <article className="regulation-preview">
            <Badge tone="info">Publicado {formatDate(regulation.publishedAt.slice(0, 10))}</Badge>
            <h2>{regulation.title}</h2>
            <p>{regulation.content}</p>
          </article>
        ) : (
          <p className="muted">No hay reglamento publicado.</p>
        )}
      </Card>

      <Modal open={Boolean(scoringForm)} title={scoringForm?.id ? "Editar sistema de puntaje" : "Nuevo sistema de puntaje"} onClose={() => setScoringForm(null)} size="lg">
        {scoringForm ? (
          <form className="modal-form" onSubmit={saveScoring}>
            <div className="form-grid">
              <label>Nombre del sistema<input required value={scoringForm.name} onChange={(event) => setScoringForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Estado
                <select value={scoringForm.status} onChange={(event) => setScoringForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </label>
              {scoringFields.map(([field, label]) => (
                <label key={field}>{label}
                  <input type="number" required min="0" value={scoringForm[field]} onChange={(event) => setScoringForm((current) => ({ ...current, [field]: event.target.value }))} />
                </label>
              ))}
            </div>
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setScoringForm(null)}>Cancelar</Button>
              <Button type="submit">Guardar puntaje</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(regulationForm)} title={regulation ? "Editar reglamento" : "Crear reglamento"} onClose={() => setRegulationForm(null)} size="lg">
        {regulationForm ? (
          <form className="modal-form" onSubmit={saveRegulation}>
            <label>Titulo<input required value={regulationForm.title} onChange={(event) => setRegulationForm((current) => ({ ...current, title: event.target.value }))} /></label>
            <label>Contenido<textarea required rows={12} value={regulationForm.content} onChange={(event) => setRegulationForm((current) => ({ ...current, content: event.target.value }))} /></label>
            <div className="wizard-actions">
              <Button variant="ghost" type="button" onClick={() => setRegulationForm(null)}>Cancelar</Button>
              <Button type="submit">Guardar reglamento</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmModal
        open={deleteRegulationOpen}
        title="Eliminar reglamento"
        message="Estas seguro que queres eliminar el reglamento publicado?"
        confirmLabel="Si, eliminar"
        cancelLabel="No"
        onConfirm={deleteRegulation}
        onCancel={() => setDeleteRegulationOpen(false)}
      />
    </div>
  );
}
