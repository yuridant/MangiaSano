import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ManualWeekPlanner } from "../components/menu/ManualWeekPlanner";
import { WeekGrid } from "../components/menu/WeekGrid";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { MealSlot, Recipe, WeeklyMenu } from "../types";
import { DAYS_FULL, SLOT_LABELS, SLOTS } from "../types";

function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(weekStart: string) {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start.getTime() + 6 * 86400000);
  return `${start.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — ${end.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function MenuPage() {
  const { token, activeFamilyId } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedWeekStart = searchParams.get("weekStart");
  const parsedWeek =
    requestedWeekStart && !Number.isNaN(new Date(requestedWeekStart).getTime())
      ? new Date(requestedWeekStart + "T00:00:00")
      : getMonday(new Date());
  const currentWeek = getMonday(parsedWeek);
  const weekStart = currentWeek.toISOString().split("T")[0];
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [mealSlot, setMealSlot] = useState<MealSlot>("lunch");
  const [mode, setMode] = useState<"recipe" | "custom">("recipe");
  const [recipeId, setRecipeId] = useState("");
  const [customName, setCustomName] = useState("");
  const [manualError, setManualError] = useState("");
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);

  const menuQuery = useQuery({
    queryKey: ["menu", activeFamilyId, weekStart],
    queryFn: () =>
      api.get<WeeklyMenu | null>(`/menus/${weekStart}?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });
  const recipesQuery = useQuery({
    queryKey: ["recipes", activeFamilyId],
    queryFn: () => api.get<Recipe[]>(`/recipes?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });

  const invalidateWeekData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["menu", activeFamilyId, weekStart] }),
      queryClient.invalidateQueries({ queryKey: ["shopping", activeFamilyId, weekStart] })
    ]);
  };

  useEffect(() => {
    resetManualForm();
  }, [weekStart]);

  const resetManualForm = () => {
    setDayOfWeek(0);
    setMealSlot("lunch");
    setMode("recipe");
    setRecipeId("");
    setCustomName("");
    setManualError("");
    setEditingMealId(null);
    setManualModalOpen(false);
  };

  const closeManualModal = () => {
    setManualError("");
    setEditingMealId(null);
    setManualModalOpen(false);
  };

  const saveMealMutation = useMutation({
    mutationFn: async () => {
      if (mode === "recipe" && !recipeId) {
        throw new Error("Seleziona una ricetta da inserire nel menu.");
      }
      if (mode === "custom" && !customName.trim()) {
        throw new Error("Inserisci un nome per il pasto manuale.");
      }

      return api.post(
        `/menus/${weekStart}/meals?familyId=${activeFamilyId}`,
        {
          dayOfWeek,
          mealSlot,
          recipeId: mode === "recipe" ? recipeId : undefined,
          customName: mode === "custom" ? customName.trim() : undefined
        },
        token!
      );
    },
    onSuccess: async () => {
      await invalidateWeekData();
      resetManualForm();
    },
    onError: (error) => {
      setManualError(error instanceof Error ? error.message : "Errore durante il salvataggio del pasto.");
    }
  });

  const removeMealMutation = useMutation({
    mutationFn: (mealId: string) =>
      api.delete(`/menus/${weekStart}/meals/${mealId}?familyId=${activeFamilyId}`, token!),
    onSuccess: async () => {
      await invalidateWeekData();
      resetManualForm();
    }
  });

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

  const isCurrentWeek =
    getMonday(new Date()).toISOString().split("T")[0] === weekStart;
  const meals = menuQuery.data?.meals ?? [];
  const recipeOptions = recipesQuery.data ?? [];

  const startEditMeal = (meal: NonNullable<WeeklyMenu["meals"]>[number]) => {
    setDayOfWeek(meal.dayOfWeek);
    setMealSlot(meal.mealSlot);
    setEditingMealId(meal.id);
    if (meal.recipeId && meal.recipe) {
      setMode("recipe");
      setRecipeId(meal.recipeId);
      setCustomName("");
    } else {
      setMode("custom");
      setRecipeId("");
      setCustomName(meal.customName ?? "");
    }
    setManualError("");
    setManualModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink">Menu Settimanale</h1>
          <Link to={`/menu/generate?weekStart=${weekStart}`} className="app-btn-sm app-btn-sage">
            + AI
          </Link>
        </div>

        {/* Week navigator */}
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
              <span className="text-xs text-sage font-medium">Settimana corrente</span>
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink">Gestione manuale pasti</h2>
            <p className="mt-1 text-sm text-slate-500">
              Seleziona una cella della settimana per aprire subito l&apos;editor del pasto.
            </p>
          </div>
          <button
            type="button"
            onClick={resetManualForm}
            className="text-xs text-slate-400 hover:text-ink"
          >
            Reset
          </button>
        </div>

        <div className="mt-4">
          <ManualWeekPlanner
            meals={meals}
            selectedDayOfWeek={dayOfWeek}
            selectedMealSlot={mealSlot}
            onSelect={(nextDayOfWeek, nextMealSlot) => {
              const existingMeal = meals.find(
                (meal) => meal.dayOfWeek === nextDayOfWeek && meal.mealSlot === nextMealSlot
              );

              if (existingMeal) {
                startEditMeal(existingMeal);
                return;
              }

              setDayOfWeek(nextDayOfWeek);
              setMealSlot(nextMealSlot);
              setMode("recipe");
              setRecipeId("");
              setCustomName("");
              setManualError("");
              setEditingMealId(null);
              setManualModalOpen(true);
            }}
          />
        </div>
      </div>

      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-6">
          <div className="w-full max-w-lg rounded-[30px] bg-[#fffdf8] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Menu manuale
                </p>
                <h2 className="mt-2 text-xl font-bold text-ink">
                  {DAYS_FULL[dayOfWeek]} · {SLOT_LABELS[mealSlot]}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeManualModal}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500 hover:bg-slate-200 hover:text-ink"
              >
                Chiudi
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("recipe")}
                className={`app-btn-xs ${mode === "recipe" ? "app-btn-sage" : "app-btn-secondary"}`}
              >
                Usa una ricetta esistente
              </button>
              <button
                type="button"
                onClick={() => setMode("custom")}
                className={`app-btn-xs ${mode === "custom" ? "app-btn-sage" : "app-btn-secondary"}`}
              >
                Inserisci un pasto manuale
              </button>
            </div>

            <div className="mt-5">
              {mode === "recipe" ? (
                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  Ricetta
                  <select
                    value={recipeId}
                    onChange={(e) => setRecipeId(e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
                  >
                    <option value="">Seleziona una ricetta</option>
                    {recipeOptions.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  Nome del pasto
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Es. Toast integrale con hummus"
                    className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
                  />
                </label>
              )}
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Per un pasto completo con ingredienti e lista della spesa, crea prima una ricetta in{" "}
              <Link to="/recipes" className="font-semibold text-sage hover:text-ink">
                Ricette
              </Link>
              . Se ti mancano gli elementi base, puoi aggiungerli in{" "}
              <Link to="/ingredients" className="font-semibold text-sage hover:text-ink">
                Ingredienti
              </Link>
              .
            </p>

            {manualError && <p className="mt-4 text-sm text-rose-600">{manualError}</p>}

            <div className="mt-5 flex gap-3">
              {editingMealId && (
                <button
                  type="button"
                  onClick={() => removeMealMutation.mutate(editingMealId)}
                  disabled={removeMealMutation.isPending}
                  className="app-btn app-btn-secondary text-rose-600 disabled:opacity-60"
                >
                  {removeMealMutation.isPending ? "Rimozione..." : "Elimina"}
                </button>
              )}
              <button
                type="button"
                onClick={closeManualModal}
                className="app-btn app-btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => saveMealMutation.mutate()}
                disabled={saveMealMutation.isPending}
                className="app-btn app-btn-sage flex-1 disabled:opacity-60"
              >
                {saveMealMutation.isPending ? "Salvataggio..." : "Salva pasto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {menuQuery.isLoading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-transparent" />
        </div>
      )}

      {menuQuery.isSuccess && !menuQuery.data && (
        <div className="app-panel text-center">
          <p className="text-slate-500">Nessun menu per questa settimana.</p>
          <Link to={`/menu/generate?weekStart=${weekStart}`} className="app-btn app-btn-sage mt-4 inline-flex">
            Genera menu con AI
          </Link>
        </div>
      )}

      {menuQuery.isSuccess && menuQuery.data && (
        <WeekGrid menu={menuQuery.data} weekStart={weekStart} />
      )}
    </div>
  );
}
