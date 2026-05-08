import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { WeekNavigator } from "../components/menu/WeekNavigator";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateKey, getMonday } from "../lib/week";
import type { ShoppingItem, ShoppingList } from "../types";

export function ShoppingPage() {
  const { token, activeFamilyId } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedWeekStart = searchParams.get("weekStart");
  const parsedWeek =
    requestedWeekStart && !Number.isNaN(new Date(requestedWeekStart).getTime())
      ? new Date(`${requestedWeekStart}T00:00:00`)
      : getMonday(new Date());
  const weekStart = formatDateKey(getMonday(parsedWeek));

  const listQuery = useQuery({
    queryKey: ["shopping", activeFamilyId, weekStart],
    queryFn: () =>
      api.get<ShoppingList>(`/shopping/${weekStart}?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId,
    retry: false
  });

  const toggleMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) =>
      api.patch(`/shopping/${listId}/items/${itemId}/toggle?familyId=${activeFamilyId}`, {}, token!),
    onMutate: async ({ itemId }) => {
      await queryClient.cancelQueries({ queryKey: ["shopping", activeFamilyId, weekStart] });
      const prev = queryClient.getQueryData<ShoppingList>(["shopping", activeFamilyId, weekStart]);
      queryClient.setQueryData<ShoppingList>(["shopping", activeFamilyId, weekStart], (old) =>
        old
          ? {
              ...old,
              items: old.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i))
            }
          : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["shopping", activeFamilyId, weekStart], ctx.prev);
    }
  });

  const resetMutation = useMutation({
    mutationFn: (listId: string) =>
      api.post(`/shopping/${listId}/reset?familyId=${activeFamilyId}`, {}, token!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["shopping", activeFamilyId, weekStart] })
  });

  const regenerateMutation = useMutation({
    mutationFn: () =>
      api.post<ShoppingList>(`/shopping/${weekStart}/regenerate?familyId=${activeFamilyId}`, {}, token!),
    onSuccess: (nextList) => {
      queryClient.setQueryData(["shopping", activeFamilyId, weekStart], nextList);
    }
  });

  const list = listQuery.data;
  const checkedCount = list?.items.filter((i) => i.checked).length ?? 0;
  const totalCount = list?.items.length ?? 0;

  const grouped = (list?.items ?? []).reduce<Record<string, ShoppingItem[]>>((acc, item) => {
    const key = item.category ?? "Altro";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  const errorMessage =
    listQuery.error instanceof Error ? listQuery.error.message : "Errore nel caricamento della lista.";
  const isMenuMissingError = errorMessage.toLowerCase().includes("menu non trovato");

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header">
        <h1 className="text-2xl font-bold text-ink">Lista della spesa</h1>
        <WeekNavigator
          weekStart={weekStart}
          includeYear={false}
          onChangeWeekStart={(nextWeekStart) => setSearchParams({ weekStart: nextWeekStart })}
        />
      </div>

      {listQuery.isLoading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-transparent" />
        </div>
      )}

      {listQuery.isError && (
        <div className="app-panel text-center">
          <p className="text-slate-500">
            {isMenuMissingError
              ? "Nessun menu trovato per questa settimana. Genera prima un menu con l'AI."
              : errorMessage.includes("Failed to fetch")
                ? "Connessione al server non riuscita. Controlla la rete e riprova."
                : errorMessage}
          </p>
        </div>
      )}

      {list && (
        <>
          {/* Progress bar */}
          <div className="app-panel">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">
                {checkedCount} / {totalCount} prodotti
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                  className="text-xs text-sage hover:text-herb disabled:opacity-60"
                  type="button"
                >
                  {regenerateMutation.isPending ? "Rigenerando..." : "Rigenera lista"}
                </button>
                {checkedCount > 0 && (
                  <button
                    onClick={() => resetMutation.mutate(list.id)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                    type="button"
                  >
                    Reimposta
                  </button>
                )}
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sage transition-all duration-300"
                style={{ width: totalCount > 0 ? `${(checkedCount / totalCount) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {/* Items by category */}
          {sortedGroups.map(([group, items]) => (
            <div key={group} className="app-panel">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                {group}
              </h3>
              <div className="flex flex-col gap-1">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleMutation.mutate({ listId: list.id, itemId: item.id })}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                      item.checked ? "bg-sage/8 opacity-60" : "bg-slate-50/80 hover:bg-slate-100/80"
                    }`}
                  >
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        item.checked
                          ? "border-sage bg-sage text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {item.checked && (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                          <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span
                      className={`font-medium ${
                        item.checked ? "text-slate-400 line-through" : "text-ink"
                      }`}
                    >
                      {item.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {totalCount === 0 && (
            <div className="app-empty">
              La lista è vuota. Aggiungi ricette al menu per generare gli ingredienti.
            </div>
          )}
        </>
      )}
    </div>
  );
}
