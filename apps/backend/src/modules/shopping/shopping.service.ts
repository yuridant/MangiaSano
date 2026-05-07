import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FamiliesService } from "../families/families.service";

@Injectable()
export class ShoppingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService
  ) {}

  async getOrGenerateList(userId: string, familyId: string, weekStart: string) {
    await this.families.requireMembership(userId, familyId);

    const menu = await this.getMenuWithShoppingLists(familyId, weekStart);

    const existing = menu.shoppingLists[0];
    if (existing) return this.formatList(existing);

    return this.createListFromMenu(menu.id, familyId, menu.meals);
  }

  async toggleItem(userId: string, familyId: string, listId: string, itemId: string) {
    await this.families.requireMembership(userId, familyId);

    const list = await this.prisma.shoppingList.findUnique({ where: { id: listId } });
    if (!list || list.familyId !== familyId) throw new NotFoundException("Lista non trovata.");

    const item = await this.prisma.shoppingListItem.findUnique({ where: { id: itemId } });
    if (!item || item.shoppingListId !== listId) throw new NotFoundException("Item non trovato.");

    return this.prisma.shoppingListItem.update({
      where: { id: itemId },
      data: { checked: !item.checked }
    });
  }

  async resetList(userId: string, familyId: string, listId: string) {
    await this.families.requireMembership(userId, familyId);

    const list = await this.prisma.shoppingList.findUnique({ where: { id: listId } });
    if (!list || list.familyId !== familyId) throw new NotFoundException("Lista non trovata.");

    await this.prisma.shoppingListItem.updateMany({
      where: { shoppingListId: listId },
      data: { checked: false }
    });

    return { success: true };
  }

  async regenerateList(userId: string, familyId: string, weekStart: string) {
    await this.families.requireMembership(userId, familyId);

    const menu = await this.getMenuWithShoppingLists(familyId, weekStart);
    const existing = menu.shoppingLists[0];

    if (existing) {
      await this.prisma.shoppingList.delete({ where: { id: existing.id } });
    }

    return this.createListFromMenu(menu.id, familyId, menu.meals);
  }

  private async getMenuWithShoppingLists(familyId: string, weekStart: string) {
    const date = this.parseWeekStart(weekStart);
    const menu = await this.prisma.weeklyMenu.findUnique({
      where: { weekStart_familyId: { weekStart: date, familyId } },
      include: {
        meals: {
          include: {
            recipe: {
              include: {
                ingredients: { include: { ingredient: true } }
              }
            }
          }
        },
        shoppingLists: {
          where: { familyId },
          include: {
            items: { include: { ingredient: { select: { id: true, name: true, category: true } } } }
          }
        }
      }
    });

    if (!menu) throw new NotFoundException("Menu non trovato per questa settimana.");

    return menu;
  }

  private async createListFromMenu(
    weeklyMenuId: string,
    familyId: string,
    meals: {
      recipe: {
        ingredients: {
          ingredient: { id: string; name: string; category: string | null };
        }[];
      } | null;
    }[]
  ) {
    const ingredientMap = new Map<string, { id: string; name: string; category: string | null }>();
    for (const meal of meals) {
      if (!meal.recipe) continue;
      for (const ri of meal.recipe.ingredients) {
        ingredientMap.set(ri.ingredient.id, ri.ingredient);
      }
    }

    const list = await this.prisma.shoppingList.create({
      data: {
        weeklyMenuId,
        familyId,
        items: {
          create: Array.from(ingredientMap.values()).map((ingredient) => ({
            ingredientId: ingredient.id
          }))
        }
      },
      include: {
        items: { include: { ingredient: { select: { id: true, name: true, category: true } } } }
      }
    });

    return this.formatList(list);
  }

  private formatList(list: {
    id: string;
    weeklyMenuId: string;
    familyId: string;
    createdAt: Date;
    updatedAt: Date;
    items: {
      id: string;
      checked: boolean;
      customName: string | null;
      ingredient: { id: string; name: string; category: string | null } | null;
    }[];
  }) {
    return {
      id: list.id,
      weeklyMenuId: list.weeklyMenuId,
      items: list.items.map((item) => ({
        id: item.id,
        checked: item.checked,
        name: item.ingredient?.name ?? item.customName ?? "?",
        category: item.ingredient?.category ?? null,
        ingredientId: item.ingredient?.id ?? null
      }))
    };
  }

  private parseWeekStart(weekStart: string) {
    const date = new Date(weekStart);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
