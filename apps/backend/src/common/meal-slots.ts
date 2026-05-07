import { z } from "zod";

export const MEAL_SLOTS = [
  "breakfast",
  "snack_morning",
  "lunch",
  "snack_afternoon",
  "dinner"
] as const;

export const mealSlotSchema = z.enum(MEAL_SLOTS);

export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Colazione",
  snack_morning: "Spuntino mattutino",
  lunch: "Pranzo",
  snack_afternoon: "Spuntino pomeridiano",
  dinner: "Cena"
};

export const MEAL_SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  snack_morning: 1,
  lunch: 2,
  snack_afternoon: 3,
  dinner: 4
};
