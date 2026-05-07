import { Body, Controller, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../../common/guards/auth.guard";
import { mealSlotSchema } from "../../common/meal-slots";
import { AiService } from "./ai.service";

const generateSchema = z.object({
  slots: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      mealSlot: mealSlotSchema
    })
  ),
  goal: z.string().default("Piano equilibrato con riduzione picchi glicemici")
});

type AuthedRequest = { user: { id: string } };

@Controller("ai")
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("generate")
  generate(@Req() req: AuthedRequest, @Query("familyId") familyId: string, @Body() body: unknown) {
    const { slots, goal } = generateSchema.parse(body);
    return this.aiService.generate(req.user.id, familyId, slots, goal);
  }
}
