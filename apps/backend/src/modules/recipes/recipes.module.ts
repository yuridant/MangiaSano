import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FamiliesModule } from "../families/families.module";
import { RecipesController } from "./recipes.controller";
import { RecipeSemanticsService } from "./recipe-semantics.service";
import { RecipesService } from "./recipes.service";

@Module({
  imports: [ConfigModule, FamiliesModule],
  controllers: [RecipesController],
  providers: [RecipesService, RecipeSemanticsService],
  exports: [RecipesService, RecipeSemanticsService]
})
export class RecipesModule {}
