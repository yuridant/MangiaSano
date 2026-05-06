import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FamiliesModule } from "../families/families.module";
import { MenusController } from "./menus.controller";
import { MenusService } from "./menus.service";

@Module({
  imports: [ConfigModule, FamiliesModule],
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService]
})
export class MenusModule {}
