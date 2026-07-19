import { useMemo, useState } from "react";
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
import { tournamentService } from "../../services/tournamentService";
import { formatDate } from "../../utils/formatters";
import { DEFAULT_MATCH_FORMAT, describeMatchFormat } from "../../utils/matchFormat";

const steps = [
  { id: "general", label: "General" },
  { id: "categories", label: "Categorias" },
  { id: "match", label: "Partido" },
  { id: "schedule", label: "Horarios" },
  { id: "publish", label: "Publicar" },
];

const initialForm = {
  name: "",
  description: "",
  startDate: "2026-08-08",
  endDate: "2026-08-16",
  registrationCloseDate: "2026-08-06",
  semifinalsDate: "2026-08-15",
  finalsDate: "2026-08-16",
  price: 18000,
  scoringSystem: "GAME 1000",
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

export function AdminTournamentCreatePage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState("general");
  const [form, setForm] = useState(initialForm);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [schedule, setSchedule] = useState({ saturday: ["10:00"], sunday: ["09:00"] });
  const [formError, setFormError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const categories = await categoryService.getCategories();
    return { categories };
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

  if (loading) return <LoadingState message="Cargando asistente..." />;
  if (error) return <ErrorState title="No pudimos cargar el asistente." onRetry={reload} />;

  const { categories } = data;
  const activeCategories = categories.filter((category) => category.status === "Activa");
  const activeCategoryIds = activeCategories.map((category) => category.id);
  const saturdayError = hasDuplicatedTimes(schedule.saturday);
  const sundayError = hasDuplicatedTimes(schedule.sunday);
  const selectedCategoryNames = categories
    .filter((category) => selectedCategories.includes(category.id))
    .map((category) => `${category.name} ${category.branch}`);

  function updateField(field, value) {
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
    if (!isDirty || window.confirm("Seguro que queres cancelar la creacion del torneo? Los datos ingresados se perderan.")) {
      navigate("/admin/tournaments");
    }
  }

  async function publishTournament() {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Completa el nombre del torneo.");
      setActiveStep("general");
      return;
    }
    if (!selectedCategories.length) {
      setFormError("Selecciona al menos una categoria.");
      setActiveStep("categories");
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
    const tournament = await tournamentService.createTournament({
      ...form,
      description: form.description || "Torneo creado desde el asistente admin.",
      status: "Inscripciones abiertas",
      price: Number(form.price),
      categories: selectedCategories,
      categoryStages: selectedCategories.map((categoryId) => {
        const category = categories.find((item) => item.id === categoryId);
        return {
          categoryId,
          categoryName: category ? `${category.name} ${category.branch}` : "Categoria",
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
    navigate(`/admin/tournaments/${tournament.id}?tab=${tournament.isDevTest ? "formats" : "summary"}`);
  }

  return (
    <div className="page-stack">
      <header className="page-header page-header--actions page-header--wide">
        <div>
          <span className="eyebrow">Nuevo torneo</span>
          <h1>Asistente de creacion</h1>
          <p>Completa la informacion del torneo y publica desde el resumen final.</p>
        </div>
        <Button variant="ghost" icon={X} onClick={cancelCreation}>Cancelar</Button>
      </header>

      <Tabs tabs={steps} activeTab={activeStep} onChange={setActiveStep} />
      {formError ? <div className="form-alert">{formError}</div> : null}

      <Card className="form-card">
        {activeStep === "general" ? (
          <div className="form-grid">
            <label>Nombre<input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="GAME 1000 Copa Invierno" /></label>
            <label>Descripcion<textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Descripcion opcional del torneo" /></label>
            <label>Fecha de inicio<input type="date" value={form.startDate} onChange={(event) => updateField("startDate", event.target.value)} /></label>
            <label>Fecha de finalizacion<input type="date" value={form.endDate} onChange={(event) => updateField("endDate", event.target.value)} /></label>
            <label>Cierre previsto de inscripciones<input type="date" value={form.registrationCloseDate} onChange={(event) => updateField("registrationCloseDate", event.target.value)} /></label>
            <label>Fecha de semifinal<input type="date" value={form.semifinalsDate} onChange={(event) => updateField("semifinalsDate", event.target.value)} /></label>
            <label>Dia de finales<input type="date" value={form.finalsDate} onChange={(event) => updateField("finalsDate", event.target.value)} /></label>
            <label>Valor de inscripcion<input type="number" value={form.price} onChange={(event) => updateField("price", event.target.value)} /></label>
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
            <SummarySection title="Informacion general" icon={CalendarDays}>
              <span>Nombre: {form.name || "Sin nombre"}</span>
              <span>Descripcion: {form.description || "Sin descripcion"}</span>
              <span>Inicio: {formatDate(form.startDate)}</span>
              <span>Finalizacion: {formatDate(form.endDate)}</span>
              <span>Cierre previsto: {formatDate(form.registrationCloseDate)}</span>
              <span>Semifinal: {formatDate(form.semifinalsDate)}</span>
              <span>Dia de finales: {formatDate(form.finalsDate)}</span>
            </SummarySection>
            <SummarySection title="Formato de partido" icon={Trophy}>
              <span>Sets: {describeMatchFormat(form.matchFormat).sets}</span>
              <span>Games por set: {form.matchFormat.gamesPerSet}</span>
              <span>Super Tie-Break: {form.matchFormat.useSuperTiebreak ? "Si" : "No"}</span>
              {form.matchFormat.useSuperTiebreak ? <span>Set decisivo: {form.matchFormat.superTiebreakInDecidingSet ? "Super Tie-Break" : "Set normal"}</span> : null}
            </SummarySection>
            <SummarySection title="Categorias" icon={UsersRound}>
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
  return (
    <section className="schedule-column">
      <div className="section-title">
        <span>{title}</span>
        <Badge tone="info">{capacity}</Badge>
      </div>
      <div className="time-list">
        {times.map((time, index) => (
          <div key={`${title}-${index}`} className="time-row">
            <input type="time" value={time} onChange={(event) => onChange(index, event.target.value)} />
            <Button variant="ghost" size="icon" icon={Trash2} onClick={() => onRemove(index)}>Eliminar</Button>
          </div>
        ))}
      </div>
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
