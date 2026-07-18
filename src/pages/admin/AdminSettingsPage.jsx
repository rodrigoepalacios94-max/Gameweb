import { Bell, Clock, GitBranch, MapPinned, ScrollText, ShieldAlert, Tags, Trophy } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { mockSettings } from "../../mocks/mockAdmin";

const modules = [
  { title: "Categorias", icon: Tags, description: "Nombre, rama, nivel jerarquico y estado activo/inactivo.", action: "/admin/categories" },
  { title: "Puntajes", icon: Trophy, description: "Inscripcion, preliminar, bonus, rondas, campeon y subcampeon." },
  { title: "Tipos de torneo", icon: GitBranch, description: "Preliminar, zonas y eliminacion directa." },
  { title: "Horarios", icon: Clock, description: "Turnos disponibles para que GAME programe partidos." },
  { title: "Canchas", icon: MapPinned, description: "Cantidad y nombres de canchas disponibles." },
  { title: "Reglamentos", icon: ScrollText, description: "Reglamento oficial consultable por jugadores." },
  { title: "Disciplina", icon: ShieldAlert, description: "Limite de faltas, W.O., doble W.O. y desbloqueo manual." },
  { title: "Notificaciones", icon: Bell, description: "Avisos internos y correos para eventos importantes." },
];

export function AdminSettingsPage() {
  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Configuracion</span>
        <h1>Configuracion general</h1>
        <p>Primer panel visual para parametros globales del circuito. Los cambios impactaran en torneos futuros cuando exista persistencia real.</p>
      </header>

      <div className="settings-grid">
        {modules.map((item) => (
          <Card key={item.title} className="settings-card">
            <span className="feature-icon"><item.icon size={24} /></span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </div>
            <Button variant="ghost" size="sm">Configurar</Button>
          </Card>
        ))}
      </div>

      <div className="detail-grid">
        <Card>
          <h2>Sistemas de puntaje mock</h2>
          <div className="compact-list">
            {mockSettings.scoringSystems.map((system) => (
              <div key={system.name} className="compact-item">
                <strong>{system.name}</strong>
                <span>Inscripcion {system.inscription} / Campeon {system.champion} / Subcampeon {system.runnerUp}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2>Disciplina y canales</h2>
          <div className="info-list">
            <span>Limite de faltas: {mockSettings.discipline.faultLimit}</span>
            <span>{mockSettings.discipline.limitAction}</span>
            <span>Canchas: {mockSettings.courts.join(", ")}</span>
            <span>Notificaciones: {mockSettings.notifications.join(", ")}</span>
          </div>
          <Badge tone="info">Preparado para crecer por club/profesor</Badge>
        </Card>
      </div>
    </div>
  );
}
