import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AnalyticsSummary } from "../types";
import { SLOT_LABELS } from "../types";

function formatWeekRange(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start.getTime() + 6 * 86400000);
  return `${start.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — ${end.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 2
  }).format(value);
}

function formatSectionName(name: string) {
  const labels: Record<string, string> = {
    systemPrompt: "Istruzioni di sistema",
    goal: "Obiettivo nutrizionale",
    existingRecipes: "Ricettario esistente",
    existingIngredients: "Ingredienti esistenti",
    dietaryProfile: "Profilo famiglia",
    requestedSlots: "Pasti richiesti",
    rules: "Regole applicative"
  };
  return labels[name] ?? name;
}

function formatExperimentVariant(variant: string) {
  if (variant === "secondary") return "B";
  return "A";
}

function formatSignedPercent(value: number | null) {
  if (value === null) return "n/d";
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function getVerdictStyle(status: AnalyticsSummary["aiUsage"]["experimentVerdict"]["status"]) {
  switch (status) {
    case "winner_b":
      return "border-emerald-200 bg-emerald-50/90";
    case "winner_a":
      return "border-sky-200 bg-sky-50/90";
    case "watch":
      return "border-amber-200 bg-amber-50/90";
    case "close":
      return "border-slate-200 bg-slate-50/90";
    default:
      return "border-slate-200 bg-slate-50/90";
  }
}

export function AnalyticsPage() {
  const { token, activeFamilyId } = useAuth();
  const queryClient = useQueryClient();

  const analyticsQuery = useQuery({
    queryKey: ["analytics", activeFamilyId],
    queryFn: () => api.get<AnalyticsSummary>(`/analytics?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });

  const experimentMutation = useMutation({
    mutationFn: (mode: "off" | "alternate" | "random") =>
      api.patch<{ mode: "off" | "alternate" | "random"; primaryModel: string; secondaryModel: string }>(
        `/analytics/experiment?familyId=${activeFamilyId}`,
        { mode },
        token!
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics", activeFamilyId] });
    }
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

      <div className="app-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink">Costo richieste AI</h2>
            <p className="mt-1 text-sm text-slate-500">
              Stima basata sui token registrati e sul modello usato per ogni richiesta.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Modalita esperimento
                </span>
                <select
                  value={data.aiUsage.experiment.mode}
                  onChange={(e) =>
                    experimentMutation.mutate(e.target.value as "off" | "alternate" | "random")
                  }
                  disabled={experimentMutation.isPending}
                  className="mt-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink focus:border-sage focus:outline-none disabled:opacity-60"
                >
                  <option value="off">Off</option>
                  <option value="alternate">Alternate</option>
                  <option value="random">Random</option>
                </select>
              </label>
              <div className="text-xs text-slate-400">
                <p>
                  A: <span className="font-semibold text-ink">{data.aiUsage.experiment.primaryModel}</span>
                </p>
                <p>
                  B: <span className="font-semibold text-ink">{data.aiUsage.experiment.secondaryModel}</span>
                </p>
              </div>
            </div>
            {experimentMutation.isError && (
              <p className="mt-2 text-xs text-rose-500">
                {experimentMutation.error instanceof Error
                  ? experimentMutation.error.message
                  : "Impossibile aggiornare la modalita dell'esperimento."}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Richieste riuscite</p>
            <p className="mt-1 text-xl font-bold text-ink">
              {data.aiUsage.successfulRequests}/{data.aiUsage.totalRequests}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="app-subpanel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Costo medio richiesta</p>
            <p className="mt-2 text-2xl font-bold text-ink">{formatUsd(data.aiUsage.averageCostUsd)}</p>
          </div>
          <div className="app-subpanel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Costo medio per pasto</p>
            <p className="mt-2 text-2xl font-bold text-ink">{formatUsd(data.aiUsage.averageCostPerMealUsd)}</p>
          </div>
          <div className="app-subpanel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Input medio</p>
            <p className="mt-2 text-2xl font-bold text-ink">{data.aiUsage.averageInputTokens}</p>
            <p className="text-xs text-slate-400">token</p>
          </div>
          <div className="app-subpanel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Output medio</p>
            <p className="mt-2 text-2xl font-bold text-ink">{data.aiUsage.averageOutputTokens}</p>
            <p className="text-xs text-slate-400">token</p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="app-subpanel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Richieste autocorrette</p>
            <p className="mt-2 text-2xl font-bold text-ink">
              {data.aiUsage.correctedRequests}
              <span className="ml-2 text-sm font-medium text-slate-400">
                ({data.aiUsage.correctedRequestRatePct}%)
              </span>
            </p>
          </div>
          <div className="app-subpanel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Iterazioni medie</p>
            <p className="mt-2 text-2xl font-bold text-ink">{data.aiUsage.averageCorrectionAttempts}</p>
            <p className="text-xs text-slate-400">
              {data.aiUsage.averageCorrectionAttemptsWhenCorrected} se c&apos;è stata correzione
            </p>
          </div>
          <div className="app-subpanel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Costo extra medio</p>
            <p className="mt-2 text-2xl font-bold text-ink">{formatUsd(data.aiUsage.averageCorrectionCostUsd)}</p>
            <p className="text-xs text-slate-400">
              {formatUsd(data.aiUsage.averageCorrectionCostWhenCorrectedUsd)} quando scatta il retry
            </p>
          </div>
          <div className="app-subpanel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Token retry medi</p>
            <p className="mt-2 text-2xl font-bold text-ink">{data.aiUsage.averageCorrectionInputTokens}</p>
            <p className="text-xs text-slate-400">input • {data.aiUsage.averageCorrectionOutputTokens} output</p>
          </div>
        </div>

        {data.aiUsage.modelBreakdown.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-3 text-sm font-bold text-ink">Confronto per modello</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {data.aiUsage.modelBreakdown.map((item) => (
                <div key={item.model} className="app-subpanel">
                  <p className="text-sm font-semibold text-ink">{item.model}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.requests} richieste</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-ink">{formatUsd(item.averageCostUsd)}</p>
                      <p className="text-[11px] text-slate-400">Costo medio</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-ink">{item.averageInputTokens}</p>
                      <p className="text-[11px] text-slate-400">Input</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-ink">{item.averageOutputTokens}</p>
                      <p className="text-[11px] text-slate-400">Output</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl bg-slate-50/80 px-2 py-2">
                      <p className="text-base font-bold text-ink">{item.correctedRatePct}%</p>
                      <p className="text-[11px] text-slate-400">Retry rate</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50/80 px-2 py-2">
                      <p className="text-base font-bold text-ink">{item.averageCorrectionAttempts}</p>
                      <p className="text-[11px] text-slate-400">Iterazioni</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50/80 px-2 py-2">
                      <p className="text-base font-bold text-ink">{formatUsd(item.averageCorrectionCostUsd)}</p>
                      <p className="text-[11px] text-slate-400">Costo extra</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.aiUsage.experiment.mode !== "off" && data.aiUsage.experimentBreakdown.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-3 text-sm font-bold text-ink">Confronto gruppi A/B</h3>
            <div className={`mb-3 rounded-3xl border px-4 py-4 ${getVerdictStyle(data.aiUsage.experimentVerdict.status)}`}>
              <p className="text-sm font-semibold text-ink">Verdetto automatico</p>
              <p className="mt-1 text-sm text-slate-600">{data.aiUsage.experimentVerdict.summary}</p>
              <p className="mt-2 text-sm text-slate-600">{data.aiUsage.experimentVerdict.recommendation}</p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Delta costo richiesta B vs A</p>
                  <p className="mt-1 font-semibold text-ink">
                    {formatSignedPercent(data.aiUsage.experimentVerdict.costDeltaPct)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Delta costo per pasto B vs A</p>
                  <p className="mt-1 font-semibold text-ink">
                    {formatSignedPercent(data.aiUsage.experimentVerdict.costPerMealDeltaPct)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Gap pasti medi</p>
                  <p className="mt-1 font-semibold text-ink">
                    {data.aiUsage.experimentVerdict.requestedMealsGap ?? "n/d"}
                  </p>
                </div>
              </div>
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Delta feedback positivi B vs A</p>
                  <p className="mt-1 font-semibold text-ink">
                    {formatSignedPercent(data.aiUsage.experimentVerdict.positiveFeedbackGap)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Delta feedback scarsi B vs A</p>
                  <p className="mt-1 font-semibold text-ink">
                    {formatSignedPercent(data.aiUsage.experimentVerdict.poorFeedbackGap)}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {data.aiUsage.experimentBreakdown.map((item) => (
                <div key={item.variant} className="app-subpanel">
                  <p className="text-sm font-semibold text-ink">
                    Gruppo {formatExperimentVariant(item.variant)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{item.requests} richieste</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400">Costo medio</p>
                      <p className="mt-1 font-semibold text-ink">{formatUsd(item.averageCostUsd)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400">Pasti medi</p>
                      <p className="mt-1 font-semibold text-ink">{item.averageRequestedMeals}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400">Input medio</p>
                      <p className="mt-1 font-semibold text-ink">{item.averageInputTokens}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400">Output medio</p>
                      <p className="mt-1 font-semibold text-ink">{item.averageOutputTokens}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400">Retry rate</p>
                      <p className="mt-1 font-semibold text-ink">{item.correctedRatePct}%</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400">Iterazioni</p>
                      <p className="mt-1 font-semibold text-ink">{item.averageCorrectionAttempts}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl bg-slate-50/80 px-2 py-2">
                      <p className="text-base font-bold text-ink">{item.feedbackCount}</p>
                      <p className="text-[11px] text-slate-400">Feedback</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50/80 px-2 py-2">
                      <p className="text-base font-bold text-ink">
                        {item.positiveFeedbackRatePct ?? "n/d"}{item.positiveFeedbackRatePct !== null ? "%" : ""}
                      </p>
                      <p className="text-[11px] text-slate-400">Positivi</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50/80 px-2 py-2">
                      <p className="text-base font-bold text-ink">
                        {item.savedRatePct ?? "n/d"}{item.savedRatePct !== null ? "%" : ""}
                      </p>
                      <p className="text-[11px] text-slate-400">Salvati</p>
                    </div>
                  </div>
                  <div className="mt-2 rounded-2xl bg-slate-50/80 px-3 py-2 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Costo extra medio dei retry</p>
                    <p className="mt-1 font-semibold text-ink">{formatUsd(item.averageCorrectionCostUsd)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.aiUsage.sectionAverages.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-3 text-sm font-bold text-ink">Peso medio del prompt</h3>
            <div className="flex flex-col gap-2">
              {data.aiUsage.sectionAverages.map((section) => (
                <div key={section.name} className="flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{formatSectionName(section.name)}</p>
                    <p className="text-xs text-slate-400">{section.averageChars} caratteri medi</p>
                  </div>
                  <p className="text-sm font-semibold text-ink">{section.averageTokens} token medi</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.aiUsage.recentRequests.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-3 text-sm font-bold text-ink">Ultime richieste AI</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Gruppo</th>
                    <th className="px-3 py-2 font-semibold">Modello</th>
                    <th className="px-3 py-2 font-semibold">Pasti</th>
                    <th className="px-3 py-2 font-semibold">Feedback</th>
                    <th className="px-3 py-2 font-semibold">Retry</th>
                    <th className="px-3 py-2 font-semibold">Input</th>
                    <th className="px-3 py-2 font-semibold">Output</th>
                    <th className="px-3 py-2 font-semibold">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aiUsage.recentRequests.map((request) => (
                    <tr key={request.id} className="border-t border-slate-100">
                      <td className="px-3 py-3 text-slate-600">
                        {new Date(request.createdAt).toLocaleString("it-IT", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {request.experimentStrategy === "off"
                          ? "Off"
                          : formatExperimentVariant(request.experimentVariant)}
                      </td>
                      <td className="px-3 py-3 font-medium text-ink">{request.model}</td>
                      <td className="px-3 py-3 text-slate-600">{request.requestedMealCount}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {request.feedbackRating === "excellent"
                          ? "Ottima"
                          : request.feedbackRating === "acceptable"
                            ? "Accettabile"
                              : request.feedbackRating === "poor"
                              ? "Da rifare"
                              : "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {request.correctionAttempts > 0
                          ? `${request.correctionAttempts} • ${formatUsd(request.correctionEstimatedCostUsd)}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {request.inputTokens}
                        {request.cachedInputTokens > 0 && (
                          <span className="ml-1 text-xs text-slate-400">
                            ({request.cachedInputTokens} cached)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{request.outputTokens}</td>
                      <td className="px-3 py-3 font-medium text-ink">
                        {request.success ? formatUsd(request.estimatedTotalCostUsd) : "Errore"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
