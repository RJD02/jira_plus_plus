import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
function stableStringify(value) {
  return JSON.stringify(value, (_, val) => {
    if (Array.isArray(val)) {
      return val.map((item) => (typeof item === "object" && item !== null ? sortObjectKeys(item) : item));
    }
    if (val && typeof val === "object") {
      return sortObjectKeys(val);
    }
    return val;
  });
}

function sortObjectKeys(value) {
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      const val = value[key];
      acc[key] = typeof val === "object" && val !== null ? (Array.isArray(val) ? val : sortObjectKeys(val)) : val;
      return acc;
    }, {});
}

function hashStable(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function renderTemplate(template, data) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, token) => {
    const value = resolvePath(data, token);
    return value === undefined || value === null ? "" : String(value);
  });
}

function resolvePath(source, pathValue) {
  const segments = pathValue.split(".");
  let current = source;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

export class SkillExecutor {
  constructor(options) {
    this.registry = options.registry;
    this.traceStore = options.traceStore;
    this.adapters = options.adapters;
    this.logger = options.logger;
    this.metrics = options.metrics;
  }

  async execute(request) {
    const compiled = this.registry.getCompiledSkill(request.skillId);
    const providerOverride = request.providerOverride ?? request.context.metadata?.provider;
    const providerKey = providerOverride ?? compiled.manifest.model.provider;
    const adapter = this.adapters[providerKey];
    if (!adapter) {
      throw new Error(`Adapter for provider ${providerKey} is not configured`);
    }

    const validatedInput = compiled.inputParser.parse(request.payload);
    const prompt = renderTemplate(compiled.manifest.template, validatedInput);

    const inputHash = hashStable(validatedInput);
    const cacheKey = {
      tenantId: request.context.tenantId,
      skillId: request.skillId,
      templateHash: compiled.templateHash,
      inputHash,
    };

    if (request.allowCache ?? compiled.manifest.cache.enabled) {
      const cached = await this.lookupCachedTrace(cacheKey, compiled);
      if (cached) {
        return cached;
      }
    }

    const traceId = crypto.randomUUID();
    const started = performance.now();
    let adapterResult;
    try {
      adapterResult = await adapter.invoke({
        skill: compiled.manifest,
        context: request.context,
        prompt,
        input: validatedInput,
      });
    } catch (error) {
      this.metrics?.incrementError(request.skillId, error);
      this.logger?.error?.("Adapter invocation failed", { skillId: request.skillId, error });
      throw error;
    }
    const latencyMs = performance.now() - started;
    this.metrics?.observeLatency(request.skillId, latencyMs, false);
    if (adapterResult.usage) {
      this.metrics?.observeTokens(request.skillId, adapterResult.usage);
    }
    if (
      !adapterResult.outputText ||
      typeof adapterResult.outputText !== "string" ||
      !adapterResult.outputText.trim()
    ) {
      const error = new Error("Skill provider returned an empty response");
      error.name = "SkillExecutionFailed";
      throw error;
    }

    const output = compiled.outputParser.parse(adapterResult.outputText);

    const record = {
      traceId,
      tenantId: request.context.tenantId,
      skillId: request.skillId,
      skillVersion: compiled.manifest.version,
      modelProvider: adapter.provider,
      modelName: compiled.manifest.model.name,
      templateHash: compiled.templateHash,
      inputHash,
      latencyMs,
      cached: compiled.manifest.cache.enabled && (request.allowCache ?? true),
      input: validatedInput,
      output,
      metadata: {
        requestId: request.context.requestId,
        userId: request.context.userId,
        locale: request.context.locale,
        adapter: adapter.provider,
        rawResponse: adapterResult.rawResponse,
        contextMetadata: request.context.metadata,
      },
      usage: adapterResult.usage,
      createdAt: new Date(),
    };

    await this.traceStore.recordTrace(record);

    return {
      skillId: request.skillId,
      traceId,
      output,
      cached: false,
      latencyMs,
      usage: adapterResult.usage,
      model: {
        provider: adapter.provider,
        name: compiled.manifest.model.name,
      },
    };
  }

  async lookupCachedTrace(cacheKey, compiled) {
    const cached = await this.traceStore.findCachedTrace(cacheKey);
    if (!cached) {
      return null;
    }

    const ttlMs = (compiled.manifest.cache.ttlSeconds ?? 0) * 1000;
    if (ttlMs > 0 && Date.now() > cached.createdAt.getTime() + ttlMs) {
      return null;
    }

    try {
      const parsedOutput = compiled.outputParser.parse(cached.output);
      this.metrics?.observeLatency(cacheKey.skillId, cached.latencyMs, true);
      if (cached.usage) {
        this.metrics?.observeTokens(cacheKey.skillId, cached.usage);
      }
      return {
        skillId: cacheKey.skillId,
        traceId: cached.traceId,
        output: parsedOutput,
        cached: true,
        latencyMs: cached.latencyMs,
        usage: cached.usage,
        model: {
          provider: cached.modelProvider,
          name: cached.modelName,
        },
      };
    } catch (error) {
      this.logger?.warn?.("Cached trace failed schema validation, ignoring cache entry", {
        skillId: cacheKey.skillId,
        cacheKey,
        error,
      });
      return null;
    }
  }
}
