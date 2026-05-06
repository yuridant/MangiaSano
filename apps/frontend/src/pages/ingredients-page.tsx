import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Ingredient } from "../types";

export function IngredientsPage() {
  const { token, activeFamilyId } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");

  const ingredientsQuery = useQuery({
    queryKey: ["ingredients", activeFamilyId],
    queryFn: () => api.get<Ingredient[]>(`/ingredients?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; category?: string }) =>
      api.post<Ingredient>(`/ingredients?familyId=${activeFamilyId}`, data, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients", activeFamilyId] });
      resetForm();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Errore")
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; category?: string } }) =>
      api.patch<Ingredient>(`/ingredients/${id}?familyId=${activeFamilyId}`, data, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients", activeFamilyId] });
      resetForm();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Errore")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/ingredients/${id}?familyId=${activeFamilyId}`, token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ingredients", activeFamilyId] })
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setCategory("");
    setError("");
  };

  const startEdit = (ing: Ingredient) => {
    setEditingId(ing.id);
    setName(ing.name);
    setCategory(ing.category ?? "");
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { name, category: category || undefined } });
    } else {
      createMutation.mutate({ name, category: category || undefined });
    }
  };

  const grouped = (ingredientsQuery.data ?? []).reduce<Record<string, Ingredient[]>>((acc, ing) => {
    const key = ing.category ?? "Altro";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ing);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Ingredienti</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="app-btn-sm app-btn-sage"
          type="button"
        >
          + Aggiungi
        </button>
      </div>

      {showForm && (
        <div className="app-panel">
          <h3 className="mb-4 font-bold text-ink">{editingId ? "Modifica" : "Nuovo ingrediente"}</h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Nome ingrediente"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
            />
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Categoria (es. verdure, proteine…)"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
            />
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

      {ingredientsQuery.isLoading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-transparent" />
        </div>
      )}

      {ingredientsQuery.isSuccess && (ingredientsQuery.data?.length ?? 0) === 0 && !showForm && (
        <div className="app-empty">Nessun ingrediente. Aggiungine uno per iniziare.</div>
      )}

      {sortedGroups.map(([group, items]) => (
        <div key={group} className="app-panel">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{group}</h3>
          <div className="flex flex-col gap-1">
            {items.map((ing) => (
              <div
                key={ing.id}
                className="flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3"
              >
                <span className="font-medium text-ink">{ing.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(ing)}
                    className="text-xs text-slate-400 hover:text-ink"
                    type="button"
                  >
                    Modifica
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(ing.id)}
                    className="text-xs text-rose-400 hover:text-rose-600"
                    type="button"
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
