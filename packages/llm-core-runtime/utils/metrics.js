import { Counter, Gauge, Histogram, Registry } from "prom-client";

export class PrometheusSkillMetrics {
  constructor(options = {}) {
    this.registry = options.registry ?? new Registry();
    this.latency = new Histogram({
      name: "llm_skill_latency_ms",
      help: "Latency of LLM skill executions in milliseconds",
      labelNames: ["skillId", "cached"],
      registers: [this.registry],
      buckets: [50, 100, 250, 500, 1000, 2000, 5000, 10000],
    });
    this.errors = new Counter({
      name: "llm_skill_errors_total",
      help: "Total number of LLM skill execution errors",
      labelNames: ["skillId"],
      registers: [this.registry],
    });
    this.tokens = new Gauge({
      name: "llm_skill_tokens",
      help: "Latest token usage per skill execution",
      labelNames: ["skillId", "type"],
      registers: [this.registry],
    });
  }

  observeLatency(skillId, latencyMs, cached) {
    this.latency.observe({ skillId, cached: cached ? "true" : "false" }, latencyMs);
  }

  incrementError(skillId, _error) {
    this.errors.inc({ skillId });
  }

  observeTokens(skillId, usage) {
    if (usage?.promptTokens !== undefined) {
      this.tokens.set({ skillId, type: "prompt" }, usage.promptTokens);
    }
    if (usage?.completionTokens !== undefined) {
      this.tokens.set({ skillId, type: "completion" }, usage.completionTokens);
    }
    if (usage?.totalTokens !== undefined) {
      this.tokens.set({ skillId, type: "total" }, usage.totalTokens);
    }
  }

  getRegistry() {
    return this.registry;
  }
}
