import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Edit3, Plus, Trash2 } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Modal } from "../../components/common/Modal";
import { useAsyncData } from "../../hooks/useAsyncData";
import { adminService } from "../../services/adminService";

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
  ["champion", "Campeón"],
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
};

export function AdminSettingsScoringPage() {
  const [scoringForm, setScoringForm] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [blockedDelete, setBlockedDelete] = useState(null);
  const { data: settings, loading, error, reload } = useAsyncData(() => adminService.getSettings(), []);

  if (loading) return <LoadingState message="Cargando sistemas de puntaje..." />;
  if (error) return <ErrorState title="No pudimos cargar sistemas de puntaje." onRetry={reload} />;

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

  async function toggleScoring(system) {
    await adminService.toggleScoringSystem(system.id);
    reload();
  }

  async function confirmDeleteScoring() {
    setDeleteError("");
    try {
      const result = await adminService.removeScoringSystem(deleteTarget.id);
      setDeleteTarget(null);
      if (result?.blocked) {
        setBlockedDelete(result);
        return;
      }
      reload();
    } catch (error) {
      setDeleteError(error.message || "No se pudo eliminar por un error del servidor.");
    }
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
          <h1>Sistemas de puntaje</h1>
          <p>Crea y administra los sistemas disponibles para torneos futuros.</p>
        </div>
        <Button icon={Plus} onClick={() => openScoringForm()}>Nuevo sistema</Button>
      </header>

      <Card>
        <div className="admin-table">
          {settings.scoringSystems.map((system) => (
            <div key={system.id} className="admin-table-row admin-table-row--scoring">
              <strong>{system.name}</strong>
              <span>Inscripción {system.inscription}</span>
              <span>Preliminar {system.preliminary}</span>
              <span>Campeón {system.champion}</span>
              <Badge tone={system.status === "Activo" ? "success" : "neutral"}>{system.status}</Badge>
              <div className="card-actions">
                <Button variant="ghost" size="sm" icon={Edit3} onClick={() => openScoringForm(system)}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={() => toggleScoring(system)}>{system.status === "Activo" ? "Desactivar" : "Activar"}</Button>
                <Button variant="danger" size="sm" icon={Trash2} onClick={() => {
                  setDeleteError("");
                  setDeleteTarget(system);
                }}>Eliminar</Button>
              </div>
            </div>
          ))}
        </div>
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

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="ELIMINAR SISTEMA DE PUNTAJE"
        message={deleteTarget ? `${deleteError ? `${deleteError}\n\n` : ""}¿Seguro que querés eliminar ${deleteTarget.name}?` : ""}
        confirmLabel="ELIMINAR"
        cancelLabel="CANCELAR"
        onConfirm={confirmDeleteScoring}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError("");
        }}
      />

      <Modal open={Boolean(blockedDelete)} title="NO SE PUEDE ELIMINAR EL SISTEMA" onClose={() => setBlockedDelete(null)} size="sm">
        {blockedDelete ? (
          <div className="confirm-modal">
            <p>Este sistema de puntaje está asociado a torneos o información histórica.</p>
            <p>Podés desactivarlo para impedir que se use en nuevos torneos.</p>
            <div className="wizard-actions">
              <Button onClick={() => setBlockedDelete(null)}>CERRAR</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
