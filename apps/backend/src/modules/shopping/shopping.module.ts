import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FamiliesModule } from "../families/families.module";
import { ShoppingController } from "./shopping.controller";
import { ShoppingService } from "./shopping.service";

@Module({
  imports: [ConfigModule, FamiliesModule],
  controllers: [ShoppingController],
  providers: [ShoppingService],
  exports: [ShoppingService]
})
export class ShoppingModule {}
