import { Body, Controller, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../../common/guards/auth.guard";
import { mealSlotSchema } from "../../common/meal-slots";
import { AiService } from "./ai.service";
import { aiResponseSchema } from "./ai.service";

const generateSchema = z.object({
  weekStart: z.string().min(1),
  slots: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      mealSlot: mealSlotSchema
    })
  ),
  goal: z.string().default("Piano equilibrato con riduzione picchi glicemici")
});

const applySchema = z.object({
  weekStart: z.string().min(1),
  generationId: z.string().optional(),
  selectedSlots: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      mealSlot: mealSlotSchema
    })
  ),
  aiResult: aiResponseSchema.extend({
    weeklyPlan: aiResponseSchema.shape.weeklyPlan
  })
});

const feedbackSchema = z.object({
  generationId: z.string().min(1),
  rating: z.enum(["excellent", "acceptable", "poor"])
});

type AuthedRequest = { user: { id: string } };

@Controller("ai")
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("generate")
  generate(@Req() req: AuthedRequest, @Query("familyId") familyId: string, @Body() body: unknown) {
    const { weekStart, slots, goal } = generateSchema.parse(body);
    return this.aiService.generate(req.user.id, familyId, weekStart, slots, goal);
  }

  @Post("apply")
  apply(@Req() req: AuthedRequest, @Query("familyId") familyId: string, @Body() body: unknown) {
    const { weekStart, generationId, selectedSlots, aiResult } = applySchema.parse(body);
    return this.aiService.applyGeneratedPlan(req.user.id, familyId, weekStart, generationId, selectedSlots, aiResult);
  }

  @Post("feedback")
  feedback(@Req() req: AuthedRequest, @Query("familyId") familyId: string, @Body() body: unknown) {
    const { generationId, rating } = feedbackSchema.parse(body);
    return this.aiService.saveGenerationFeedback(req.user.id, familyId, generationId, rating);
  }
}
