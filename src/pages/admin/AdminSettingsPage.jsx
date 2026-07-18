import { Card } from "../../components/common/Card";

export function AdminSettingsPage() {
  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Configuracion</span>
        <h1>Configuracion general</h1>
        <p>Modulo preparado para categorias, puntajes, tipos de torneo, horarios, canchas, reglamentos y notificaciones.</p>
      </header>
      <div className="card-grid">
        {["Categorias", "Puntajes", "Tipos de torneo", "Horarios", "Canchas", "Reglamentos", "Notificaciones"].map((item) => (
          <Card key={item}>
            <h2>{item}</h2>
            <p className="muted">Configuracion mock pendiente de integracion real.</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
