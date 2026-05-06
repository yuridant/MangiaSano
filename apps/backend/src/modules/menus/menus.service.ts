import { Injectable, NotFoundException } from "@nestjs/common";
import { MealSlot } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
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

    return menu;
  }

  async upsertMeal(
    userId: string,
    familyId: string,
    weekStart: string,
    data: { dayOfWeek: number; mealSlot: MealSlot; recipeId?: string; customName?: string }
  ) {
    await this.families.requireMembership(userId, familyId);

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
        customName: data.customName || null
      },
      update: {
        recipeId: data.recipeId || null,
        customName: data.customName || null
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
          update: { recipeId: meal.recipeId }
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
