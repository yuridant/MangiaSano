import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { buildSmartSearchText, getSmartSearchScore } from "../lib/smart-search";
import type { Ingredient, MealSlot, Recipe } from "../types";
import { SLOT_LABELS, SLOTS } from "../types";

export function RecipesPage() {
  const { token, activeFamilyId } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mealTypes, setMealTypes] = useState<MealSlot[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);

  const recipesQuery = useQuery({
    queryKey: ["recipes", activeFamilyId],
    queryFn: () => api.get<Recipe[]>(`/recipes?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });

  const ingredientsQuery = useQuery({
    queryKey: ["ingredients", activeFamilyId],
    queryFn: () => api.get<Ingredient[]>(`/ingredients?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId && showForm
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; mealTypes?: MealSlot[]; ingredientIds: string[] }) =>
      api.post<Recipe>(`/recipes?familyId=${activeFamilyId}`, data, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes", activeFamilyId] });
      resetForm();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Errore")
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch<Recipe>(`/recipes/${id}?familyId=${activeFamilyId}`, data, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes", activeFamilyId] });
      resetForm();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Errore")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/recipes/${id}?familyId=${activeFamilyId}`, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes", activeFamilyId] });
      setError("");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Errore durante l'eliminazione")
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          await api.delete(`/recipes/${id}?familyId=${activeFamilyId}`, token!);
          return id;
        })
      );
      return {
        deletedIds: results
          .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
          .map((result) => result.value),
        failures: results
          .map((result, index) => ({ result, id: ids[index] }))
          .filter(
            (entry): entry is { result: PromiseRejectedResult; id: string } => entry.result.status === "rejected"
          )
          .map((entry) => ({
            id: entry.id,
            message: entry.result.reason instanceof Error ? entry.result.reason.message : "Errore durante l'eliminazione"
          }))
      };
    },
    onSuccess: ({ deletedIds, failures }) => {
      queryClient.invalidateQueries({ queryKey: ["recipes", activeFamilyId] });
      setSelectedRecipeIds(failures.map((failure) => failure.id));
      if (failures.length === 0) {
        setSelectionMode(false);
        setError("");
        return;
      }
      const deletedCount = deletedIds.length;
      const failureMessages = [...new Set(failures.map((failure) => failure.message))];
      setError(
        `${deletedCount > 0 ? `${deletedCount} ricette eliminate. ` : ""}${failures.length} non eliminate. ${failureMessages.join(" ")}`
      );
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Errore durante l'eliminazione")
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setDescription("");
    setMealTypes([]);
    setSelectedIngredients([]);
    setError("");
  };

  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelectedRecipeIds([]);
    setError("");
  };

  const toggleRecipeSelection = (recipeId: string) => {
    setSelectedRecipeIds((prev) =>
      prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]
    );
  };

  const startEdit = (recipe: Recipe) => {
    setEditingId(recipe.id);
    setName(recipe.name);
    setDescription(recipe.description ?? "");
    setMealTypes(recipe.mealTypes ?? []);
    setSelectedIngredients(recipe.ingredients.map((ri) => ri.ingredientId));
    setShowForm(true);
  };

  const toggleIngredient = (id: string) => {
    setSelectedIngredients((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleMealType = (slot: MealSlot) => {
    setMealTypes((prev) =>
      prev.includes(slot) ? prev.filter((item) => item !== slot) : [...prev, slot]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const data = {
      name,
      description: description || undefined,
      mealTypes,
      ingredientIds: selectedIngredients
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const selectedIngredientNames = selectedIngredients
    .map((id) => ingredientsQuery.data?.find((ingredient) => ingredient.id === id)?.name ?? "")
    .filter(Boolean);
  const draftSearch = buildSmartSearchText(
    name,
    description,
    mealTypes.map((slot) => SLOT_LABELS[slot]).join(" "),
    selectedIngredientNames.join(" ")
  );
  const activeSearch = search.trim() || (showForm ? draftSearch : "");

  const scoredRecipes = (recipesQuery.data ?? [])
    .map((recipe) => ({
      recipe,
      score: getSmartSearchScore(
        activeSearch,
        buildSmartSearchText(
          recipe.name,
          recipe.description ?? "",
          recipe.mealTypes.map((slot) => SLOT_LABELS[slot]).join(" "),
          recipe.ingredients.map((ingredient) => ingredient.ingredient.name).join(" ")
        )
      )
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.recipe.name.localeCompare(b.recipe.name, "it");
    });

  const similarRecipes = (recipesQuery.data ?? [])
    .filter((recipe) => recipe.id !== editingId)
    .map((recipe) => ({
      recipe,
      score: getSmartSearchScore(
        draftSearch,
        buildSmartSearchText(
          recipe.name,
          recipe.description ?? "",
          recipe.mealTypes.map((slot) => SLOT_LABELS[slot]).join(" "),
          recipe.ingredients.map((ingredient) => ingredient.ingredient.name).join(" ")
        )
      )
    }))
    .filter(({ score }) => score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ recipe }) => recipe);

  const visibleRecipes = activeSearch ? scoredRecipes.map(({ recipe }) => recipe) : recipesQuery.data ?? [];
  const allVisibleRecipeIds = visibleRecipes.map((recipe) => recipe.id);
  const areAllVisibleSelected =
    allVisibleRecipeIds.length > 0 && allVisibleRecipeIds.every((id) => selectedRecipeIds.includes(id));

  const toggleSelectAllVisible = () => {
    if (areAllVisibleSelected) {
      setSelectedRecipeIds((prev) => prev.filter((id) => !allVisibleRecipeIds.includes(id)));
      return;
    }
    setSelectedRecipeIds((prev) => [...new Set([...prev, ...allVisibleRecipeIds])]);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Ricette</h1>
        <div className="flex gap-2">
          <button
            onClick={toggleSelectionMode}
            className={`app-btn-sm ${selectionMode ? "app-btn-secondary" : "app-btn-secondary"}`}
            type="button"
          >
            {selectionMode ? "Fine selezione" : "Seleziona"}
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="app-btn-sm app-btn-sage"
            type="button"
          >
            + Aggiungi
          </button>
        </div>
      </div>

      {selectionMode && (
        <div className="app-panel flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggleSelectAllVisible} className="app-btn-sm app-btn-secondary">
            {areAllVisibleSelected ? "Deseleziona tutti" : "Seleziona tutti"}
          </button>
          <button
            type="button"
            onClick={() => bulkDeleteMutation.mutate(selectedRecipeIds)}
            disabled={selectedRecipeIds.length === 0 || bulkDeleteMutation.isPending}
            className="app-btn-sm bg-rose-500 text-white disabled:opacity-60"
          >
            {bulkDeleteMutation.isPending
              ? "Eliminazione..."
              : `Elimina selezionato${selectedRecipeIds.length === 1 ? "" : "/i"}`}
          </button>
          <p className="text-xs text-slate-500">
            {selectedRecipeIds.length === 0
              ? "Nessuna ricetta selezionata"
              : `${selectedRecipeIds.length} ricette selezionate`}
          </p>
        </div>
      )}

      <div className="app-panel">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Ricerca smart
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome, descrizione, tipo pasto o ingredienti"
          className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
        />
        <p className="mt-2 text-xs text-slate-500">
          La ricerca tiene conto anche degli ingredienti e delle tipologie di pasto.
        </p>
      </div>

      {showForm && (
        <div className="app-panel">
          <h3 className="mb-4 font-bold text-ink">{editingId ? "Modifica ricetta" : "Nuova ricetta"}</h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Nome ricetta"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrizione (opzionale)"
              rows={2}
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none resize-none"
            />
            {similarRecipes.length > 0 && (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Esistono già ricette simili: {similarRecipes.map((recipe) => recipe.name).join(", ")}.
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tipologie di pasto
              </p>
              <div className="flex flex-wrap gap-2">
                {SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleMealType(slot)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      mealTypes.includes(slot)
                        ? "bg-sage text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {SLOT_LABELS[slot]}
                  </button>
                ))}
              </div>
            </div>

            {/* Ingredients selector */}
            {ingredientsQuery.isSuccess && (ingredientsQuery.data?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Ingredienti
                </p>
                <div className="max-h-40 overflow-y-auto rounded-2xl border border-slate-200 bg-white/80 p-3">
                  <div className="flex flex-wrap gap-2">
                    {(ingredientsQuery.data ?? []).map((ing) => (
                      <button
                        key={ing.id}
                        type="button"
                        onClick={() => toggleIngredient(ing.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          selectedIngredients.includes(ing.id)
                            ? "bg-sage text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {ing.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={resetForm} className="app-btn-sm app-btn-secondary flex-1">
                Annulla
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="app-btn-sm app-btn-sage flex-1 disabled:opacity-60"
              >
                {editingId ? "Salva" : "Aggiungi"}
              </button>
            </div>
          </form>
        </div>
      )}

      {recipesQuery.isLoading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-transparent" />
        </div>
      )}

      {recipesQuery.isSuccess && (recipesQuery.data?.length ?? 0) === 0 && !showForm && (
        <div className="app-empty">Nessuna ricetta. Aggiungine una per iniziare.</div>
      )}

      {recipesQuery.isSuccess && (recipesQuery.data?.length ?? 0) > 0 && visibleRecipes.length === 0 && (
        <div className="app-empty">Nessuna ricetta corrisponde alla ricerca attuale.</div>
      )}

      <div className="flex flex-col gap-3">
        {visibleRecipes.map((recipe) => (
          <div key={recipe.id} className="app-panel">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-1 items-start gap-3">
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedRecipeIds.includes(recipe.id)}
                    onChange={() => toggleRecipeSelection(recipe.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-sage focus:ring-sage"
                  />
                )}
                <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-ink">{recipe.name}</h3>
                  {recipe.mealTypes.map((slot) => (
                    <span key={slot} className="app-badge app-badge-sage text-[10px]">
                      {SLOT_LABELS[slot]}
                    </span>
                  ))}
                </div>
                {recipe.description && (
                  <p className="mt-1 text-sm text-slate-500">{recipe.description}</p>
                )}
                {recipe.ingredients.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {recipe.ingredients.map((ri) => (
                      <span key={ri.ingredientId} className="app-badge text-[10px]">
                        {ri.ingredient.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              </div>
              {!selectionMode && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => startEdit(recipe)} className="text-xs text-slate-400 hover:text-ink" type="button">
                    Modifica
                  </button>
                  <button onClick={() => deleteMutation.mutate(recipe.id)} className="text-xs text-rose-400 hover:text-rose-600" type="button">
                    Elimina
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
