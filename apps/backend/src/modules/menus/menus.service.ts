import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { MEAL_SLOT_ORDER, type MealSlot } from "../../common/meal-slots";
import { FamiliesService } from "../families/families.service";

@Injectable()
export class MenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService
  ) {}

  async listWeeks(userId: string, familyId: string) {
    await this.families.requireMembership(userId, familyId);
    return this.prisma.weeklyMenu.findMany({
      where: { familyId },
      select: { id: true, weekStart: true, _count: { select: { meals: true } } },
      orderBy: { weekStart: "desc" }
    });
  }

  async getWeek(userId: string, familyId: string, weekStart: string) {
    await this.families.requireMembership(userId, familyId);

    const date = this.parseWeekStart(weekStart);
    const menu = await this.prisma.weeklyMenu.findUnique({
      where: { weekStart_familyId: { weekStart: date, familyId } },
      include: {
        meals: {
          include: {
            recipe: {
              include: {
                ingredients: {
                  include: { ingredient: { select: { id: true, name: true, category: true } } }
                }
              }
            }
          },
          orderBy: [{ dayOfWeek: "asc" }, { mealSlot: "asc" }]
        }
      }
    });

    return menu
      ? {
          ...menu,
          meals: [...menu.meals].sort((a, b) => {
            if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
            return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
          })
        }
      : null;
  }

  async upsertMeal(
    userId: string,
    familyId: string,
    weekStart: string,
    data: { dayOfWeek: number; mealSlot: MealSlot; recipeId?: string; customName?: string }
  ) {
    await this.families.requireMembership(userId, familyId);

    if (data.recipeId) {
      const recipe = await this.prisma.recipe.findUnique({
        where: { id: data.recipeId },
        select: { id: true, familyId: true }
      });
      if (!recipe || recipe.familyId !== familyId) {
        throw new BadRequestException("La ricetta selezionata non appartiene alla famiglia attiva.");
      }
    }

    const date = this.parseWeekStart(weekStart);
    const menu = await this.prisma.weeklyMenu.upsert({
      where: { weekStart_familyId: { weekStart: date, familyId } },
      create: { weekStart: date, familyId },
      update: {}
    });

    return this.prisma.menuMeal.upsert({
      where: {
        weeklyMenuId_dayOfWeek_mealSlot: {
          weeklyMenuId: menu.id,
          dayOfWeek: data.dayOfWeek,
          mealSlot: data.mealSlot
        }
      },
      create: {
        weeklyMenuId: menu.id,
        dayOfWeek: data.dayOfWeek,
        mealSlot: data.mealSlot,
        recipeId: data.recipeId || null,
        customName: data.customName?.trim() || null
      },
      update: {
        recipeId: data.recipeId || null,
        customName: data.customName?.trim() || null
      },
      include: { recipe: { select: { id: true, name: true } } }
    });
  }

  async removeMeal(userId: string, familyId: string, weekStart: string, mealId: string) {
    await this.families.requireMembership(userId, familyId);

    const date = this.parseWeekStart(weekStart);
    const menu = await this.prisma.weeklyMenu.findUnique({
      where: { weekStart_familyId: { weekStart: date, familyId } }
    });
    if (!menu) throw new NotFoundException("Menu non trovato.");

    await this.prisma.menuMeal.deleteMany({
      where: { id: mealId, weeklyMenuId: menu.id }
    });

    return { success: true };
  }

  async bulkSaveMeals(
    userId: string,
    familyId: string,
    weekStart: string,
    meals: { dayOfWeek: number; mealSlot: MealSlot; recipeId: string }[]
  ) {
    await this.families.requireMembership(userId, familyId);

    const allowedRecipeIds = new Set(
      (
        await this.prisma.recipe.findMany({
          where: { familyId, id: { in: meals.map((meal) => meal.recipeId) } },
          select: { id: true }
        })
      ).map((recipe) => recipe.id)
    );
    if (allowedRecipeIds.size !== new Set(meals.map((meal) => meal.recipeId)).size) {
      throw new BadRequestException("Il menu contiene ricette non valide per la famiglia attiva.");
    }

    const date = this.parseWeekStart(weekStart);
    const menu = await this.prisma.weeklyMenu.upsert({
      where: { weekStart_familyId: { weekStart: date, familyId } },
      create: { weekStart: date, familyId },
      update: {}
    });

    await this.prisma.$transaction(
      meals.map((meal) =>
        this.prisma.menuMeal.upsert({
          where: {
            weeklyMenuId_dayOfWeek_mealSlot: {
              weeklyMenuId: menu.id,
              dayOfWeek: meal.dayOfWeek,
              mealSlot: meal.mealSlot
          }
          },
          create: { weeklyMenuId: menu.id, ...meal },
          update: { recipeId: meal.recipeId, customName: null }
        })
      )
    );

    return this.getWeek(userId, familyId, weekStart);
  }

  private parseWeekStart(weekStart: string) {
    const date = new Date(weekStart);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
