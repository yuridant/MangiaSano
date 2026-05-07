import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { MealSlot } from "../../common/meal-slots";
import { FamiliesService } from "../families/families.service";

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService
  ) {}

  async list(userId: string, familyId: string) {
    await this.families.requireMembership(userId, familyId);
    return this.prisma.recipe.findMany({
      where: { familyId },
      include: {
        ingredients: {
          include: { ingredient: { select: { id: true, name: true, category: true } } }
        }
      },
      orderBy: { name: "asc" }
    });
  }

  async create(
    userId: string,
    familyId: string,
    data: { name: string; description?: string; mealType?: MealSlot; ingredientIds?: string[] }
  ) {
    await this.families.requireMembership(userId, familyId);

    const existing = await this.prisma.recipe.findUnique({
      where: { name_familyId: { name: data.name.trim(), familyId } }
    });
    if (existing) throw new ConflictException("Ricetta già esistente.");

    return this.prisma.recipe.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        mealType: data.mealType || null,
        familyId,
        createdById: userId,
        ingredients: {
          create: (data.ingredientIds ?? []).map((ingredientId) => ({ ingredientId }))
        }
      },
      include: {
        ingredients: {
          include: { ingredient: { select: { id: true, name: true, category: true } } }
        }
      }
    });
  }

  async update(
    userId: string,
    familyId: string,
    recipeId: string,
    data: { name?: string; description?: string; mealType?: MealSlot | null; ingredientIds?: string[] }
  ) {
    await this.families.requireMembership(userId, familyId);
    await this.requireRecipe(recipeId, familyId);

    if (data.name) {
      const existing = await this.prisma.recipe.findUnique({
        where: { name_familyId: { name: data.name.trim(), familyId } }
      });
      if (existing && existing.id !== recipeId) throw new ConflictException("Nome già in uso.");
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (data.ingredientIds !== undefined) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId } });
        await tx.recipeIngredient.createMany({
          data: data.ingredientIds.map((ingredientId) => ({ recipeId, ingredientId }))
        });
      }

      return tx.recipe.update({
        where: { id: recipeId },
        data: {
          ...(data.name && { name: data.name.trim() }),
          ...(data.description !== undefined && { description: data.description?.trim() || null }),
          ...(data.mealType !== undefined && { mealType: data.mealType })
        },
        include: {
          ingredients: {
            include: { ingredient: { select: { id: true, name: true, category: true } } }
          }
        }
      });
    });
  }

  async remove(userId: string, familyId: string, recipeId: string) {
    await this.families.requireMembership(userId, familyId);
    await this.requireRecipe(recipeId, familyId);
    await this.prisma.recipe.delete({ where: { id: recipeId } });
    return { success: true };
  }

  async createMany(
    userId: string,
    familyId: string,
    items: { name: string; description?: string; mealType?: MealSlot; ingredients: string[] }[]
  ) {
    await this.families.requireMembership(userId, familyId);
    const createdIds: string[] = [];

    for (const item of items) {
      let recipe = await this.prisma.recipe.findUnique({
        where: { name_familyId: { name: item.name.trim(), familyId } }
      });

      if (!recipe) {
        const ingredientRecords = await this.prisma.ingredient.findMany({
          where: { familyId, name: { in: item.ingredients } }
        });

        recipe = await this.prisma.recipe.create({
          data: {
            name: item.name.trim(),
            description: item.description?.trim() || null,
            mealType: item.mealType || null,
            familyId,
            createdById: userId,
            ingredients: {
              create: ingredientRecords.map((ingredient) => ({ ingredientId: ingredient.id }))
            }
          }
        });
      }

      createdIds.push(recipe.id);
    }

    return createdIds;
  }

  private async requireRecipe(id: string, familyId: string) {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe || recipe.familyId !== familyId) throw new NotFoundException("Ricetta non trovata.");
    return recipe;
  }
}
