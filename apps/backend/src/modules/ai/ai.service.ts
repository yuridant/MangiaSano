import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { z } from "zod";
import { PrismaService } from "../../prisma/prisma.service";
import { FamiliesService } from "../families/families.service";

const mealSlotEnum = z.enum(["breakfast", "lunch", "dinner", "snack"]);

const aiResponseSchema = z.object({
  weeklyPlan: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      mealSlot: mealSlotEnum,
      recipeId: z.string().optional(),
      recipeName: z.string(),
      recipeDescription: z.string().optional()
    })
  ),
  newRecipes: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      mealType: mealSlotEnum.optional(),
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
  private readonly client: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
    private readonly config: ConfigService
  ) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new BadRequestException("OPENAI_API_KEY non configurata.");
    this.client = new OpenAI({ apiKey });
  }

  async generate(
    userId: string,
    familyId: string,
    slots: { dayOfWeek: number; mealSlot: string }[],
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
      existingRecipes: recipes.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        mealType: r.mealType,
        ingredients: r.ingredients.map((ri) => ri.ingredient.name)
      })),
      existingIngredients: ingredients.map((i) => ({ id: i.id, name: i.name, category: i.category }))
    };

    const dayNames = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
    const slotNames: Record<string, string> = {
      breakfast: "Colazione",
      lunch: "Pranzo",
      dinner: "Cena",
      snack: "Spuntino"
    };

    const slotsDescription = slots
      .map((s) => `${dayNames[s.dayOfWeek]} - ${slotNames[s.mealSlot] ?? s.mealSlot}`)
      .join(", ");

    const userMessage = `Obiettivo: ${goal}

Ricette già presenti nell'app (usa queste quando possibile, riportando il loro id):
${JSON.stringify(context.existingRecipes, null, 2)}

Ingredienti già presenti nell'app:
${JSON.stringify(context.existingIngredients, null, 2)}

Genera un piano per questi slot: ${slotsDescription}

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
      "mealType": "lunch",
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
Prima di rispondere, verifica internamente che il JSON sia valido e completo.`;

    const completion = await this.client.chat.completions.create({
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
      return aiResponseSchema.parse(parsed);
    } catch {
      throw new BadRequestException("La risposta AI non è nel formato atteso. Riprova.");
    }
  }
}
