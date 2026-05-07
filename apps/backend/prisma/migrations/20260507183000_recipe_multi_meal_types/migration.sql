ALTER TABLE "Recipe"
ADD COLUMN "mealTypes" "MealSlot"[] DEFAULT ARRAY[]::"MealSlot"[];

UPDATE "Recipe"
SET "mealTypes" = CASE
  WHEN "mealType" IS NULL THEN ARRAY[]::"MealSlot"[]
  ELSE ARRAY["mealType"]
END;

ALTER TABLE "Recipe"
ALTER COLUMN "mealTypes" SET NOT NULL;

ALTER TABLE "Recipe"
DROP COLUMN "mealType";
