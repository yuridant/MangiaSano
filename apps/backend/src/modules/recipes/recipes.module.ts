import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FamiliesModule } from "../families/families.module";
import { RecipesController } from "./recipes.controller";
import { RecipesService } from "./recipes.service";

@Module({
  imports: [ConfigModule, FamiliesModule],
  controllers: [RecipesController],
  providers: [RecipesService],
  exports: [RecipesService]
})
export class RecipesModule {}
