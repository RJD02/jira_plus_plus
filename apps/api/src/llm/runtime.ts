import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SkillRegistry,
  SkillExecutor,
  createLogger,
  PrismaTraceStore,
  PrometheusSkillMetrics,
  buildExecutionContext,
  OpenAIAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  type SkillExecutionResult,
  type ModelAdapter,
  type SkillManifestModel,
} from "@platform/llm-core-runtime";
import type {
  IssueInsightSkillInput,
  ProjectNarrativeSkillInput,
  UserNarrativeSkillInput,
} from "./types.js";
import { prisma } from "../prisma.js";
import { getEnv } from "../env.js";

const logger = createLogger("skill-runtime");
const registry = new SkillRegistry(logger);
const metrics = new PrometheusSkillMetrics();
const traceStore = new PrismaTraceStore(prisma);
let currentAdapters: Record<string, ModelAdapter> | null = null;
type ProviderKey = "openai" | "anthropic" | "ollama";

let executorPromise: Promise<SkillExecutor> | null = null;

async function initialiseExecutor(): Promise<SkillExecutor> {
  const executor = await createExecutor();
  return executor;
}

async function createExecutor(): Promise<SkillExecutor> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const skillsDir = path.resolve(__dirname, "skills");
  await registry.loadFromDirectory(skillsDir);
  const adapters = buildAdapters();
  currentAdapters = adapters;
  applySkillEnvironmentOverrides(adapters);
  return new SkillExecutor({
    registry,
    traceStore,
    adapters,
    logger: createLogger("skill-executor"),
    metrics,
  });
}

async function getExecutor(): Promise<SkillExecutor> {
  if (!executorPromise) {
    executorPromise = initialiseExecutor().catch((error) => {
      executorPromise = null;
      logger.error("Failed to initialise skill executor", { error });
      throw error;
    });
  }
  return executorPromise;
}

