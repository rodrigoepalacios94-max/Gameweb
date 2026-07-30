import { Link } from "react-router-dom";
import { KeyRound, ScrollText, Tags, Trophy } from "lucide-react";
import { Card } from "../../components/common/Card";

const settingsModules = [
  {
    to: "/admin/settings/categories",
    title: "Categorías",
    description: "Crea y administra las categorías del circuito.",
    icon: Tags,
  },
  {
    to: "/admin/settings/scoring",
    title: "Puntajes",
    description: "Crea y administra los sistemas de puntuación disponibles para los torneos.",
    icon: Trophy,
  },
  {
    to: "/admin/settings/regulation",
    title: "Reglamentos y Formatos",
    description: "Administra reglamentos, formatos y documentos PDF visibles para jugadores.",
    icon: ScrollText,
  },
  {
    to: "/admin/settings/security",
    title: "Seguridad",
    description: "Administra la seguridad de tu cuenta.",
    icon: KeyRound,
  },
];

export function AdminSettingsPage() {
  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Configuración</span>
        <h1>Configuración general</h1>
        <p>Accedé a los parámetros globales reales del circuito.</p>
      </header>

      <div className="settings-grid settings-grid--focused">
        {settingsModules.map((module) => (
          <Card key={module.to} className="settings-card">
            <span className="feature-icon"><module.icon size={24} /></span>
            <div>
              <h2>{module.title}</h2>
              <p>{module.description}</p>
            </div>
            <Link className="button button--outline-green button--sm" to={module.to}>
              <span>CONFIGURAR</span>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
