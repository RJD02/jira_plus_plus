# 🧩 **Phase 1 – Deterministic Skill Runtime (MVP)**

## 🎯 Business Specification (BRS)

### **Objective**

Create a reproducible, transparent, and deterministic runtime for executing LLM skills through Temporal with complete schema enforcement, observability, and trace logging.

### **Business Needs**

* Ensure predictable, auditable LLM behavior.
* Establish a unified runtime for all LLM interactions.
* Provide visibility into cost, latency, and success metrics.
* Enable reuse of skills across multiple products (Jira Agent, Analytics Agent, etc.).

### **Key Requirements**

| Area                  | Description                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- |
| **Execution**         | Every LLM call routed via Temporal workflows/activities.                               |
| **Traceability**      | Each run creates a `SkillTrace` entry in TraceStore (latency, tokens, model, version). |
| **Schema Validation** | Input/output contracts defined via Zod or Pydantic.                                    |
| **Skill Registry**    | YAML manifest describing skill ID, goal, model, template, schemas.                     |
| **Caching (Initial)** | Optional cache reuse keyed by `skillId + templateHash + inputHash`.                    |
| **Monitoring**        | Prometheus / Grafana dashboards for latency and error rates.                           |
| **Persistence**       | TraceStore (Postgres / DuckDB) stores all traces and cacheable results.                |

### **Deliverables**

* `llm-core-runtime` package
* Base Temporal workflow (`BaseLLMWorkflow`)
* `TraceStore` schema and API
* `SkillRegistry` loader + validator
* Metrics exporters (Prometheus + Grafana)

---

## ⚙️ Technical Specification (T-Spec)

### **System Layout**

```
/packages/llm-core-runtime
  ├── runtime/
  │    ├── skill-registry.ts
  │    ├── skill-executor.ts
  │    └── context-provider.ts
  ├── temporal/
  │    └── BaseLLMWorkflow.ts
  ├── utils/
  │    ├── schema.ts
  │    ├── logger.ts
  │    └── trace-store.ts
  └── adapters/
       ├── openai.ts
       ├── anthropic.ts
       └── ollama.ts
```

### **Architecture Overview**

```
┌──────────────────────────────┐
│ Temporal Workflow Layer       │
│  • Orchestrates skill calls   │
│  • Handles retries & logging  │
└───────────────┬──────────────┘
                ↓
┌──────────────────────────────┐
│  LLM Core Runtime             │
│  • Skill Registry             │
│  • Skill Executor             │
│  • Context Provider           │
│  • TraceStore writer          │
└───────────────┬──────────────┘
                ↓
┌──────────────────────────────┐
│  Model Adapters               │
│  • OpenAI / Anthropic / Ollama │
└──────────────────────────────┘
```

### **Design Highlights**

1. **Temporal as Controller** – All skill executions run as deterministic workflows/activities.
2. **Skill Registry** – YAML definition per skill: inputs, outputs, model, goal, schema.
3. **TraceStore** – Postgres or DuckDB table: `traceId, skillId, model, latency, tokens, input, output, timestamp`.
4. **Schema Validation** – Each skill’s input/output validated before and after model call.
5. **Adapters** – Unified interface for all LLM providers.
6. **Metrics** – Prometheus exporter exposes `latency_ms`, `success_rate`, `token_usage`.

### **Integration Principles**

* Deterministic execution only — no dynamic agent loops yet.
* Each skill = atomic unit with clear schema contracts.
* Every execution must emit one trace record.
* All logs → Grafana for visibility.
