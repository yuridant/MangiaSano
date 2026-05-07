import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
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

    const [recipes, ingredients] = await Promise.all([
      this.prisma.recipe.findMany({
        where: { familyId },
        include: {
          ingredients: { include: { ingredient: { select: { name: true } } } }
        }
      }),
      this.prisma.ingredient.findMany({ where: { familyId } })
    ]);

    const context = {
      existingRecipes: recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        mealType: recipe.mealType,
        ingredients: recipe.ingredients.map((recipeIngredient) => recipeIngredient.ingredient.name)
      })),
      existingIngredients: ingredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        category: ingredient.category
      }))
    };

    const dayNames = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

    const slotsDescription = slots
      .map((slot) => `${dayNames[slot.dayOfWeek]} - ${MEAL_SLOT_LABELS[slot.mealSlot]}`)
      .join(", ");

    const userMessage = `Obiettivo: ${goal}

Ricette già presenti nell'app (usa queste quando possibile, riportando il loro id):
${JSON.stringify(context.existingRecipes, null, 2)}

Ingredienti già presenti nell'app:
${JSON.stringify(context.existingIngredients, null, 2)}

Genera un piano per questi slot: ${slotsDescription}
Slot richiesti in formato strutturato:
${JSON.stringify(slots, null, 2)}

Rispondi con questo JSON esatto (senza testo aggiuntivo):
{
  "weeklyPlan": [
    {
      "dayOfWeek": 0,
      "mealSlot": "lunch",
      "recipeId": "id-se-usi-ricetta-esistente",
      "recipeName": "Nome ricetta",
      "recipeDescription": "Descrizione breve"
    }
  ],
  "newRecipes": [
    {
      "name": "Nome nuova ricetta",
      "description": "Descrizione",
      "mealType": "snack_morning",
      "ingredients": ["nome ingrediente 1", "nome ingrediente 2"]
    }
  ],
  "newIngredients": [
    {
      "name": "nome ingrediente nuovo",
      "category": "categoria"
    }
  ]
}

Includi in newRecipes solo le ricette che non esistono già. Includi in newIngredients solo gli ingredienti non già presenti.
Ogni elemento di weeklyPlan deve corrispondere a uno e un solo slot richiesto, senza duplicati e senza slot extra.
Se usi una ricetta esistente compila recipeId con un id presente in existingRecipes.
Se proponi una ricetta nuova lascia recipeId assente e inseriscila anche in newRecipes con lo stesso recipeName.
Prima di rispondere, verifica internamente che il JSON sia valido e completo.`;

    const completion = await this.getClient().chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    try {
      const parsed = JSON.parse(raw);
      return this.validateAiResponse(aiResponseSchema.parse(parsed), recipes.map((recipe) => recipe.id), slots);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("La risposta AI non è nel formato atteso. Riprova.");
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
