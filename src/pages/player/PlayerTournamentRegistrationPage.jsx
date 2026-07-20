import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, CreditCard, ShieldQuestion } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Tabs } from "../../components/common/Tabs";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { enrollmentService } from "../../services/enrollmentService";
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency } from "../../utils/formatters";

const steps = [
  { id: "category", label: "Categoria" },
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

  if (loading) return <LoadingState message="Cargando inscripcion..." />;
  if (error) return <ErrorState title="No pudimos cargar la inscripcion." onRetry={reload} />;

  const { tournament, tournamentCategories, categoryRules, allowedCategories } = data;
  if (!tournament) return <Card>Torneo no encontrado.</Card>;
  const isBlocked = user.status?.includes("Bloqueado");
  const benefit = user.benefit;
  const discount = benefit?.percentage || 0;
  const finalPrice = Math.max(0, Number(tournament.price || 0) * (100 - discount) / 100);

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

  async function payMock() {
    setRegistrationError("");
    try {
      const enrollment = await enrollmentService.enrollPlayer({
        tournamentId: tournament.id,
        playerId: user.id,
        categoryId: selectedCategoryId,
        categoryName: selectedCategory ? `${selectedCategory.name} ${selectedCategory.branch}` : "",
        price: finalPrice,
        benefitPercentage: discount,
      });
      const confirmed = await enrollmentService.confirmEnrollment(enrollment.id, user.id);
      setCreatedEnrollment(confirmed);
      next();
    } catch (error) {
      setRegistrationError(error.cause?.message || error.message || "No pudimos confirmar la inscripcion.");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Inscripcion mock</span>
        <h1>{tournament.name}</h1>
        <p>Flujo visual preparado para conectar Mercado Pago mas adelante.</p>
      </header>
      <Tabs tabs={steps} activeTab={steps[stepIndex].id} onChange={(idValue) => setStepIndex(steps.findIndex((step) => step.id === idValue))} />

      {steps[stepIndex].id === "category" ? (
        <Card>
          <h2>Seleccionar categoria</h2>
          {isBlocked ? <div className="form-alert">Tu cuenta esta bloqueada y no podes inscribirte a torneos.</div> : null}
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
            <p className="muted">No hay categorias disponibles para registrarse.</p>
          )}
          <p className="muted">Categorias del torneo no permitidas: {tournamentCategories.length - allowedCategories.length}</p>
          <Button variant="secondary" icon={ShieldQuestion} onClick={requestDescent}>
            Solicitar descenso de categoria
          </Button>
          {descentRequested ? <p className="mock-note">Solicitud mock creada: queda pendiente de aprobacion del profesor.</p> : null}
        </Card>
      ) : null}

      {steps[stepIndex].id === "summary" ? (
        <Card>
          <h2>Resumen</h2>
          <div className="info-list">
            <span>Torneo: {tournament.name}</span>
            <span>Categoria: {selectedCategory?.name} {selectedCategory?.branch}</span>
            <span>Precio: {formatCurrency(tournament.price)}</span>
            {discount ? <span>Beneficio: {discount}% de descuento. Total mock: {formatCurrency(finalPrice)}</span> : null}
            <span>Disponibilidad: se solicita antes de cada partido.</span>
          </div>
        </Card>
      ) : null}

      {steps[stepIndex].id === "payment" ? (
        <Card className="payment-card">
          <CreditCard size={34} />
          <h2>Mercado Pago MOCK</h2>
          <p>Este boton simula el inicio y aprobacion del pago. No realiza ninguna integracion real.</p>
          {registrationError ? <div className="form-alert">{registrationError}</div> : null}
          <Button onClick={payMock} disabled={isBlocked || !selectedCategory}>Pagar inscripcion mock</Button>
        </Card>
      ) : null}

      {steps[stepIndex].id === "confirmed" ? (
        <Card className="payment-card">
          <CheckCircle2 size={42} />
          <h2>Inscripcion confirmada</h2>
          <p>Tu inscripcion mock quedo registrada para pruebas locales.</p>
          {createdEnrollment ? <Badge tone="success">{createdEnrollment.status}</Badge> : null}
        </Card>
      ) : null}

      <div className="wizard-actions">
        <Button variant="ghost" onClick={previous} disabled={stepIndex === 0}>Atras</Button>
        {stepIndex < steps.length - 1 && steps[stepIndex].id !== "payment" ? <Button onClick={next} disabled={isBlocked || (steps[stepIndex].id === "category" && !allowedCategories.length)}>Continuar</Button> : null}
      </div>
    </div>
  );
}
