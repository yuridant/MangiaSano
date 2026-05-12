CREATE TABLE IF NOT EXISTS "MenuMealItem" (
    "id" TEXT NOT NULL,
    "menuMealId" TEXT NOT NULL,
    "recipeId" TEXT,
    "customName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuMealItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MenuMealItem_menuMealId_sortOrder_idx" ON "MenuMealItem"("menuMealId", "sortOrder");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'MenuMealItem_menuMealId_fkey'
    ) THEN
        ALTER TABLE "MenuMealItem"
        ADD CONSTRAINT "MenuMealItem_menuMealId_fkey"
        FOREIGN KEY ("menuMealId") REFERENCES "MenuMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'MenuMealItem_recipeId_fkey'
    ) THEN
        ALTER TABLE "MenuMealItem"
        ADD CONSTRAINT "MenuMealItem_recipeId_fkey"
        FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'MenuMeal' AND column_name = 'recipeId'
    ) OR EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'MenuMeal' AND column_name = 'customName'
    ) THEN
        INSERT INTO "MenuMealItem" ("id", "menuMealId", "recipeId", "customName", "sortOrder")
        SELECT
            CONCAT('mmi_', mm."id"),
            mm."id",
            mm."recipeId",
            mm."customName",
            0
        FROM "MenuMeal" mm
        WHERE (mm."recipeId" IS NOT NULL OR mm."customName" IS NOT NULL)
          AND NOT EXISTS (
              SELECT 1
              FROM "MenuMealItem" existing
              WHERE existing."menuMealId" = mm."id"
          );
    END IF;
END $$;

ALTER TABLE "MenuMeal" DROP COLUMN IF EXISTS "recipeId";
ALTER TABLE "MenuMeal" DROP COLUMN IF EXISTS "customName";
