import { Camera, Pencil } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { useAuth } from "../../context/AuthContext";

export function PlayerProfilePage() {
  const { user } = useAuth();

  return (
    <div className="page-stack">
      <section className="profile-header">
        <Avatar src={user.avatar} name={user.fullName} size="xl" />
        <div>
          <span className="eyebrow">Perfil jugador</span>
          <h1>{user.fullName}</h1>
          <p>{user.categoryName} / Ranking #{user.ranking} / {user.points} pts</p>
          <Badge tone={user.discipline.faults >= 3 ? "danger" : user.discipline.faults > 0 ? "warning" : "success"}>
            Disciplina {user.discipline.faults}/{user.discipline.limit}
          </Badge>
        </div>
      </section>

      <div className="card-actions">
        <Button variant="secondary" icon={Pencil}>Editar perfil</Button>
        <Button variant="ghost" icon={Camera}>Cambiar foto</Button>
      </div>

      <div className="detail-grid">
        <Card>
          <h2>Datos personales</h2>
          <div className="info-list">
            <span>Nombre: {user.firstName}</span>
            <span>Apellido: {user.lastName}</span>
            <span>DNI: {user.dni}</span>
            <span>Telefono: {user.phone}</span>
            <span>Email: {user.email}</span>
          </div>
        </Card>
        <Card>
          <h2>Historial deportivo</h2>
          <div className="info-list">
            <span>Partidos jugados: {user.stats.played}</span>
            <span>Victorias: {user.stats.wins}</span>
            <span>Derrotas: {user.stats.losses}</span>
            <span>Torneos disputados: {user.stats.tournaments}</span>
            <span>Estado disciplinario: {user.discipline.status}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
