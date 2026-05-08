import { Body, Controller, Get, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../../common/guards/auth.guard";
import { AnalyticsService } from "./analytics.service";

type AuthedRequest = { user: { id: string } };
const updateExperimentSchema = z.object({
  mode: z.enum(["off", "alternate", "random"])
});

@Controller("analytics")
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  getSummary(@Req() req: AuthedRequest, @Query("familyId") familyId: string) {
    return this.analyticsService.getSummary(req.user.id, familyId);
  }

  @Patch("experiment")
  updateExperiment(@Req() req: AuthedRequest, @Query("familyId") familyId: string, @Body() body: unknown) {
    const { mode } = updateExperimentSchema.parse(body);
    return this.analyticsService.updateExperimentMode(req.user.id, familyId, mode);
  }
}
