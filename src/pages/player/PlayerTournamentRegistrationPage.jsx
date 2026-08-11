import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, CreditCard, ShieldQuestion } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Tabs } from "../../components/common/Tabs";
import { MercadoPagoQrPanel } from "../../components/tournaments/MercadoPagoQrPanel";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { enrollmentService } from "../../services/enrollmentService";
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";
import { canPayLater, getPaymentDueAt } from "../../utils/paymentRules";
import { formatCurrency } from "../../utils/formatters";

const steps = [
  { id: "category", label: "Categoría" },
  { id: "summary", label: "Resumen" },
  { id: "payment", label: "Pago" },
  { id: "confirmed", label: "Confirmada" },
];

export function PlayerTournamentRegistrationPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState(user.categoryId);
  const [descentRequested, setDescentRequested] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [createdEnrollment, setCreatedEnrollment] = useState(null);
  const [qrPayment, setQrPayment] = useState(null);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [tournament, tournamentCategories, categoryRules] = await Promise.all([
      tournamentService.getTournamentById(id),
      tournamentService.getTournamentCategories(id),
      categoryService.getCategoryRulesForPlayer(user.id),
    ]);
    const allowedCategories = tournamentCategories.filter(
      (category) => category.status === "Activa" && categoryService.canPlayerRegisterInCategory(categoryRules.currentCategory, category),
    );
    return { tournament, tournamentCategories, categoryRules, allowedCategories };
  }, [id, user.id]);

  const selectedCategory = useMemo(
    () => data?.allowedCategories.find((category) => category.id === selectedCategoryId),
    [data, selectedCategoryId],
  );

  useEffect(() => {
    if (data?.allowedCategories?.length && !data.allowedCategories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(data.allowedCategories[0].id);
    }
  }, [data, selectedCategoryId]);

  if (loading) return <LoadingState message="Cargando inscripción..." />;
  if (error) return <ErrorState title="No pudimos cargar la inscripción." onRetry={reload} />;

  const { tournament, tournamentCategories, categoryRules, allowedCategories } = data;
  if (!tournament) return <Card>Torneo no encontrado.</Card>;
  const missingTournamentProfileData = !user?.gender || !user?.categoryId;
  if (missingTournamentProfileData) {
    return (
      <div className="page-stack">
        <ErrorState title="Completá tu sexo y categoría actual para ver los torneos disponibles." />
      </div>
    );
  }
  const isBlocked = user.status?.includes("Bloqueado");
  const benefit = user.benefit;
  const discount = benefit?.percentage || 0;
  const finalPrice = Math.max(0, Number(tournament.price || 0) * (100 - discount) / 100);
  const qrFinalPrice = Math.max(0, Math.round(finalPrice * 0.95 * 100) / 100);
  const paymentDueAt = getPaymentDueAt(tournament);
  const payLaterAvailable = canPayLater(tournament);

  function next() {
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function previous() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function requestDescent() {
    const lowerCategory = categoryRules.lowerCategories[0];
    if (!lowerCategory) return;
    await playerService.requestCategoryDowngrade(user.id, lowerCategory.id);
    setDescentRequested(true);
  }

  async function payNow() {
    setRegistrationError("");
    setQrPayment(null);
    try {
      const result = await enrollmentService.startMercadoPagoCheckout({
        tournamentId: tournament.id,
        playerId: user.id,
        categoryIds: [selectedCategoryId],
        categoryNames: { [selectedCategoryId]: selectedCategory ? `${selectedCategory.name} ${selectedCategory.branch}` : "" },
        unitPrice: Number(tournament.price || 0),
        benefitPercentage: discount,
      }, user.id);
      if (result.status === "waived") {
        setCreatedEnrollment(result.enrollments?.[0] || null);
        next();
        return;
      }
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      throw new Error("Mercado Pago no devolvio una URL de checkout.");
    } catch (error) {
      setRegistrationError(error.cause?.message || error.message || "No pudimos iniciar Mercado Pago.");
    }
  }

  async function payQr() {
    setRegistrationError("");
    setQrPayment(null);
    try {
      const result = await enrollmentService.startMercadoPagoQr({
        tournamentId: tournament.id,
        playerId: user.id,
        categoryIds: [selectedCategoryId],
        categoryNames: { [selectedCategoryId]: selectedCategory ? `${selectedCategory.name} ${selectedCategory.branch}` : "" },
        unitPrice: Number(tournament.price || 0),
        benefitPercentage: discount,
      }, user.id);
      if (result.status === "waived") {
        setCreatedEnrollment(result.enrollments?.[0] || null);
        next();
        return;
      }
      if (result.qrData) {
        setCreatedEnrollment(result.enrollments?.[0] || null);
        setQrPayment(result);
        return;
      }
      throw new Error("Mercado Pago no devolvio los datos del QR.");
    } catch (error) {
      setRegistrationError(error.cause?.message || error.message || "No pudimos generar el QR de Mercado Pago.");
    }
  }

  async function payLater() {
    setRegistrationError("");
    try {
      const enrollments = await enrollmentService.confirmPayLaterRegistrations({
        tournamentId: tournament.id,
        playerId: user.id,
        categoryIds: [selectedCategoryId],
        categoryNames: { [selectedCategoryId]: selectedCategory ? `${selectedCategory.name} ${selectedCategory.branch}` : "" },
        unitPrice: Number(tournament.price || 0),
        benefitPercentage: discount,
      }, user.id);
      setCreatedEnrollment(enrollments[0]);
      next();
    } catch (error) {
      setRegistrationError(error.cause?.message || error.message || "No pudimos reservar tu lugar.");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Inscripción</span>
        <h1>{tournament.name}</h1>
        <p>Elegí la categoría y completá el pago por Mercado Pago o reservá con pago pendiente.</p>
      </header>
      <Tabs tabs={steps} activeTab={steps[stepIndex].id} onChange={(idValue) => setStepIndex(steps.findIndex((step) => step.id === idValue))} />

      {steps[stepIndex].id === "category" ? (
        <Card>
          <h2>Seleccionar categoría</h2>
          {isBlocked ? <div className="form-alert">NO PODÉS INSCRIBIRTE. Tu cuenta deportiva está bloqueada por faltas. Contactá al administrador.</div> : null}
          {allowedCategories.length ? (
            <div className="category-options">
              {allowedCategories.map((category) => (
                  <button
                    key={category.id}
                    className={selectedCategoryId === category.id ? "category-option is-selected" : "category-option"}
                    onClick={() => setSelectedCategoryId(category.id)}
                    type="button"
                  >
                    <strong>{category.name} {category.branch}</strong>
                    <span>Nivel {category.level}</span>
                    <Badge tone="success">Disponible</Badge>
                  </button>
              ))}
            </div>
          ) : (
            <p className="muted">No hay categorías disponibles para registrarse.</p>
          )}
          <p className="muted">Categorías del torneo no permitidas: {tournamentCategories.length - allowedCategories.length}</p>
          <Button variant="secondary" icon={ShieldQuestion} onClick={requestDescent}>
            Solicitar descenso de categoría
          </Button>
          {descentRequested ? <p className="mock-note">Solicitud creada: queda pendiente de aprobación del profesor.</p> : null}
        </Card>
      ) : null}

      {steps[stepIndex].id === "summary" ? (
        <Card>
          <h2>Resumen</h2>
          <div className="info-list">
            <span>Torneo: {tournament.name}</span>
            <span>Categoría: {selectedCategory?.name} {selectedCategory?.branch}</span>
          <span>Precio: {formatCurrency(tournament.price)}</span>
            <span>Total: {formatCurrency(finalPrice)}</span>
            {paymentDueAt ? <span>Pagar después disponible hasta: {paymentDueAt.slice(0, 10)}</span> : null}
            {finalPrice > 0 ? <span>QR dinamico: {formatCurrency(qrFinalPrice)} (5% menos pagando con QR)</span> : null}
            {discount ? <span>Beneficio: {discount}% de descuento. Total: {formatCurrency(finalPrice)}</span> : null}
            <span>Disponibilidad: se solicita antes de cada partido.</span>
          </div>
        </Card>
      ) : null}

      {steps[stepIndex].id === "payment" ? (
        <Card className="payment-card">
          <CreditCard size={34} />
          <h2>Mercado Pago</h2>
          <p>Elegi Checkout o QR dinamico de Mercado Pago. Pagar despues reserva el lugar con deuda pendiente.</p>
          {registrationError ? <div className="form-alert">{registrationError}</div> : null}
          {qrPayment ? <MercadoPagoQrPanel payment={qrPayment} /> : null}
          {!payLaterAvailable ? <div className="form-alert">Pagar despues ya no esta disponible. Completa el pago para confirmar tu inscripcion.</div> : null}
          <div className="payment-method-grid">
            <div className="payment-method-card">
              <CreditCard size={28} />
              <strong>Checkout Mercado Pago</strong>
              <span className="payment-method-price">{formatCurrency(finalPrice)}</span>
              <Button onClick={payNow} disabled={isBlocked || !selectedCategory}>Pagar con Checkout</Button>
            </div>
            <div className="payment-method-card">
              <CreditCard size={28} />
              <strong>QR dinamico Mercado Pago</strong>
              <span className="payment-method-price">{formatCurrency(qrFinalPrice)}</span>
              <span className="muted">5% menos pagando con QR</span>
              <Button variant="outline-green" onClick={payQr} disabled={isBlocked || !selectedCategory}>{qrPayment ? "Continuar pago" : "Generar QR"}</Button>
            </div>
          </div>
          <div className="wizard-actions">
            <Button variant="ghost" onClick={payLater} disabled={isBlocked || !selectedCategory || !payLaterAvailable}>Pagar despues</Button>
          </div>
        </Card>
      ) : null}

      {steps[stepIndex].id === "confirmed" ? (
        <Card className="payment-card">
          <CheckCircle2 size={42} />
          <h2>Inscripción confirmada</h2>
          <p>{createdEnrollment?.paymentStatus === "pending" ? "Tu lugar quedó reservado con pago pendiente." : "Tu inscripción quedó registrada."}</p>
          {createdEnrollment ? <Badge tone="success">{createdEnrollment.status}</Badge> : null}
          {createdEnrollment?.paymentStatus === "pending" ? <Badge tone="danger">Pago pendiente</Badge> : null}
        </Card>
      ) : null}

      <div className="wizard-actions">
        <Button variant="ghost" onClick={previous} disabled={stepIndex === 0}>Atrás</Button>
        {stepIndex < steps.length - 1 && steps[stepIndex].id !== "payment" ? <Button onClick={next} disabled={isBlocked || (steps[stepIndex].id === "category" && !allowedCategories.length)}>Continuar</Button> : null}
      </div>
    </div>
  );
}
