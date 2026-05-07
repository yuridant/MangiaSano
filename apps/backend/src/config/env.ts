import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url(),
  CORS_ORIGIN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_PRICE_INPUT_PER_1M: z.coerce.number().positive().optional(),
  OPENAI_PRICE_CACHED_INPUT_PER_1M: z.coerce.number().positive().optional(),
  OPENAI_PRICE_OUTPUT_PER_1M: z.coerce.number().positive().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().positive().optional(),
  SMTP_SECURE: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => v === true || v === "true")
    .default(false),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().email().optional()
});

export type Env = z.infer<typeof envSchema>;
