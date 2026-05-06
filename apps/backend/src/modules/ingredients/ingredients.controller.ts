import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../../common/guards/auth.guard";
import { IngredientsService } from "./ingredients.service";

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional()
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional()
});

type AuthedRequest = { user: { id: string } };

@Controller("ingredients")
@UseGuards(AuthGuard)
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query("familyId") familyId: string) {
    return this.ingredientsService.list(req.user.id, familyId);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Query("familyId") familyId: string, @Body() body: unknown) {
    return this.ingredientsService.create(req.user.id, familyId, createSchema.parse(body));
  }

  @Patch(":id")
  update(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.ingredientsService.update(req.user.id, familyId, id, updateSchema.parse(body));
  }

  @Delete(":id")
  remove(@Req() req: AuthedRequest, @Query("familyId") familyId: string, @Param("id") id: string) {
    return this.ingredientsService.remove(req.user.id, familyId, id);
  }
}
