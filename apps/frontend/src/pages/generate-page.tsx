import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { WeekGrid } from "../components/menu/WeekGrid";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AiMealPlan, AiResponse, FamilyDetail, MealSlot, WeeklyMenu } from "../types";
import { DAYS, DAYS_FULL, MEAL_SLOT_ORDER, SLOT_LABELS, SLOTS } from "../types";

function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start.getTime() + 6 * 86400000);
  return `${start.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — ${end.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`;
}

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
  const [planToSave, setPlanToSave] = useState<AiMealPlan[]>([]);
  const [goal, setGoal] = useState("Piano equilibrato con riduzione picchi glicemici");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"select" | "preview">("select");
  const [overwriteWarningOpen, setOverwriteWarningOpen] = useState(false);

  const requestedWeekStart = searchParams.get("weekStart");
  const parsedWeekStart =
    requestedWeekStart && !Number.isNaN(new Date(requestedWeekStart).getTime())
      ? new Date(requestedWeekStart + "T00:00:00")
      : getMonday(new Date());
  const currentWeek = getMonday(parsedWeekStart);
  const weekStart = currentWeek.toISOString().split("T")[0];
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
    setPlanToSave([]);
    setSelectedSlots([]);
    setError("");
    setStep("select");
    setOverwriteWarningOpen(false);
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

  const setWeek = (date: Date) => {
    const nextWeekStart = getMonday(date).toISOString().split("T")[0];
    setSearchParams({ weekStart: nextWeekStart });
  };

  const prevWeek = () => {
    setWeek(new Date(currentWeek.getTime() - 7 * 86400000));
  };

  const nextWeek = () => {
    setWeek(new Date(currentWeek.getTime() + 7 * 86400000));
  };

  const isCurrentWeek = getMonday(new Date()).toISOString().split("T")[0] === weekStart;
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
      api.post<AiResponse>(
        `/ai/generate?familyId=${activeFamilyId}`,
        {
          slots: selectedSlots,
          goal
        },
        token!
      ),
    onSuccess: (data) => {
      setAiResult(data);
      setPlanToSave(sortMealPlans(data.weeklyPlan));
      setStep("preview");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Errore durante la generazione");
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!aiResult) return;
      await api.post(
        `/ai/apply?familyId=${activeFamilyId}`,
        {
          weekStart,
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

  const removeMeal = (dayOfWeek: number, mealSlot: MealSlot) => {
    setPlanToSave((prev) =>
      sortMealPlans(prev.filter((m) => !(m.dayOfWeek === dayOfWeek && m.mealSlot === mealSlot)))
    );
  };

  if (step === "preview" && aiResult) {
    return (
      <div className="flex flex-col gap-5">
        <div className="app-page-header">
          <h1 className="text-2xl font-bold text-ink">Piano proposto dall'AI</h1>
          <p className="mt-1 text-sm text-slate-500">
            Rimuovi i pasti che non ti convincono, poi conferma il menu della settimana selezionata.
          </p>
        </div>

        {aiResult.newIngredients.length > 0 && (
          <div className="app-panel">
            <h3 className="mb-3 text-sm font-bold text-ink">
              Nuovi ingredienti ({aiResult.newIngredients.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {aiResult.newIngredients.map((i) => (
                <span key={i.name} className="app-badge app-badge-sage">
                  {i.name}
                  {i.category && <span className="ml-1 text-green-600/60">· {i.category}</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="app-panel">
          <h3 className="mb-3 text-sm font-bold text-ink">Piano pasti</h3>
          <div className="flex flex-col gap-2">
            {planToSave.map((meal) => (
              <div
                key={`${meal.dayOfWeek}-${meal.mealSlot}`}
                className="flex items-center justify-between rounded-2xl bg-sage/8 px-4 py-3"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-400">
                    {DAYS_FULL[meal.dayOfWeek]} · {SLOT_LABELS[meal.mealSlot]}
                  </p>
                  <p className="font-semibold text-ink">{meal.recipeName}</p>
                  {meal.recipeDescription && (
                    <p className="text-xs text-slate-500">{meal.recipeDescription}</p>
                  )}
                </div>
                <button
                  onClick={() => removeMeal(meal.dayOfWeek, meal.mealSlot)}
                  className="ml-3 shrink-0 text-xs text-rose-400 hover:text-rose-600"
                  type="button"
                >
                  Rimuovi
                </button>
              </div>
            ))}
            {planToSave.length === 0 && (
              <p className="text-sm text-slate-400">
                Nessun pasto rimasto nel piano. Aggiungi almeno un pasto per poter salvare il menu.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => { setStep("select"); setAiResult(null); }}
            className="app-btn app-btn-secondary flex-1"
            type="button"
          >
            Ricomincia
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || planToSave.length === 0}
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
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={prevWeek}
            className="app-btn-xs app-btn-secondary"
            type="button"
          >
            ← Prec.
          </button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-ink">{formatWeekRange(weekStart)}</p>
            {isCurrentWeek && (
              <span className="text-xs font-medium text-sage">Settimana corrente</span>
            )}
          </div>
          <button
            onClick={nextWeek}
            className="app-btn-xs app-btn-secondary"
            type="button"
          >
            Succ. →
          </button>
        </div>
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
          <div className="w-full max-w-2xl rounded-[30px] bg-[#fffdf8] p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">
              Conferma sovrascrittura
            </p>
            <h2 className="mt-2 text-xl font-bold text-ink">
              Stai per sovrascrivere pasti gi&agrave; assegnati
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              L&apos;AI rigenerer&agrave; i seguenti slot della settimana selezionata.
            </p>

            <div className="mt-5 space-y-3">
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

            <div className="mt-6 flex gap-3">
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
