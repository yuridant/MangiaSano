import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AnalyticsSummary } from "../types";
import { SLOT_LABELS } from "../types";

export function AnalyticsPage() {
  const { token, activeFamilyId } = useAuth();

  const analyticsQuery = useQuery({
    queryKey: ["analytics", activeFamilyId],
    queryFn: () =>
      api.get<AnalyticsSummary>(`/analytics?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });

  if (analyticsQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-transparent" />
      </div>
    );
  }

  const data = analyticsQuery.data;

  if (!data) return null;

  const maxRecipeCount = data.topRecipes[0]?.count ?? 1;
  const maxIngCount = data.topIngredients[0]?.count ?? 1;
  const totalSlots = data.mealSlotDistribution.reduce((s, d) => s + d.count, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header">
        <h1 className="text-2xl font-bold text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          {data.totalMenus} settiman{data.totalMenus === 1 ? "a" : "e"} pianificat{data.totalMenus === 1 ? "a" : "e"} in totale
        </p>
      </div>

      {data.totalMenus === 0 && (
        <div className="app-empty">
          Nessun dato ancora. Inizia a pianificare i menu per vedere le statistiche.
        </div>
      )}

      {data.topRecipes.length > 0 && (
        <div className="app-panel">
          <h2 className="mb-4 font-bold text-ink">Ricette più usate</h2>
          <div className="flex flex-col gap-2">
            {data.topRecipes.map((item, i) => (
              <div key={item.recipeId}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">
                    <span className="mr-2 text-slate-400">#{i + 1}</span>
                    {item.name}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    {item.count}×
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sage transition-all"
                    style={{ width: `${(item.count / maxRecipeCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.topIngredients.length > 0 && (
        <div className="app-panel">
          <h2 className="mb-4 font-bold text-ink">Ingredienti più usati</h2>
          <div className="flex flex-col gap-2">
            {data.topIngredients.map((item, i) => (
              <div key={item.ingredientId}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">
                    <span className="mr-2 text-slate-400">#{i + 1}</span>
                    {item.name}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    {item.count}×
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-wheat transition-all"
                    style={{ width: `${(item.count / maxIngCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.mealSlotDistribution.length > 0 && (
        <div className="app-panel">
          <h2 className="mb-4 font-bold text-ink">Distribuzione pasti</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.mealSlotDistribution.map((item) => (
              <div key={item.mealSlot} className="app-subpanel text-center">
                <p className="text-2xl font-bold text-ink">{item.count}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {SLOT_LABELS[item.mealSlot]}
                </p>
                <p className="text-xs text-slate-400">
                  {totalSlots > 0 ? Math.round((item.count / totalSlots) * 100) : 0}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
