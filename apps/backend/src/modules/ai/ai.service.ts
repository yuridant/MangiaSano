import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { encodingForModel } from "js-tiktoken";
import OpenAI from "openai";
import type { TiktokenModel } from "js-tiktoken/lite";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, mealSlotSchema, type MealSlot } from "../../common/meal-slots";
import { PrismaService } from "../../prisma/prisma.service";
import { FamiliesService } from "../families/families.service";

const nutritionTagSchema = z.enum(["carb", "protein", "fat", "vegetable"]);
const proteinSourceSchema = z.enum(["meat", "fish", "legume", "egg", "dairy", "plant_based", "other"]);
const aiMealItemSchema = z.object({
  recipeId: z.string().optional(),
  recipeName: z.string(),
  recipeDescription: z.string().optional(),
  nutritionTags: z.array(nutritionTagSchema).optional(),
  proteinSource: proteinSourceSchema.optional()
});

export const aiResponseSchema = z.object({
  weeklyPlan: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      mealSlot: mealSlotSchema,
      items: z.array(aiMealItemSchema).min(1)
    })
  ),
  newRecipes: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      mealTypes: z.array(mealSlotSchema).optional(),
      ingredients: z.array(z.string())
    })
  ),
  newIngredients: z.array(
    z.object({
      name: z.string(),
      category: z.string().optional()
    })
  )
});

export type AiResponse = z.infer<typeof aiResponseSchema>;
export type AiFeedbackRating = "excellent" | "acceptable" | "poor";

export interface AiGenerateResult {
  generationId: string | null;
  model: string;
  experimentVariant: "primary" | "secondary";
  experimentStrategy: OpenAiExperimentMode;
  correctionSummary: {
    correctionAttempts: number;
    corrected: boolean;
    reachedLimit: boolean;
    notes: string[];
  };
  validationIssues: {
    dayOfWeek?: number;
    mealSlot?: MealSlot;
    recipeName?: string;
    message: string;
    code: string;
  }[];
  result: AiResponse;
}

const DEFAULT_OPENAI_MODEL = "gpt-4o-2024-08-06";
const MODEL_PRICING_USD_PER_1M: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-4o-2024-08-06": {
    input: 2.5,
    cachedInput: 1.25,
    output: 10
  },
  "gpt-4o-mini": {
    input: 0.15,
    cachedInput: 0.075,
    output: 0.6
  },
  "gpt-4o-mini-2024-07-18": {
    input: 0.15,
    cachedInput: 0.075,
    output: 0.6
  }
};

interface PromptSectionBreakdown {
  name: string;
  chars: number;
  tokens: number;
}

interface RequestBreakdown {
  sections: PromptSectionBreakdown[];
  totals: { chars: number; tokens: number };
  counts: {
    requestedMeals: number;
    existingRecipes: number;
    existingIngredients: number;
  };
}

interface PromptContextRecipe {
  id: string;
  name: string;
  description?: string | null;
  mealTypes: MealSlot[];
  ingredients?: string[];
}

interface PromptContextIngredient {
  name: string;
  category?: string | null;
}

type OpenAiExperimentMode = "off" | "alternate" | "random";

interface UsageTotals {
  inputTokens: number | null;
  cachedInputTokens: number;
  outputTokens: number | null;
  totalTokens: number | null;
}

interface AiValidationIssue {
  code:
    | "slot_not_requested"
    | "slot_duplicate"
    | "slot_missing"
    | "meal_missing_items"
    | "meal_missing_nutrition"
    | "protein_source_missing"
    | "meat_limit_exceeded"
    | "meat_too_close"
    | "protein_variety_low"
    | "existing_recipe_incompatible_slot"
    | "unknown_recipe_id"
    | "new_recipe_missing"
    | "new_recipe_incompatible_slot";
  message: string;
  dayOfWeek?: number;
  mealSlot?: MealSlot;
  recipeName?: string;
}

interface AiCorrectionResolution {
  result: AiResponse;
  correctionAttempts: number;
  reachedLimit: boolean;
  issues: AiValidationIssue[];
  notes: string[];
  correctionUsages: UsageTotals[];
  lastResponseId: string;
}

interface ModelSelection {
  model: string;
  strategy: OpenAiExperimentMode;
  variant: "primary" | "secondary";
}

const MAX_AI_CORRECTION_ATTEMPTS = 3;
const MAX_PROMPT_INPUT_TOKENS = 18000;

const SYSTEM_PROMPT = `Sei un nutrizionista esperto. Il tuo obiettivo è creare piani alimentari settimanali equilibrati che riducano al minimo i picchi glicemici.

Principi guida:
- Preferisci carboidrati complessi (farro, orzo, legumi, verdure) rispetto a quelli semplici
- Abbina sempre proteine e fibre ai carboidrati per rallentare l'assorbimento
- Varia le fonti proteiche (legumi, pesce, carne magra, uova)
- Includi verdure ad ogni pasto principale
- Limita zuccheri semplici, pane bianco, riso raffinato
- Privilegia ingredienti di stagione, soprattutto frutta, verdura e prodotti freschi, così da favorire una spesa locale al mercato e ricette più fresche
- Rispetta rigorosamente il tipo di pasto: colazioni da colazione, spuntini leggeri e realistici da spuntino, pranzi e cene da pasto principale
- Per gli spuntini evita piatti da pranzo o cena come filetti, secondi completi, primi piatti, zuppe complete o portate strutturate`;

