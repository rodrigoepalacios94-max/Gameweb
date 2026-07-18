import { useMemo, useState } from "react";
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
import { playerService } from "../../services/playerService";
import { tournamentService } from "../../services/tournamentService";
import { formatCurrency } from "../../utils/formatters";

const steps = [
  { id: "category", label: "Categoria" },
  { id: "availability", label: "Disponibilidad" },
  { id: "summary", label: "Resumen" },
  { id: "payment", label: "Pago" },
  { id: "confirmed", label: "Confirmada" },
];

const slots = ["Sabado 9:00", "Sabado 12:00", "Sabado 16:00", "Domingo 9:00", "Domingo 12:00", "Domingo 16:00"];

export function PlayerTournamentRegistrationPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState(user.categoryId);
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [descentRequested, setDescentRequested] = useState(false);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [tournament, tournamentCategories, categoryRules] = await Promise.all([
      tournamentService.getTournamentById(id),
      tournamentService.getTournamentCategories(id),
      categoryService.getCategoryRulesForPlayer(user.id),
    ]);
    return { tournament, tournamentCategories, categoryRules };
  }, [id, user.id]);

  const selectedCategory = useMemo(
    () => data?.tournamentCategories.find((category) => category.id === selectedCategoryId),
    [data, selectedCategoryId],
  );

  if (loading) return <LoadingState message="Cargando inscripcion..." />;
  if (error) return <ErrorState title="No pudimos cargar la inscripcion." onRetry={reload} />;

  const { tournament, tournamentCategories, categoryRules } = data;
  if (!tournament) return <Card>Torneo no encontrado.</Card>;

  function toggleSlot(slot) {
    setBlockedSlots((current) => (current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]));
  }

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
          <div className="category-options">
            {tournamentCategories.map((category) => {
              const enabled = categoryService.canPlayerRegisterInCategory(categoryRules.currentCategory, category);
              const lower = categoryService.isLowerCategory(categoryRules.currentCategory, category);
              return (
                <button
                  key={category.id}
                  className={selectedCategoryId === category.id ? "category-option is-selected" : "category-option"}
                  disabled={!enabled}
                  onClick={() => setSelectedCategoryId(category.id)}
                  type="button"
                >
                  <strong>{category.name} {category.branch}</strong>
                  <span>Nivel {category.level}</span>
                  {enabled ? <Badge tone="success">Disponible</Badge> : <Badge tone="danger">Inferior bloqueada</Badge>}
                  {lower ? <small>No podes inscribirte directamente en una categoria inferior.</small> : null}
                </button>
              );
            })}
          </div>
          <Button variant="secondary" icon={ShieldQuestion} onClick={requestDescent}>
            Solicitar descenso de categoria
          </Button>
          {descentRequested ? <p className="mock-note">Solicitud mock creada: queda pendiente de aprobacion del profesor.</p> : null}
        </Card>
      ) : null}

      {steps[stepIndex].id === "availability" ? (
        <Card>
          <h2>Disponibilidad</h2>
          <p className="muted">Marca solo los horarios en los que NO podes jugar.</p>
          <div className="slot-grid">
            {slots.map((slot) => (
              <button key={slot} className={blockedSlots.includes(slot) ? "slot is-selected" : "slot"} onClick={() => toggleSlot(slot)} type="button">
                {slot}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {steps[stepIndex].id === "summary" ? (
        <Card>
          <h2>Resumen</h2>
          <div className="info-list">
            <span>Torneo: {tournament.name}</span>
            <span>Categoria: {selectedCategory?.name} {selectedCategory?.branch}</span>
            <span>Precio: {formatCurrency(tournament.price)}</span>
            <span>No puedo jugar: {blockedSlots.length ? blockedSlots.join(", ") : "Sin restricciones"}</span>
          </div>
        </Card>
      ) : null}

      {steps[stepIndex].id === "payment" ? (
        <Card className="payment-card">
          <CreditCard size={34} />
          <h2>Mercado Pago MOCK</h2>
          <p>Este boton simula el inicio y aprobacion del pago. No realiza ninguna integracion real.</p>
          <Button onClick={next}>Pagar inscripcion mock</Button>
        </Card>
      ) : null}

      {steps[stepIndex].id === "confirmed" ? (
        <Card className="payment-card">
          <CheckCircle2 size={42} />
          <h2>Inscripcion confirmada</h2>
          <p>Tu inscripcion mock quedo registrada para pruebas locales.</p>
        </Card>
      ) : null}

      <div className="wizard-actions">
        <Button variant="ghost" onClick={previous} disabled={stepIndex === 0}>Atras</Button>
        {stepIndex < steps.length - 1 ? <Button onClick={next}>Continuar</Button> : null}
      </div>
    </div>
  );
}
