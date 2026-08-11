import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { enrollmentService } from "../../services/enrollmentService";
import { formatCurrency } from "../../utils/formatters";

function statusView(status) {
  if (status === "approved" || status === "waived") {
    return {
      icon: CheckCircle2,
      tone: "success",
      title: status === "waived" ? "Inscripcion liberada" : "Pago confirmado",
      label: status === "waived" ? "Liberado" : "Aprobado",
    };
  }
  if (status === "rejected" || status === "cancelled") {
    return {
      icon: XCircle,
      tone: "danger",
      title: "Pago no aprobado",
      label: status === "cancelled" ? "Cancelado" : "Rechazado",
    };
  }
  if (status === "review" || status === "refunded" || status === "charged_back") {
    return {
      icon: AlertTriangle,
      tone: "warning",
      title: "Pago en revision",
      label: "Revision",
    };
  }
  return {
    icon: Clock3,
    tone: "warning",
    title: "Pago pendiente",
    label: "Pendiente",
  };
}

export function PaymentReturnPage() {
  const [searchParams] = useSearchParams();
  const registrationId = searchParams.get("registration_id") || searchParams.get("external_reference") || "";
  const providerPaymentId = searchParams.get("payment_id") || searchParams.get("collection_id") || "";
  const providerOrderId = searchParams.get("order_id") || searchParams.get("provider_order_id") || searchParams.get("merchant_order_id") || "";
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      if (!registrationId) {
        setState({ loading: false, data: null, error: "No pudimos identificar la inscripcion." });
        return;
      }
      setState({ loading: true, data: null, error: "" });
      try {
        const data = await enrollmentService.getPaymentReturnStatus({ registrationId, providerPaymentId, providerOrderId });
        if (active) setState({ loading: false, data, error: "" });
      } catch (error) {
        if (active) setState({ loading: false, data: null, error: error.cause?.message || error.message || "No pudimos verificar el pago." });
      }
    }
    loadStatus();
    return () => {
      active = false;
    };
  }, [registrationId, providerPaymentId, providerOrderId]);

  async function retryPayment() {
    if (!registrationId) return;
    setRetrying(true);
    try {
      const result = await enrollmentService.payPendingRegistration(registrationId);
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error.cause?.message || error.message || "No pudimos reintentar el pago.",
      }));
    } finally {
      setRetrying(false);
    }
  }

  const data = state.data;
  const view = statusView(data?.status);
  const Icon = view.icon;
  const canRetry = ["pending", "rejected", "cancelled"].includes(data?.status);

  return (
    <div className="page-stack payment-return-page">
      <Card className="payment-return-card">
        {state.loading ? (
          <>
            <RefreshCw className="payment-return-spinner" size={42} />
            <h1>Verificando pago</h1>
            <p>Consultando el estado real antes de confirmar la inscripcion.</p>
          </>
        ) : state.error ? (
          <>
            <AlertTriangle size={46} />
            <h1>No pudimos verificar el pago</h1>
            <p>{state.error}</p>
          </>
        ) : (
          <>
            <Icon size={52} />
            <Badge tone={view.tone}>{view.label}</Badge>
            <h1>{view.title}</h1>
            <p>{data.message}</p>
            <div className="info-list payment-return-summary">
              <span>Torneo: {data.registration?.tournamentName || "Torneo GAME"}</span>
              {data.registration?.categories?.length ? <span>Categorias: {data.registration.categories.join(", ")}</span> : null}
              <span>Total: {formatCurrency(data.registration?.totalAmount || 0)}</span>
            </div>
          </>
        )}

        <div className="wizard-actions payment-return-actions">
          <Link className="button button--ghost button--lg" to="/player/tournaments">
            Volver a torneos
          </Link>
          {canRetry ? (
            <Button variant="orange" disabled={retrying} onClick={retryPayment}>
              {retrying ? "Abriendo..." : "Reintentar pago"}
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
