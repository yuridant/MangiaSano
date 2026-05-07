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
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, mealSlotSchema, type MealSlot } from "../../common/meal-slots";
import { PrismaService } from "../../prisma/prisma.service";
import { FamiliesService } from "../families/families.service";

const aiResponseSchema = z.object({
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
      mealType: mealSlotSchema.optional(),
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

const SYSTEM_PROMPT = `Sei un nutrizionista esperto. Il tuo obiettivo è creare piani alimentari settimanali equilibrati che riducano al minimo i picchi glicemici.

Principi guida:
- Preferisci carboidrati complessi (farro, orzo, legumi, verdure) rispetto a quelli semplici
- Abbina sempre proteine e fibre ai carboidrati per rallentare l'assorbimento
- Varia le fonti proteiche (legumi, pesce, carne magra, uova)
- Includi verdure ad ogni pasto principale
- Limita zuccheri semplici, pane bianco, riso raffinato

IMPORTANTE: Rispondi ESCLUSIVAMENTE con JSON valido. Nessun testo prima o dopo il JSON. Nessun blocco markdown. Solo JSON puro.`;

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

    const [family, recipes, ingredients] = await Promise.all([
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
      this.prisma.ingredient.findMany({ where: { familyId } })
    ]);

    const context = {
      existingRecipes: [...recipes]
        .sort((a, b) => a.name.localeCompare(b.name, "it"))
        .map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        mealType: recipe.mealType,
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

    const userMessage = `Obiettivo nutrizionale: ${goal}

Ricette già presenti nell'app (usa queste quando possibile, riportando il loro id):
${JSON.stringify(context.existingRecipes)}

Ingredienti già presenti nell'app:
${JSON.stringify(context.existingIngredients)}

Profilo alimentare della famiglia da rispettare SEMPRE:
${JSON.stringify(dietaryProfile)}

Genera un piano per questi slot: ${slotsDescription}
Slot richiesti in formato strutturato:
${JSON.stringify(slots)}

Includi in newRecipes solo le ricette che non esistono già. Includi in newIngredients solo gli ingredienti non già presenti.
Ogni elemento di weeklyPlan deve corrispondere a uno e un solo slot richiesto, senza duplicati e senza slot extra.
Se usi una ricetta esistente compila recipeId con un id presente in existingRecipes.
Se proponi una ricetta nuova lascia recipeId assente e inseriscila anche in newRecipes con lo stesso recipeName.
Non proporre ingredienti o ricette in conflitto con allergie, intolleranze o preferenze indicate.
Descrivi ingredienti e ricette nuove in modo realistico e riutilizzabile nell'app.
Prima di rispondere, verifica internamente che il piano copra tutti gli slot richiesti.`;

    try {
      const completion = await this.getClient().beta.chat.completions.parse({
        model: "gpt-4o-2024-08-06",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ],
        response_format: zodResponseFormat(aiResponseSchema, "weekly_menu_plan"),
        temperature: 0.7
      });

      const parsed = completion.choices[0]?.message?.parsed;
      if (!parsed) {
        throw new BadRequestException("L'AI non ha restituito un piano utilizzabile. Riprova.");
      }
      return this.validateAiResponse(parsed, recipes.map((recipe) => recipe.id), slots);
    } catch (error) {
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

  private getClient() {
    if (this.client) return this.client;

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new BadRequestException("OPENAI_API_KEY non configurata.");

    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  private validateAiResponse(
    response: AiResponse,
    existingRecipeIds: string[],
    requestedSlots: { dayOfWeek: number; mealSlot: MealSlot }[]
  ) {
    const requestedSlotKeys = new Set(requestedSlots.map((slot) => this.getSlotKey(slot.dayOfWeek, slot.mealSlot)));
    const returnedSlotKeys = new Set<string>();
    const existingRecipeIdsSet = new Set(existingRecipeIds);
    const newRecipeNames = new Set(response.newRecipes.map((recipe) => recipe.name.trim().toLowerCase()));

    for (const meal of response.weeklyPlan) {
      const slotKey = this.getSlotKey(meal.dayOfWeek, meal.mealSlot);
      if (!requestedSlotKeys.has(slotKey)) {
        throw new BadRequestException("La risposta AI contiene slot non richiesti.");
      }
      if (returnedSlotKeys.has(slotKey)) {
        throw new BadRequestException("La risposta AI contiene slot duplicati.");
      }
      returnedSlotKeys.add(slotKey);

      if (meal.recipeId && !existingRecipeIdsSet.has(meal.recipeId)) {
        throw new BadRequestException("La risposta AI contiene recipeId non presenti nel database.");
      }

      if (!meal.recipeId && !newRecipeNames.has(meal.recipeName.trim().toLowerCase())) {
        throw new BadRequestException("La risposta AI contiene una nuova ricetta non presente in newRecipes.");
      }
    }

    if (returnedSlotKeys.size !== requestedSlotKeys.size) {
      throw new BadRequestException("La risposta AI non copre tutti gli slot richiesti.");
    }

    return {
      ...response,
      weeklyPlan: [...response.weeklyPlan].sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
      })
    };
  }

  private getSlotKey(dayOfWeek: number, mealSlot: MealSlot) {
    return `${dayOfWeek}-${mealSlot}`;
  }
}
