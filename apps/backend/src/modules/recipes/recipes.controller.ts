import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { MealSlot } from "@prisma/client";
import { z } from "zod";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RecipesService } from "./recipes.service";

const mealSlotEnum = z.enum(["breakfast", "lunch", "dinner", "snack"] as const);

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  mealType: mealSlotEnum.optional(),
  ingredientIds: z.array(z.string()).optional()
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  mealType: mealSlotEnum.nullable().optional(),
  ingredientIds: z.array(z.string()).optional()
});

type AuthedRequest = { user: { id: string } };

@Controller("recipes")
@UseGuards(AuthGuard)
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query("familyId") familyId: string) {
    return this.recipesService.list(req.user.id, familyId);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Query("familyId") familyId: string, @Body() body: unknown) {
    const data = createSchema.parse(body);
    return this.recipesService.create(req.user.id, familyId, data as { name: string; mealType?: MealSlot });
  }

  @Patch(":id")
  update(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const data = updateSchema.parse(body);
    return this.recipesService.update(req.user.id, familyId, id, data as { mealType?: MealSlot | null });
  }

  @Delete(":id")
  remove(@Req() req: AuthedRequest, @Query("familyId") familyId: string, @Param("id") id: string) {
    return this.recipesService.remove(req.user.id, familyId, id);
  }
}