function buildAdapters(): Record<string, ModelAdapter> {
  const adapters: Record<string, ModelAdapter> = {};
  const env = getEnv();

  if (env.OPENAI_API_KEY) {
    adapters.openai = new OpenAIAdapter({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  if (env.ANTHROPIC_API_KEY) {
    adapters.anthropic = new AnthropicAdapter();
  }

  const useLocalDefault = !env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY;
  if (useLocalDefault || env.OLLAMA_BASE_URL) {
    adapters.ollama = new OllamaAdapter();
  }

  return adapters;
}

export interface ExecuteIssueInsightSkillArgs {
  tenantId: string;
  userId?: string | null;
  requestId?: string;
  payload: IssueInsightSkillInput;
  allowCache: boolean;
  providerOverride?: string | null;
}

export async function executeIssueInsightSkill(
  args: ExecuteIssueInsightSkillArgs,
): Promise<SkillExecutionResult<string>> {
  const executor = await getExecutor();
  const context = buildExecutionContext({
    tenantId: args.tenantId,
    userId: args.userId ?? null,
    requestId: args.requestId,
  });
  return executor.execute<IssueInsightSkillInput, string>({
    skillId: "issue-insight.v1",
    payload: args.payload,
    context,
    allowCache: args.allowCache,
    providerOverride: args.providerOverride ?? undefined,
  });
}

export function getLLMMetricsRegistry() {
  return metrics.getRegistry();
}

export async function reloadSkillRegistry(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const skillsDir = path.resolve(__dirname, "skills");
  await registry.loadFromDirectory(skillsDir);
  if (currentAdapters) {
    applySkillEnvironmentOverrides(currentAdapters);
  }
  logger.info("Skill registry reloaded");
}

function applySkillEnvironmentOverrides(adapters: Record<string, ModelAdapter>) {
  const provider = resolveIssueInsightProvider(adapters);
  if (!provider) {
    return applyNarrativeEnvironmentOverrides(adapters);
  }

  const modelName = resolveIssueInsightModel(provider);
  const overrides: Partial<SkillManifestModel> = {
    provider,
    ...(modelName ? { name: modelName } : {}),
  };

  registry.overrideSkillModel("issue-insight.v1", overrides);
  applyNarrativeEnvironmentOverrides(adapters);
}

function resolveIssueInsightProvider(adapters: Record<string, ModelAdapter>): ProviderKey | null {
  const env = getEnv();
  const explicit = process.env.ISSUE_INSIGHT_PROVIDER?.toLowerCase();
  const fallback = env.INSIGHTS_PROVIDER;
  const providerKey = normaliseProvider(explicit ?? fallback);
  if (!providerKey) {
    return null;
  }
  if (!adapters[providerKey]) {
    logger.warn("Requested insight provider is not configured", {
      provider: providerKey,
    });
    return null;
  }
  return providerKey;
}

function resolveIssueInsightModel(provider: ProviderKey) {
  const explicit = process.env.ISSUE_INSIGHT_MODEL?.trim();
  if (explicit) {
    return explicit;
  }
  const env = getEnv();
  if (provider === "openai") {
    return env.OPENAI_MODEL;
  }
  if (provider === "anthropic") {
    return env.ANTHROPIC_MODEL;
  }
  if (provider === "ollama") {
    return env.OLLAMA_MODEL;
  }
  return undefined;
}

function normaliseProvider(value: string | undefined | null): ProviderKey | null {
  if (!value) {
    return null;
  }
  const trimmed = value.toLowerCase();
  if (trimmed === "auto") {
    return null;
  }
  if (trimmed === "openai") {
    return "openai";
  }
  if (trimmed === "anthropic") {
    return "anthropic";
  }
  if (trimmed === "ollama" || trimmed === "local") {
    return "ollama";
  }
  logger.warn("Unrecognised insight provider override", { provider: value });
  return null;
}

function applyNarrativeEnvironmentOverrides(adapters: Record<string, ModelAdapter>) {
  const provider = resolveNarrativeProvider(adapters);
  if (!provider) {
    return;
  }

  const modelName = resolveNarrativeModel(provider);
  const overrides: Partial<SkillManifestModel> = {
    provider,
    ...(modelName ? { name: modelName } : {}),
  };

  registry.overrideSkillModel("project-narrative.v1", overrides);
  registry.overrideSkillModel("user-narrative.v1", overrides);
}

function resolveNarrativeProvider(adapters: Record<string, ModelAdapter>): ProviderKey | null {
  const env = getEnv();
  const explicit = process.env.NARRATIVE_PROVIDER ?? env.NARRATIVE_PROVIDER;
  const providerKey = normaliseProvider(explicit);

  if (providerKey) {
    if (!adapters[providerKey]) {
      logger.warn("Requested narrative provider is not configured", { provider: providerKey });
      return null;
    }
    return providerKey;
  }

  const priority: ProviderKey[] = ["openai", "anthropic", "ollama"];
  for (const candidate of priority) {
    if (adapters[candidate]) {
      return candidate;
    }
  }
  return null;
}

function resolveNarrativeModel(provider: ProviderKey): string | undefined {
  const explicit = process.env.NARRATIVE_MODEL?.trim();
  if (explicit) {
    return explicit;
  }

  const env = getEnv();
  if (provider === "openai") {
    return env.NARRATIVE_MODEL || env.OPENAI_MODEL;
  }
  if (provider === "anthropic") {
    return env.NARRATIVE_MODEL || env.ANTHROPIC_MODEL;
  }
  if (provider === "ollama") {
    return env.NARRATIVE_MODEL || env.OLLAMA_MODEL;
  }
  return undefined;
}

export interface ExecuteProjectNarrativeSkillArgs {
  tenantId: string;
  payload: ProjectNarrativeSkillInput;
  allowCache: boolean;
  providerOverride?: string | null;
}

export interface ExecuteUserNarrativeSkillArgs {
  tenantId: string;
  payload: UserNarrativeSkillInput;
  allowCache: boolean;
  providerOverride?: string | null;
}

export async function executeProjectNarrativeSkill(
  args: ExecuteProjectNarrativeSkillArgs,
): Promise<SkillExecutionResult<string>> {
  const executor = await getExecutor();
  const context = buildExecutionContext({
    tenantId: args.tenantId,
    userId: null,
  });

  return executor.execute<ProjectNarrativeSkillInput, string>({
    skillId: "project-narrative.v1",
    payload: args.payload,
    context,
    allowCache: args.allowCache,
    providerOverride: args.providerOverride ?? undefined,
  });
}

export async function executeUserNarrativeSkill(
  args: ExecuteUserNarrativeSkillArgs,
): Promise<SkillExecutionResult<string>> {
  const executor = await getExecutor();
  const context = buildExecutionContext({
    tenantId: args.tenantId,
    userId: null,
  });

  return executor.execute<UserNarrativeSkillInput, string>({
    skillId: "user-narrative.v1",
    payload: args.payload,
    context,
    allowCache: args.allowCache,
    providerOverride: args.providerOverride ?? undefined,
  });
}
