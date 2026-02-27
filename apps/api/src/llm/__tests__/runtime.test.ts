import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared with vi.hoisted() since vi.mock is hoisted
// ---------------------------------------------------------------------------

const { mockExecute, mockLoadFromDirectory, mockOverrideSkillModel, mockBuildExecutionContext } =
  vi.hoisted(() => ({
    mockExecute: vi.fn(),
    mockLoadFromDirectory: vi.fn(),
    mockOverrideSkillModel: vi.fn(),
    mockBuildExecutionContext: vi.fn(
      (opts: { tenantId: string; userId?: string | null; requestId?: string }) => ({
        tenantId: opts.tenantId,
        userId: opts.userId ?? null,
        requestId: opts.requestId ?? "test-req",
      }),
    ),
  }));

vi.mock("@platform/llm-core-runtime", () => ({
  SkillExecutor: class {
    execute = mockExecute;
  },
  SkillRegistry: class {
    loadFromDirectory = mockLoadFromDirectory;
    overrideSkillModel = mockOverrideSkillModel;
  },
  PrismaTraceStore: class {},
  PrometheusSkillMetrics: class {
    getRegistry() {
      return { metrics: "test-registry" };
    }
  },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  buildExecutionContext: mockBuildExecutionContext,
  OpenAIAdapter: vi.fn(),
  AnthropicAdapter: vi.fn(),
  OllamaAdapter: vi.fn(),
}));

vi.mock("../../env.js", () => ({
  getEnv: vi.fn(() => ({
    OPENAI_API_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    OLLAMA_BASE_URL: "http://localhost:11434",
    INSIGHTS_PROVIDER: undefined,
    NARRATIVE_PROVIDER: undefined,
    OPENAI_MODEL: undefined,
    ANTHROPIC_MODEL: undefined,
    OLLAMA_MODEL: undefined,
    NARRATIVE_MODEL: undefined,
  })),
}));

vi.mock("../../prisma.js", () => ({ prisma: {} }));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  executeIssueInsightSkill,
  executeProjectNarrativeSkill,
  executeUserNarrativeSkill,
  getLLMMetricsRegistry,
  reloadSkillRegistry,
} from "../runtime.js";
import type {
  IssueInsightSkillInput,
  ProjectNarrativeSkillInput,
  UserNarrativeSkillInput,
} from "../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInsightResult(overrides = {}) {
  return {
    skillId: "issue-insight.v1",
    traceId: "trace-insight-1",
    output: '{"summary":{"text":"Test insight"}}',
    cached: false,
    latencyMs: 120,
    model: { provider: "ollama", name: "llama3" },
    ...overrides,
  };
}

function makeNarrativeResult(skillId: string, overrides = {}) {
  return {
    skillId,
    traceId: `trace-${skillId}`,
    output: '{"story":"Once upon a time...","tone":"neutral"}',
    cached: false,
    latencyMs: 200,
    model: { provider: "ollama", name: "llama3" },
    ...overrides,
  };
}

const ISSUE_INSIGHT_PAYLOAD: IssueInsightSkillInput = {
  issueKey: "PRJ-42",
  issueSummary: "Fix login timeout on mobile",
  issueStatus: "In Progress",
  statusCategory: "indeterminate",
  priority: "High",
  dueDate: "2026-03-01",
  resolvedAt: "",
  ruleSummary: "SLA breach in 2 days",
  incrementalSummary: "Token refresh logic updated",
  heuristicSentimentLabel: "negative",
  heuristicSentimentScore: "0.3",
  heuristicSentimentTones: "frustrated,urgent",
  stageSummary: "Development > Code Review",
  recentComments: "Need to prioritize this",
  recentWorklogs: "2h yesterday on auth module",
  waitingOn: "QA team",
  additionalNotes: "",
};

const PROJECT_NARRATIVE_PAYLOAD: ProjectNarrativeSkillInput = {
  persona: "manager",
  summaryDate: "2026-02-27",
  executiveBrief: "Sprint on track with 70% completion",
  workspaceContext: "Team of 5 engineers",
  teamHealth: "1 member idle, 0 blockers",
  highlights: "Auth module shipped",
  collaboration: "Paired programming on API layer",
  risks: "Dependency on external API",
  callsToAction: "Review PR #42",
  userHeadlines: "Alice: 3 tasks done; Bob: blocked on infra",
  taskSignals: "2 tasks overdue",
  sentimentNotes: "Team morale positive",
};

const USER_NARRATIVE_PAYLOAD: UserNarrativeSkillInput = {
  persona: "manager",
  summaryDate: "2026-02-27",
  displayName: "Alice Chen",
  headline: "Shipped auth module, starting API integration",
  metrics: "4.5h logged, 3 tasks touched, 2 closed",
  accomplishments: "AUTH-1 merged, AUTH-2 tested",
  inFlight: "API-5 in code review",
  blockers: "None",
  collaborationNotes: "Paired with Bob on token logic",
  pendingDecisions: "OAuth vs JWT for v2",
  mood: "positive",
  taskHighlights: "AUTH-1: critical path item completed",
  riskFlags: "None",
  focusNext: "API-5 deployment",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockExecute.mockReset();
  mockBuildExecutionContext.mockClear();
});

