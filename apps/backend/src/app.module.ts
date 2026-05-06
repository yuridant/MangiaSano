import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { FamiliesModule } from "./modules/families/families.module";
import { IngredientsModule } from "./modules/ingredients/ingredients.module";
import { RecipesModule } from "./modules/recipes/recipes.module";
import { MenusModule } from "./modules/menus/menus.module";
import { ShoppingModule } from "./modules/shopping/shopping.module";
import { AiModule } from "./modules/ai/ai.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
      validate: (config) => envSchema.parse(config)
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    FamiliesModule,
    IngredientsModule,
    RecipesModule,
    MenusModule,
    ShoppingModule,
    AiModule,
    AnalyticsModule
  ]
})
export class AppModule {}
