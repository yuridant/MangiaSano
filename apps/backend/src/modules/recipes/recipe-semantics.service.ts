import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { PrismaService } from "../../prisma/prisma.service";
import type { MealSlot } from "../../common/meal-slots";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 32;

interface RecipeEmbeddingSource {
  id: string;
  name: string;
  description: string | null;
  mealTypes: MealSlot[];
  ingredients: { ingredient: { name: string; category: string | null } }[];
  semanticText?: string | null;
  embeddingVector?: number[];
}

@Injectable()
export class RecipeSemanticsService {
  private client: OpenAI | null = null;
  private readonly logger = new Logger(RecipeSemanticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async ensureRecipeEmbeddings(recipes: RecipeEmbeddingSource[]) {
    const model = this.getEmbeddingModel();
    const staleRecipes = recipes
      .map((recipe) => ({
        recipe,
        semanticText: this.buildRecipeSemanticText(recipe)
      }))
      .filter(({ recipe, semanticText }) =>
        !recipe.embeddingVector ||
        recipe.embeddingVector.length === 0 ||
        recipe.semanticText !== semanticText
      );

    if (staleRecipes.length === 0) {
      return new Map(recipes.map((recipe) => [recipe.id, recipe.embeddingVector ?? []]));
    }

    for (let index = 0; index < staleRecipes.length; index += EMBEDDING_BATCH_SIZE) {
      const batch = staleRecipes.slice(index, index + EMBEDDING_BATCH_SIZE);
      const response = await this.getClient().embeddings.create({
        model,
        input: batch.map((entry) => entry.semanticText)
      });

      await Promise.all(
        batch.map((entry, offset) =>
          this.prisma.recipe.update({
            where: { id: entry.recipe.id },
            data: {
              semanticText: entry.semanticText,
              embeddingModel: model,
              embeddingVector: response.data[offset]?.embedding ?? [],
              embeddingUpdatedAt: new Date()
            }
          })
        )
      );
    }

    const refreshedRecipes = await this.prisma.recipe.findMany({
      where: { id: { in: recipes.map((recipe) => recipe.id) } },
      select: { id: true, embeddingVector: true }
    });

    return new Map(refreshedRecipes.map((recipe) => [recipe.id, recipe.embeddingVector]));
  }

  async syncRecipeEmbedding(recipeId: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        ingredients: {
          include: { ingredient: { select: { name: true, category: true } } }
        }
      }
    });
    if (!recipe) return;
    await this.ensureRecipeEmbeddings([recipe]);
  }

  async syncRecipeEmbeddings(recipeIds: string[]) {
    const uniqueRecipeIds = [...new Set(recipeIds)];
    if (uniqueRecipeIds.length === 0) return;
    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: uniqueRecipeIds } },
      include: {
        ingredients: {
          include: { ingredient: { select: { name: true, category: true } } }
        }
      }
    });
    if (recipes.length === 0) return;
    await this.ensureRecipeEmbeddings(recipes);
  }

  async embedQuery(texts: string[]) {
    if (texts.length === 0) return [];
    const response = await this.getClient().embeddings.create({
      model: this.getEmbeddingModel(),
      input: texts
    });
    return response.data.map((item) => item.embedding);
  }

  buildRecipeSemanticText(recipe: {
    name: string;
    description: string | null;
    mealTypes: MealSlot[];
    ingredients: { ingredient: { name: string; category: string | null } }[];
  }) {
    const ingredientSummary = recipe.ingredients
      .map((item) => item.ingredient.name)
      .sort((a, b) => a.localeCompare(b, "it"))
      .join(", ");

    return [
      `Nome: ${recipe.name}`,
      recipe.description ? `Descrizione: ${recipe.description}` : "",
      recipe.mealTypes.length > 0 ? `Pasti: ${recipe.mealTypes.join(", ")}` : "",
      ingredientSummary ? `Ingredienti: ${ingredientSummary}` : ""
    ]
      .filter(Boolean)
      .join("\n");
  }

  cosineSimilarity(a: number[], b: number[]) {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let index = 0; index < a.length; index += 1) {
      dot += a[index] * b[index];
      normA += a[index] * a[index];
      normB += b[index] * b[index];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private getEmbeddingModel() {
    return this.config.get<string>("OPENAI_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
  }

  private getClient() {
    if (this.client) return this.client;

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY non configurata.");
    }

    this.client = new OpenAI({ apiKey, maxRetries: 0 });
    return this.client;
  }
}
