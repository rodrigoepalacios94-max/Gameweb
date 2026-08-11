import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, MapPin } from "lucide-react";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { Modal } from "../common/Modal";
import { MercadoPagoQrPanel } from "./MercadoPagoQrPanel";
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

function paymentStatusLabel(state, total = null) {
  if (Number(total) === 0 && (state === "WAIVED" || state === "PENDING_PAYMENT")) return "Inscripcion confirmada";
  if (state === "PAID") return "Pagado";
  if (state === "WAIVED") return "Confirmado";
  if (state === "EXPIRED") return "Vencido";
  if (state === "CANCELLED") return "Cancelado";
  if (state === "PENDING_PAYMENT") return "Pago pendiente";
  return "Pago pendiente";
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

function mapBackendPaymentState(status) {
  if (status === "approved") return "PAID";
  if (status === "waived") return "WAIVED";
  if (status === "expired") return "EXPIRED";
  if (status === "cancelled" || status === "rejected") return "CANCELLED";
  return "PENDING_PAYMENT";
}

function isTerminalPaymentStatus(status) {
  return ["approved", "waived", "expired", "cancelled", "rejected", "refunded", "charged_back"].includes(status);
}

export function TournamentRegistrationModal({ open, tournament, player, categories = [], existingEnrollments = [], onClose, onConfirmed }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdEnrollments, setCreatedEnrollments] = useState([]);
  const [registrationState, setRegistrationState] = useState("DRAFT");
  const [paymentState, setPaymentState] = useState("DRAFT");
  const [qrPayment, setQrPayment] = useState(null);

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
    setQrPayment(null);
    setCreatedEnrollments(existingRows);
    setRegistrationState(existing?.paymentStatus === "paid" || existing?.paymentStatus === "waived" ? "CONFIRMED" : existing?.paymentStatus === "pending" ? "PENDING_PAYMENT" : "DRAFT");
    setPaymentState(existing?.paymentStatus === "paid" ? "PAID" : existing?.paymentStatus === "waived" ? "WAIVED" : existing?.paymentStatus === "pending" ? "PENDING_PAYMENT" : "DRAFT");
  }, [open, tournament?.id, existingEnrollments]);

  useEffect(() => {
    if (!open || !qrPayment?.registrationId || !player?.id || paymentState !== "PENDING_PAYMENT") return undefined;
    let active = true;
    let attempts = 0;
    let intervalId = null;

    async function refreshQrStatus() {
      attempts += 1;
      try {
        const status = await enrollmentService.getPaymentReturnStatus({
          registrationId: qrPayment.registrationId,
          providerOrderId: qrPayment.orderId,
        });
        if (!active) return;
        const nextPaymentState = mapBackendPaymentState(status?.status);
        if (status?.status === "approved" || status?.status === "waived") {
          const latestEnrollments = await enrollmentService.getEnrollmentsByPlayer(player.id);
          if (!active) return;
          const registrationRows = latestEnrollments.filter((enrollment) => enrollment.registrationId === qrPayment.registrationId);
          const resolvedRows = registrationRows.length ? registrationRows : (qrPayment.enrollments || []);
          setCreatedEnrollments(resolvedRows);
          setPaymentState(nextPaymentState);
          setRegistrationState("CONFIRMED");
          onConfirmed?.(resolvedRows);
          if (intervalId) window.clearInterval(intervalId);
          return;
        }
        if (isTerminalPaymentStatus(status?.status)) {
          setPaymentState(nextPaymentState);
          setError(status?.message || "El pago no quedo aprobado.");
          if (intervalId) window.clearInterval(intervalId);
        }
      } catch (error) {
        if (active && attempts >= 6) {
          setError(error.cause?.message || error.message || "Estamos verificando el pago. Si ya pagaste, espera unos segundos.");
        }
      }
      if (attempts >= 24 && intervalId) window.clearInterval(intervalId);
    }

    refreshQrStatus();
    intervalId = window.setInterval(refreshQrStatus, 5000);
    return () => {
      active = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [open, qrPayment?.registrationId, qrPayment?.orderId, paymentState, player?.id, onConfirmed]);

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
  const finalPrice = hasExistingRegistration
    ? Number(existingRegistration?.totalAmount || existingRegistration?.price || 0)
    : Math.max(0, (baseTotal * (100 - discount)) / 100);
  const qrFinalPrice = Math.max(0, Math.round(finalPrice * 0.95 * 100) / 100);
  const qrSavings = Math.max(0, Math.round((finalPrice - qrFinalPrice) * 100) / 100);
  const isFreeRegistration = finalPrice === 0 && summaryCategoryCount > 0;
  const paymentDueAt = getPaymentDueAt(tournament);
  const payLaterAvailable = canPayLater(tournament);
  const location = tournament?.location || tournament?.venue || tournament?.place || tournament?.club || "";
  const description = getVisibleTournamentDescription(tournament?.description);
  const paymentStatusText = paymentStatusLabel(paymentState, finalPrice);
  const selectedCategoryText = selectedCategories.map(categoryLabel).filter(Boolean).join(", ") || "Categoria a definir";
  const modalSubtitle = `${tournament?.name || "Torneo"} - ${selectedCategoryText}`;

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

  async function payQr() {
    if (!tournament || !player || (!selectedCategoryIds.length && !hasExistingRegistration) || existingPaid || existingWaived) return;
    setSaving(true);
    setError("");
    setQrPayment(null);
    try {
      const result = hasExistingRegistration
        ? await enrollmentService.payPendingRegistrationWithQr(existingRegistration.registrationId, player.id)
        : await enrollmentService.startMercadoPagoQr({
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
      if (result.qrData) {
        setCreatedEnrollments(result.enrollments || createdEnrollments);
        setPaymentState("PENDING_PAYMENT");
        setQrPayment(result);
        return;
      }
      throw new Error("Mercado Pago no devolvio los datos del QR.");
    } catch (error) {
      setPaymentState("PENDING_PAYMENT");
      setError(error.cause?.message || error.message || "No pudimos generar el QR de Mercado Pago.");
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
      <Modal open={open} title="Pago de inscripción" size="lg" onClose={finish}>
        <div className="registration-success">
          <CheckCircle2 size={64} />
          <h3>Inscripción realizada</h3>
          <p>{isPendingPayment ? "Tu lugar quedo reservado." : "Te inscribiste correctamente en:"}</p>
          <strong>{tournament.name}</strong>
          <div className="info-list">
            <span>Categoría: {createdEnrollments.map((enrollment) => enrollment.categoryName).join(", ")}</span>
            {isPendingPayment ? <span><strong>Pago pendiente:</strong> recorda completar el pago antes del vencimiento.</span> : null}
            {isPendingPayment && paymentDueAt ? <span>Vence: {formatDate(paymentDueAt.slice(0, 10))}</span> : null}
            {isWaived ? <span><strong>Estado:</strong> Inscripcion confirmada.</span> : null}
            {isPaid ? <span><strong>Pago:</strong> inscripcion ya pagada.</span> : null}
          </div>
          <Button variant="outline-green" onClick={finish}>Finalizar</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} title="Pago de inscripción" size="lg" onClose={onClose}>
      <div className="registration-modal">
        <div className="registration-modal__intro">
          <span>{modalSubtitle}</span>
        </div>
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
              <span>Definí tu categoría para ver el total final.</span>
              {description ? <span>Descripcion: {description}</span> : null}
            </div>
          </div>
        ) : null}

        {currentStep === "categories" ? (
          <div className="registration-panel">
            <div className="section-title">
              <span>Seleccioná tu categoría</span>
              <Badge tone="info">Elegí categoría</Badge>
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
          <div className="registration-panel registration-panel--payment">
            <div className="section-title">
              <span>Resumen</span>
              <Badge tone={isFreeRegistration ? "success" : "warning"}>{paymentStatusText}</Badge>
            </div>
            <div className="payment-summary-compact">
              <span><strong>Torneo</strong>{tournament?.name}</span>
              <span><strong>Categoría</strong>{selectedCategoryText}</span>
              <span><strong>Total a pagar</strong>{formatCurrency(finalPrice)}</span>
              {paymentDueAt ? <span><strong>Pago pendiente hasta</strong>{formatDate(paymentDueAt.slice(0, 10))}</span> : null}
              <span><strong>Estado</strong>{paymentStatusText}</span>
            </div>

            {isFreeRegistration ? (
              <div className="payment-free-panel">
                <CheckCircle2 size={36} />
                <strong>Tu inscripción no requiere pago.</strong>
                <span>Estado: Inscripción confirmada</span>
                <Button onClick={payNow} disabled={saving || blocked || (!selectedCategoryIds.length && !hasExistingRegistration)}>
                  {saving ? "Procesando..." : "Confirmar inscripción"}
                </Button>
              </div>
            ) : null}

            {qrPayment ? <MercadoPagoQrPanel payment={qrPayment} /> : null}

            {!isFreeRegistration ? (
              <div className="payment-choice-section">
                <span className="payment-choice-title">Elegí cómo pagar</span>
                <div className="payment-method-grid payment-method-grid--checkout">
                  <div className="payment-method-card payment-method-card--checkout">
                    <CreditCard size={28} />
                    <span className="payment-method-kicker">Mercado Pago</span>
                    <strong>Checkout</strong>
                    <span className="payment-method-price">{formatCurrency(finalPrice)}</span>
                    <Button onClick={payNow} disabled={saving || blocked || (!selectedCategoryIds.length && !hasExistingRegistration) || existingPaid || existingWaived}>
                      {saving ? "Procesando..." : hasExistingRegistration ? "Continuar pago" : "Pagar ahora"}
                    </Button>
                  </div>
                  <div className="payment-method-card payment-method-card--qr">
                    <CreditCard size={28} />
                    <div className="payment-method-card__head">
                      <span className="payment-method-kicker">QR Mercado Pago</span>
                      <span className="payment-method-badge">5% menos</span>
                    </div>
                    <strong>QR Mercado Pago</strong>
                    <span className="payment-method-price">{formatCurrency(qrFinalPrice)}</span>
                    <span className="muted">Ahorrás {formatCurrency(qrSavings)}</span>
                    <Button variant="outline-green" onClick={payQr} disabled={saving || blocked || (!selectedCategoryIds.length && !hasExistingRegistration) || existingPaid || existingWaived}>
                      {saving ? "Procesando..." : qrPayment || hasExistingRegistration ? "Continuar pago" : "Generar QR"}
                    </Button>
                  </div>
                </div>

                {!hasExistingRegistration ? (
                  <div className="pay-later-block">
                    <Button onClick={payLater} variant="ghost" disabled={saving || blocked || !selectedCategoryIds.length || !payLaterAvailable}>
                      Pagar más tarde
                    </Button>
                    <span>Tu inscripción quedará pendiente y podrás pagarla después.</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!hasExistingRegistration && !isFreeRegistration && !payLaterAvailable ? (
              <div className="form-alert">Pagar después ya no está disponible. El torneo comienza en menos de 3 días.</div>
            ) : null}
          </div>
        ) : null}

        {stepIndex < 2 || (!hasExistingRegistration && stepIndex > 0) ? (
          <div className="wizard-actions">
            {stepIndex === 0 ? <Button variant="ghost" onClick={onClose}>Cancelar</Button> : null}
            {stepIndex > 0 && stepIndex < 3 && !hasExistingRegistration ? <Button variant="ghost" onClick={goBack}>Atras</Button> : null}
            {stepIndex < 2 ? (
              <Button onClick={goNext} disabled={blocked || (currentStep === "categories" && !selectedCategoryIds.length)}>
                Continuar
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
