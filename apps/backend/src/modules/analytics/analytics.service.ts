import { Injectable } from "@nestjs/common";
import { MEAL_SLOT_ORDER } from "../../common/meal-slots";
import { PrismaService } from "../../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { FamiliesService } from "../families/families.service";

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
    private readonly aiService: AiService
  ) {}

  async getSummary(userId: string, familyId: string) {
    await this.families.requireMembership(userId, familyId);

    const [topRecipes, topIngredients, mealSlotDistribution, totalMenus, totalRecipes, totalIngredients, totalMealsPlanned, weeklyCoverage, aiUsage] = await Promise.all([
      this.getTopRecipes(familyId),
      this.getTopIngredients(familyId),
      this.getMealSlotDistribution(familyId),
      this.prisma.weeklyMenu.count({ where: { familyId } }),
      this.prisma.recipe.count({ where: { familyId } }),
      this.prisma.ingredient.count({ where: { familyId } }),
      this.prisma.menuMeal.count({ where: { weeklyMenu: { familyId } } }),
      this.getWeeklyCoverage(familyId),
      this.getAiUsageSummary(familyId)
    ]);

    return {
      overview: {
        totalMenus,
        totalRecipes,
        totalIngredients,
        totalMealsPlanned,
        averageMealsPerMenu: totalMenus > 0 ? Number((totalMealsPlanned / totalMenus).toFixed(1)) : 0,
        completionRate: totalMenus > 0 ? Math.round((totalMealsPlanned / (totalMenus * 35)) * 100) : 0
      },
      topRecipes,
      topIngredients,
      mealSlotDistribution: mealSlotDistribution.sort(
        (a, b) => MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot]
      ),
      weeklyCoverage,
      aiUsage: {
        ...aiUsage,
        experiment: this.getExperimentConfig()
      }
    };
  }

  private async getTopRecipes(familyId: string) {
    const results = await this.prisma.menuMeal.groupBy({
      by: ["recipeId"],
      where: { weeklyMenu: { familyId }, recipeId: { not: null } },
      _count: { recipeId: true },
      orderBy: { _count: { recipeId: "desc" } },
      take: 10
    });

    const recipeIds = results.map((r) => r.recipeId).filter(Boolean) as string[];
    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: recipeIds } },
      select: { id: true, name: true }
    });

    const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));
    return results.map((r) => ({
      recipeId: r.recipeId!,
      name: recipeMap.get(r.recipeId!) ?? "?",
      count: r._count.recipeId
    }));
  }

  private async getTopIngredients(familyId: string) {
    const results = await this.prisma.$queryRaw<{ ingredientId: string; name: string; count: bigint }[]>`
      SELECT i.id as "ingredientId", i.name, COUNT(*)::int as count
      FROM "MenuMeal" mm
      JOIN "WeeklyMenu" wm ON wm.id = mm."weeklyMenuId"
      JOIN "RecipeIngredient" ri ON ri."recipeId" = mm."recipeId"
      JOIN "Ingredient" i ON i.id = ri."ingredientId"
      WHERE wm."familyId" = ${familyId}
      GROUP BY i.id, i.name
      ORDER BY count DESC
      LIMIT 10
    `;

    return results.map((r) => ({ ...r, count: Number(r.count) }));
  }

  private async getMealSlotDistribution(familyId: string) {
    const results = await this.prisma.menuMeal.groupBy({
      by: ["mealSlot"],
      where: { weeklyMenu: { familyId } },
      _count: { mealSlot: true }
    });

    return results.map((r) => ({ mealSlot: r.mealSlot, count: r._count.mealSlot }));
  }

  private async getWeeklyCoverage(familyId: string) {
    const menus = await this.prisma.weeklyMenu.findMany({
      where: { familyId },
      select: {
        weekStart: true,
        _count: {
          select: { meals: true }
        }
      },
      orderBy: { weekStart: "desc" },
      take: 8
    });

    return menus.map((menu) => ({
      weekStart: menu.weekStart.toISOString().split("T")[0],
      mealCount: menu._count.meals,
      completionRate: Math.round((menu._count.meals / 35) * 100)
    }));
  }

  private async getAiUsageSummary(familyId: string) {
    const logs = await this.prisma.aiGenerationLog.findMany({
      where: { familyId },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    const successfulLogs = logs.filter((log) => log.success);
    const totalEstimatedCostUsd = successfulLogs.reduce(
      (sum, log) => sum + (log.estimatedTotalCostUsd ?? 0),
      0
    );
    const totalRequestedMeals = successfulLogs.reduce((sum, log) => sum + log.requestedMealCount, 0);
    const totalInputTokens = successfulLogs.reduce((sum, log) => sum + (log.inputTokens ?? 0), 0);
    const totalOutputTokens = successfulLogs.reduce((sum, log) => sum + (log.outputTokens ?? 0), 0);

    const modelBuckets = new Map<string, typeof successfulLogs>();
    const variantBuckets = new Map<string, typeof successfulLogs>();
    for (const log of successfulLogs) {
      const bucket = modelBuckets.get(log.model) ?? [];
      bucket.push(log);
      modelBuckets.set(log.model, bucket);

      const requestBreakdown = log.requestBreakdown as
        | {
            experiment?: { strategy?: string; variant?: string };
          }
        | null;
      const variantKey = requestBreakdown?.experiment?.variant;
      if (variantKey) {
        const variantBucket = variantBuckets.get(variantKey) ?? [];
        variantBucket.push(log);
        variantBuckets.set(variantKey, variantBucket);
      }
    }

    const sectionTotals = new Map<string, { tokens: number; chars: number }>();
    for (const log of successfulLogs) {
      const requestBreakdown = log.requestBreakdown as
        | {
            sections?: { name: string; tokens: number; chars: number }[];
          }
        | null;
      for (const section of requestBreakdown?.sections ?? []) {
        const current = sectionTotals.get(section.name) ?? { tokens: 0, chars: 0 };
        current.tokens += section.tokens;
        current.chars += section.chars;
        sectionTotals.set(section.name, current);
      }
    }

    return {
      totalRequests: logs.length,
      successfulRequests: successfulLogs.length,
      averageCostUsd:
        successfulLogs.length > 0 ? Number((totalEstimatedCostUsd / successfulLogs.length).toFixed(6)) : 0,
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
      averageInputTokens:
        successfulLogs.length > 0 ? Math.round(totalInputTokens / successfulLogs.length) : 0,
      averageOutputTokens:
        successfulLogs.length > 0 ? Math.round(totalOutputTokens / successfulLogs.length) : 0,
      averageRequestedMeals:
        successfulLogs.length > 0 ? Number((totalRequestedMeals / successfulLogs.length).toFixed(1)) : 0,
      averageCostPerMealUsd:
        totalRequestedMeals > 0 ? Number((totalEstimatedCostUsd / totalRequestedMeals).toFixed(6)) : 0,
      modelBreakdown: [...modelBuckets.entries()].map(([model, entries]) => ({
        model,
        requests: entries.length,
        averageCostUsd: Number(
          (
            entries.reduce((sum, entry) => sum + (entry.estimatedTotalCostUsd ?? 0), 0) / entries.length
          ).toFixed(6)
        ),
        averageInputTokens: Math.round(
          entries.reduce((sum, entry) => sum + (entry.inputTokens ?? 0), 0) / entries.length
        ),
        averageOutputTokens: Math.round(
          entries.reduce((sum, entry) => sum + (entry.outputTokens ?? 0), 0) / entries.length
        )
      })),
      experimentBreakdown: [...variantBuckets.entries()].map(([variant, entries]) => ({
        variant,
        requests: entries.length,
        averageCostUsd: Number(
          (
            entries.reduce((sum, entry) => sum + (entry.estimatedTotalCostUsd ?? 0), 0) / entries.length
          ).toFixed(6)
        ),
        averageRequestedMeals: Number(
          (entries.reduce((sum, entry) => sum + entry.requestedMealCount, 0) / entries.length).toFixed(1)
        ),
        averageInputTokens: Math.round(
          entries.reduce((sum, entry) => sum + (entry.inputTokens ?? 0), 0) / entries.length
        ),
        averageOutputTokens: Math.round(
          entries.reduce((sum, entry) => sum + (entry.outputTokens ?? 0), 0) / entries.length
        )
      })),
      sectionAverages: [...sectionTotals.entries()]
        .map(([name, totals]) => ({
          name,
          averageTokens: Math.round(totals.tokens / successfulLogs.length),
          averageChars: Math.round(totals.chars / successfulLogs.length)
        }))
        .sort((a, b) => b.averageTokens - a.averageTokens),
      recentRequests: logs.slice(0, 12).map((log) => ({
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        model: log.model,
        experimentVariant:
          ((log.requestBreakdown as { experiment?: { variant?: string } } | null)?.experiment?.variant ??
            "primary"),
        experimentStrategy:
          ((log.requestBreakdown as { experiment?: { strategy?: string } } | null)?.experiment?.strategy ??
            "off"),
        success: log.success,
        requestedMealCount: log.requestedMealCount,
        existingRecipeCount: log.existingRecipeCount,
        existingIngredientCount: log.existingIngredientCount,
        inputTokens: log.inputTokens ?? 0,
        cachedInputTokens: log.cachedInputTokens ?? 0,
        outputTokens: log.outputTokens ?? 0,
        totalTokens: log.totalTokens ?? 0,
        estimatedTotalCostUsd: log.estimatedTotalCostUsd ?? 0,
        latencyMs: log.latencyMs ?? 0,
        requestBreakdown: log.requestBreakdown,
        errorMessage: log.errorMessage
      }))
    };
  }

  private getExperimentConfig() {
    const config = this.aiService.getModelConfig();
    return {
      mode: config.experimentMode,
      primaryModel: config.primaryModel,
      secondaryModel: config.secondaryModel
    };
  }
}
