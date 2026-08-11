import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, KeyRound } from "lucide-react";
import { ChangePasswordModal } from "../../components/auth/ChangePasswordModal";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";

export function AdminSettingsSecurityPage() {
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <div className="page-stack">
      <Link className="back-link" to="/admin/settings">
        <ArrowLeft size={18} />
        <span>Volver</span>
      </Link>

      <header className="page-header page-header--wide">
        <span className="eyebrow">Configuración</span>
        <h1>Seguridad</h1>
        <p>Administra la seguridad de tu cuenta.</p>
      </header>

      <Card>
        <div className="section-title">
          <span>Cambiar contraseña</span>
          <KeyRound size={18} />
        </div>
        <p className="muted">Cuando Supabase Auth esté activo, GAME validará tu contraseña actual antes de guardar una nueva.</p>
        <Button variant="outline-green" onClick={() => setPasswordOpen(true)}>Configurar</Button>
      </Card>

      <ChangePasswordModal open={passwordOpen} title="Cambiar contraseña admin" onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