@Injectable()
export class AiService {
  private client: OpenAI | null = null;
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
    private readonly config: ConfigService
  ) {}

  async generate(
    userId: string,
    familyId: string,
    weekStart: string,
    slots: { dayOfWeek: number; mealSlot: MealSlot }[],
    goal: string
  ): Promise<AiGenerateResult> {
    await this.families.requireMembership(userId, familyId);
    const startedAt = Date.now();

    const [family, recipes, ingredients, modelSelection] = await Promise.all([
      this.prisma.family.findUniqueOrThrow({
        where: { id: familyId },
        select: {
          name: true,
          allergyNotes: true,
          intoleranceNotes: true,
          preferenceNotes: true
        }
      }),
      this.prisma.recipe.findMany({
        where: { familyId },
        include: {
          ingredients: { include: { ingredient: { select: { name: true } } } }
        }
      }),
      this.prisma.ingredient.findMany({ where: { familyId } }),
      this.selectModelForRequest(familyId)
    ]);
    const model = modelSelection.model;

    const dietaryProfile = {
      familyName: family.name,
      allergies: family.allergyNotes,
      intolerances: family.intoleranceNotes,
      preferences: family.preferenceNotes
    };

    const dayNames = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

    const slotsDescription = slots
      .map((slot) => `${dayNames[slot.dayOfWeek]} - ${MEAL_SLOT_LABELS[slot.mealSlot]}`)
      .join(", ");

    const compactContext = this.buildCompactPromptContext(model, recipes, ingredients, slots, {
      goal,
      dietaryProfile,
      slotsDescription
    });
    const promptSections = this.buildPromptSections({
      goal,
      existingRecipes: compactContext.existingRecipes,
      existingIngredients: compactContext.existingIngredients,
      dietaryProfile,
      slotsDescription,
      slots
    });
    const userMessage = [
      promptSections.goal,
      promptSections.existingRecipes,
      promptSections.existingIngredients,
      promptSections.dietaryProfile,
      promptSections.requestedSlots,
      promptSections.rules
    ].join("\n\n");
    const requestBreakdown = this.buildRequestBreakdown(model, {
      systemPrompt: SYSTEM_PROMPT,
      ...promptSections
    }, {
      requestedMeals: slots.length,
      existingRecipes: compactContext.existingRecipes.length,
      existingIngredients: compactContext.existingIngredients.length
    });

    try {
      const initialResponse = await this.getClient().responses.parse({
        model,
        instructions: SYSTEM_PROMPT,
        input: userMessage,
        text: {
          format: zodTextFormat(aiResponseSchema, "weekly_menu_plan")
        },
        temperature: 0.7
      });

      const parsed = initialResponse.output_parsed;
      if (!parsed) {
        throw new BadRequestException("L'AI non ha restituito un piano utilizzabile. Riprova.");
      }
      const validation = await this.resolveAiResponseWithCorrections({
        model,
        initialResponseId: initialResponse.id,
        initialResponse: parsed,
        existingRecipes: recipes.map((recipe) => ({ id: recipe.id, name: recipe.name, mealTypes: recipe.mealTypes })),
        requestedSlots: slots
      });
      const generationId = await this.logGeneration({
        userId,
        familyId,
        weekStart,
        model,
        strategy: modelSelection.strategy,
        variant: modelSelection.variant,
        requestedMealCount: slots.length,
        existingRecipeCount: compactContext.existingRecipes.length,
        existingIngredientCount: compactContext.existingIngredients.length,
        requestBreakdown,
        responseBreakdown: {
          weeklyPlanCount: validation.result.weeklyPlan.length,
          newRecipesCount: validation.result.newRecipes.length,
          newIngredientsCount: validation.result.newIngredients.length,
          correctionAttempts: validation.correctionAttempts,
          correctionUsage: this.buildUsageSummary(model, this.combineUsageTotals(...validation.correctionUsages))
        },
        usageTotals: this.combineUsageTotals(
          this.extractUsageTotals(initialResponse.usage),
          ...validation.correctionUsages
        ),
        success: true,
        latencyMs: Date.now() - startedAt,
        openaiResponseId: validation.lastResponseId
      });
      return {
        generationId,
        model,
        experimentVariant: modelSelection.variant,
        experimentStrategy: modelSelection.strategy,
        correctionSummary: {
          correctionAttempts: validation.correctionAttempts,
          corrected: validation.correctionAttempts > 0,
          reachedLimit: validation.reachedLimit,
          notes: validation.notes
        },
        validationIssues: validation.issues,
        result: validation.result
      };
    } catch (error) {
      await this.logGeneration({
        userId,
        familyId,
        weekStart,
        model,
        strategy: modelSelection.strategy,
        variant: modelSelection.variant,
        requestedMealCount: slots.length,
        existingRecipeCount: compactContext.existingRecipes.length,
        existingIngredientCount: compactContext.existingIngredients.length,
        requestBreakdown,
        success: false,
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : "Errore imprevisto"
      });

      if (error instanceof BadRequestException) throw error;

      this.logger.error(
        "AI generation failed",
        error instanceof Error ? error.stack : undefined
      );

      if (error instanceof OpenAI.RateLimitError) {
        const requestId = error.request_id ? ` Request ID OpenAI: ${error.request_id}.` : "";
        const isRequestTooLarge = error.message.toLowerCase().includes("request too large");
        if (isRequestTooLarge) {
          throw new HttpException(
            `La richiesta AI è troppo grande per il limite token del modello. Abbiamo già ridotto automaticamente il contesto, ma per questo tentativo serve ridurre ancora il volume di dati o gli slot richiesti.${requestId}`,
            HttpStatus.TOO_MANY_REQUESTS
          );
        }
        throw new HttpException(
          `OpenAI ha rifiutato la richiesta per quota o rate limit: ${error.message}.${requestId}`,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      if (error instanceof OpenAI.APIConnectionError) {
        throw new ServiceUnavailableException("Impossibile contattare il servizio AI in questo momento.");
      }
      if (error instanceof OpenAI.APIError) {
        const requestId = error.request_id ? ` Request ID OpenAI: ${error.request_id}.` : "";
        throw new BadGatewayException(`OpenAI ha rifiutato la richiesta: ${error.message}.${requestId}`);
      }
      if (error instanceof Error) {
        throw new BadGatewayException(`Errore durante la generazione AI: ${error.message}`);
      }

      throw new BadGatewayException("Errore imprevisto durante la generazione AI.");
    }
  }

  async applyGeneratedPlan(
    userId: string,
    familyId: string,
    weekStart: string,
    generationId: string | undefined,
    selectedSlots: { dayOfWeek: number; mealSlot: MealSlot }[],
    response: AiResponse
  ) {
    await this.families.requireMembership(userId, familyId);

    const normalizedSelectedSlots = this.normalizeSlots(selectedSlots);
    const requestedSlotKeys = new Set(
      normalizedSelectedSlots.map((slot) => this.getSlotKey(slot.dayOfWeek, slot.mealSlot))
    );
    const filteredPlan = response.weeklyPlan.filter((meal) =>
      requestedSlotKeys.has(this.getSlotKey(meal.dayOfWeek, meal.mealSlot))
    );

    const [existingRecipes, existingIngredients, generationLog] = await Promise.all([
      this.prisma.recipe.findMany({
        where: { familyId },
        select: { id: true, name: true, mealTypes: true }
      }),
      this.prisma.ingredient.findMany({
        where: { familyId },
        select: { id: true, name: true }
      }),
      generationId
        ? this.prisma.aiGenerationLog.findFirst({
            where: { id: generationId, userId, familyId },
            select: {
              id: true,
              model: true,
              openaiResponseId: true,
              inputTokens: true,
              cachedInputTokens: true,
              outputTokens: true,
              totalTokens: true,
              responseBreakdown: true
            }
          })
        : Promise.resolve(null)
    ]);

    let responseToApply: AiResponse = {
      ...response,
      weeklyPlan: filteredPlan
    };

    if (generationLog?.openaiResponseId) {
      const correctionResult = await this.resolveAiResponseWithCorrections({
        model: generationLog.model,
        initialResponseId: generationLog.openaiResponseId,
        initialResponse: responseToApply,
        existingRecipes,
        requestedSlots: normalizedSelectedSlots,
        requireCompleteCoverage: false,
        allowIncompatibleSlots: true,
        issueCodes: ["unknown_recipe_id", "new_recipe_missing", "slot_duplicate", "slot_not_requested"],
        includeCurrentResponseInPrompt: true
      });
      responseToApply = correctionResult.result;
      if (correctionResult.correctionAttempts > 0) {
        await this.updateGenerationLogAfterAdditionalCorrections(generationLog, correctionResult);
      }
    }

    const validation = this.inspectAiResponse(
      responseToApply,
      existingRecipes,
      normalizedSelectedSlots,
      { requireCompleteCoverage: false, allowIncompatibleSlots: true }
    );
    const hasOnlySaveRecoverableIssues =
      !validation.ok &&
      validation.issues.every((issue) => this.isSaveRecoverableIssue(issue.code));
    if (!validation.ok && !hasOnlySaveRecoverableIssues) {
      throw new BadRequestException(validation.issues[0]?.message ?? "La risposta AI non è valida.");
    }
    const normalizedResponse = validation.ok
      ? validation.result
      : {
          ...responseToApply,
          weeklyPlan: [...responseToApply.weeklyPlan].sort((a, b) => {
            if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
            return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
          })
        };

    const existingRecipesByName = new Map(
      existingRecipes.map((recipe) => [this.normalizeRecipeName(recipe.name), recipe])
    );
    const existingIngredientsByName = new Map(
      existingIngredients.map((ingredient) => [this.normalizeRecipeName(ingredient.name), ingredient])
    );

    const recipesToCreateByName = new Map(
      normalizedResponse.newRecipes.map((recipe) => [this.normalizeRecipeName(recipe.name), recipe])
    );
    const ingredientMetadataByName = new Map(
      normalizedResponse.newIngredients.map((ingredient) => [
        this.normalizeRecipeName(ingredient.name),
        ingredient
      ])
    );

    const usedNewRecipeNames = new Set(
      normalizedResponse.weeklyPlan.flatMap((meal) =>
        meal.items
          .filter((item) => !item.recipeId)
          .map((item) => this.normalizeRecipeName(item.recipeName))
      )
    );

    const usedIngredientNames = new Set<string>();
    const inferredMealTypesByRecipeName = new Map<string, Set<MealSlot>>();

    for (const meal of normalizedResponse.weeklyPlan) {
      for (const item of meal.items) {
        const normalizedRecipeName = this.normalizeRecipeName(item.recipeName);
        if (item.recipeId) continue;
        const slots = inferredMealTypesByRecipeName.get(normalizedRecipeName) ?? new Set<MealSlot>();
        slots.add(meal.mealSlot);
        inferredMealTypesByRecipeName.set(normalizedRecipeName, slots);
      }
    }

    const recipesToCreate = [...usedNewRecipeNames]
      .map((recipeName) => {
        const explicitRecipe = recipesToCreateByName.get(recipeName);
        if (explicitRecipe) return explicitRecipe;

        const matchingMealItem = normalizedResponse.weeklyPlan.flatMap((meal) =>
          meal.items.map((item) => ({
            mealSlot: meal.mealSlot,
            recipeName: item.recipeName,
            recipeDescription: item.recipeDescription
          }))
        ).find(
          (item) => this.normalizeRecipeName(item.recipeName) === recipeName
        );
        if (!matchingMealItem) return null;

        return {
          name: matchingMealItem.recipeName,
          description: matchingMealItem.recipeDescription,
          mealTypes: [...(inferredMealTypesByRecipeName.get(recipeName) ?? new Set<MealSlot>())],
          ingredients: []
        };
      })
      .filter((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe));

    for (const recipe of recipesToCreate) {
      for (const ingredientName of recipe.ingredients) {
        usedIngredientNames.add(this.normalizeRecipeName(ingredientName));
      }
    }

    const savedMenu = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ingredientIdsByName = new Map(
        [...existingIngredientsByName.entries()].map(([name, ingredient]) => [name, ingredient.id])
      );

      for (const ingredientName of usedIngredientNames) {
        if (ingredientIdsByName.has(ingredientName)) continue;

        const ingredientDetails = ingredientMetadataByName.get(ingredientName);
        const createdIngredient = await tx.ingredient.create({
          data: {
            name: ingredientDetails?.name.trim() ?? ingredientName,
            category: ingredientDetails?.category?.trim() || null,
            familyId,
            createdById: userId
          },
          select: { id: true, name: true }
        });
        ingredientIdsByName.set(this.normalizeRecipeName(createdIngredient.name), createdIngredient.id);
      }

      const recipeIdsByName = new Map(
        [...existingRecipesByName.entries()].map(([name, recipe]) => [name, recipe.id])
      );

      for (const recipe of recipesToCreate) {
        const normalizedRecipeName = this.normalizeRecipeName(recipe.name);
        if (recipeIdsByName.has(normalizedRecipeName)) continue;

        const ingredientIds = [...new Set(
          recipe.ingredients
            .map((ingredientName) => ingredientIdsByName.get(this.normalizeRecipeName(ingredientName)))
            .filter((value): value is string => Boolean(value))
        )];
        const inferredMealTypes = [...(inferredMealTypesByRecipeName.get(normalizedRecipeName) ?? new Set())];

        const createdRecipe = await tx.recipe.create({
          data: {
            name: recipe.name.trim(),
            description: recipe.description?.trim() || null,
            mealTypes: recipe.mealTypes?.length ? recipe.mealTypes : inferredMealTypes,
            familyId,
            createdById: userId,
            ingredients: {
              create: ingredientIds.map((ingredientId) => ({ ingredientId }))
            }
          },
          select: { id: true, name: true }
        });

        recipeIdsByName.set(this.normalizeRecipeName(createdRecipe.name), createdRecipe.id);
      }

      const date = this.parseWeekStart(weekStart);
      const menu = await tx.weeklyMenu.upsert({
        where: { weekStart_familyId: { weekStart: date, familyId } },
        create: { weekStart: date, familyId },
        update: {},
        select: { id: true }
      });

      const existingRecipeIds = new Set(existingRecipes.map((recipe) => recipe.id));
      const finalMeals: Array<{
        dayOfWeek: number;
        mealSlot: MealSlot;
        items: { recipeId: string; customName: null }[];
      }> = [];

      for (const meal of normalizedResponse.weeklyPlan) {
        const finalItems: { recipeId: string; customName: null }[] = [];

        for (const item of meal.items) {
          const normalizedRecipeName = this.normalizeRecipeName(item.recipeName);
          let recipeId =
            item.recipeId && existingRecipeIds.has(item.recipeId)
              ? item.recipeId
              : recipeIdsByName.get(normalizedRecipeName);

          if (!recipeId) {
            const inferredMealTypes = [
              ...(inferredMealTypesByRecipeName.get(normalizedRecipeName) ?? new Set<MealSlot>([meal.mealSlot]))
            ];
            const createdRecipe = await tx.recipe.create({
              data: {
                name: item.recipeName.trim(),
                description: item.recipeDescription?.trim() || null,
                mealTypes: inferredMealTypes.length > 0 ? inferredMealTypes : [meal.mealSlot],
                familyId,
                createdById: userId
              },
              select: { id: true, name: true }
            });
            recipeId = createdRecipe.id;
            recipeIdsByName.set(this.normalizeRecipeName(createdRecipe.name), createdRecipe.id);
          }

          finalItems.push({
            recipeId,
            customName: null
          });
        }

        finalMeals.push({
          dayOfWeek: meal.dayOfWeek,
          mealSlot: meal.mealSlot,
          items: finalItems
        });
      }

      const finalMealSlotKeys = new Set(
        finalMeals.map((meal) => this.getSlotKey(meal.dayOfWeek, meal.mealSlot))
      );

      const slotsToDelete = normalizedSelectedSlots
        .filter((slot) => !finalMealSlotKeys.has(this.getSlotKey(slot.dayOfWeek, slot.mealSlot)))
        .map((slot) => ({ dayOfWeek: slot.dayOfWeek, mealSlot: slot.mealSlot }));

      if (slotsToDelete.length > 0) {
        await tx.menuMeal.deleteMany({
          where: {
            weeklyMenuId: menu.id,
            OR: slotsToDelete
          }
        });
      }

      for (const meal of finalMeals) {
        const savedMeal = await tx.menuMeal.upsert({
          where: {
            weeklyMenuId_dayOfWeek_mealSlot: {
              weeklyMenuId: menu.id,
              dayOfWeek: meal.dayOfWeek,
              mealSlot: meal.mealSlot
            }
          },
          create: {
            weeklyMenuId: menu.id,
            dayOfWeek: meal.dayOfWeek,
            mealSlot: meal.mealSlot
          },
          update: {}
        });

        await tx.menuMealItem.deleteMany({ where: { menuMealId: savedMeal.id } });
        await tx.menuMealItem.createMany({
          data: meal.items.map((item, index) => ({
            menuMealId: savedMeal.id,
            recipeId: item.recipeId,
            customName: item.customName,
            sortOrder: index
          }))
        });
      }

      return tx.weeklyMenu.findUnique({
        where: { id: menu.id },
        include: {
          meals: {
            include: {
              items: {
                include: {
                  recipe: {
                    include: {
                      ingredients: {
                        include: { ingredient: { select: { id: true, name: true, category: true } } }
                      }
                    }
                  }
                },
                orderBy: { sortOrder: "asc" }
              }
            }
          }
        }
      });
    });

    if (generationId) {
      await this.prisma.aiGenerationLog.updateMany({
        where: { id: generationId, userId, familyId },
        data: {
          savedToMenuAt: new Date()
        }
      });
    }

    return savedMenu;
  }

  async saveGenerationFeedback(
    userId: string,
    familyId: string,
    generationId: string,
    rating: AiFeedbackRating
  ) {
    await this.families.requireMembership(userId, familyId);

    await this.prisma.aiGenerationLog.updateMany({
      where: { id: generationId, userId, familyId },
      data: {
        feedbackRating: rating,
        feedbackAt: new Date()
      }
    });

    return { ok: true };
  }

  private getClient() {
    if (this.client) return this.client;

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new BadRequestException("OPENAI_API_KEY non configurata.");

    this.client = new OpenAI({ apiKey, maxRetries: 0 });
    return this.client;
  }

  private getBaseModelConfig() {
    const primaryModel =
      this.config.get<string>("OPENAI_MODEL_PRIMARY") ??
      this.config.get<string>("OPENAI_MODEL") ??
      DEFAULT_OPENAI_MODEL;
    const secondaryModel = this.config.get<string>("OPENAI_MODEL_SECONDARY") ?? "gpt-4o-mini";
    const experimentMode = this.config.get<OpenAiExperimentMode>("OPENAI_EXPERIMENT_MODE") ?? "off";

    return {
      experimentMode,
      primaryModel,
      secondaryModel
    };
  }

  async getModelConfigForFamily(familyId?: string) {
    const baseConfig = this.getBaseModelConfig();
    if (!familyId) return baseConfig;

    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { aiExperimentMode: true }
    });

    return {
      ...baseConfig,
      experimentMode: family?.aiExperimentMode ?? baseConfig.experimentMode
    };
  }

  private async selectModelForRequest(familyId: string): Promise<ModelSelection> {
    const { experimentMode, primaryModel, secondaryModel } = await this.getModelConfigForFamily(familyId);

    if (experimentMode === "off" || primaryModel === secondaryModel) {
      return {
        model: primaryModel,
        strategy: experimentMode,
        variant: "primary"
      };
    }

    if (experimentMode === "random") {
      const useSecondary = Math.random() >= 0.5;
      return {
        model: useSecondary ? secondaryModel : primaryModel,
        strategy: experimentMode,
        variant: useSecondary ? "secondary" : "primary"
      };
    }

    const previousRequests = await this.prisma.aiGenerationLog.count({
      where: { familyId }
    });
    const useSecondary = previousRequests % 2 === 1;

    return {
      model: useSecondary ? secondaryModel : primaryModel,
      strategy: experimentMode,
      variant: useSecondary ? "secondary" : "primary"
    };
  }

  private buildRequestBreakdown(
    model: string,
    sections: Record<string, string>,
    counts: RequestBreakdown["counts"]
  ): RequestBreakdown {
    const encoder = this.getTokenizer(model);
    const breakdownSections = Object.entries(sections).map(([name, value]) => ({
      name,
      chars: value.length,
      tokens: encoder.encode(value).length
    }));
    const totals = breakdownSections.reduce(
      (acc, section) => ({
        chars: acc.chars + section.chars,
        tokens: acc.tokens + section.tokens
      }),
      { chars: 0, tokens: 0 }
    );

    return {
      sections: breakdownSections,
      totals,
      counts
    };
  }

  private getTokenizer(model: string) {
    try {
      return encodingForModel(model as TiktokenModel);
    } catch {
      return encodingForModel("gpt-4o");
    }
  }

  private buildCompactPromptContext(
    model: string,
    recipes: Array<{
      id: string;
      name: string;
      description: string | null;
      mealTypes: MealSlot[];
      updatedAt: Date;
      ingredients: { ingredient: { name: string } }[];
    }>,
    ingredients: Array<{ name: string; category: string | null }>,
    slots: { dayOfWeek: number; mealSlot: MealSlot }[],
    meta: {
      goal: string;
      dietaryProfile: { familyName: string; allergies: string | null; intolerances: string | null; preferences: string | null };
      slotsDescription: string;
    }
  ) {
    const requestedMealTypes = new Set(slots.map((slot) => slot.mealSlot));
    const rankedRecipes = [...recipes]
      .filter((recipe) => recipe.mealTypes.length === 0 || recipe.mealTypes.some((type) => requestedMealTypes.has(type)))
      .sort((a, b) => {
        const aMatches = a.mealTypes.filter((type) => requestedMealTypes.has(type)).length;
        const bMatches = b.mealTypes.filter((type) => requestedMealTypes.has(type)).length;
        if (aMatches !== bMatches) return bMatches - aMatches;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    const fallbackRecipes = [...recipes]
      .filter((recipe) => !rankedRecipes.some((candidate) => candidate.id === recipe.id))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const orderedRecipes = [...rankedRecipes, ...fallbackRecipes];
    const sortedIngredients = [...ingredients].sort((a, b) => a.name.localeCompare(b.name, "it"));

    const strategies: Array<{
      recipeLimit: number;
      ingredientLimit: number;
      includeDescription: boolean;
      ingredientNamesPerRecipe: number;
    }> = [
      { recipeLimit: 160, ingredientLimit: 250, includeDescription: false, ingredientNamesPerRecipe: 5 },
      { recipeLimit: 120, ingredientLimit: 180, includeDescription: false, ingredientNamesPerRecipe: 4 },
      { recipeLimit: 80, ingredientLimit: 120, includeDescription: false, ingredientNamesPerRecipe: 3 },
      { recipeLimit: 50, ingredientLimit: 80, includeDescription: false, ingredientNamesPerRecipe: 2 },
      { recipeLimit: 30, ingredientLimit: 50, includeDescription: false, ingredientNamesPerRecipe: 0 }
    ];

    let chosenContext = {
      existingRecipes: [] as PromptContextRecipe[],
      existingIngredients: [] as PromptContextIngredient[]
    };

    for (const strategy of strategies) {
      const candidateContext = {
        existingRecipes: orderedRecipes.slice(0, strategy.recipeLimit).map((recipe) => {
          const compactRecipe: PromptContextRecipe = {
            id: recipe.id,
            name: recipe.name,
            mealTypes: recipe.mealTypes
          };
          if (strategy.includeDescription && recipe.description) {
            compactRecipe.description = recipe.description;
          }
          if (strategy.ingredientNamesPerRecipe > 0) {
            compactRecipe.ingredients = [...recipe.ingredients]
              .map((recipeIngredient) => recipeIngredient.ingredient.name)
              .sort((a, b) => a.localeCompare(b, "it"))
              .slice(0, strategy.ingredientNamesPerRecipe);
          }
          return compactRecipe;
        }),
        existingIngredients: sortedIngredients.slice(0, strategy.ingredientLimit).map((ingredient) => ({
          name: ingredient.name,
          category: ingredient.category
        }))
      };

      const candidateSections = this.buildPromptSections({
        goal: meta.goal,
        existingRecipes: candidateContext.existingRecipes,
        existingIngredients: candidateContext.existingIngredients,
        dietaryProfile: meta.dietaryProfile,
        slotsDescription: meta.slotsDescription,
        slots
      });
      const candidateBreakdown = this.buildRequestBreakdown(model, {
        systemPrompt: SYSTEM_PROMPT,
        ...candidateSections
      }, {
        requestedMeals: slots.length,
        existingRecipes: candidateContext.existingRecipes.length,
        existingIngredients: candidateContext.existingIngredients.length
      });

      chosenContext = candidateContext;
      if (candidateBreakdown.totals.tokens <= MAX_PROMPT_INPUT_TOKENS) {
        break;
      }
    }

    return chosenContext;
  }

  private buildPromptSections(params: {
    goal: string;
    existingRecipes: PromptContextRecipe[];
    existingIngredients: PromptContextIngredient[];
    dietaryProfile: { familyName: string; allergies: string | null; intolerances: string | null; preferences: string | null };
    slotsDescription: string;
    slots: { dayOfWeek: number; mealSlot: MealSlot }[];
  }) {
    return {
      goal: `Obiettivo nutrizionale: ${params.goal}`,
      existingRecipes: `Ricette già presenti nell'app (usa queste quando possibile, riportando il loro id e rispettando SEMPRE i loro mealTypes quando presenti):\n${JSON.stringify(params.existingRecipes)}`,
      existingIngredients: `Ingredienti già presenti nell'app:\n${JSON.stringify(params.existingIngredients)}`,
      dietaryProfile: `Profilo alimentare della famiglia da rispettare SEMPRE:\n${JSON.stringify(params.dietaryProfile)}`,
      requestedSlots: `Genera un piano per questi slot: ${params.slotsDescription}\nSlot richiesti in formato strutturato:\n${JSON.stringify(params.slots)}`,
      rules: `Includi in newRecipes solo le ricette che non esistono già. Includi in newIngredients solo gli ingredienti non già presenti.
Ogni elemento di weeklyPlan deve corrispondere a uno e un solo slot richiesto, senza duplicati e senza slot extra.
Ogni slot di weeklyPlan deve avere un array items con una o più componenti del pasto.
Ogni item deve avere recipeName; recipeId va compilato solo se corrisponde a una ricetta esistente in existingRecipes.
Se usi una ricetta esistente compila recipeId con un id presente in existingRecipes e non assegnarla mai a uno slot incompatibile con i suoi mealTypes.
Se proponi una ricetta nuova lascia recipeId assente e inseriscila anche in newRecipes con lo stesso recipeName.
Per ogni nuova ricetta compila mealTypes in modo coerente con gli slot in cui la usi.
Per ogni item valorizza nutritionTags scegliendo tra carb, protein, fat, vegetable quando applicabile.
Quando un item contiene proteine valorizza anche proteinSource scegliendo tra meat, fish, legume, egg, dairy, plant_based, other.
Per pranzi e cene ogni slot deve essere nutrizionalmente completo: o un piatto unico bilanciato che copre carboidrati, proteine e grassi buoni, oppure più componenti separate che nel complesso coprono carboidrati, proteine e grassi buoni. Le verdure sono fortemente raccomandate.
Varia molto le fonti proteiche nell'arco della settimana.
Evita la carne in più di 3 pasti principali a settimana.
Distribuisci gli eventuali pasti con carne lungo la settimana, evitando pasti con carne troppo ravvicinati e soprattutto evitando di concentrare la carne in giorni consecutivi o nello stesso giorno quando esistono alternative valide.
Non fondere artificialmente ricette diverse in una sola ricetta se nella realtà sono due portate separate dello stesso pasto.
Gli spuntini mattutini e pomeridiani devono essere davvero spuntini leggeri, veloci e plausibili: frutta, yogurt, frutta secca, smoothie, cracker, hummus, piccoli snack simili.
Non proporre ingredienti o ricette in conflitto con allergie, intolleranze o preferenze indicate.
Descrivi ingredienti e ricette nuove in modo realistico e riutilizzabile nell'app.
Prima di rispondere, verifica internamente che il piano copra tutti gli slot richiesti.`
    };
  }

  private async logGeneration(params: {
    userId: string;
    familyId: string;
    weekStart: string;
    model: string;
    strategy: OpenAiExperimentMode;
    variant: "primary" | "secondary";
    requestedMealCount: number;
    existingRecipeCount: number;
    existingIngredientCount: number;
    requestBreakdown: RequestBreakdown;
    responseBreakdown?: Record<string, unknown>;
    usageTotals?: UsageTotals;
    success: boolean;
    latencyMs: number;
    openaiResponseId?: string;
    errorMessage?: string;
  }): Promise<string | null> {
    try {
      const pricing = this.getPricingForModel(params.model);
      const inputTokens = params.usageTotals?.inputTokens ?? null;
      const cachedInputTokens = params.usageTotals?.cachedInputTokens ?? 0;
      const outputTokens = params.usageTotals?.outputTokens ?? null;
      const billableInputTokens = inputTokens === null ? null : Math.max(inputTokens - cachedInputTokens, 0);
      const estimatedInputCostUsd =
        billableInputTokens === null
          ? null
          : Number((((billableInputTokens / 1_000_000) * pricing.input) + ((cachedInputTokens / 1_000_000) * pricing.cachedInput)).toFixed(6));
      const estimatedOutputCostUsd =
        outputTokens === null ? null : Number((((outputTokens / 1_000_000) * pricing.output)).toFixed(6));
      const estimatedTotalCostUsd =
        estimatedInputCostUsd === null || estimatedOutputCostUsd === null
          ? null
          : Number((estimatedInputCostUsd + estimatedOutputCostUsd).toFixed(6));

      const createdLog = await this.prisma.aiGenerationLog.create({
        data: {
          userId: params.userId,
          familyId: params.familyId,
          weekStart: this.parseWeekStart(params.weekStart),
          model: params.model,
          success: params.success,
          requestedMealCount: params.requestedMealCount,
          existingRecipeCount: params.existingRecipeCount,
          existingIngredientCount: params.existingIngredientCount,
          inputTokens,
          cachedInputTokens,
          outputTokens,
          totalTokens: params.usageTotals?.totalTokens ?? null,
          estimatedInputCostUsd,
          estimatedOutputCostUsd,
          estimatedTotalCostUsd,
          latencyMs: params.latencyMs,
          openaiResponseId: params.openaiResponseId,
          errorMessage: params.errorMessage,
          requestBreakdown: {
            ...(params.requestBreakdown as unknown as Record<string, unknown>),
            experiment: {
              strategy: params.strategy,
              variant: params.variant
            }
          } as Prisma.InputJsonValue,
          responseBreakdown: params.responseBreakdown
            ? (params.responseBreakdown as unknown as Prisma.InputJsonValue)
            : undefined
        },
        select: { id: true }
      });
      return createdLog.id;
    } catch (loggingError) {
      this.logger.warn(
        `Impossibile salvare il log AI: ${
          loggingError instanceof Error ? loggingError.message : "errore sconosciuto"
        }`
      );
      return null;
    }
  }

  private buildUsageSummary(model: string, usageTotals: UsageTotals) {
    const pricing = this.getPricingForModel(model);
    const inputTokens = usageTotals.inputTokens ?? 0;
    const cachedInputTokens = usageTotals.cachedInputTokens ?? 0;
    const outputTokens = usageTotals.outputTokens ?? 0;
    const billableInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
    const estimatedInputCostUsd = Number(
      (((billableInputTokens / 1_000_000) * pricing.input) + ((cachedInputTokens / 1_000_000) * pricing.cachedInput)).toFixed(6)
    );
    const estimatedOutputCostUsd = Number((((outputTokens / 1_000_000) * pricing.output)).toFixed(6));
    return {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens: usageTotals.totalTokens ?? 0,
      estimatedInputCostUsd,
      estimatedOutputCostUsd,
      estimatedTotalCostUsd: Number((estimatedInputCostUsd + estimatedOutputCostUsd).toFixed(6))
    };
  }

  private getPricingForModel(model: string) {
    const configuredInput = this.config.get<number>("OPENAI_PRICE_INPUT_PER_1M");
    const configuredCachedInput = this.config.get<number>("OPENAI_PRICE_CACHED_INPUT_PER_1M");
    const configuredOutput = this.config.get<number>("OPENAI_PRICE_OUTPUT_PER_1M");

    if (configuredInput && configuredCachedInput && configuredOutput) {
      return {
        input: configuredInput,
        cachedInput: configuredCachedInput,
        output: configuredOutput
      };
    }

    return MODEL_PRICING_USD_PER_1M[model] ?? MODEL_PRICING_USD_PER_1M[DEFAULT_OPENAI_MODEL];
  }

  private validateAiResponse(
    response: AiResponse,
    existingRecipes: { id: string; name: string; mealTypes: MealSlot[] }[],
    requestedSlots: { dayOfWeek: number; mealSlot: MealSlot }[],
    options: { requireCompleteCoverage: boolean; allowIncompatibleSlots?: boolean }
  ) {
    const validation = this.inspectAiResponse(response, existingRecipes, requestedSlots, options);
    if (!validation.ok) {
      throw new BadRequestException(validation.issues[0]?.message ?? "La risposta AI non è valida.");
    }
    return validation.result;
  }

  private inspectAiResponse(
    response: AiResponse,
    existingRecipes: { id: string; name: string; mealTypes: MealSlot[] }[],
    requestedSlots: { dayOfWeek: number; mealSlot: MealSlot }[],
    options: { requireCompleteCoverage: boolean; allowIncompatibleSlots?: boolean }
  ): { ok: true; result: AiResponse } | { ok: false; issues: AiValidationIssue[] } {
    const requestedSlotKeys = new Set(requestedSlots.map((slot) => this.getSlotKey(slot.dayOfWeek, slot.mealSlot)));
    const returnedSlotKeys = new Set<string>();
    const existingRecipeIdsSet = new Set(existingRecipes.map((recipe) => recipe.id));
    const existingRecipesByName = new Map(
      existingRecipes.map((recipe) => [this.normalizeRecipeName(recipe.name), recipe])
    );
    const newRecipeNames = new Set(
      response.newRecipes.map((recipe) => this.normalizeRecipeName(recipe.name))
    );
    const normalizedWeeklyPlan = response.weeklyPlan.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => ({ ...item }))
    }));
    const issues: AiValidationIssue[] = [];
    const mainMealProteinSources: { dayOfWeek: number; mealSlot: MealSlot; sources: Set<string> }[] = [];
    const meatMeals: { dayOfWeek: number; mealSlot: MealSlot }[] = [];

    for (const meal of normalizedWeeklyPlan) {
      const slotKey = this.getSlotKey(meal.dayOfWeek, meal.mealSlot);
      if (!requestedSlotKeys.has(slotKey)) {
        issues.push({
          code: "slot_not_requested",
          message: `La risposta AI contiene uno slot non richiesto: ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)}.`,
          dayOfWeek: meal.dayOfWeek,
          mealSlot: meal.mealSlot
        });
        continue;
      }
      if (returnedSlotKeys.has(slotKey)) {
        issues.push({
          code: "slot_duplicate",
          message: `La risposta AI contiene uno slot duplicato: ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)}.`,
          dayOfWeek: meal.dayOfWeek,
          mealSlot: meal.mealSlot
        });
        continue;
      }
      returnedSlotKeys.add(slotKey);

      if (meal.items.length === 0) {
        issues.push({
          code: "meal_missing_items",
          message: `Lo slot ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)} non contiene alcuna componente.`,
          dayOfWeek: meal.dayOfWeek,
          mealSlot: meal.mealSlot
        });
        continue;
      }

      for (const item of meal.items) {
        const normalizedRecipeName = this.normalizeRecipeName(item.recipeName);
        const matchedExistingRecipe = existingRecipesByName.get(normalizedRecipeName);

        if (item.recipeId) {
          if (existingRecipeIdsSet.has(item.recipeId)) {
            const exactRecipe = existingRecipes.find((recipe) => recipe.id === item.recipeId);
            if (exactRecipe && exactRecipe.mealTypes.length > 0 && !exactRecipe.mealTypes.includes(meal.mealSlot)) {
              if (!options.allowIncompatibleSlots) {
                issues.push({
                  code: "existing_recipe_incompatible_slot",
                  message: `La ricetta "${exactRecipe.name}" non è compatibile con ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)}.`,
                  dayOfWeek: meal.dayOfWeek,
                  mealSlot: meal.mealSlot,
                  recipeName: exactRecipe.name
                });
              }
            }
            item.recipeName = exactRecipe?.name ?? item.recipeName;
            continue;
          }

          if (matchedExistingRecipe) {
            if (
              matchedExistingRecipe.mealTypes.length > 0 &&
              !matchedExistingRecipe.mealTypes.includes(meal.mealSlot)
            ) {
              if (!options.allowIncompatibleSlots) {
                issues.push({
                  code: "existing_recipe_incompatible_slot",
                  message: `La ricetta "${matchedExistingRecipe.name}" non è compatibile con ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)}.`,
                  dayOfWeek: meal.dayOfWeek,
                  mealSlot: meal.mealSlot,
                  recipeName: matchedExistingRecipe.name
                });
                continue;
              }
            }
            item.recipeId = matchedExistingRecipe.id;
            item.recipeName = matchedExistingRecipe.name;
            continue;
          }

          if (newRecipeNames.has(normalizedRecipeName)) {
            delete item.recipeId;
            continue;
          }

          issues.push({
            code: "unknown_recipe_id",
            message: `La risposta AI contiene un recipeId non risolvibile per "${item.recipeName}" in ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)}.`,
            dayOfWeek: meal.dayOfWeek,
            mealSlot: meal.mealSlot,
            recipeName: item.recipeName
          });
          continue;
        }

        if (matchedExistingRecipe) {
          if (
            matchedExistingRecipe.mealTypes.length > 0 &&
            !matchedExistingRecipe.mealTypes.includes(meal.mealSlot)
          ) {
            if (!options.allowIncompatibleSlots) {
              issues.push({
                code: "existing_recipe_incompatible_slot",
                message: `La ricetta "${matchedExistingRecipe.name}" non è compatibile con ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)}.`,
                dayOfWeek: meal.dayOfWeek,
                mealSlot: meal.mealSlot,
                recipeName: matchedExistingRecipe.name
              });
            }
          }
          item.recipeId = matchedExistingRecipe.id;
          item.recipeName = matchedExistingRecipe.name;
          continue;
        }

        if (!newRecipeNames.has(normalizedRecipeName)) {
          issues.push({
            code: "new_recipe_missing",
            message: `La nuova ricetta "${item.recipeName}" usata in ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)} non è presente in newRecipes.`,
            dayOfWeek: meal.dayOfWeek,
            mealSlot: meal.mealSlot,
            recipeName: item.recipeName
          });
          continue;
        }

        const matchingNewRecipe = response.newRecipes.find(
          (recipe) => this.normalizeRecipeName(recipe.name) === normalizedRecipeName
        );
        if (
          matchingNewRecipe?.mealTypes?.length &&
          !matchingNewRecipe.mealTypes.includes(meal.mealSlot)
        ) {
          if (!options.allowIncompatibleSlots) {
            issues.push({
              code: "new_recipe_incompatible_slot",
              message: `La nuova ricetta "${matchingNewRecipe.name}" non è compatibile con ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)}.`,
              dayOfWeek: meal.dayOfWeek,
              mealSlot: meal.mealSlot,
              recipeName: matchingNewRecipe.name
            });
          }
        }
      }

      if (this.requiresCompleteMainMeal(meal.mealSlot)) {
        const nutritionTags = new Set(
          meal.items.flatMap((item) => item.nutritionTags ?? [])
        );
        const proteinItems = meal.items.filter((item) => item.nutritionTags?.includes("protein"));
        const proteinSources = new Set(
          proteinItems
            .map((item) => item.proteinSource)
            .filter((value): value is z.infer<typeof proteinSourceSchema> => Boolean(value))
        );

        if (nutritionTags.size === 0) {
          issues.push({
            code: "meal_missing_nutrition",
            message: `Lo slot ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)} non specifica carboidrati, proteine e grassi nelle componenti del pasto.`,
            dayOfWeek: meal.dayOfWeek,
            mealSlot: meal.mealSlot
          });
        } else if (
          !nutritionTags.has("carb") ||
          !nutritionTags.has("protein") ||
          !nutritionTags.has("fat")
        ) {
          issues.push({
            code: "meal_missing_nutrition",
            message: `Lo slot ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)} non risulta completo: servono carboidrati, proteine e grassi buoni tra le componenti proposte.`,
            dayOfWeek: meal.dayOfWeek,
            mealSlot: meal.mealSlot
          });
        }

        if (proteinItems.length > 0 && proteinSources.size === 0) {
          issues.push({
            code: "protein_source_missing",
            message: `Lo slot ${this.describeSlot(meal.dayOfWeek, meal.mealSlot)} include proteine ma non specifica la fonte proteica con proteinSource.`,
            dayOfWeek: meal.dayOfWeek,
            mealSlot: meal.mealSlot
          });
        }

        if (proteinSources.size > 0) {
          mainMealProteinSources.push({
            dayOfWeek: meal.dayOfWeek,
            mealSlot: meal.mealSlot,
            sources: proteinSources
          });
        }
        if (proteinSources.has("meat")) {
          meatMeals.push({ dayOfWeek: meal.dayOfWeek, mealSlot: meal.mealSlot });
        }
      }
    }

    if (meatMeals.length > 3) {
      const offendingMeal = meatMeals[3];
      issues.push({
        code: "meat_limit_exceeded",
        message: `La carne compare in più di 3 pasti principali nella settimana selezionata. Riducila e varia con pesce, legumi, uova o fonti vegetali.`,
        dayOfWeek: offendingMeal.dayOfWeek,
        mealSlot: offendingMeal.mealSlot
      });
    }

    const sortedMeatMeals = [...meatMeals].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
    });
    for (let index = 1; index < sortedMeatMeals.length; index += 1) {
      const previousMeal = sortedMeatMeals[index - 1];
      const currentMeal = sortedMeatMeals[index];
      if (currentMeal.dayOfWeek - previousMeal.dayOfWeek <= 1) {
        issues.push({
          code: "meat_too_close",
          message: `I pasti con carne sono troppo ravvicinati tra ${this.describeSlot(previousMeal.dayOfWeek, previousMeal.mealSlot)} e ${this.describeSlot(currentMeal.dayOfWeek, currentMeal.mealSlot)}. Distribuiscili meglio nella settimana.`,
          dayOfWeek: currentMeal.dayOfWeek,
          mealSlot: currentMeal.mealSlot
        });
      }
    }

    const distinctProteinSources = new Set(
      mainMealProteinSources.flatMap((meal) => [...meal.sources].filter((source) => source !== "other"))
    );
    if (mainMealProteinSources.length >= 4 && distinctProteinSources.size < 2) {
      const targetMeal = mainMealProteinSources[mainMealProteinSources.length - 1];
      issues.push({
        code: "protein_variety_low",
        message: "Le fonti proteiche risultano poco varie nella settimana selezionata. Alterna di più tra legumi, pesce, uova, latticini e fonti vegetali, limitando la carne.",
        dayOfWeek: targetMeal.dayOfWeek,
        mealSlot: targetMeal.mealSlot
      });
    }

    if (options.requireCompleteCoverage && returnedSlotKeys.size !== requestedSlotKeys.size) {
      for (const slot of requestedSlots) {
        const slotKey = this.getSlotKey(slot.dayOfWeek, slot.mealSlot);
        if (!returnedSlotKeys.has(slotKey)) {
          issues.push({
            code: "slot_missing",
            message: `La risposta AI non copre lo slot richiesto ${this.describeSlot(slot.dayOfWeek, slot.mealSlot)}.`,
            dayOfWeek: slot.dayOfWeek,
            mealSlot: slot.mealSlot
          });
        }
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    return {
      ok: true,
      result: {
        ...response,
        weeklyPlan: normalizedWeeklyPlan.sort((a, b) => {
          if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
          return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
        })
      }
    };
  }

  private async resolveAiResponseWithCorrections(params: {
    model: string;
    initialResponseId: string;
    initialResponse: AiResponse;
    existingRecipes: { id: string; name: string; mealTypes: MealSlot[] }[];
    requestedSlots: { dayOfWeek: number; mealSlot: MealSlot }[];
    requireCompleteCoverage?: boolean;
    allowIncompatibleSlots?: boolean;
    issueCodes?: AiValidationIssue["code"][];
    includeCurrentResponseInPrompt?: boolean;
  }): Promise<AiCorrectionResolution> {
    let currentResponse = params.initialResponse;
    let previousResponseId = params.initialResponseId;
    let correctionAttempts = 0;
    const notes: string[] = [];
    const correctionUsages: UsageTotals[] = [];
    const requireCompleteCoverage = params.requireCompleteCoverage ?? true;
    const allowIncompatibleSlots = params.allowIncompatibleSlots ?? false;

    while (correctionAttempts <= MAX_AI_CORRECTION_ATTEMPTS) {
      const validation = this.inspectAiResponse(
        currentResponse,
        params.existingRecipes,
        params.requestedSlots,
        { requireCompleteCoverage, allowIncompatibleSlots }
      );

      if (validation.ok) {
        return {
          result: validation.result,
          correctionAttempts,
          reachedLimit: false,
          issues: [],
          notes,
          correctionUsages,
          lastResponseId: previousResponseId
        };
      }

      const issuesToCorrect = params.issueCodes?.length
        ? validation.issues.filter((issue) => params.issueCodes!.includes(issue.code))
        : validation.issues;

      if (issuesToCorrect.length === 0) {
        return {
          result: currentResponse,
          correctionAttempts,
          reachedLimit: false,
          issues: validation.issues,
          notes,
          correctionUsages,
          lastResponseId: previousResponseId
        };
      }

      if (correctionAttempts === MAX_AI_CORRECTION_ATTEMPTS) {
        notes.push(
          `Limite di correzioni raggiunto: restano ${issuesToCorrect.length} criticità da controllare manualmente.`
        );
        return {
          result: currentResponse,
          correctionAttempts,
          reachedLimit: true,
          issues: issuesToCorrect,
          notes,
          correctionUsages,
          lastResponseId: previousResponseId
        };
      }

      correctionAttempts += 1;
      const issueSummary = this.summarizeIssuesForUser(issuesToCorrect);
      notes.push(`Correzione automatica ${correctionAttempts}: ${issueSummary}`);

      const followUpResponse = await this.getClient().responses.parse({
        model: params.model,
        previous_response_id: previousResponseId,
        input: this.buildCorrectionPrompt(issuesToCorrect, currentResponse, {
          requireCompleteCoverage,
          includeCurrentResponseInPrompt: params.includeCurrentResponseInPrompt ?? true
        }),
        text: {
          format: zodTextFormat(aiResponseSchema, "weekly_menu_plan")
        },
        temperature: 0.4
      });
      const parsed = followUpResponse.output_parsed;
      if (!parsed) {
        throw new BadRequestException("L'AI non ha restituito un piano correggibile dopo una revisione.");
      }

      previousResponseId = followUpResponse.id;
      correctionUsages.push(this.extractUsageTotals(followUpResponse.usage));
      currentResponse = this.mergeAiResponses(currentResponse, parsed);
    }

    throw new BadRequestException("L'AI non è riuscita a correggere il piano.");
  }

  private buildCorrectionPrompt(
    issues: AiValidationIssue[],
    currentResponse: AiResponse,
    options: { requireCompleteCoverage: boolean; includeCurrentResponseInPrompt: boolean }
  ) {
    const uniqueLines = [...new Set(issues.map((issue) => {
      switch (issue.code) {
        case "existing_recipe_incompatible_slot":
        case "new_recipe_incompatible_slot":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: la ricetta "${issue.recipeName}" non è adatta a questo tipo di pasto. Sostituiscila con una proposta compatibile.`;
        case "slot_missing":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: manca nel piano. Aggiungi uno slot valido.`;
        case "slot_duplicate":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: compare più di una volta. Mantieni una sola proposta valida.`;
        case "slot_not_requested":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: non era stato richiesto. Rimuovilo dal piano finale.`;
        case "meal_missing_items":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: lo slot deve contenere almeno una componente nel campo items.`;
        case "meal_missing_nutrition":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: il pasto principale deve risultare completo con carboidrati, proteine e grassi buoni, distribuiti tra una o più componenti e dichiarati con nutritionTags.`;
        case "protein_source_missing":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: se un item contiene proteine devi valorizzare anche proteinSource.`;
        case "meat_limit_exceeded":
          return "- La carne compare in troppi pasti principali: riducila ad al massimo 3 pasti nella settimana e sostituisci gli eccessi con altre fonti proteiche.";
        case "meat_too_close":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: i pasti con carne sono troppo ravvicinati. Redistribuisci la carne nella settimana lasciando più distanza tra un'occasione e l'altra.`;
        case "protein_variety_low":
          return "- Le fonti proteiche sono poco varie: alterna maggiormente pesce, legumi, uova, latticini e fonti vegetali, limitando la carne.";
        case "unknown_recipe_id":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: il recipeId di "${issue.recipeName}" non è valido. Usa una ricetta esistente corretta oppure trattala come nuova ricetta coerente.`;
        case "new_recipe_missing":
          return `- ${this.describeSlot(issue.dayOfWeek!, issue.mealSlot!)}: "${issue.recipeName}" è usata nel piano ma manca in newRecipes. Aggiungila correttamente oppure sostituiscila.`;
      }
    }))];

    return [
      "La tua risposta precedente non rispetta alcuni vincoli del piano settimanale.",
      "Mantieni il formato structured output identico e conserva gli slot già validi quando possibile.",
      options.includeCurrentResponseInPrompt
        ? `Questa è la versione strutturata corrente da correggere e completare senza perdere i dati già validi:\n${JSON.stringify(currentResponse)}`
        : "",
      "Correggi solo i problemi seguenti:",
      uniqueLines.join("\n"),
      options.requireCompleteCoverage
        ? "Ricontrolla internamente che ogni slot richiesto compaia una sola volta e che i mealTypes siano compatibili con il tipo di pasto."
        : "Restituisci un oggetto strutturato completo e coerente con il piano corrente, correggendo i riferimenti alle ricette e mantenendo invariati gli slot già validi."
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private summarizeIssuesForUser(issues: AiValidationIssue[]) {
    if (issues.length === 1) return issues[0].message;
    return `${issues.length} problemi rilevati: ${issues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join(" | ")}${issues.length > 3 ? " | ..." : ""}`;
  }

  private describeSlot(dayOfWeek: number, mealSlot: MealSlot) {
    const dayNames = ["Lunedi", "Martedi", "Mercoledi", "Giovedi", "Venerdi", "Sabato", "Domenica"];
    return `${dayNames[dayOfWeek]} - ${MEAL_SLOT_LABELS[mealSlot]}`;
  }

  private extractUsageTotals(usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number } | null;
  } | null | undefined): UsageTotals {
    return {
      inputTokens: usage?.input_tokens ?? null,
      cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null
    };
  }

  private combineUsageTotals(...totals: UsageTotals[]): UsageTotals {
    return totals.reduce<UsageTotals>(
      (acc, current) => ({
        inputTokens: (acc.inputTokens ?? 0) + (current.inputTokens ?? 0),
        cachedInputTokens: acc.cachedInputTokens + current.cachedInputTokens,
        outputTokens: (acc.outputTokens ?? 0) + (current.outputTokens ?? 0),
        totalTokens: (acc.totalTokens ?? 0) + (current.totalTokens ?? 0)
      }),
      {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }
    );
  }

  private getSlotKey(dayOfWeek: number, mealSlot: MealSlot) {
    return `${dayOfWeek}-${mealSlot}`;
  }

  private requiresCompleteMainMeal(mealSlot: MealSlot) {
    return mealSlot === "lunch" || mealSlot === "dinner";
  }

  private normalizeSlots(slots: { dayOfWeek: number; mealSlot: MealSlot }[]) {
    return [...slots]
      .filter(
        (slot, index, items) =>
          items.findIndex(
            (candidate) => candidate.dayOfWeek === slot.dayOfWeek && candidate.mealSlot === slot.mealSlot
          ) === index
      )
      .sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
      });
  }

  private normalizeRecipeName(name: string) {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
  }

  private mergeAiResponses(base: AiResponse, patch: AiResponse): AiResponse {
    const weeklyPlanBySlot = new Map(
      base.weeklyPlan.map((meal) => [this.getSlotKey(meal.dayOfWeek, meal.mealSlot), meal])
    );
    for (const meal of patch.weeklyPlan) {
      weeklyPlanBySlot.set(this.getSlotKey(meal.dayOfWeek, meal.mealSlot), meal);
    }

    const newRecipesByName = new Map(
      base.newRecipes.map((recipe) => [this.normalizeRecipeName(recipe.name), recipe])
    );
    for (const recipe of patch.newRecipes) {
      newRecipesByName.set(this.normalizeRecipeName(recipe.name), recipe);
    }

    const newIngredientsByName = new Map(
      base.newIngredients.map((ingredient) => [this.normalizeRecipeName(ingredient.name), ingredient])
    );
    for (const ingredient of patch.newIngredients) {
      newIngredientsByName.set(this.normalizeRecipeName(ingredient.name), ingredient);
    }

    return {
      weeklyPlan: [...weeklyPlanBySlot.values()],
      newRecipes: [...newRecipesByName.values()],
      newIngredients: [...newIngredientsByName.values()]
    };
  }

  private isSaveRecoverableIssue(code: AiValidationIssue["code"]) {
    return code === "unknown_recipe_id" || code === "new_recipe_missing";
  }

  private async updateGenerationLogAfterAdditionalCorrections(
    generationLog: {
      id: string;
      model: string;
      inputTokens: number | null;
      cachedInputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
      responseBreakdown: Prisma.JsonValue | null;
    },
    correctionResult: AiCorrectionResolution
  ) {
    const extraUsage = this.combineUsageTotals(...correctionResult.correctionUsages);
    if ((extraUsage.totalTokens ?? 0) === 0) return;

    const pricing = this.getPricingForModel(generationLog.model);
    const inputTokens = (generationLog.inputTokens ?? 0) + (extraUsage.inputTokens ?? 0);
    const cachedInputTokens = (generationLog.cachedInputTokens ?? 0) + extraUsage.cachedInputTokens;
    const outputTokens = (generationLog.outputTokens ?? 0) + (extraUsage.outputTokens ?? 0);
    const totalTokens = (generationLog.totalTokens ?? 0) + (extraUsage.totalTokens ?? 0);
    const billableInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
    const estimatedInputCostUsd = Number(
      ((((billableInputTokens / 1_000_000) * pricing.input) + ((cachedInputTokens / 1_000_000) * pricing.cachedInput))).toFixed(6)
    );
    const estimatedOutputCostUsd = Number((((outputTokens / 1_000_000) * pricing.output)).toFixed(6));
    const previousBreakdown =
      generationLog.responseBreakdown && typeof generationLog.responseBreakdown === "object" && !Array.isArray(generationLog.responseBreakdown)
        ? (generationLog.responseBreakdown as Record<string, unknown>)
        : {};

    await this.prisma.aiGenerationLog.update({
      where: { id: generationLog.id },
      data: {
        openaiResponseId: correctionResult.lastResponseId,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        totalTokens,
        estimatedInputCostUsd,
        estimatedOutputCostUsd,
        estimatedTotalCostUsd: Number((estimatedInputCostUsd + estimatedOutputCostUsd).toFixed(6)),
        responseBreakdown: {
          ...previousBreakdown,
          savePhaseCorrectionAttempts: correctionResult.correctionAttempts,
          savePhaseCorrectionUsage: this.buildUsageSummary(generationLog.model, extraUsage),
          savePhaseCorrectionNotes: correctionResult.notes
        } as Prisma.InputJsonValue
      }
    });
  }

  private parseWeekStart(weekStart: string) {
    const date = new Date(weekStart);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
