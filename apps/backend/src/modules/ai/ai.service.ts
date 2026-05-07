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
import type { ResponseUsage } from "openai/resources/responses/responses";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, mealSlotSchema, type MealSlot } from "../../common/meal-slots";
import { PrismaService } from "../../prisma/prisma.service";
import { FamiliesService } from "../families/families.service";

export const aiResponseSchema = z.object({
  weeklyPlan: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      mealSlot: mealSlotSchema,
      recipeId: z.string().optional(),
      recipeName: z.string(),
      recipeDescription: z.string().optional()
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

type OpenAiExperimentMode = "off" | "alternate" | "random";

interface ModelSelection {
  model: string;
  strategy: OpenAiExperimentMode;
  variant: "primary" | "secondary";
}

const SYSTEM_PROMPT = `Sei un nutrizionista esperto. Il tuo obiettivo è creare piani alimentari settimanali equilibrati che riducano al minimo i picchi glicemici.

Principi guida:
- Preferisci carboidrati complessi (farro, orzo, legumi, verdure) rispetto a quelli semplici
- Abbina sempre proteine e fibre ai carboidrati per rallentare l'assorbimento
- Varia le fonti proteiche (legumi, pesce, carne magra, uova)
- Includi verdure ad ogni pasto principale
- Limita zuccheri semplici, pane bianco, riso raffinato
- Privilegia ingredienti di stagione, soprattutto frutta, verdura e prodotti freschi, così da favorire una spesa locale al mercato e ricette più fresche`;

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
    slots: { dayOfWeek: number; mealSlot: MealSlot }[],
    goal: string
  ): Promise<AiResponse> {
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

    const context = {
      existingRecipes: [...recipes]
        .sort((a, b) => a.name.localeCompare(b.name, "it"))
        .map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        mealTypes: recipe.mealTypes,
        ingredients: [...recipe.ingredients]
          .map((recipeIngredient) => recipeIngredient.ingredient.name)
          .sort((a, b) => a.localeCompare(b, "it"))
      })),
      existingIngredients: [...ingredients]
        .sort((a, b) => a.name.localeCompare(b.name, "it"))
        .map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        category: ingredient.category
      }))
    };
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

    const promptSections = {
      goal: `Obiettivo nutrizionale: ${goal}`,
      existingRecipes: `Ricette già presenti nell'app (usa queste quando possibile, riportando il loro id):\n${JSON.stringify(context.existingRecipes)}`,
      existingIngredients: `Ingredienti già presenti nell'app:\n${JSON.stringify(context.existingIngredients)}`,
      dietaryProfile: `Profilo alimentare della famiglia da rispettare SEMPRE:\n${JSON.stringify(dietaryProfile)}`,
      requestedSlots: `Genera un piano per questi slot: ${slotsDescription}\nSlot richiesti in formato strutturato:\n${JSON.stringify(slots)}`,
      rules: `Includi in newRecipes solo le ricette che non esistono già. Includi in newIngredients solo gli ingredienti non già presenti.
Ogni elemento di weeklyPlan deve corrispondere a uno e un solo slot richiesto, senza duplicati e senza slot extra.
Se usi una ricetta esistente compila recipeId con un id presente in existingRecipes.
Se proponi una ricetta nuova lascia recipeId assente e inseriscila anche in newRecipes con lo stesso recipeName.
Non proporre ingredienti o ricette in conflitto con allergie, intolleranze o preferenze indicate.
Descrivi ingredienti e ricette nuove in modo realistico e riutilizzabile nell'app.
Prima di rispondere, verifica internamente che il piano copra tutti gli slot richiesti.`
    };
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
      existingRecipes: context.existingRecipes.length,
      existingIngredients: context.existingIngredients.length
    });

    try {
      const response = await this.getClient().responses.parse({
        model,
        instructions: SYSTEM_PROMPT,
        input: userMessage,
        text: {
          format: zodTextFormat(aiResponseSchema, "weekly_menu_plan")
        },
        temperature: 0.7
      });

      const parsed = response.output_parsed;
      if (!parsed) {
        throw new BadRequestException("L'AI non ha restituito un piano utilizzabile. Riprova.");
      }
      const validated = this.validateAiResponse(
        parsed,
        recipes.map((recipe) => ({ id: recipe.id, name: recipe.name })),
        slots,
        { requireCompleteCoverage: true }
      );
      await this.logGeneration({
        userId,
        familyId,
        model,
        strategy: modelSelection.strategy,
        variant: modelSelection.variant,
        requestedMealCount: slots.length,
        existingRecipeCount: context.existingRecipes.length,
        existingIngredientCount: context.existingIngredients.length,
        requestBreakdown,
        responseBreakdown: {
          weeklyPlanCount: validated.weeklyPlan.length,
          newRecipesCount: validated.newRecipes.length,
          newIngredientsCount: validated.newIngredients.length
        },
        usage: response.usage,
        success: true,
        latencyMs: Date.now() - startedAt,
        openaiResponseId: response.id
      });
      return validated;
    } catch (error) {
      await this.logGeneration({
        userId,
        familyId,
        model,
        strategy: modelSelection.strategy,
        variant: modelSelection.variant,
        requestedMealCount: slots.length,
        existingRecipeCount: context.existingRecipes.length,
        existingIngredientCount: context.existingIngredients.length,
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

    const [existingRecipes, existingIngredients] = await Promise.all([
      this.prisma.recipe.findMany({
        where: { familyId },
        select: { id: true, name: true }
      }),
      this.prisma.ingredient.findMany({
        where: { familyId },
        select: { id: true, name: true }
      })
    ]);

    const normalizedResponse = this.validateAiResponse(
      {
        ...response,
        weeklyPlan: filteredPlan
      },
      existingRecipes,
      normalizedSelectedSlots,
      { requireCompleteCoverage: false }
    );

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
      normalizedResponse.weeklyPlan
        .filter((meal) => !meal.recipeId)
        .map((meal) => this.normalizeRecipeName(meal.recipeName))
    );

    const recipesToCreate = [...usedNewRecipeNames]
      .map((recipeName) => recipesToCreateByName.get(recipeName))
      .filter((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe));

    const usedIngredientNames = new Set<string>();
    const inferredMealTypesByRecipeName = new Map<string, Set<MealSlot>>();

    for (const meal of normalizedResponse.weeklyPlan) {
      const normalizedRecipeName = this.normalizeRecipeName(meal.recipeName);
      if (meal.recipeId) continue;
      const slots = inferredMealTypesByRecipeName.get(normalizedRecipeName) ?? new Set<MealSlot>();
      slots.add(meal.mealSlot);
      inferredMealTypesByRecipeName.set(normalizedRecipeName, slots);
    }

    for (const recipe of recipesToCreate) {
      for (const ingredientName of recipe.ingredients) {
        usedIngredientNames.add(this.normalizeRecipeName(ingredientName));
      }
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      const finalMeals = normalizedResponse.weeklyPlan.map((meal) => {
        const recipeId =
          meal.recipeId ?? recipeIdsByName.get(this.normalizeRecipeName(meal.recipeName));

        if (!recipeId) {
          throw new BadRequestException(`Impossibile risolvere la ricetta "${meal.recipeName}" per il salvataggio.`);
        }

        return {
          dayOfWeek: meal.dayOfWeek,
          mealSlot: meal.mealSlot,
          recipeId
        };
      });

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
        await tx.menuMeal.upsert({
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
            mealSlot: meal.mealSlot,
            recipeId: meal.recipeId
          },
          update: {
            recipeId: meal.recipeId,
            customName: null
          }
        });
      }

      return tx.weeklyMenu.findUnique({
        where: { id: menu.id },
        include: {
          meals: {
            include: {
              recipe: {
                include: {
                  ingredients: {
                    include: { ingredient: { select: { id: true, name: true, category: true } } }
                  }
                }
              }
            }
          }
        }
      });
    });
  }

  private getClient() {
    if (this.client) return this.client;

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new BadRequestException("OPENAI_API_KEY non configurata.");

    this.client = new OpenAI({ apiKey, maxRetries: 0 });
    return this.client;
  }

  getModelConfig() {
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

  private async selectModelForRequest(familyId: string): Promise<ModelSelection> {
    const { experimentMode, primaryModel, secondaryModel } = this.getModelConfig();

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

  private async logGeneration(params: {
    userId: string;
    familyId: string;
    model: string;
    strategy: OpenAiExperimentMode;
    variant: "primary" | "secondary";
    requestedMealCount: number;
    existingRecipeCount: number;
    existingIngredientCount: number;
    requestBreakdown: RequestBreakdown;
    responseBreakdown?: Record<string, number>;
    usage?: ResponseUsage;
    success: boolean;
    latencyMs: number;
    openaiResponseId?: string;
    errorMessage?: string;
  }) {
    try {
      const pricing = this.getPricingForModel(params.model);
      const usage = params.usage;
      const inputTokens = usage?.input_tokens ?? null;
      const cachedInputTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? null;
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

      await this.prisma.aiGenerationLog.create({
        data: {
          userId: params.userId,
          familyId: params.familyId,
          model: params.model,
          success: params.success,
          requestedMealCount: params.requestedMealCount,
          existingRecipeCount: params.existingRecipeCount,
          existingIngredientCount: params.existingIngredientCount,
          inputTokens,
          cachedInputTokens,
          outputTokens,
          totalTokens: usage?.total_tokens ?? null,
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
        }
      });
    } catch (loggingError) {
      this.logger.warn(
        `Impossibile salvare il log AI: ${
          loggingError instanceof Error ? loggingError.message : "errore sconosciuto"
        }`
      );
    }
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
    existingRecipes: { id: string; name: string }[],
    requestedSlots: { dayOfWeek: number; mealSlot: MealSlot }[],
    options: { requireCompleteCoverage: boolean }
  ) {
    const requestedSlotKeys = new Set(requestedSlots.map((slot) => this.getSlotKey(slot.dayOfWeek, slot.mealSlot)));
    const returnedSlotKeys = new Set<string>();
    const existingRecipeIdsSet = new Set(existingRecipes.map((recipe) => recipe.id));
    const existingRecipesByName = new Map(
      existingRecipes.map((recipe) => [this.normalizeRecipeName(recipe.name), recipe])
    );
    const newRecipeNames = new Set(
      response.newRecipes.map((recipe) => this.normalizeRecipeName(recipe.name))
    );
    const normalizedWeeklyPlan = response.weeklyPlan.map((meal) => ({ ...meal }));

    for (const meal of normalizedWeeklyPlan) {
      const slotKey = this.getSlotKey(meal.dayOfWeek, meal.mealSlot);
      if (!requestedSlotKeys.has(slotKey)) {
        throw new BadRequestException("La risposta AI contiene slot non richiesti.");
      }
      if (returnedSlotKeys.has(slotKey)) {
        throw new BadRequestException("La risposta AI contiene slot duplicati.");
      }
      returnedSlotKeys.add(slotKey);

      const normalizedRecipeName = this.normalizeRecipeName(meal.recipeName);
      const matchedExistingRecipe = existingRecipesByName.get(normalizedRecipeName);

      if (meal.recipeId) {
        if (existingRecipeIdsSet.has(meal.recipeId)) {
          continue;
        }

        if (matchedExistingRecipe) {
          meal.recipeId = matchedExistingRecipe.id;
          meal.recipeName = matchedExistingRecipe.name;
          continue;
        }

        if (newRecipeNames.has(normalizedRecipeName)) {
          delete meal.recipeId;
          continue;
        }

        throw new BadRequestException("La risposta AI contiene recipeId non presenti nel database.");
      }

      if (matchedExistingRecipe) {
        meal.recipeId = matchedExistingRecipe.id;
        meal.recipeName = matchedExistingRecipe.name;
        continue;
      }

      if (!newRecipeNames.has(normalizedRecipeName)) {
        throw new BadRequestException("La risposta AI contiene una nuova ricetta non presente in newRecipes.");
      }
    }

    if (options.requireCompleteCoverage && returnedSlotKeys.size !== requestedSlotKeys.size) {
      throw new BadRequestException("La risposta AI non copre tutti gli slot richiesti.");
    }

    return {
      ...response,
      weeklyPlan: normalizedWeeklyPlan.sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
      })
    };
  }

  private getSlotKey(dayOfWeek: number, mealSlot: MealSlot) {
    return `${dayOfWeek}-${mealSlot}`;
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

  private parseWeekStart(weekStart: string) {
    const date = new Date(weekStart);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
