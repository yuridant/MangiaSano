import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FamiliesService } from "../families/families.service";

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService
  ) {}

  async list(userId: string, familyId: string) {
    await this.families.requireMembership(userId, familyId);
    return this.prisma.ingredient.findMany({
      where: { familyId },
      orderBy: [{ category: "asc" }, { name: "asc" }]
    });
  }

  async create(userId: string, familyId: string, data: { name: string; category?: string }) {
    await this.families.requireMembership(userId, familyId);

    const existing = await this.prisma.ingredient.findUnique({
      where: { name_familyId: { name: data.name.trim(), familyId } }
    });
    if (existing) throw new ConflictException("Ingrediente già esistente.");

    return this.prisma.ingredient.create({
      data: { name: data.name.trim(), category: data.category?.trim() || null, familyId, createdById: userId }
    });
  }

  async update(userId: string, familyId: string, ingredientId: string, data: { name?: string; category?: string }) {
    await this.families.requireMembership(userId, familyId);
    await this.requireIngredient(ingredientId, familyId);

    if (data.name) {
      const existing = await this.prisma.ingredient.findUnique({
        where: { name_familyId: { name: data.name.trim(), familyId } }
      });
      if (existing && existing.id !== ingredientId) throw new ConflictException("Nome già in uso.");
    }

    return this.prisma.ingredient.update({
      where: { id: ingredientId },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.category !== undefined && { category: data.category?.trim() || null })
      }
    });
  }

  async remove(userId: string, familyId: string, ingredientId: string) {
    await this.families.requireMembership(userId, familyId);
    await this.requireIngredient(ingredientId, familyId);
    await this.prisma.ingredient.delete({ where: { id: ingredientId } });
    return { success: true };
  }

  async createMany(userId: string, familyId: string, items: { name: string; category?: string }[]) {
    await this.families.requireMembership(userId, familyId);
    const created: string[] = [];

    for (const item of items) {
      const existing = await this.prisma.ingredient.findUnique({
        where: { name_familyId: { name: item.name.trim(), familyId } }
      });
      if (!existing) {
        const ingredient = await this.prisma.ingredient.create({
          data: { name: item.name.trim(), category: item.category?.trim() || null, familyId, createdById: userId }
        });
        created.push(ingredient.id);
      } else {
        created.push(existing.id);
      }
    }

    return created;
  }

  private async requireIngredient(id: string, familyId: string) {
    const ingredient = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient || ingredient.familyId !== familyId) throw new NotFoundException("Ingrediente non trovato.");
    return ingredient;
  }
}
