import { vi, describe, it, expect, beforeEach } from "vitest";
import { executeIssueInsightSkill } from "../runtime.js";

const mockExecute = vi.fn().mockResolvedValue({
  skillId: "issue-insight.v1",
  traceId: "trace-123",
  output: "{}",
  cached: false,
  latencyMs: 100,
  model: { provider: "ollama", name: "test" },
});

vi.mock("@platform/llm-core-runtime", () => ({
  SkillExecutor: class {
    execute = mockExecute;
  },
  SkillRegistry: class {
    async loadFromDirectory() {}
    overrideSkillModel() {}
  },
  PrismaTraceStore: class {},
  PrometheusSkillMetrics: class {
    getRegistry() {
      return {};
    }
  },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  buildExecutionContext: vi.fn(() => ({ tenantId: "tenant", requestId: "req" })),
  OpenAIAdapter: vi.fn(),
  AnthropicAdapter: vi.fn(),
  OllamaAdapter: vi.fn(),
}));

vi.mock("../../env.js", () => ({
  getEnv: vi.fn(() => ({
    OPENAI_API_KEY: undefined,
    OLLAMA_BASE_URL: "http://localhost:11434",
  })),
}));

vi.mock("../../prisma.js", () => ({ prisma: {} }));

beforeEach(() => {
  mockExecute.mockClear();
});

describe("executeIssueInsightSkill", () => {
  it("hydrates the runtime and executes the skill", async () => {
    const result = await executeIssueInsightSkill({
      tenantId: "tenant",
      payload: {} as any,
      allowCache: true,
    });

    expect(result.skillId).toBe("issue-insight.v1");
    expect(mockExecute).toHaveBeenCalled();
  });
});
