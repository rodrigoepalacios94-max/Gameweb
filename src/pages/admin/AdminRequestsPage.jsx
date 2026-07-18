import { Check, X } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryRequestService } from "../../services/categoryRequestService";
import { playerService } from "../../services/playerService";
import { formatDate } from "../../utils/formatters";

export function AdminRequestsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [requests, players] = await Promise.all([
      categoryRequestService.getCategoryChangeRequests(),
      playerService.getPlayers(),
    ]);
    return { requests, players };
  }, []);

  if (loading) return <LoadingState message="Cargando solicitudes..." />;
  if (error) return <ErrorState title="No pudimos cargar solicitudes." onRetry={reload} />;

  const { requests, players } = data;

  async function updateStatus(id, status) {
    if (status === "Aprobada") await categoryRequestService.approveRequest(id);
    if (status === "Rechazada") await categoryRequestService.rejectRequest(id);
    reload();
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--wide">
        <span className="eyebrow">Categorias</span>
        <h1>Solicitudes de descenso</h1>
        <p>El jugador no puede inscribirse directamente en una categoria inferior. El profesor aprueba o rechaza la solicitud.</p>
      </header>

      <Card>
        <div className="admin-table">
          {requests.map((request) => {
            const player = players.find((item) => item.id === request.playerId);
            return (
              <div key={request.id} className="admin-table-row admin-table-row--requests">
                <Avatar src={player?.avatar} name={player?.fullName} size="sm" />
                <strong>{player?.fullName}</strong>
                <span>{request.currentCategoryName}</span>
                <span>{request.requestedCategoryName}</span>
                <span>{formatDate(request.date)}</span>
                <Badge tone={request.status === "Pendiente" ? "warning" : request.status === "Aprobada" ? "success" : "neutral"}>{request.status}</Badge>
                <div className="card-actions">
                  <Button variant="outline-green" size="sm" icon={Check} onClick={() => updateStatus(request.id, "Aprobada")}>Aceptar</Button>
                  <Button variant="ghost" size="sm" icon={X} onClick={() => updateStatus(request.id, "Rechazada")}>Rechazar</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="info-band">
        <strong>Consecuencia aplicada visualmente</strong>
        <span>Mientras la solicitud esta pendiente, la inscripcion en categoria inferior permanece bloqueada. La actualizacion real de categoria queda para integracion de datos.</span>
      </div>
    </div>
  );
}
