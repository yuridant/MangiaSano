import { Injectable } from "@nestjs/common";
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

    const [topRecipes, topIngredients, mealSlotDistribution, totalMenus] = await Promise.all([
      this.getTopRecipes(familyId),
      this.getTopIngredients(familyId),
      this.getMealSlotDistribution(familyId),
      this.prisma.weeklyMenu.count({ where: { familyId } })
    ]);

    return { topRecipes, topIngredients, mealSlotDistribution, totalMenus };
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
      SELECT i.id as "ingredientId", i.name, COUNT(ri."ingredientId")::int as count
      FROM "RecipeIngredient" ri
      JOIN "Ingredient" i ON i.id = ri."ingredientId"
      JOIN "Recipe" r ON r.id = ri."recipeId"
      WHERE r."familyId" = ${familyId}
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
}
