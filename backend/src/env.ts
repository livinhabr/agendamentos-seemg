import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().transform(Number).default("3000"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  N8N_CHAT_WEBHOOK_URL: z.string().optional().transform((val) => val === "" ? undefined : val).pipe(z.string().url().optional()),
  N8N_SYNC_WEBHOOK_URL: z.string().optional().transform((val) => val === "" ? undefined : val).pipe(z.string().url().optional()),
  N8N_SHARED_SECRET: z.string().optional().transform((val) => val === "" ? undefined : val),
  USE_N8N_CHAT: z.string().optional().transform((val) => val !== "false").default("true"),
  ALLOWED_ORIGINS: z.string().transform((val) => val.split(",").map((s) => s.trim())),
  GOOGLE_CALENDAR_CLIENT_EMAIL: z.string().optional().transform((val) => val === "" ? undefined : val),
  GOOGLE_CALENDAR_PRIVATE_KEY: z.string().optional().transform((val) => val === "" ? undefined : val),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  process.exit(1);
}

export const env = _env.data;
