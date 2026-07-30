import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, MapPin } from "lucide-react";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { Modal } from "../common/Modal";
import { enrollmentService } from "../../services/enrollmentService";
import { canPayLater, getPaymentDueAt } from "../../utils/paymentRules";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { getVisibleTournamentDescription } from "../../utils/tournamentDescription";

const steps = [
  { id: "info", label: "Info" },
  { id: "categories", label: "Categorías" },
  { id: "payment", label: "Pago" },
];

function categoryLabel(category) {
  return `${category.name} ${category.branch}`.trim();
}

function getExistingRegistrationRows(enrollments = []) {
  const groups = new Map();
  enrollments
    .filter((enrollment) => enrollment.registrationStatus !== "cancelled")
    .forEach((enrollment) => {
      const registrationId = enrollment.registrationId || enrollment.paymentGroupId;
      if (!registrationId) return;
      groups.set(registrationId, [...(groups.get(registrationId) || []), enrollment]);
    });
  return [...groups.values()][0] || [];
}

export function TournamentRegistrationModal({ open, tournament, player, categories = [], existingEnrollments = [], onClose, onConfirmed }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdEnrollments, setCreatedEnrollments] = useState([]);
  const [registrationState, setRegistrationState] = useState("DRAFT");
  const [paymentState, setPaymentState] = useState("DRAFT");

  const registeredCategoryIds = useMemo(
    () => new Set(existingEnrollments.map((enrollment) => enrollment.categoryId)),
    [existingEnrollments],
  );
  const selectableCategories = useMemo(
    () => categories.filter((category) => category.isEligible && !registeredCategoryIds.has(category.id)),
    [categories, registeredCategoryIds],
  );
  const existingRegistrationRows = useMemo(
    () => getExistingRegistrationRows(existingEnrollments),
    [existingEnrollments],
  );
  const existingRegistration = existingRegistrationRows[0] || null;
  const hasExistingRegistration = Boolean(existingRegistration);
  const existingPaymentStatus = existingRegistration?.paymentStatus || "";
  const existingPaid = existingPaymentStatus === "paid";
  const existingWaived = existingPaymentStatus === "waived";

  useEffect(() => {
    if (!open) return;
    const existingRows = getExistingRegistrationRows(existingEnrollments);
    const existing = existingRows[0] || null;
    setStepIndex(existing?.paymentStatus === "pending" ? 2 : 0);
    setSelectedCategoryIds(existingRows.map((enrollment) => enrollment.categoryId).filter(Boolean));
    setError("");
    setSaving(false);
    setCreatedEnrollments(existingRows);
    setRegistrationState(existing?.paymentStatus === "paid" || existing?.paymentStatus === "waived" ? "CONFIRMED" : existing?.paymentStatus === "pending" ? "PENDING_PAYMENT" : "DRAFT");
    setPaymentState(existing?.paymentStatus === "paid" ? "PAID" : existing?.paymentStatus === "waived" ? "WAIVED" : existing?.paymentStatus === "pending" ? "PENDING_PAYMENT" : "DRAFT");
  }, [open, tournament?.id, existingEnrollments]);

  const selectedCategories = useMemo(
    () => hasExistingRegistration
      ? existingRegistrationRows.map((enrollment) => ({
          id: enrollment.categoryId,
          name: enrollment.categoryName || "",
          branch: "",
        }))
      : categories.filter((category) => selectedCategoryIds.includes(category.id)),
    [categories, existingRegistrationRows, hasExistingRegistration, selectedCategoryIds],
  );

  if (!open || !tournament) return null;

  const currentStep = steps[stepIndex]?.id || "info";
  const blocked = player?.status?.includes("Bloqueado");
  const discount = Number(player?.benefit?.percentage || 0);
  const originalPrice = Number(tournament?.price || 0);
  const summaryCategoryCount = hasExistingRegistration ? existingRegistrationRows.length : selectedCategoryIds.length;
  const baseTotal = hasExistingRegistration
    ? Number(existingRegistration?.subtotal || existingRegistration?.originalPrice || 0)
    : originalPrice * selectedCategoryIds.length;
  const summaryDiscount = hasExistingRegistration ? Number(existingRegistration?.benefitPercentage || 0) : discount;
  const finalPrice = hasExistingRegistration
    ? Number(existingRegistration?.totalAmount || existingRegistration?.price || 0)
    : Math.max(0, (baseTotal * (100 - discount)) / 100);
  const isFreeRegistration = finalPrice === 0 && summaryCategoryCount > 0;
  const paymentDueAt = getPaymentDueAt(tournament);
  const payLaterAvailable = canPayLater(tournament);
  const location = tournament?.location || tournament?.venue || tournament?.place || tournament?.club || "";
  const description = getVisibleTournamentDescription(tournament?.description);

  function toggleCategory(category) {
    if (!category.isEligible || registeredCategoryIds.has(category.id)) return;
    setSelectedCategoryIds((current) =>
      current.includes(category.id)
        ? current.filter((categoryId) => categoryId !== category.id)
        : [...current, category.id],
    );
  }

  function goNext() {
    setError("");
    if (currentStep === "categories" && !selectedCategoryIds.length) {
      setError("Seleccioná al menos una categoría para continuar.");
      return;
    }
    if (currentStep === "categories") {
      setRegistrationState("PENDING_PAYMENT");
      setPaymentState("PENDING_PAYMENT");
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    setError("");
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function payNow() {
    if (!tournament || !player || (!selectedCategoryIds.length && !hasExistingRegistration) || existingPaid || existingWaived) return;
    setSaving(true);
    setError("");
    try {
      const result = hasExistingRegistration
        ? await enrollmentService.payPendingRegistration(existingRegistration.registrationId, player.id)
        : await enrollmentService.startMercadoPagoCheckout({
            tournamentId: tournament.id,
            playerId: player.id,
            categoryIds: selectedCategoryIds,
            categoryNames: Object.fromEntries(selectedCategories.map((category) => [category.id, categoryLabel(category)])),
            unitPrice: originalPrice,
            benefitPercentage: discount,
          }, player.id);
      if (result.status === "waived") {
        setCreatedEnrollments(result.enrollments || []);
        setRegistrationState("CONFIRMED");
        setPaymentState("WAIVED");
        return;
      }
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      throw new Error("Mercado Pago no devolvio una URL de checkout.");
    } catch (error) {
      setPaymentState("PENDING_PAYMENT");
      setError(error.cause?.message || error.message || "No pudimos iniciar Mercado Pago.");
    } finally {
      setSaving(false);
    }
  }

  async function payLater() {
    if (!tournament || !player || !selectedCategoryIds.length) return;
    setSaving(true);
    setError("");
    try {
      const enrollments = await enrollmentService.confirmPayLaterRegistrations({
        tournamentId: tournament.id,
        playerId: player.id,
        categoryIds: selectedCategoryIds,
        categoryNames: Object.fromEntries(selectedCategories.map((category) => [category.id, categoryLabel(category)])),
        unitPrice: originalPrice,
        benefitPercentage: discount,
      }, player.id);
      setCreatedEnrollments(enrollments);
      setRegistrationState("CONFIRMED");
      setPaymentState(enrollments[0]?.paymentStatus === "waived" ? "WAIVED" : "PENDING_PAYMENT");
    } catch (error) {
      setPaymentState("PENDING_PAYMENT");
      setError(error.cause?.message || error.message || "No pudimos reservar tu lugar.");
    } finally {
      setSaving(false);
    }
  }

  function finish() {
    onConfirmed?.(createdEnrollments);
    onClose?.();
  }

  if (registrationState === "CONFIRMED") {
    const isPendingPayment = paymentState === "PENDING_PAYMENT";
    const isWaived = paymentState === "WAIVED";
    const isPaid = paymentState === "PAID";
    return (
      <Modal open={open} title="Inscripción" size="lg" onClose={finish}>
        <div className="registration-success">
          <CheckCircle2 size={64} />
          <h3>Inscripción realizada</h3>
          <p>{isPendingPayment ? "Tu lugar quedo reservado." : "Te inscribiste correctamente en:"}</p>
          <strong>{tournament.name}</strong>
          <div className="info-list">
            <span>Categoría: {createdEnrollments.map((enrollment) => enrollment.categoryName).join(", ")}</span>
            {isPendingPayment ? <span><strong>Pago pendiente:</strong> recorda completar el pago antes del vencimiento.</span> : null}
            {isPendingPayment && paymentDueAt ? <span>Vence: {formatDate(paymentDueAt.slice(0, 10))}</span> : null}
            {isWaived ? <span><strong>Beneficio:</strong> liberado de pago.</span> : null}
            {isPaid ? <span><strong>Pago:</strong> inscripcion ya pagada.</span> : null}
          </div>
          <Button variant="outline-green" onClick={finish}>Finalizar</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} title="Inscripción" size="lg" onClose={onClose}>
      <div className="registration-modal">
        <div className="registration-steps" aria-label="Progreso de inscripcion">
          {steps.map((step, index) => (
            <span key={step.id} className={index === stepIndex ? "is-active" : index < stepIndex ? "is-done" : ""}>
              {step.label}
            </span>
          ))}
        </div>

        {error ? <div className="form-alert">{error}</div> : null}

        {currentStep === "info" ? (
          <div className="registration-panel">
            <span className="eyebrow">Inscripción</span>
            <h3>{tournament?.name}</h3>
            <div className="info-list">
              <span>Fecha: {formatDate(tournament?.startDate)}</span>
              {location ? <span><MapPin size={16} /> Lugar: {location}</span> : null}
              <span>Valor por categoria: {formatCurrency(originalPrice)}</span>
              {description ? <span>Descripcion: {description}</span> : null}
            </div>
          </div>
        ) : null}

        {currentStep === "categories" ? (
          <div className="registration-panel">
            <div className="section-title">
              <span>Seleccioná tu categoría</span>
              <Badge tone="info">{registrationState}</Badge>
            </div>
            {blocked ? <div className="form-alert">NO PODÉS INSCRIBIRTE. Tu cuenta deportiva está bloqueada por faltas. Contactá al administrador.</div> : null}
            {categories.length ? (
              <div className="category-options category-options--compact">
                {categories.map((category) => {
                  const isRegistered = registeredCategoryIds.has(category.id);
                  const isDisabled = blocked || !category.isEligible || isRegistered;
                  const isSelected = selectedCategoryIds.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      className={isSelected ? "category-option is-selected" : "category-option"}
                      disabled={isDisabled}
                      onClick={() => toggleCategory(category)}
                      type="button"
                    >
                      <strong>{category.name}</strong>
                      <span>{category.branch}</span>
                      <Badge tone={isRegistered ? "success" : category.isEligible ? "success" : "neutral"}>
                        {isRegistered ? "Inscripto" : category.isEligible ? "Disponible" : "No disponible"}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No hay categorias habilitadas en este torneo.</p>
            )}
            {!selectableCategories.length ? <p className="muted">No tenes categorias disponibles para inscribirte en este torneo.</p> : null}
          </div>
        ) : null}

        {currentStep === "payment" ? (
          <div className="registration-panel">
            <div className="section-title">
              <span>Resumen</span>
              <Badge tone="warning">{paymentState}</Badge>
            </div>
            <div className="info-list">
              <span>Torneo: {tournament?.name}</span>
              <span>Categoría: {selectedCategories.map(categoryLabel).join(", ")}</span>
              <span>Cantidad de categorias: {summaryCategoryCount}</span>
              {!hasExistingRegistration ? <span>Precio unitario: {formatCurrency(originalPrice)}</span> : null}
              <span>Subtotal: {formatCurrency(baseTotal)}</span>
              {summaryDiscount ? <span>Descuento: {summaryDiscount}%</span> : null}
              <span><strong>Total: {formatCurrency(finalPrice)}</strong></span>
              {hasExistingRegistration ? <span>Inscripcion existente: {existingRegistration.registrationId}</span> : null}
              {paymentDueAt ? <span>Pago pendiente hasta: {formatDate(paymentDueAt.slice(0, 10))}</span> : null}
            </div>
            {isFreeRegistration ? (
              <div className="payment-card payment-card--compact">
                <CheckCircle2 size={36} />
                <strong>BONIFICACIÓN 100%</strong>
                <p className="muted">La inscripción queda liberada de pago y se confirma sin abrir Mercado Pago.</p>
              </div>
            ) : (
              <div className="payment-card payment-card--compact">
                <CreditCard size={36} />
                <p className="muted">
                  {hasExistingRegistration
                    ? "Pagar ahora usa la inscripcion pendiente existente y conserva el total registrado."
                    : "Pagar ahora abre Checkout Pro de Mercado Pago. Pagar despues reserva tu lugar con deuda pendiente."}
                </p>
              </div>
            )}
            {!hasExistingRegistration && !isFreeRegistration && !payLaterAvailable ? (
              <div className="form-alert">Pagar después ya no está disponible. El torneo comienza en menos de 3 días.</div>
            ) : null}
          </div>
        ) : null}

        <div className="wizard-actions">
          {stepIndex === 0 ? <Button variant="ghost" onClick={onClose}>Cancelar</Button> : null}
          {stepIndex > 0 && stepIndex < 3 && !hasExistingRegistration ? <Button variant="ghost" onClick={goBack}>Atras</Button> : null}
          {stepIndex < 2 ? (
            <Button onClick={goNext} disabled={blocked || (currentStep === "categories" && !selectedCategoryIds.length)}>
              Continuar
            </Button>
          ) : null}
          {stepIndex === 2 && isFreeRegistration ? (
            <Button onClick={payNow} disabled={saving || blocked || (!selectedCategoryIds.length && !hasExistingRegistration)}>
              {saving ? "Procesando..." : "Confirmar inscripción"}
            </Button>
          ) : null}
          {stepIndex === 2 && !isFreeRegistration ? (
            <>
              {!hasExistingRegistration ? <Button onClick={payLater} variant="ghost" disabled={saving || blocked || !selectedCategoryIds.length || !payLaterAvailable}>
                Pagar después
              </Button> : null}
              <Button onClick={payNow} disabled={saving || blocked || (!selectedCategoryIds.length && !hasExistingRegistration) || existingPaid || existingWaived}>
                {saving ? "Procesando..." : "Pagar ahora"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
