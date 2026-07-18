import { useState } from "react";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Tabs } from "../../components/common/Tabs";
import { mockCategories } from "../../mocks/mockCategories";

const steps = [
  { id: "general", label: "General" },
  { id: "categories", label: "Categorias" },
  { id: "format", label: "Formato" },
  { id: "scoring", label: "Puntaje" },
  { id: "dates", label: "Fechas" },
  { id: "courts", label: "Canchas" },
  { id: "review", label: "Revision" },
];

export function AdminTournamentCreatePage() {
  const [activeStep, setActiveStep] = useState("general");

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Nuevo torneo</span>
        <h1>Asistente de creacion</h1>
        <p>Estructura visual preparada para validar datos y publicar mas adelante.</p>
      </header>
      <Tabs tabs={steps} activeTab={activeStep} onChange={setActiveStep} />
      <Card className="form-card">
        {activeStep === "general" ? (
          <div className="form-grid">
            <label>Nombre<input defaultValue="GAME 1000 Copa Invierno" /></label>
            <label>Descripcion<textarea defaultValue="Torneo central del calendario." /></label>
            <label>Valor de inscripcion<input defaultValue="18000" /></label>
            <label>Estado<select defaultValue="Borrador"><option>Borrador</option><option>Inscripciones abiertas</option></select></label>
          </div>
        ) : null}
        {activeStep === "categories" ? (
          <div className="badge-cloud">
            {mockCategories.map((category) => <label key={category.id} className="check-pill"><input type="checkbox" defaultChecked={category.status === "Activa"} /> {category.name} {category.branch}</label>)}
          </div>
        ) : null}
        {activeStep === "format" ? (
          <div className="option-grid">
            {["Preliminar", "Zonas", "Eliminacion Directa"].map((format) => <button key={format} className="category-option" type="button"><strong>{format}</strong><span>Algoritmo pendiente de etapa backend.</span></button>)}
          </div>
        ) : null}
        {activeStep === "scoring" ? <div className="form-grid"><label>Sistema de puntaje<select defaultValue="GAME 1000"><option>GAME 250</option><option>GAME 500</option><option>GAME 1000</option><option>MASTER GAME 1500</option></select></label><label>Puntos campeon<input defaultValue="1000" /></label></div> : null}
        {activeStep === "dates" ? <div className="form-grid"><label>Inicio<input type="date" defaultValue="2026-08-08" /></label><label>Semifinales<input type="date" defaultValue="2026-08-15" /></label><label>Finales<input type="date" defaultValue="2026-08-16" /></label></div> : null}
        {activeStep === "courts" ? <div className="form-grid"><label>Canchas<input defaultValue="Cancha 1, Cancha 2, Cancha 3" /></label><label>Horarios<textarea defaultValue="Sabado 9:00, 12:00, 16:00&#10;Domingo 9:00, 12:00, 16:00" /></label></div> : null}
        {activeStep === "review" ? <p className="mock-note">Revision mock lista. Crear, publicar, cronograma y llaves quedan preparados para proximas etapas.</p> : null}
        <div className="wizard-actions">
          <Button variant="secondary">Guardar borrador</Button>
          <Button>Continuar</Button>
        </div>
      </Card>
    </div>
  );
}
