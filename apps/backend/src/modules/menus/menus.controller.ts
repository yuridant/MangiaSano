import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../../common/guards/auth.guard";
import { mealSlotSchema, type MealSlot } from "../../common/meal-slots";
import { MenusService } from "./menus.service";

const menuMealItemSchema = z.object({
  recipeId: z.string().optional(),
  customName: z.string().optional()
}).refine((body) => Boolean(body.recipeId) !== Boolean(body.customName), {
  message: "Specifica una ricetta esistente oppure un nome manuale, non entrambi."
});

const upsertMealSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  mealSlot: mealSlotSchema,
  items: z.array(menuMealItemSchema).min(1, "Inserisci almeno una componente del pasto.")
});

const bulkSaveSchema = z.object({
  meals: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      mealSlot: mealSlotSchema,
      items: z.array(menuMealItemSchema).min(1)
    })
  )
});

type AuthedRequest = { user: { id: string } };

@Controller("menus")
@UseGuards(AuthGuard)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  listWeeks(@Req() req: AuthedRequest, @Query("familyId") familyId: string) {
    return this.menusService.listWeeks(req.user.id, familyId);
  }

  @Get(":weekStart")
  getWeek(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("weekStart") weekStart: string
  ) {
    return this.menusService.getWeek(req.user.id, familyId, weekStart);
  }

  @Post(":weekStart/meals")
  upsertMeal(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("weekStart") weekStart: string,
    @Body() body: unknown
  ) {
    const data = upsertMealSchema.parse(body);
    return this.menusService.upsertMeal(req.user.id, familyId, weekStart, data as {
      dayOfWeek: number;
      mealSlot: MealSlot;
      items: { recipeId?: string; customName?: string }[];
    });
  }

  @Put(":weekStart/meals")
  bulkSaveMeals(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("weekStart") weekStart: string,
    @Body() body: unknown
  ) {
    const { meals } = bulkSaveSchema.parse(body);
    return this.menusService.bulkSaveMeals(req.user.id, familyId, weekStart, meals as {
      dayOfWeek: number;
      mealSlot: MealSlot;
      items: { recipeId?: string; customName?: string }[];
    }[]);
  }

  @Delete(":weekStart/meals/:mealId")
  removeMeal(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("weekStart") weekStart: string,
    @Param("mealId") mealId: string
  ) {
    return this.menusService.removeMeal(req.user.id, familyId, weekStart, mealId);
  }
}
