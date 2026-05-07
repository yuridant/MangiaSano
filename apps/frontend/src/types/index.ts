export type MealSlot =
  | "breakfast"
  | "snack_morning"
  | "lunch"
  | "snack_afternoon"
  | "dinner";
export type MembershipRole = "owner" | "member";

export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface Family {
  id: string;
  name: string;
  role: MembershipRole;
  memberCount: number;
  allergyNotes?: string | null;
  intoleranceNotes?: string | null;
  preferenceNotes?: string | null;
}

export interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  familyId: string;
  createdAt: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  ingredient: { id: string; name: string; category: string | null };
}

export interface Recipe {
  id: string;
  name: string;
  description: string | null;
  mealTypes: MealSlot[];
  familyId: string;
  createdAt: string;
  updatedAt: string;
  ingredients: RecipeIngredient[];
}

export interface MenuMeal {
  id: string;
  dayOfWeek: number;
  mealSlot: MealSlot;
  recipeId: string | null;
  customName: string | null;
  recipe: Recipe | null;
}

export interface WeeklyMenu {
  id: string;
  weekStart: string;
  familyId: string;
  meals: MenuMeal[];
}

export interface ShoppingItem {
  id: string;
  checked: boolean;
  name: string;
  category: string | null;
  ingredientId: string | null;
}

export interface ShoppingList {
  id: string;
  weeklyMenuId: string;
  items: ShoppingItem[];
}

export interface FamilyMember {
  id: string;
  name: string | null;
  email: string;
  role: MembershipRole;
  joinedAt: string;
}

export interface FamilyInvitation {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: string;
}

export interface FamilyDetail {
  id: string;
  name: string;
  allergyNotes: string | null;
  intoleranceNotes: string | null;
  preferenceNotes: string | null;
  members: FamilyMember[];
  pendingInvitations: FamilyInvitation[];
}

export interface AiMealPlan {
  dayOfWeek: number;
  mealSlot: MealSlot;
  recipeId?: string;
  recipeName: string;
  recipeDescription?: string;
}

export interface AiResponse {
  weeklyPlan: AiMealPlan[];
  newRecipes: { name: string; description?: string; mealTypes?: MealSlot[]; ingredients: string[] }[];
  newIngredients: { name: string; category?: string }[];
}

export interface AnalyticsSummary {
  overview: {
    totalMenus: number;
    totalRecipes: number;
    totalIngredients: number;
    totalMealsPlanned: number;
    averageMealsPerMenu: number;
    completionRate: number;
  };
  topRecipes: { recipeId: string; name: string; count: number }[];
  topIngredients: { ingredientId: string; name: string; count: number }[];
  mealSlotDistribution: { mealSlot: MealSlot; count: number }[];
  weeklyCoverage: { weekStart: string; mealCount: number; completionRate: number }[];
  aiUsage: {
    totalRequests: number;
    successfulRequests: number;
    averageCostUsd: number;
    totalEstimatedCostUsd: number;
    averageInputTokens: number;
    averageOutputTokens: number;
    averageRequestedMeals: number;
    averageCostPerMealUsd: number;
    modelBreakdown: {
      model: string;
      requests: number;
      averageCostUsd: number;
      averageInputTokens: number;
      averageOutputTokens: number;
    }[];
    sectionAverages: {
      name: string;
      averageTokens: number;
      averageChars: number;
    }[];
    recentRequests: {
      id: string;
      createdAt: string;
      model: string;
      success: boolean;
      requestedMealCount: number;
      existingRecipeCount: number;
      existingIngredientCount: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedTotalCostUsd: number;
      latencyMs: number;
      requestBreakdown: unknown;
      errorMessage: string | null;
    }[];
  };
}

export const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
export const DAYS_FULL = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"] as const;
export const SLOTS: MealSlot[] = [
  "breakfast",
  "snack_morning",
  "lunch",
  "snack_afternoon",
  "dinner"
];
export const SLOT_LABELS: Record<MealSlot, string> = {
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
