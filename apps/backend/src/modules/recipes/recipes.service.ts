import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { MealSlot } from "../../common/meal-slots";
import { FamiliesService } from "../families/families.service";
import { RecipeSemanticsService } from "./recipe-semantics.service";

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
    private readonly recipeSemantics: RecipeSemanticsService
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
    data: { name: string; description?: string; mealTypes?: MealSlot[]; ingredientIds?: string[] }
  ) {
    await this.families.requireMembership(userId, familyId);

    const existing = await this.prisma.recipe.findUnique({
      where: { name_familyId: { name: data.name.trim(), familyId } }
    });
    if (existing) throw new ConflictException("Ricetta già esistente.");

    const createdRecipe = await this.prisma.recipe.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        mealTypes: data.mealTypes ?? [],
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

    await this.recipeSemantics.syncRecipeEmbedding(createdRecipe.id);
    return createdRecipe;
  }

  async update(
    userId: string,
    familyId: string,
    recipeId: string,
    data: { name?: string; description?: string; mealTypes?: MealSlot[]; ingredientIds?: string[] }
  ) {
    await this.families.requireMembership(userId, familyId);
    await this.requireRecipe(recipeId, familyId);

    if (data.name) {
      const existing = await this.prisma.recipe.findUnique({
        where: { name_familyId: { name: data.name.trim(), familyId } }
      });
      if (existing && existing.id !== recipeId) throw new ConflictException("Nome già in uso.");
    }

    const updatedRecipe = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
          ...(data.mealTypes !== undefined && { mealTypes: data.mealTypes })
        },
        include: {
          ingredients: {
            include: { ingredient: { select: { id: true, name: true, category: true } } }
          }
        }
      });
    });

    await this.recipeSemantics.syncRecipeEmbedding(recipeId);
    return updatedRecipe;
  }

  async remove(userId: string, familyId: string, recipeId: string) {
    await this.families.requireMembership(userId, familyId);
    await this.requireRecipe(recipeId, familyId);
    try {
      await this.prisma.recipe.delete({ where: { id: recipeId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException("Questa ricetta non può essere eliminata perché è ancora usata in uno o più menu.");
      }
      throw error;
    }
    return { success: true };
  }

  async createMany(
    userId: string,
    familyId: string,
    items: { name: string; description?: string; mealTypes?: MealSlot[]; ingredients: string[] }[]
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
            mealTypes: item.mealTypes ?? [],
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

    await this.recipeSemantics.syncRecipeEmbeddings(createdIds);
    return createdIds;
  }

  private async requireRecipe(id: string, familyId: string) {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe || recipe.familyId !== familyId) throw new NotFoundException("Ricetta non trovata.");
    return recipe;
  }
}
