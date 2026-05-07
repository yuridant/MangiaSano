CREATE TYPE "MealSlot_new" AS ENUM (
  'breakfast',
  'snack_morning',
  'lunch',
  'snack_afternoon',
  'dinner'
);

ALTER TABLE "Recipe"
ALTER COLUMN "mealType" TYPE "MealSlot_new"
USING (
  CASE
    WHEN "mealType"::text = 'snack' THEN 'snack_afternoon'
    ELSE "mealType"::text
  END
)::"MealSlot_new";

ALTER TABLE "MenuMeal"
ALTER COLUMN "mealSlot" TYPE "MealSlot_new"
USING (
  CASE
    WHEN "mealSlot"::text = 'snack' THEN 'snack_afternoon'
    ELSE "mealSlot"::text
  END
)::"MealSlot_new";

ALTER TYPE "MealSlot" RENAME TO "MealSlot_old";
ALTER TYPE "MealSlot_new" RENAME TO "MealSlot";
DROP TYPE "MealSlot_old";
