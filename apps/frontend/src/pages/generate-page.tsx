import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { WeekNavigator } from "../components/menu/WeekNavigator";
import { WeekGrid } from "../components/menu/WeekGrid";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateKey, formatWeekRange, getMonday } from "../lib/week";
import type {
  AiFeedbackRating,
  AiGenerateResult,
  AiMealPlan,
  AiResponse,
  FamilyDetail,
  MealSlot,
  MenuMeal,
  WeeklyMenu
} from "../types";
import { DAYS, DAYS_FULL, MEAL_SLOT_ORDER, SLOT_LABELS, SLOTS } from "../types";

interface SelectedSlot {
  dayOfWeek: number;
  mealSlot: MealSlot;
}

function getSlotKey(dayOfWeek: number, mealSlot: MealSlot) {
  return `${dayOfWeek}-${mealSlot}`;
}

function sortMealPlans(meals: AiMealPlan[]) {
  return [...meals].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
  });
}

export function GeneratePage() {
  const { token, activeFamilyId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  const [aiResult, setAiResult] = useState<AiResponse | null>(null);
  const [generationMeta, setGenerationMeta] = useState<{
    generationId: string | null;
    model: string;
    experimentVariant: "primary" | "secondary";
    experimentStrategy: "off" | "alternate" | "random";
    correctionSummary: {
      correctionAttempts: number;
      corrected: boolean;
      reachedLimit: boolean;
      notes: string[];
    };
  } | null>(null);
  const [planToSave, setPlanToSave] = useState<AiMealPlan[]>([]);
  const [goal, setGoal] = useState("Piano equilibrato con riduzione picchi glicemici");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"select" | "preview">("select");
  const [overwriteWarningOpen, setOverwriteWarningOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<AiFeedbackRating | null>(null);
  const [submittedFeedback, setSubmittedFeedback] = useState<AiFeedbackRating | null>(null);
  const [validationIssues, setValidationIssues] = useState<AiGenerateResult["validationIssues"]>([]);
  const [progressMessageIndex, setProgressMessageIndex] = useState(0);

  const requestedWeekStart = searchParams.get("weekStart");
  const parsedWeekStart =
    requestedWeekStart && !Number.isNaN(new Date(requestedWeekStart).getTime())
      ? new Date(requestedWeekStart + "T00:00:00")
      : getMonday(new Date());
  const currentWeek = getMonday(parsedWeekStart);
  const weekStart = formatDateKey(currentWeek);
  const familyQuery = useQuery({
    queryKey: ["family", activeFamilyId],
    queryFn: () => api.get<FamilyDetail>(`/families/${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });
  const menuQuery = useQuery({
    queryKey: ["menu", activeFamilyId, weekStart],
    queryFn: () => api.get<WeeklyMenu | null>(`/menus/${weekStart}?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });

  useEffect(() => {
    setAiResult(null);
    setGenerationMeta(null);
    setPlanToSave([]);
    setSelectedSlots([]);
    setError("");
    setStep("select");
    setOverwriteWarningOpen(false);
    setSelectedFeedback(null);
    setSubmittedFeedback(null);
    setValidationIssues([]);
    setProgressMessageIndex(0);
  }, [weekStart]);

  const toggleSlot = (dayOfWeek: number, mealSlot: MealSlot) => {
    setSelectedSlots((prev) => {
      const exists = prev.some((s) => s.dayOfWeek === dayOfWeek && s.mealSlot === mealSlot);
      if (exists) return prev.filter((s) => !(s.dayOfWeek === dayOfWeek && s.mealSlot === mealSlot));
      return sortSelections([...prev, { dayOfWeek, mealSlot }]);
    });
  };

  const isSelected = (dayOfWeek: number, mealSlot: MealSlot) =>
    selectedSlots.some((s) => s.dayOfWeek === dayOfWeek && s.mealSlot === mealSlot);

  const sortSelections = (slots: SelectedSlot[]) =>
    [...slots].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
    });

  const allSlots = sortSelections(
    DAYS_FULL.flatMap((_, dayOfWeek) => SLOTS.map((mealSlot) => ({ dayOfWeek, mealSlot })))
  );
  const isAllSlotsSelected = selectedSlots.length === allSlots.length;

  const toggleDaySelection = (dayOfWeek: number) => {
    setSelectedSlots((prev) => {
      const daySlots = SLOTS.map((mealSlot) => ({ dayOfWeek, mealSlot }));
      const allDaySelected = daySlots.every((slot) => prev.some((selected) => getSlotKey(selected.dayOfWeek, selected.mealSlot) === getSlotKey(slot.dayOfWeek, slot.mealSlot)));
      if (allDaySelected) {
        return prev.filter((slot) => slot.dayOfWeek !== dayOfWeek);
      }
      const merged = [...prev.filter((slot) => slot.dayOfWeek !== dayOfWeek), ...daySlots];
      return sortSelections(merged);
    });
  };

  const toggleMealTypeSelection = (mealSlot: MealSlot) => {
    setSelectedSlots((prev) => {
      const slotAcrossWeek = DAYS_FULL.map((_, dayOfWeek) => ({ dayOfWeek, mealSlot }));
      const allTypeSelected = slotAcrossWeek.every((slot) =>
        prev.some((selected) => getSlotKey(selected.dayOfWeek, selected.mealSlot) === getSlotKey(slot.dayOfWeek, slot.mealSlot))
      );
      if (allTypeSelected) {
        return prev.filter((slot) => slot.mealSlot !== mealSlot);
      }
      const merged = [...prev.filter((slot) => slot.mealSlot !== mealSlot), ...slotAcrossWeek];
      return sortSelections(merged);
    });
  };

  const isDayFullySelected = (dayOfWeek: number) =>
    SLOTS.every((mealSlot) => isSelected(dayOfWeek, mealSlot));

  const isMealTypeFullySelected = (mealSlot: MealSlot) =>
    DAYS_FULL.every((_, dayOfWeek) => isSelected(dayOfWeek, mealSlot));

  const assignedMeals = menuQuery.data?.meals ?? [];
  const selectedSlotSet = new Set(selectedSlots.map((slot) => getSlotKey(slot.dayOfWeek, slot.mealSlot)));
  const overlappingMeals = assignedMeals.filter((meal) =>
    selectedSlotSet.has(getSlotKey(meal.dayOfWeek, meal.mealSlot))
  );

  const overlappingMealsByDay = DAYS_FULL.map((day, dayOfWeek) => ({
    day,
    meals: overlappingMeals.filter((meal) => meal.dayOfWeek === dayOfWeek)
  })).filter((entry) => entry.meals.length > 0);

  const startGeneration = () => {
    setError("");
    if (overlappingMeals.length > 0) {
      setOverwriteWarningOpen(true);
      return;
    }
    generateMutation.mutate();
  };

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post<AiGenerateResult>(
        `/ai/generate?familyId=${activeFamilyId}`,
        {
          weekStart,
          slots: selectedSlots,
          goal
        },
        token!
      ),
    onSuccess: (data) => {
      setAiResult(data.result);
      setGenerationMeta({
        generationId: data.generationId,
        model: data.model,
        experimentVariant: data.experimentVariant,
        experimentStrategy: data.experimentStrategy,
        correctionSummary: data.correctionSummary
      });
      setValidationIssues(data.validationIssues);
      setPlanToSave(sortMealPlans(data.result.weeklyPlan));
      setSelectedFeedback(null);
      setSubmittedFeedback(null);
      setStep("preview");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Errore durante la generazione");
    }
  });

  useEffect(() => {
    if (!generateMutation.isPending) {
      setProgressMessageIndex(0);
      return;
    }
    const interval = window.setInterval(() => {
      setProgressMessageIndex((current) => (current + 1) % GENERATION_PROGRESS_MESSAGES.length);
    }, 1800);
    return () => window.clearInterval(interval);
  }, [generateMutation.isPending]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!aiResult) return;
      await api.post(
        `/ai/apply?familyId=${activeFamilyId}`,
        {
          weekStart,
          generationId: generationMeta?.generationId ?? undefined,
          selectedSlots,
          aiResult: {
            ...aiResult,
            weeklyPlan: planToSave
          }
        },
        token!
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu", activeFamilyId, weekStart] });
      navigate(`/menu?weekStart=${weekStart}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    }
  });

  const feedbackMutation = useMutation({
    mutationFn: (rating: AiFeedbackRating) =>
      api.post(
        `/ai/feedback?familyId=${activeFamilyId}`,
        {
          generationId: generationMeta?.generationId,
          rating
        },
        token!
      ),
    onSuccess: (_, rating) => {
      setSubmittedFeedback(rating);
      setError("");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio del feedback");
    }
  });

  const previewMeals: MenuMeal[] = planToSave.map((meal) => ({
    id: `${meal.dayOfWeek}-${meal.mealSlot}`,
    dayOfWeek: meal.dayOfWeek,
    mealSlot: meal.mealSlot,
    recipeId: meal.recipeId ?? null,
    customName: meal.recipeName,
    recipe: meal.recipeId
      ? ({
          id: meal.recipeId,
          name: meal.recipeName,
          description: meal.recipeDescription ?? null,
          mealTypes: [meal.mealSlot],
          familyId: activeFamilyId ?? "",
          createdAt: "",
          updatedAt: "",
          ingredients: []
        } as MenuMeal["recipe"])
      : null
  }));
  const flaggedSlots = new Map<string, string[]>();
  for (const issue of validationIssues) {
    if (issue.dayOfWeek === undefined || issue.mealSlot === undefined) continue;
    const key = getSlotKey(issue.dayOfWeek, issue.mealSlot);
    const current = flaggedSlots.get(key) ?? [];
    current.push(issue.message);
    flaggedSlots.set(key, current);
  }

  if (step === "preview" && aiResult) {
    return (
      <div className="flex flex-col gap-5">
        <div className="app-page-header">
          <h1 className="text-2xl font-bold text-ink">Piano proposto dall'AI</h1>
          <p className="mt-1 text-sm text-slate-500">
            Valuta la proposta direttamente sulla griglia settimanale, lascia il tuo feedback e poi salva il menu.
          </p>
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-ink">Anteprima settimanale AI</h3>
              <p className="mt-1 text-xs text-slate-500">{formatWeekRange(weekStart)}</p>
            </div>
            {generationMeta && (
              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">
                  {generationMeta.experimentStrategy === "off"
                    ? "Modello"
                    : `Gruppo ${generationMeta.experimentVariant === "secondary" ? "B" : "A"}`}
                </p>
                <p className="text-sm font-semibold text-ink">{generationMeta.model}</p>
              </div>
            )}
          </div>
          <WeekGrid meals={previewMeals} weekStart={weekStart} flaggedSlots={flaggedSlots} />
        </div>

        {generationMeta?.correctionSummary.corrected && (
          <div
            className={`rounded-2xl px-4 py-4 text-sm ${
              generationMeta.correctionSummary.reachedLimit
                ? "bg-amber-50 text-amber-800"
                : "bg-sky-50 text-sky-800"
            }`}
          >
            <p className="font-semibold">
              {generationMeta.correctionSummary.reachedLimit
                ? "L'AI ha raggiunto il limite massimo di correzioni automatiche."
                : "L'AI ha corretto automaticamente la proposta prima di mostrartela."}{" "}
              {generationMeta.correctionSummary.correctionAttempts > 0 &&
                `Tentativi effettuati: ${generationMeta.correctionSummary.correctionAttempts}.`}
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {generationMeta.correctionSummary.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </div>
        )}

        {validationIssues.length > 0 && (
          <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              Restano alcuni pasti da verificare: li trovi evidenziati nella griglia.
            </p>
            <p className="mt-1 text-amber-800">
              Puoi salvare comunque il piano e poi correggere manualmente i pasti segnati.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {validationIssues.map((issue, index) => (
                <p key={`${issue.code}-${issue.dayOfWeek}-${issue.mealSlot}-${index}`}>{issue.message}</p>
              ))}
            </div>
          </div>
        )}

        <div className="app-panel">
          <h3 className="mb-3 text-sm font-bold text-ink">Com&apos;è questa proposta?</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                rating: "excellent" as const,
                title: "Ottima",
                description: "La proposta è convincente e pronta da salvare."
              },
              {
                rating: "acceptable" as const,
                title: "Accettabile",
                description: "Va bene, anche se non è perfetta."
              },
              {
                rating: "poor" as const,
                title: "Da rifare",
                description: "Qualità insufficiente, meglio rigenerare."
              }
            ].map((option) => {
              const isActive = (submittedFeedback ?? selectedFeedback) === option.rating;
              return (
                <button
                  key={option.rating}
                  type="button"
                  disabled={feedbackMutation.isPending}
                  onClick={() => {
                    setSelectedFeedback(option.rating);
                    if (generationMeta?.generationId) {
                      feedbackMutation.mutate(option.rating);
                    } else {
                      setSubmittedFeedback(option.rating);
                    }
                  }}
                  className={`rounded-3xl border px-4 py-4 text-left transition ${
                    isActive
                      ? "border-sage bg-sage/12 shadow-[0_10px_24px_rgba(85,139,103,0.12)]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-ink">{option.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{option.description}</p>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Questo feedback viene registrato per confrontare la qualità dei modelli A/B nel tempo.
          </p>
          {submittedFeedback && (
            <p className="mt-2 rounded-2xl bg-sage/10 px-4 py-3 text-sm text-sage">
              Feedback registrato:{" "}
              {submittedFeedback === "excellent"
                ? "Ottima"
                : submittedFeedback === "acceptable"
                  ? "Accettabile"
                  : "Da rifare"}.
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => {
              setStep("select");
              setAiResult(null);
              setGenerationMeta(null);
              setValidationIssues([]);
              setSelectedFeedback(null);
              setSubmittedFeedback(null);
            }}
            className="app-btn app-btn-secondary flex-1"
            type="button"
          >
            Ricomincia
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={
              saveMutation.isPending ||
              planToSave.length === 0 ||
              (!submittedFeedback && Boolean(generationMeta?.generationId))
            }
            className="app-btn app-btn-sage flex-1 disabled:opacity-60"
            type="button"
          >
            {saveMutation.isPending ? "Salvataggio..." : "Salva menu"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header">
        <h1 className="text-2xl font-bold text-ink">Genera menu con AI</h1>
        <p className="mt-1 text-sm text-slate-500">
          Seleziona i pasti da generare per la settimana del{" "}
          {new Date(weekStart + "T00:00:00").toLocaleDateString("it-IT", {
            day: "numeric",
            month: "long",
            year: "numeric"
          })}.
        </p>
        <WeekNavigator weekStart={weekStart} onChangeWeekStart={(nextWeekStart) => setSearchParams({ weekStart: nextWeekStart })} />
      </div>

      <div className="app-panel">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Informazioni che verranno inviate all&apos;AI
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Allergie</p>
            <p className="mt-2 text-sm text-ink">{familyQuery.data?.allergyNotes || "Nessuna"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Intolleranze</p>
            <p className="mt-2 text-sm text-ink">{familyQuery.data?.intoleranceNotes || "Nessuna"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Preferenze</p>
            <p className="mt-2 text-sm text-ink">{familyQuery.data?.preferenceNotes || "Nessuna"}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          L&apos;AI riceve anche tutte le ricette e gli ingredienti già presenti per riutilizzarli quando possibile.
        </p>
      </div>

      <div className="app-panel">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Obiettivo del piano AI
        </label>
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Es. Piatti semplici, economici e adatti a picchi glicemici ridotti"
          className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
        />
      </div>

      {/* Quick select buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedSlots(isAllSlotsSelected ? [] : allSlots)}
          className={`app-btn-xs ${isAllSlotsSelected ? "app-btn-sage" : "app-btn-secondary"}`}
        >
          {isAllSlotsSelected ? "Togli tutti i pasti" : "Tutti i pasti"}
        </button>
        <button
          type="button"
          onClick={() =>
            setSelectedSlots(
              sortSelections(
                DAYS_FULL.flatMap((_, dayOfWeek) =>
                  (["lunch", "dinner"] as MealSlot[]).map((mealSlot) => ({ dayOfWeek, mealSlot }))
                )
              )
            )
          }
          className="app-btn-xs app-btn-secondary"
        >
          Pranzi e cene (7 giorni)
        </button>
        <button
          type="button"
          onClick={() => setSelectedSlots([])}
          className="app-btn-xs app-btn-secondary"
        >
          Deseleziona tutto
        </button>
      </div>

      <div className="app-panel">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Selezione rapida per giorno
        </p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day, dayOfWeek) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDaySelection(dayOfWeek)}
              className={`app-btn-xs ${
                isDayFullySelected(dayOfWeek) ? "app-btn-sage" : "app-btn-secondary"
              }`}
            >
              {isDayFullySelected(dayOfWeek) ? `Togli ${day}` : `Tutto ${day}`}
            </button>
          ))}
        </div>
      </div>

      <div className="app-panel">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Selezione rapida per tipo pasto
        </p>
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => toggleMealTypeSelection(slot)}
              className={`app-btn-xs ${
                isMealTypeFullySelected(slot) ? "app-btn-sage" : "app-btn-secondary"
              }`}
            >
              {isMealTypeFullySelected(slot) ? `Togli ${SLOT_LABELS[slot]}` : `${SLOT_LABELS[slot]} x7`}
            </button>
          ))}
        </div>
      </div>

      {/* Slot grid */}
      <WeekGrid
        meals={assignedMeals}
        weekStart={weekStart}
        selectedSlots={selectedSlotSet}
        onCellClick={(dayOfWeek, mealSlot) => toggleSlot(dayOfWeek, mealSlot)}
      />

      <p className="text-center text-sm text-slate-500">
        {selectedSlots.length === 0
          ? "Seleziona almeno un pasto"
          : `${selectedSlots.length} pasti selezionati`}
      </p>

      {overlappingMeals.length > 0 && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          La selezione include {overlappingMeals.length} pasti già assegnati: se continui con l&apos;AI, quei pasti verranno sovrascritti.
        </p>
      )}

      {error && (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>
      )}

      {generateMutation.isPending && (
        <div className="rounded-2xl bg-sky-50 px-4 py-4 text-sm text-sky-900">
          <p className="font-semibold">{GENERATION_PROGRESS_MESSAGES[progressMessageIndex]}</p>
          <p className="mt-1 text-sky-800">
            Se emergono pasti incompatibili, proveremo a farli correggere automaticamente all&apos;AI nella stessa conversazione.
          </p>
        </div>
      )}

      {!goal.trim() && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Inserisci un obiettivo per aiutare l&apos;AI a proporre un menu coerente.
        </p>
      )}

      <button
        type="button"
        onClick={startGeneration}
        disabled={selectedSlots.length === 0 || generateMutation.isPending || !goal.trim()}
        className="app-btn app-btn-sage w-full disabled:opacity-60"
      >
        {generateMutation.isPending ? "Generazione in corso..." : "🤖 Genera con AI"}
      </button>

      {overwriteWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-6">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] bg-[#fffdf8] p-6 shadow-2xl">
            <div className="shrink-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">
                Conferma sovrascrittura
              </p>
              <h2 className="mt-2 text-xl font-bold text-ink">
                Stai per sovrascrivere pasti gi&agrave; assegnati
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                L&apos;AI rigenerer&agrave; i seguenti slot della settimana selezionata.
              </p>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-3">
                {overlappingMealsByDay.map((entry) => (
                  <div key={entry.day} className="rounded-2xl bg-amber-50/80 px-4 py-4">
                    <p className="text-sm font-semibold text-ink">{entry.day}</p>
                    <div className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
                      {entry.meals.map((meal) => (
                        <p key={meal.id}>
                          {SLOT_LABELS[meal.mealSlot]}: {meal.recipe?.name ?? meal.customName ?? "—"}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => setOverwriteWarningOpen(false)}
                className="app-btn app-btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverwriteWarningOpen(false);
                  generateMutation.mutate();
                }}
                className="app-btn app-btn-sage flex-1"
              >
                Conferma e genera
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const GENERATION_PROGRESS_MESSAGES = [
  "L'AI sta preparando la prima proposta del piano.",
  "Sto controllando che ogni ricetta sia coerente con il tipo di pasto.",
  "Se serve, sto chiedendo all'AI di correggere solo gli slot problematici."
];
