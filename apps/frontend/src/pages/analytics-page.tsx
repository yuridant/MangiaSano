import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AnalyticsSummary } from "../types";
import { SLOT_LABELS } from "../types";

function formatWeekRange(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start.getTime() + 6 * 86400000);
  return `${start.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — ${end.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;
}

export function AnalyticsPage() {
  const { token, activeFamilyId } = useAuth();

  const analyticsQuery = useQuery({
    queryKey: ["analytics", activeFamilyId],
    queryFn: () => api.get<AnalyticsSummary>(`/analytics?familyId=${activeFamilyId}`, token!),
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
  const totalSlots = data.mealSlotDistribution.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header">
        <h1 className="text-2xl font-bold text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Una vista d&apos;insieme su copertura dei menu, ricette e ingredienti usati davvero.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="app-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Settimane pianificate</p>
          <p className="mt-3 text-3xl font-bold text-ink">{data.overview.totalMenus}</p>
          <p className="mt-2 text-sm text-slate-500">{data.overview.totalMealsPlanned} pasti salvati in totale</p>
        </div>
        <div className="app-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ricette in archivio</p>
          <p className="mt-3 text-3xl font-bold text-ink">{data.overview.totalRecipes}</p>
          <p className="mt-2 text-sm text-slate-500">{data.overview.totalIngredients} ingredienti disponibili</p>
        </div>
        <div className="app-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Media pasti per settimana</p>
          <p className="mt-3 text-3xl font-bold text-ink">{data.overview.averageMealsPerMenu}</p>
          <p className="mt-2 text-sm text-slate-500">Su un massimo teorico di 35 slot</p>
        </div>
        <div className="app-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Copertura media</p>
          <p className="mt-3 text-3xl font-bold text-ink">{data.overview.completionRate}%</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sage transition-all"
              style={{ width: `${data.overview.completionRate}%` }}
            />
          </div>
        </div>
      </div>

      {data.overview.totalMenus === 0 && (
        <div className="app-empty">
          Nessun dato ancora. Inizia a pianificare i menu per vedere statistiche e trend.
        </div>
      )}

      {data.weeklyCoverage.length > 0 && (
        <div className="app-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-ink">Copertura ultime settimane</h2>
              <p className="mt-1 text-sm text-slate-500">
                Quanti slot sono stati riempiti settimana per settimana.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {[...data.weeklyCoverage].reverse().map((week) => (
              <div key={week.weekStart}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{formatWeekRange(week.weekStart)}</span>
                  <span className="text-xs font-semibold text-slate-400">
                    {week.mealCount}/35 • {week.completionRate}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-ink transition-all"
                    style={{ width: `${week.completionRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {data.topRecipes.length > 0 && (
          <div className="app-panel">
            <h2 className="mb-4 font-bold text-ink">Ricette più usate</h2>
            <div className="flex flex-col gap-3">
              {data.topRecipes.map((item, index) => (
                <div key={item.recipeId}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">
                      <span className="mr-2 text-slate-400">#{index + 1}</span>
                      {item.name}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">{item.count}×</span>
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
            <h2 className="mb-4 font-bold text-ink">Ingredienti più usati nei menu</h2>
            <div className="flex flex-col gap-3">
              {data.topIngredients.map((item, index) => (
                <div key={item.ingredientId}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">
                      <span className="mr-2 text-slate-400">#{index + 1}</span>
                      {item.name}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">{item.count}×</span>
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
      </div>

      {data.mealSlotDistribution.length > 0 && (
        <div className="app-panel">
          <h2 className="mb-4 font-bold text-ink">Distribuzione dei pasti salvati</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {data.mealSlotDistribution.map((item) => (
              <div key={item.mealSlot} className="app-subpanel text-center">
                <p className="text-2xl font-bold text-ink">{item.count}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{SLOT_LABELS[item.mealSlot]}</p>
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
