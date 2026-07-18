import { useState } from "react";
import { CalendarDays, CheckCircle2, GitBranch, MapPinned, Trophy, UsersRound } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Tabs } from "../../components/common/Tabs";
import { mockSettings } from "../../mocks/mockAdmin";
import { mockCategories } from "../../mocks/mockCategories";

const steps = [
  { id: "general", label: "General" },
  { id: "categories", label: "Categorias" },
  { id: "format", label: "Formato" },
  { id: "scoring", label: "Puntaje" },
  { id: "schedule", label: "Canchas y horarios" },
  { id: "publish", label: "Publicar" },
];

export function AdminTournamentCreatePage() {
  const [activeStep, setActiveStep] = useState("general");
  const [selectedFormat, setSelectedFormat] = useState("Preliminar");

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Nuevo torneo</span>
        <h1>Asistente de creacion</h1>
        <p>Flujo visual basado en estructura.md. El profesor define datos clave y GAME queda preparado para organizar programacion y llaves.</p>
      </header>

      <Tabs tabs={steps} activeTab={activeStep} onChange={setActiveStep} />

      <Card className="form-card">
        {activeStep === "general" ? (
          <div className="form-grid">
            <label>Nombre<input defaultValue="GAME 1000 Copa Invierno" /></label>
            <label>Edicion<input defaultValue="2026 - Invierno" /></label>
            <label>Descripcion<textarea defaultValue="Torneo central del calendario con finales el domingo." /></label>
            <label>Valor de inscripcion<input type="number" defaultValue="18000" /></label>
            <label>Cupo maximo por categoria<input type="number" defaultValue="16" /></label>
            <label>Estado<select defaultValue="Borrador"><option>Borrador</option><option>Inscripciones abiertas</option></select></label>
            <label>Reglamento especifico<textarea defaultValue="Se aplican reglas oficiales del circuito GAME." /></label>
            <label>Observaciones internas<textarea defaultValue="Revisar disponibilidad de jugadores con doble categoria antes de publicar." /></label>
          </div>
        ) : null}

        {activeStep === "categories" ? (
          <div className="admin-create-section">
            <div className="info-band">
              <strong>Regla de categoria</strong>
              <span>Las categorias son configurables por nivel jerarquico. El nivel se usa para validar si un jugador puede jugar su categoria o superiores.</span>
            </div>
            <div className="badge-cloud">
              {mockCategories.map((category) => (
                <label key={category.id} className="check-pill">
                  <input type="checkbox" defaultChecked={category.status === "Activa" && category.level <= 5} />
                  <strong>{category.name} {category.branch}</strong>
                  <span>Nivel {category.level} / {category.status}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {activeStep === "format" ? (
          <div className="option-grid">
            {mockSettings.tournamentTypes.map((format) => (
              <button key={format} className={selectedFormat === format ? "category-option is-selected" : "category-option"} type="button" onClick={() => setSelectedFormat(format)}>
                <GitBranch size={20} />
                <strong>{format}</strong>
                <span>{format === "Preliminar" ? "Preliminar para sumar puntos, ordenar y definir cuadro principal." : null}</span>
                <span>{format === "Zonas" ? "Todos contra todos, desempates y luego eliminacion directa." : null}</span>
                <span>{format === "Eliminacion Directa" ? "Cuadro directo con cabezas de serie si utiliza ranking." : null}</span>
              </button>
            ))}
            <div className="info-band">
              <strong>Ranking y llaves</strong>
              <span>El ranking general se usa para cabezas de serie y desempates; nunca para otorgar byes.</span>
            </div>
          </div>
        ) : null}

        {activeStep === "scoring" ? (
          <div className="admin-table">
            {mockSettings.scoringSystems.map((system) => (
              <div key={system.name} className="admin-table-row admin-table-row--scoring">
                <Trophy size={20} />
                <strong>{system.name}</strong>
                <span>Inscripcion {system.inscription}</span>
                <span>Preliminar {system.preliminary}</span>
                <span>Campeon {system.champion}</span>
                <Badge tone="info">Configurable</Badge>
              </div>
            ))}
          </div>
        ) : null}

        {activeStep === "schedule" ? (
          <div className="form-grid">
            <label>Fecha de inicio<input type="date" defaultValue="2026-08-08" /></label>
            <label>Fecha prevista de semifinales<input type="date" defaultValue="2026-08-15" /></label>
            <label>Dia de finales<input type="date" defaultValue="2026-08-16" /></label>
            <label>Canchas<textarea defaultValue={mockSettings.courts.join(", ")} /></label>
            <label>Turnos disponibles<textarea defaultValue={mockSettings.timeSlots.join("\n")} /></label>
            <div className="info-band">
              <strong>Programacion editable</strong>
              <span>GAME distribuye segun disponibilidad, canchas, descanso, fases y finales; el profesor puede modificar fechas, horarios y canchas.</span>
            </div>
          </div>
        ) : null}

        {activeStep === "publish" ? (
          <div className="publish-grid">
            <div className="publish-item"><CheckCircle2 size={22} /><strong>Informacion general</strong><span>Lista para guardar como borrador.</span></div>
            <div className="publish-item"><UsersRound size={22} /><strong>Categorias</strong><span>Configurables y seleccionadas por nivel.</span></div>
            <div className="publish-item"><GitBranch size={22} /><strong>Formato</strong><span>{selectedFormat}</span></div>
            <div className="publish-item"><MapPinned size={22} /><strong>Canchas</strong><span>Disponibilidad preparada para programacion.</span></div>
            <div className="publish-item"><CalendarDays size={22} /><strong>Fechas clave</strong><span>Inicio, semifinales y finales definidas.</span></div>
          </div>
        ) : null}

        <div className="wizard-actions">
          <Button variant="secondary">Guardar borrador</Button>
          <Button variant="outline-green">Vista previa</Button>
          <Button>Continuar</Button>
        </div>
      </Card>
    </div>
  );
}