describe("executeIssueInsightSkill", () => {
  it("hydrates the runtime and executes the skill", async () => {
    mockExecute.mockResolvedValue(makeInsightResult());
    const result = await executeIssueInsightSkill({
      tenantId: "tenant-1",
      payload: ISSUE_INSIGHT_PAYLOAD,
      allowCache: true,
    });

    expect(result.skillId).toBe("issue-insight.v1");
    expect(result.output).toContain("Test insight");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: "issue-insight.v1",
        payload: ISSUE_INSIGHT_PAYLOAD,
        allowCache: true,
      }),
    );
  });

  it("passes tenantId and userId to execution context", async () => {
    mockExecute.mockResolvedValue(makeInsightResult());
    await executeIssueInsightSkill({
      tenantId: "tenant-abc",
      userId: "user-xyz",
      requestId: "req-123",
      payload: ISSUE_INSIGHT_PAYLOAD,
      allowCache: false,
    });

    expect(mockBuildExecutionContext).toHaveBeenCalledWith({
      tenantId: "tenant-abc",
      userId: "user-xyz",
      requestId: "req-123",
    });
  });

  it("defaults userId to null when not provided", async () => {
    mockExecute.mockResolvedValue(makeInsightResult());
    await executeIssueInsightSkill({
      tenantId: "tenant-1",
      payload: ISSUE_INSIGHT_PAYLOAD,
      allowCache: true,
    });

    expect(mockBuildExecutionContext).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });

  it("passes providerOverride when specified", async () => {
    mockExecute.mockResolvedValue(makeInsightResult());
    await executeIssueInsightSkill({
      tenantId: "tenant-1",
      payload: ISSUE_INSIGHT_PAYLOAD,
      allowCache: false,
      providerOverride: "anthropic",
    });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ providerOverride: "anthropic" }),
    );
  });

  it("omits providerOverride when null", async () => {
    mockExecute.mockResolvedValue(makeInsightResult());
    await executeIssueInsightSkill({
      tenantId: "tenant-1",
      payload: ISSUE_INSIGHT_PAYLOAD,
      allowCache: true,
      providerOverride: null,
    });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ providerOverride: undefined }),
    );
  });

  it("returns cached results when executor provides them", async () => {
    mockExecute.mockResolvedValue(makeInsightResult({ cached: true, latencyMs: 2 }));
    const result = await executeIssueInsightSkill({
      tenantId: "tenant-1",
      payload: ISSUE_INSIGHT_PAYLOAD,
      allowCache: true,
    });

    expect(result.cached).toBe(true);
    expect(result.latencyMs).toBe(2);
  });

  it("propagates executor errors", async () => {
    mockExecute.mockRejectedValue(new Error("Adapter timeout"));
    await expect(
      executeIssueInsightSkill({
        tenantId: "tenant-1",
        payload: ISSUE_INSIGHT_PAYLOAD,
        allowCache: false,
      }),
    ).rejects.toThrow("Adapter timeout");
  });
});

describe("executeProjectNarrativeSkill", () => {
  it("executes the project-narrative.v1 skill", async () => {
    mockExecute.mockResolvedValue(makeNarrativeResult("project-narrative.v1"));
    const result = await executeProjectNarrativeSkill({
      tenantId: "tenant-1",
      payload: PROJECT_NARRATIVE_PAYLOAD,
      allowCache: true,
    });

    expect(result.skillId).toBe("project-narrative.v1");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: "project-narrative.v1",
        payload: PROJECT_NARRATIVE_PAYLOAD,
      }),
    );
  });

  it("sets userId to null for project narratives", async () => {
    mockExecute.mockResolvedValue(makeNarrativeResult("project-narrative.v1"));
    await executeProjectNarrativeSkill({
      tenantId: "tenant-1",
      payload: PROJECT_NARRATIVE_PAYLOAD,
      allowCache: false,
    });

    expect(mockBuildExecutionContext).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });
});

describe("executeUserNarrativeSkill", () => {
  it("executes the user-narrative.v1 skill", async () => {
    mockExecute.mockResolvedValue(makeNarrativeResult("user-narrative.v1"));
    const result = await executeUserNarrativeSkill({
      tenantId: "tenant-1",
      payload: USER_NARRATIVE_PAYLOAD,
      allowCache: true,
    });

    expect(result.skillId).toBe("user-narrative.v1");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: "user-narrative.v1",
        payload: USER_NARRATIVE_PAYLOAD,
      }),
    );
  });

  it("passes providerOverride for user narratives", async () => {
    mockExecute.mockResolvedValue(makeNarrativeResult("user-narrative.v1"));
    await executeUserNarrativeSkill({
      tenantId: "tenant-1",
      payload: USER_NARRATIVE_PAYLOAD,
      allowCache: false,
      providerOverride: "openai",
    });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ providerOverride: "openai" }),
    );
  });
});

describe("getLLMMetricsRegistry", () => {
  it("returns the Prometheus metrics registry", () => {
    const registry = getLLMMetricsRegistry();
    expect(registry).toEqual({ metrics: "test-registry" });
  });
});

describe("reloadSkillRegistry", () => {
  it("reloads skills from the directory", async () => {
    await reloadSkillRegistry();
    expect(mockLoadFromDirectory).toHaveBeenCalled();
  });
});
