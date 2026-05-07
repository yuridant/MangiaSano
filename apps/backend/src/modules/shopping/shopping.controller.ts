import { Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../../common/guards/auth.guard";
import { ShoppingService } from "./shopping.service";

type AuthedRequest = { user: { id: string } };

@Controller("shopping")
@UseGuards(AuthGuard)
export class ShoppingController {
  constructor(private readonly shoppingService: ShoppingService) {}

  @Get(":weekStart")
  getOrGenerateList(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("weekStart") weekStart: string
  ) {
    return this.shoppingService.getOrGenerateList(req.user.id, familyId, weekStart);
  }

  @Patch(":listId/items/:itemId/toggle")
  toggleItem(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("listId") listId: string,
    @Param("itemId") itemId: string
  ) {
    return this.shoppingService.toggleItem(req.user.id, familyId, listId, itemId);
  }

  @Post(":listId/reset")
  resetList(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("listId") listId: string
  ) {
    return this.shoppingService.resetList(req.user.id, familyId, listId);
  }

  @Post(":weekStart/regenerate")
  regenerateList(
    @Req() req: AuthedRequest,
    @Query("familyId") familyId: string,
    @Param("weekStart") weekStart: string
  ) {
    return this.shoppingService.regenerateList(req.user.id, familyId, weekStart);
  }
}
