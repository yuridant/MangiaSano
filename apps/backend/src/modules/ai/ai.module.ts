import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FamiliesModule } from "../families/families.module";
import { RecipesModule } from "../recipes/recipes.module";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  imports: [ConfigModule, FamiliesModule, RecipesModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService]
})
export class AiModule {}
