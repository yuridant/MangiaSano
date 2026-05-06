export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
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
  mealType: MealSlot | null;
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
  newRecipes: { name: string; description?: string; mealType?: MealSlot; ingredients: string[] }[];
  newIngredients: { name: string; category?: string }[];
}

export interface AnalyticsSummary {
  topRecipes: { recipeId: string; name: string; count: number }[];
  topIngredients: { ingredientId: string; name: string; count: number }[];
  mealSlotDistribution: { mealSlot: MealSlot; count: number }[];
  totalMenus: number;
}

export const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
export const DAYS_FULL = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"] as const;
export const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  dinner: "Cena",
  snack: "Spuntino"
};
