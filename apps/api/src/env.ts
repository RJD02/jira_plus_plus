import { config } from "dotenv";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(dirname, "..");
const repoRoot = path.resolve(apiRoot, "..", "..");

const candidateEnvPaths = [
  path.join(repoRoot, ".env"),
  path.join(apiRoot, ".env"),
];

for (const envPath of candidateEnvPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  WORKER_PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TENANT_ID: z.string().default("dev"),
  JIRA_BASE_URL: z.string().min(1, "JIRA_BASE_URL is required"),
  JIRA_EMAIL: z.string().email(),
  JIRA_API_TOKEN: z.string().min(1, "JIRA_API_TOKEN is required"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("mistral"),
  ANTHROPIC_MODEL: z.string().default("claude-3-haiku-20240307"),
  ANTHROPIC_API_KEY: z.string().optional(),
  INSIGHTS_LOCAL_TIMEOUT_MS: z.coerce.number().default(120000),
  INSIGHTS_PROVIDER: z
    .enum(["auto", "openai", "local"])
    .default("local"),
  INSIGHTS_CACHE_TTL_MINUTES: z.coerce.number().default(720),
  NARRATIVE_PROVIDER: z
    .enum(["auto", "openai", "anthropic", "ollama", "local"])
    .default("auto"),
  NARRATIVE_MODEL: z.string().default("gpt-4o-mini"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ENCRYPTION_SECRET: z.string().min(32, "ENCRYPTION_SECRET must be at least 32 characters"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 characters"),
  ADMIN_DISPLAY_NAME: z.string().min(1, "ADMIN_DISPLAY_NAME is required"),
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().default("default"),
  TEMPORAL_TASK_QUEUE: z.string().default("jira-sync"),
  SYNC_DEFAULT_CRON: z.string().default("*/15 * * * *"),
  OPS_ALERT_EMAILS: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .union([z.literal("true"), z.literal("false")])
    .optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
});

type EnvShape = z.infer<typeof envSchema>;

let cachedEnv: EnvShape | null = null;

export function getEnv(): EnvShape {
  if (!cachedEnv) {
    config();
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}
