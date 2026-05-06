import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../../common/guards/auth.guard";
import { AnalyticsService } from "./analytics.service";

type AuthedRequest = { user: { id: string } };

@Controller("analytics")
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  getSummary(@Req() req: AuthedRequest, @Query("familyId") familyId: string) {
    return this.analyticsService.getSummary(req.user.id, familyId);
  }
}
