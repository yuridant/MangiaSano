import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FamiliesModule } from "../families/families.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [ConfigModule, FamiliesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService]
})
export class AnalyticsModule {}
