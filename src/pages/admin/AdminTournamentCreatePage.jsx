import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock, Send, Trash2, Trophy, UsersRound, X } from "lucide-react";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { Tabs } from "../../components/common/Tabs";
import { useAsyncData } from "../../hooks/useAsyncData";
import { categoryService } from "../../services/categoryService";
import { adminService } from "../../services/adminService";
import { tournamentService } from "../../services/tournamentService";
import { formatDate } from "../../utils/formatters";
import { DEFAULT_MATCH_FORMAT, describeMatchFormat } from "../../utils/matchFormat";

const steps = [
  { id: "general", label: "General" },
  { id: "categories", label: "Categorías" },
  { id: "match", label: "Partido" },
  { id: "scoring", label: "Puntaje" },
  { id: "schedule", label: "Horarios" },
  { id: "publish", label: "Publicar" },
];

const initialForm = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  semifinalsDate: "",
  finalsDate: "",
  price: "",
  scoringSystemId: "",
  scoringSystem: "",
  type: "Formato pendiente",
  matchFormat: DEFAULT_MATCH_FORMAT,
};

function hasDuplicatedTimes(times) {
  const filled = times.filter(Boolean);
  return new Set(filled).size !== filled.length;
}

function sortTimes(times) {
  return [...times].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function parseLocalDate(date) {
  return date ? new Date(`${date}T12:00:00`) : null;
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysToDateString(date, days) {
  const parsed = parseLocalDate(date);
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  parsed.setDate(parsed.getDate() + days);
  return toDateInputValue(parsed);
}


const timeOptions = Array.from({ length: 14 }, (_, hourIndex) => hourIndex + 9).flatMap((hour) =>
  [0, 15, 30, 45]
    .filter((minutes) => hour < 22 || minutes === 0)
    .map((minutes) => `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`)
);

export function AdminTournamentCreatePage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState("general");
  const [form, setForm] = useState(initialForm);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [schedule, setSchedule] = useState({ saturday: ["10:00"], sunday: ["09:00"] });
  const [formError, setFormError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [categories, settings] = await Promise.all([
      categoryService.getCategories(),
      adminService.getSettings(),
    ]);
    return { categories, settings };
  }, []);

  const isDirty = useMemo(() => {
    return (
      form.name.trim() ||
      form.description.trim() ||
      selectedCategories.length ||
      schedule.saturday.some(Boolean) ||
      schedule.sunday.some(Boolean)
    );
  }, [form, selectedCategories, schedule]);

  const categories = data?.categories || [];
  const settings = data?.settings || { scoringSystems: [] };
  const activeCategories = categories.filter((category) => category.status === "Activa");
  const activeScoringSystems = settings.scoringSystems.filter((system) => system.status === "Activo");
  const activeCategoryIds = activeCategories.map((category) => category.id);
  const saturdayError = hasDuplicatedTimes(schedule.saturday);
  const sundayError = hasDuplicatedTimes(schedule.sunday);
  const selectedCategoryNames = categories
    .filter((category) => selectedCategories.includes(category.id))
    .map((category) => `${category.name} ${category.branch}`);

  useEffect(() => {
    if (!form.scoringSystemId && activeScoringSystems[0]) {
      setForm((current) => ({
        ...current,
        scoringSystemId: activeScoringSystems[0].id,
        scoringSystem: activeScoringSystems[0].name,
      }));
    }
  }, [activeScoringSystems, form.scoringSystemId]);

  if (loading) return <LoadingState message="Cargando asistente..." />;
  if (error) return <ErrorState title="No pudimos cargar el asistente." onRetry={reload} />;

  function updateField(field, value) {
    if (field === "endDate" || field === "finalsDate") {
      setForm((current) => ({
        ...current,
        endDate: value,
        finalsDate: value,
        semifinalsDate: addDaysToDateString(value, -7),
      }));
      return;
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateMatchFormat(field, value) {
    setForm((current) => ({
      ...current,
      matchFormat: {
        ...current.matchFormat,
        [field]: value,
        ...(field === "useSuperTiebreak" && !value ? { superTiebreakInDecidingSet: false } : {}),
        ...(field === "useSuperTiebreak" && value ? { superTiebreakInDecidingSet: true } : {}),
      },
    }));
  }

  function toggleCategory(categoryId) {
    setSelectedCategories((current) =>
      current.includes(categoryId) ? current.filter((item) => item !== categoryId) : [...current, categoryId],
    );
  }

  function selectAllCategories() {
    setSelectedCategories(activeCategoryIds);
  }

  function clearAllCategories() {
    setSelectedCategories([]);
  }

  function updateTime(day, index, value) {
    setSchedule((current) => ({
      ...current,
      [day]: current[day].map((time, timeIndex) => (timeIndex === index ? value : time)),
    }));
  }

  function addTime(day) {
    setSchedule((current) => ({ ...current, [day]: [...current[day], ""] }));
  }

  function removeTime(day, index) {
    setSchedule((current) => ({
      ...current,
      [day]: current[day].length === 1 ? [""] : current[day].filter((_, timeIndex) => timeIndex !== index),
    }));
  }

  function cancelCreation() {
    if (!isDirty || window.confirm("¿Seguro que querés cancelar la creación del torneo? Los datos ingresados se perderán.")) {
      navigate("/admin/tournaments");
    }
  }

  async function publishTournament() {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Completá el nombre del torneo.");
      setActiveStep("general");
      return;
    }
    if (!selectedCategories.length) {
      setFormError("Seleccioná al menos una categoría.");
      setActiveStep("categories");
      return;
    }
    if (!form.startDate) {
      setFormError("Completa la fecha de inicio del torneo.");
      setActiveStep("general");
      return;
    }
    if (!form.endDate) {
      setFormError("Completa la fecha de finalizacion del torneo.");
      setActiveStep("general");
      return;
    }
    if (parseLocalDate(form.startDate) > parseLocalDate(form.endDate)) {
      setFormError("La fecha de finalizacion no puede ser anterior a la fecha de inicio del torneo.");
      setActiveStep("general");
      return;
    }
    const priceValue = String(form.price ?? "").trim();
    if (!priceValue) {
      setFormError("Completa el valor de inscripcion.");
      setActiveStep("general");
      return;
    }
    const numericPrice = Number(priceValue);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setFormError("El valor de inscripcion debe ser un numero valido.");
      setActiveStep("general");
      return;
    }
    if (!form.scoringSystemId) {
      setFormError("Seleccioná un sistema de puntaje activo.");
      setActiveStep("scoring");
      return;
    }
    if (saturdayError || sundayError) {
      setFormError("Elimina horarios duplicados antes de publicar.");
      setActiveStep("schedule");
      return;
    }
    const bestOfSets = Number(form.matchFormat.bestOfSets);
    const gamesPerSet = Number(form.matchFormat.gamesPerSet);
    if (!Number.isInteger(bestOfSets) || bestOfSets < 1 || bestOfSets > 5) {
      setFormError("La cantidad de sets debe ser un numero entero entre 1 y 5.");
      setActiveStep("match");
      return;
    }
    if (!Number.isInteger(gamesPerSet) || gamesPerSet < 1) {
      setFormError("Los games por set deben ser un numero entero mayor a 0.");
      setActiveStep("match");
      return;
    }
    const saturday = sortTimes(schedule.saturday);
    const sunday = sortTimes(schedule.sunday);
    if (!saturday.length && !sunday.length) {
      setFormError("Carga al menos un horario de competencia.");
      setActiveStep("schedule");
      return;
    }

    setPublishing(true);
    try {
      const selectedScoringSystem = activeScoringSystems.find((system) => system.id === form.scoringSystemId);
      const tournament = await tournamentService.createTournament({
      ...form,
      registrationCloseDate: null,
      endDate: form.endDate,
      finalsDate: form.endDate,
      semifinalsDate: addDaysToDateString(form.endDate, -7),
      scoringSystemId: selectedScoringSystem?.id || form.scoringSystemId,
      scoringSystem: selectedScoringSystem?.name || form.scoringSystem,
      description: form.description.trim(),
      status: "Inscripciones abiertas",
      price: numericPrice,
      categories: selectedCategories,
      categoryStages: selectedCategories.map((categoryId) => {
        const category = categories.find((item) => item.id === categoryId);
        return {
          categoryId,
          categoryName: category ? `${category.name} ${category.branch}` : "Categoría",
          format: "",
          recommendedFormat: null,
          formatStatus: "pending",
          formatDecision: "pending",
          participants: [],
          inscriptionsCount: 0,
          status: "Formato pendiente",
        };
      }),
      playerCategoryId: selectedCategories[0],
      playerCategoryName: selectedCategoryNames[0],
      schedule: { saturday, sunday },
      courtCapacity: { saturday: 3, sunday: 4 },
      courts: ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4"],
      phases: ["Formato pendiente"],
      participants: [],
      registrationStatus: "No inscripto",
      playerTournamentStatus: "Disponible",
      });
      navigate(`/admin/tournaments/${tournament.id}?tab=summary`);
    } catch (createError) {
      if (import.meta.env.DEV) {
        const source = createError.cause || createError;
        console.error("[GAME Admin] create tournament error", {
          table: source.table || null,
          select: source.select || null,
          filters: source.filter || null,
          code: source.code || null,
          message: source.message || createError.message || null,
          details: source.details || null,
          hint: source.hint || null,
          status: source.status || null,
        });
      }
      setFormError(createError.message || "No pudimos crear el torneo.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Nuevo torneo</span>
          <h1>Asistente de creacion</h1>
          <p>Completá la información del torneo y publicá desde el resumen final.</p>
        </div>
        <Button variant="ghost" icon={X} onClick={cancelCreation}>Cancelar</Button>
      </header>

      <Tabs tabs={steps} activeTab={activeStep} onChange={setActiveStep} />
      {formError ? <div className="form-alert">{formError}</div> : null}

      <Card className="form-card">
        {activeStep === "general" ? (
          <div className="form-grid tournament-general-grid">
            <label>Nombre<input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Copa Invierno" /></label>
            <label>Descripcion<textarea className="tournament-description-input" value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Descripcion opcional del torneo" /></label>
            <label>Fecha de inicio<input type="date" value={form.startDate} onChange={(event) => updateField("startDate", event.target.value)} /></label>
            <label>Fecha de finalizacion del torneo / Final<input type="date" value={form.endDate} onChange={(event) => updateField("endDate", event.target.value)} /></label>
            <label>Valor de inscripcion<input type="number" value={form.price} onChange={(event) => updateField("price", event.target.value)} /></label>
            {form.endDate ? (
              <div className="info-band">
                <strong>Fechas de definicion</strong>
                <span>Semifinal: {formatDate(addDaysToDateString(form.endDate, -7))}</span>
                <span>Final: {formatDate(form.endDate)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeStep === "categories" ? (
          <div className="page-stack compact">
            <div className="bulk-actions">
              <span>{selectedCategories.length}/{activeCategories.length} categorias seleccionadas</span>
              <div className="card-actions">
                <Button variant="outline-green" size="sm" onClick={selectAllCategories}>Seleccionar todas</Button>
                <Button variant="ghost" size="sm" onClick={clearAllCategories}>Deseleccionar todas</Button>
              </div>
            </div>
            <div className="category-pick-list">
              {activeCategories.map((category) => (
                <button key={category.id} className={selectedCategories.includes(category.id) ? "category-pick-row is-selected" : "category-pick-row"} type="button" onClick={() => toggleCategory(category.id)}>
                  <strong>{category.name} {category.branch}</strong>
                  <span>Nivel {category.level} / {category.status}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {activeStep === "match" ? (
          <div className="page-stack compact">
            <section className="match-format-panel">
              <div className="section-title">
                <span>Formato de partido</span>
                <Badge tone="info">{describeMatchFormat(form.matchFormat).sets}</Badge>
              </div>
              <div className="form-grid">
                <label>Cantidad de sets
                  <input type="number" min="1" max="5" step="1" value={form.matchFormat.bestOfSets || ""} onChange={(event) => updateMatchFormat("bestOfSets", event.target.value === "" ? "" : Number(event.target.value))} />
                </label>
                <label>Games por set
                  <input type="number" min="1" value={form.matchFormat.gamesPerSet || ""} onChange={(event) => updateMatchFormat("gamesPerSet", event.target.value === "" ? "" : Number(event.target.value))} />
                </label>
                <label>Super Tie-Break
                  <select value={form.matchFormat.useSuperTiebreak ? "yes" : "no"} onChange={(event) => updateMatchFormat("useSuperTiebreak", event.target.value === "yes")}>
                    <option value="yes">Si</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
            </section>
          </div>
        ) : null}

        {activeStep === "scoring" ? (
          <div className="page-stack compact">
            <div className="section-title">
              <span>Sistema de puntaje</span>
              <Badge tone="info">Se guarda por id</Badge>
            </div>
            {activeScoringSystems.length ? (
              <div className="category-pick-list">
                {activeScoringSystems.map((system) => (
                  <button
                    key={system.id}
                    className={form.scoringSystemId === system.id ? "category-pick-row is-selected" : "category-pick-row"}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, scoringSystemId: system.id, scoringSystem: system.name }))}
                  >
                    <strong>{system.name}</strong>
                    <span>Inscripción {system.inscription} / Campeón {system.champion} / Subcampeón {system.runnerUp}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No hay sistemas de puntaje activos.</p>
            )}
          </div>
        ) : null}

        {activeStep === "schedule" ? (
          <div className="schedule-form-grid">
            <ScheduleColumn
              title="Sabado"
              capacity="3 canchas"
              times={schedule.saturday}
              hasError={saturdayError}
              onChange={(index, value) => updateTime("saturday", index, value)}
              onAdd={() => addTime("saturday")}
              onRemove={(index) => removeTime("saturday", index)}
            />
            <ScheduleColumn
              title="Domingo"
              capacity="4 canchas"
              times={schedule.sunday}
              hasError={sundayError}
              onChange={(index, value) => updateTime("sunday", index, value)}
              onAdd={() => addTime("sunday")}
              onRemove={(index) => removeTime("sunday", index)}
            />
          </div>
        ) : null}

        {activeStep === "publish" ? (
          <div className="publish-summary">
            <SummarySection title="Información general" icon={CalendarDays}>
              <span>Nombre: {form.name || "Sin nombre"}</span>
              {form.description.trim() ? <span>Descripcion: {form.description.trim()}</span> : null}
              <span>Inicio: {formatDate(form.startDate)}</span>
              <span>Finalizacion / Final: {formatDate(form.endDate)}</span>
              <span>Semifinal automatica: {formatDate(addDaysToDateString(form.endDate, -7))}</span>
              <span>Valor de inscripcion: ${form.price || "Sin definir"}</span>
            </SummarySection>
            <SummarySection title="Formato de partido" icon={Trophy}>
              <span>Sets: {describeMatchFormat(form.matchFormat).sets}</span>
              <span>Games por set: {form.matchFormat.gamesPerSet}</span>
              <span>Super Tie-Break: {form.matchFormat.useSuperTiebreak ? "Si" : "No"}</span>
              {form.matchFormat.useSuperTiebreak ? <span>Set decisivo: {form.matchFormat.superTiebreakInDecidingSet ? "Super Tie-Break" : "Set normal"}</span> : null}
            </SummarySection>
            <SummarySection title="Sistema de puntaje" icon={Trophy}>
              <span>{activeScoringSystems.find((system) => system.id === form.scoringSystemId)?.name || "Sin sistema seleccionado"}</span>
              <span>ID: {form.scoringSystemId || "No definido"}</span>
            </SummarySection>
            <SummarySection title="Categorías" icon={UsersRound}>
              {selectedCategoryNames.length ? selectedCategoryNames.map((name) => <span key={name}>{name}</span>) : <span>Sin categorias seleccionadas</span>}
            </SummarySection>
            <SummarySection title="Horarios" icon={Clock}>
              <span>Sabado: {sortTimes(schedule.saturday).join(", ") || "Sin horarios"}</span>
              <span>Domingo: {sortTimes(schedule.sunday).join(", ") || "Sin horarios"}</span>
            </SummarySection>
            <SummarySection title="Capacidad de canchas" icon={CheckCircle2}>
              <span>Sabado: 3 canchas</span>
              <span>Domingo: 4 canchas</span>
            </SummarySection>
            <div className="wizard-actions wizard-actions--publish">
              <Button variant="ghost" icon={X} onClick={cancelCreation}>Cancelar</Button>
              <Button icon={Send} disabled={publishing} onClick={publishTournament}>{publishing ? "Publicando..." : "Publicar torneo"}</Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function ScheduleColumn({ title, capacity, times, hasError, onChange, onAdd, onRemove }) {
  const listId = `time-options-${title}`;
  return (
    <section className="schedule-column">
      <div className="section-title">
        <span>{title}</span>
        <Badge tone="info">{capacity}</Badge>
      </div>
      <div className="time-list">
        {times.map((time, index) => (
          <div key={`${title}-${index}`} className="time-row">
            <input type="time" min="09:00" max="22:00" step="900" list={listId} value={time} onChange={(event) => onChange(index, event.target.value)} />
            <Button variant="ghost" size="icon" icon={Trash2} onClick={() => onRemove(index)}>Eliminar</Button>
          </div>
        ))}
      </div>
      <datalist id={listId}>
        {timeOptions.map((time) => <option key={time} value={time} />)}
      </datalist>
      {hasError ? <span className="field-error">Hay horarios duplicados en este dia.</span> : null}
      <Button variant="outline-green" onClick={onAdd}>+ Agregar horario</Button>
    </section>
  );
}

function SummarySection({ title, icon: Icon, children }) {
  return (
    <section className="publish-item publish-item--summary">
      <Icon size={22} />
      <strong>{title}</strong>
      <div className="info-list">{children}</div>
    </section>
  );
}
