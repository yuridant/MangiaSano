import { Injectable } from "@nestjs/common";
import { MEAL_SLOT_ORDER } from "../../common/meal-slots";
import { PrismaService } from "../../prisma/prisma.service";
import { FamiliesService } from "../families/families.service";

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService
  ) {}

  async getSummary(userId: string, familyId: string) {
    await this.families.requireMembership(userId, familyId);

    const [topRecipes, topIngredients, mealSlotDistribution, totalMenus, totalRecipes, totalIngredients, totalMealsPlanned, weeklyCoverage] = await Promise.all([
      this.getTopRecipes(familyId),
      this.getTopIngredients(familyId),
      this.getMealSlotDistribution(familyId),
      this.prisma.weeklyMenu.count({ where: { familyId } }),
      this.prisma.recipe.count({ where: { familyId } }),
      this.prisma.ingredient.count({ where: { familyId } }),
      this.prisma.menuMeal.count({ where: { weeklyMenu: { familyId } } }),
      this.getWeeklyCoverage(familyId)
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
      weeklyCoverage
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
}
