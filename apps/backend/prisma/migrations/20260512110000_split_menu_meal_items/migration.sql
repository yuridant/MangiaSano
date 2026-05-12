CREATE TABLE "MenuMealItem" (
    "id" TEXT NOT NULL,
    "menuMealId" TEXT NOT NULL,
    "recipeId" TEXT,
    "customName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuMealItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MenuMealItem_menuMealId_sortOrder_idx" ON "MenuMealItem"("menuMealId", "sortOrder");

ALTER TABLE "MenuMealItem" ADD CONSTRAINT "MenuMealItem_menuMealId_fkey" FOREIGN KEY ("menuMealId") REFERENCES "MenuMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuMealItem" ADD CONSTRAINT "MenuMealItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "MenuMealItem" ("id", "menuMealId", "recipeId", "customName", "sortOrder")
SELECT
    CONCAT('mmi_', "id"),
    "id",
    "recipeId",
    "customName",
    0
FROM "MenuMeal"
WHERE "recipeId" IS NOT NULL OR "customName" IS NOT NULL;

ALTER TABLE "MenuMeal" DROP COLUMN "recipeId";
ALTER TABLE "MenuMeal" DROP COLUMN "customName";
