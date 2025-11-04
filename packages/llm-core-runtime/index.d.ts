import type { PrismaClient } from "@platform/cdm";
import type { Registry } from "prom-client";
import type { z } from "zod";

export interface SkillManifestModel {
  provider: "openai" | "anthropic" | "ollama";
  name: string;
  temperature?: number;
  topP?: number;
}

export interface SkillManifestCache {
  enabled: boolean;
  ttlSeconds: number;
}

export interface SkillManifest {
  id: string;
  goal: string;
  version: string;
  model: SkillManifestModel;
  template: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  cache: SkillManifestCache;
  metadata?: Record<string, unknown>;
}

export interface CompiledSkillDefinition {
  manifest: SkillManifest;
  templateHash: string;
  inputParser: z.ZodTypeAny;
  outputParser: z.ZodTypeAny;
}

export interface SkillRegistryLogger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  debug?(message: string, meta?: unknown): void;
}

export class SkillRegistry {
  constructor(logger?: SkillRegistryLogger);
  loadFromDirectory(directory: string): Promise<void>;
  listSkills(): SkillManifest[];
  getCompiledSkill(skillId: string): CompiledSkillDefinition;
  overrideSkillModel(skillId: string, overrides: Partial<SkillManifestModel>): void;
  reload(): Promise<void>;
}

export interface ExecutionContext {
  tenantId: string;
  userId: string | null;
  requestId: string;
  locale?: string;
  timezone?: string;
  metadata?: Record<string, unknown>;
}

export interface BuildContextOptions {
  tenantId: string;
  userId?: string | null;
  locale?: string;
  timezone?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export function buildExecutionContext(options: BuildContextOptions): ExecutionContext;
export function mergeExecutionContext(base: ExecutionContext, override: Partial<ExecutionContext>): ExecutionContext;

export interface TraceUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface NewTraceRecord {
  traceId: string;
  tenantId: string;
  skillId: string;
  skillVersion: string;
  modelProvider: string;
  modelName: string;
  templateHash: string;
  inputHash: string;
  latencyMs: number;
  cached: boolean;
  input: unknown;
  output: unknown;
  metadata?: Record<string, unknown>;
  usage?: TraceUsage;
  createdAt: Date;
}

export interface TraceRecord extends NewTraceRecord {}

export interface CacheKey {
  tenantId: string;
  skillId: string;
  templateHash: string;
  inputHash: string;
}

export interface TraceStore {
  recordTrace(record: NewTraceRecord): Promise<void>;
  findCachedTrace(cacheKey: CacheKey): Promise<TraceRecord | null>;
}

export class PrismaTraceStore implements TraceStore {
  constructor(prisma: PrismaClient);
  recordTrace(record: NewTraceRecord): Promise<void>;
  findCachedTrace(cacheKey: CacheKey): Promise<TraceRecord | null>;
}

export interface SkillExecutionInput<TInput = unknown> {
  skillId: string;
  payload: TInput;
  context: ExecutionContext;
  allowCache?: boolean;
  providerOverride?: string;
}

export interface SkillExecutionResult<TOutput = unknown> {
  skillId: string;
  traceId: string;
  output: TOutput;
  cached: boolean;
  latencyMs: number;
  usage?: TraceUsage;
  model: {
    provider: string;
    name: string;
  };
}

export interface ModelAdapterInvokeOptions<TInput = unknown> {
  skill: SkillManifest;
  context: ExecutionContext;
  prompt: string;
  input: TInput;
}

export interface ModelAdapterResult {
  outputText: string;
  rawResponse: unknown;
  usage?: TraceUsage;
}

export interface ModelAdapter {
  provider: string;
  invoke(options: ModelAdapterInvokeOptions): Promise<ModelAdapterResult>;
}

export interface SkillMetrics {
  observeLatency(skillId: string, latencyMs: number, cached: boolean): void;
  incrementError(skillId: string, error: Error): void;
  observeTokens(skillId: string, usage: TraceUsage): void;
}

export interface SkillExecutorOptions {
  registry: SkillRegistry;
  traceStore: TraceStore;
  adapters: Record<string, ModelAdapter>;
  logger?: SkillRegistryLogger;
  metrics?: SkillMetrics;
}

export class SkillExecutor {
  constructor(options: SkillExecutorOptions);
  execute<TInput = unknown, TOutput = unknown>(request: SkillExecutionInput<TInput>): Promise<SkillExecutionResult<TOutput>>;
}

export class PrometheusSkillMetrics implements SkillMetrics {
  constructor(options?: { registry?: Registry });
  observeLatency(skillId: string, latencyMs: number, cached: boolean): void;
  incrementError(skillId: string, error: Error): void;
  observeTokens(skillId: string, usage: TraceUsage): void;
  getRegistry(): Registry;
}

export class OpenAIAdapter implements ModelAdapter {
  constructor(config?: { apiKey?: string; baseUrl?: string });
  provider: string;
  invoke(options: ModelAdapterInvokeOptions): Promise<ModelAdapterResult>;
}

export class AnthropicAdapter implements ModelAdapter {
  constructor(config?: { apiKey?: string; baseUrl?: string; version?: string });
  provider: string;
  invoke(options: ModelAdapterInvokeOptions): Promise<ModelAdapterResult>;
}

export class OllamaAdapter implements ModelAdapter {
  constructor(config?: { baseUrl?: string });
  provider: string;
  invoke(options: ModelAdapterInvokeOptions): Promise<ModelAdapterResult>;
}

export interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  debug?(message: string, meta?: unknown): void;
}

export function createLogger(namespace: string): Logger;
