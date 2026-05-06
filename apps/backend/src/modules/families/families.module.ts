import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FamiliesController } from "./families.controller";
import { FamiliesService } from "./families.service";

@Module({
  imports: [ConfigModule],
  controllers: [FamiliesController],
  providers: [FamiliesService],
  exports: [FamiliesService]
})
export class FamiliesModule {}
