import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FamiliesModule } from "../families/families.module";
import { IngredientsController } from "./ingredients.controller";
import { IngredientsService } from "./ingredients.service";

@Module({
  imports: [ConfigModule, FamiliesModule],
  controllers: [IngredientsController],
  providers: [IngredientsService],
  exports: [IngredientsService]
})
export class IngredientsModule {}
