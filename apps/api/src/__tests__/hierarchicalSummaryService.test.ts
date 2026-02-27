import { describe, it, expect } from "vitest";
import {
  hashObject,
  composeUserNarrative,
  composeProjectNarrative,
  buildUserNarrativeInput,
  buildProjectNarrativeInput,
  mapTaskSummaryRecord,
  mapUserSummaryRecord,
  mapProjectSummaryRecord,
  type UserSummaryPayload,
  type ProjectSummaryPayload,
  type TaskSummarySnapshotRecord,
  type UserSummarySnapshotRecord,
} from "../services/hierarchicalSummaryService.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUserPayload(overrides: Partial<UserSummaryPayload> = {}): UserSummaryPayload {
  return {
    identity: {
      userId: "user-1",
      trackedUserId: "tracked-1",
      displayName: "Alice Chen",
      jiraAccountId: "jira-acc-1",
    },
    userId: "user-1",
    headline: "Shipped auth module, starting API integration",
    accomplishments: [
      { issueId: "iss-1", issueKey: "AUTH-1", text: "Auth module merged" },
    ],
    inFlight: [
      { issueId: "iss-2", issueKey: "API-5", status: "IN_PROGRESS", note: "In code review" },
    ],
    blockers: [],
    focusNext: "Deploy API-5 to staging",
    activityMetrics: {
      worklogMinutes: 270,
      tasksTouched: 3,
      doneCount: 2,
      blockerCount: 0,
    },
    riskFlags: [],
    collaborationNotes: [
      {
        partnerUserId: "user-2",
        partnerDisplayName: "Bob Smith",
        issueId: "iss-1",
        issueKey: "AUTH-1",
        note: "Paired on token refresh logic",
      },
    ],
    pendingDecisions: {
      ownedByUser: [{ issueId: "iss-3", issueKey: "ARCH-1", description: "OAuth vs JWT for v2" }],
      waitingOnOthers: [],
    },
    mood: { label: "positive", score: 0.8 },
    ...overrides,
  };
}

function makeProjectPayload(overrides: Partial<ProjectSummaryPayload> = {}): ProjectSummaryPayload {
  return {
    projectId: "proj-1",
    executiveBrief: "Sprint on track with 70% completion.",
    topHighlights: [
      { issueId: "iss-1", issueKey: "AUTH-1", userId: "user-1", text: "Auth module shipped" },
    ],
    criticalBlockers: [
      { issueId: "iss-4", issueKey: "INFRA-2", userId: "user-2", description: "DB migration stuck", severity: "high" },
    ],
    atRiskWork: [{ flag: "STALLED", count: 2 }],
    teamHealthSnapshot: {
      activeUsers: 4,
      trackedUsers: 5,
      idleUsers: 1,
      offlineUsers: 0,
      totalWorklogMinutes: 1200,
      doneCount: 8,
      blockerCount: 1,
      idleRate: 0.2,
      blockerRate: 0.04,
    },
    unassignedWatchlist: [
      { issueId: "iss-5", issueKey: "BACK-10", issueSummary: "Backlog cleanup" },
    ],
    callsToAction: [
      { text: "Review PR #42 before EOD", severity: "warning" },
      { text: "Reassign BACK-10", severity: "info" },
    ],
    atRiskDetails: [
      { issueId: "iss-6", issueKey: "API-8", reason: "No activity in 3 days", severity: "warning" },
    ],
    workspaceContext: "Team of 5 engineers, sprint 14",
    ...overrides,
  };
}

function makeTaskRecord(overrides = {}): TaskSummarySnapshotRecord {
  return {
    id: "task-snap-1",
    projectId: "proj-1",
    issueId: "iss-1",
    userId: "user-1",
    summaryDate: "2026-02-27",
    runId: "run-1",
    createdAt: "2026-02-27T10:00:00.000Z",
    payload: {
      issueId: "iss-1",
      issueKey: "AUTH-1",
      issueSummary: "Implement auth module",
      headline: "Auth module completed and merged",
      status: "DONE",
      activityBullets: ["Merged PR #38", "Updated tests"],
      nextStep: null,
      riskFlags: [],
      totalWorklogMinutes: 480,
      recentWorklogMinutes: 120,
      commentCount: 5,
      lastActivityAt: "2026-02-27T09:00:00.000Z",
      timeline: [{ at: "2026-02-27T09:00:00.000Z", label: "Merged", actorId: "user-1" }],
      participants: [{ userId: "user-1", displayName: "Alice Chen", contributionMinutes: 360, commentCount: 3 }],
      sentiment: { label: "positive", score: 0.85, provider: "heuristic" },
      linkedResources: [],
    },
    ...overrides,
  };
}

function makeUserRecord(overrides = {}): UserSummarySnapshotRecord {
  return {
    id: "user-snap-1",
    projectId: "proj-1",
    userId: "user-1",
    summaryDate: "2026-02-27",
    runId: "run-1",
    taskSummaryIds: ["task-snap-1"],
    createdAt: "2026-02-27T10:00:00.000Z",
    payload: makeUserPayload(),
    ...overrides,
  };
}

// DB entity shapes (as returned by Prisma)
function makeTaskEntity() {
  return {
    id: "task-snap-1",
    projectId: "proj-1",
    issueId: "iss-1",
    userId: "user-1",
    summaryDate: new Date("2026-02-27"),
    runId: "run-1",
    createdAt: new Date("2026-02-27T10:00:00.000Z"),
    payload: {
      issueId: "iss-1",
      issueKey: "AUTH-1",
      issueSummary: "Implement auth module",
      headline: "Auth module completed",
      status: "DONE",
      activityBullets: [],
      nextStep: null,
      riskFlags: [],
      totalWorklogMinutes: 480,
      recentWorklogMinutes: 120,
      commentCount: 5,
      lastActivityAt: "2026-02-27T09:00:00.000Z",
      timeline: [],
      participants: [],
      sentiment: null,
      linkedResources: [],
    },
    tenantId: "dev",
  };
}

function makeUserEntity() {
  return {
    id: "user-snap-1",
    projectId: "proj-1",
    userId: "user-1",
    summaryDate: new Date("2026-02-27"),
    runId: "run-1",
    taskSummaryIds: ["task-snap-1"],
    createdAt: new Date("2026-02-27T10:00:00.000Z"),
    payload: makeUserPayload(),
    tenantId: "dev",
    narrative: "Alice had a productive day.",
    narrativeHash: "abc123",
    narrativeGeneratedAt: new Date("2026-02-27T11:00:00.000Z"),
    richNarratives: { manager: { story: "test" } },
    needsNarrativeRefresh: false,
    narrativeRefreshRequestedAt: null,
    narrativeRefreshLockedUntil: null,
    narrativeRefreshAttempts: 0,
    lastNarrativeError: null,
  };
}

function makeProjectEntity() {
  return {
    id: "proj-snap-1",
    projectId: "proj-1",
    summaryDate: new Date("2026-02-27"),
    runId: "run-1",
    userSummaryIds: ["user-snap-1"],
    createdAt: new Date("2026-02-27T10:00:00.000Z"),
    payload: makeProjectPayload(),
    tenantId: "dev",
    project: { name: "Jira++", key: "JPP" },
    narrative: "Sprint 14 on track.",
    narrativeHash: "def456",
    narrativeGeneratedAt: new Date("2026-02-27T11:00:00.000Z"),
    richNarratives: null,
    needsNarrativeRefresh: true,
    narrativeRefreshRequestedAt: new Date("2026-02-27T12:00:00.000Z"),
    narrativeRefreshLockedUntil: null,
    narrativeRefreshAttempts: 1,
    lastNarrativeError: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("hashObject", () => {
  it("returns a SHA-256 hex digest", () => {
    const hash = hashObject({ key: "value" });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces consistent hashes for the same input", () => {
    const input = { a: 1, b: "test" };
    expect(hashObject(input)).toBe(hashObject(input));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashObject({ a: 1 })).not.toBe(hashObject({ a: 2 }));
  });
});

describe("buildUserNarrativeInput", () => {
  it("extracts the correct fields from a user payload", () => {
    const payload = makeUserPayload();
    const input = buildUserNarrativeInput(payload);

    expect(input.headline).toBe(payload.headline);
    expect(input.accomplishments).toBe(payload.accomplishments);
    expect(input.inFlight).toBe(payload.inFlight);
    expect(input.blockers).toBe(payload.blockers);
    expect(input.focusNext).toBe(payload.focusNext);
    expect(input.riskFlags).toBe(payload.riskFlags);
    expect(input.metrics).toBe(payload.activityMetrics);
  });

  it("defaults collaborationNotes to empty array", () => {
    const payload = makeUserPayload({ collaborationNotes: undefined });
    const input = buildUserNarrativeInput(payload);
    expect(input.collaborationNotes).toEqual([]);
  });

  it("defaults pendingDecisions to empty shape", () => {
    const payload = makeUserPayload({ pendingDecisions: undefined });
    const input = buildUserNarrativeInput(payload);
    expect(input.pendingDecisions).toEqual({ ownedByUser: [], waitingOnOthers: [] });
  });
});

describe("buildProjectNarrativeInput", () => {
  it("extracts project-level fields plus user headlines and task count", () => {
    const payload = makeProjectPayload();
    const users = [makeUserRecord()];
    const tasks = [makeTaskRecord()];
    const input = buildProjectNarrativeInput(payload, users, tasks);

    expect(input.executiveBrief).toBe(payload.executiveBrief);
    expect(input.highlights).toBe(payload.topHighlights);
    expect(input.criticalBlockers).toBe(payload.criticalBlockers);
    expect(input.teamHealthSnapshot).toBe(payload.teamHealthSnapshot);
    expect(input.userHeadlines).toEqual([users[0]!.payload.headline]);
    expect(input.taskCount).toBe(1);
  });
});

describe("composeUserNarrative", () => {
  it("includes display name, hours, and task counts", () => {
    const payload = makeUserPayload();
    const narrative = composeUserNarrative(payload, [makeTaskRecord()]);

    expect(narrative).toContain("Alice Chen");
    expect(narrative).toContain("4.5h");
    expect(narrative).toContain("3 tasks");
    expect(narrative).toContain("closing 2");
    expect(narrative).toContain("0 blockers");
  });

  it("includes key focus from tasks", () => {
    const tasks = [makeTaskRecord()];
    const narrative = composeUserNarrative(makeUserPayload(), tasks);
    expect(narrative).toContain("AUTH-1");
    expect(narrative).toContain("Key focus:");
  });

  it("includes accomplishments", () => {
    const narrative = composeUserNarrative(makeUserPayload(), []);
    expect(narrative).toContain("Wins: AUTH-1 (Auth module merged)");
  });

  it("includes in-flight items", () => {
    const narrative = composeUserNarrative(makeUserPayload(), []);
    expect(narrative).toContain("In motion: API-5");
  });

  it("includes blockers when present", () => {
    const payload = makeUserPayload({
      blockers: [{ issueId: "iss-x", issueKey: "BUG-1", description: "DB crash", severity: "high" }],
    });
    const narrative = composeUserNarrative(payload, []);
    expect(narrative).toContain("Blockers flagged: BUG-1 (DB crash)");
  });

  it("includes collaboration partners", () => {
    const narrative = composeUserNarrative(makeUserPayload(), []);
    expect(narrative).toContain("Collaboration: paired with Bob Smith");
  });

  it("includes pending decisions", () => {
    const narrative = composeUserNarrative(makeUserPayload(), []);
    expect(narrative).toContain("1 decision to resolve");
  });

  it("includes focus next", () => {
    const narrative = composeUserNarrative(makeUserPayload(), []);
    expect(narrative).toContain("Next up: Deploy API-5 to staging");
  });

  it("falls back to headline when no content sections exist", () => {
    const payload = makeUserPayload({
      accomplishments: [],
      inFlight: [],
      blockers: [],
      collaborationNotes: [],
      pendingDecisions: { ownedByUser: [], waitingOnOthers: [] },
      focusNext: null,
      activityMetrics: { worklogMinutes: 0, tasksTouched: 0, doneCount: 0, blockerCount: 0 },
    });
    const narrative = composeUserNarrative(payload, []);
    expect(narrative).toContain("0.0h across 0 tasks");
  });

  it("handles singular task and blocker counts correctly", () => {
    const payload = makeUserPayload({
      activityMetrics: { worklogMinutes: 60, tasksTouched: 1, doneCount: 0, blockerCount: 1 },
    });
    const narrative = composeUserNarrative(payload, []);
    expect(narrative).toContain("1 task,");
    expect(narrative).toContain("1 blocker.");
  });
});

describe("composeProjectNarrative", () => {
  it("starts with executive brief", () => {
    const payload = makeProjectPayload();
    const narrative = composeProjectNarrative(payload, [makeUserRecord()], [makeTaskRecord()]);
    expect(narrative).toMatch(/^Sprint on track with 70% completion\./);
  });

  it("includes highlights", () => {
    const narrative = composeProjectNarrative(makeProjectPayload(), [], []);
    expect(narrative).toContain("Highlights: AUTH-1: Auth module shipped");
  });

  it("includes calls to action with severity", () => {
    const narrative = composeProjectNarrative(makeProjectPayload(), [], []);
    expect(narrative).toContain("WARNING: Review PR #42 before EOD");
  });

  it("includes critical blockers", () => {
    const narrative = composeProjectNarrative(makeProjectPayload(), [], []);
    expect(narrative).toContain("Blockers under watch: INFRA-2");
  });

  it("includes risk signals", () => {
    const narrative = composeProjectNarrative(makeProjectPayload(), [], []);
    expect(narrative).toContain("Risk signals: STALLED: 2");
  });

  it("includes team health utilisation", () => {
    const narrative = composeProjectNarrative(makeProjectPayload(), [], [makeTaskRecord()]);
    expect(narrative).toContain("80% active");
    expect(narrative).toContain("idle 20%");
    expect(narrative).toContain("20.0h");
  });

  it("includes standout users", () => {
    const narrative = composeProjectNarrative(makeProjectPayload(), [makeUserRecord()], []);
    expect(narrative).toContain("Standouts: Alice Chen");
  });
});

describe("mapTaskSummaryRecord", () => {
  it("maps DB entity to record shape with formatted date", () => {
    const entity = makeTaskEntity();
    const record = mapTaskSummaryRecord(entity as any);

    expect(record.id).toBe("task-snap-1");
    expect(record.summaryDate).toBe("2026-02-27");
    expect(record.createdAt).toBe("2026-02-27T10:00:00.000Z");
    expect(record.payload.issueKey).toBe("AUTH-1");
    expect(record.payload.status).toBe("DONE");
  });
});

describe("mapUserSummaryRecord", () => {
  it("maps DB entity to record shape with narrative fields", () => {
    const entity = makeUserEntity();
    const record = mapUserSummaryRecord(entity as any);

    expect(record.id).toBe("user-snap-1");
    expect(record.summaryDate).toBe("2026-02-27");
    expect(record.narrative).toBe("Alice had a productive day.");
    expect(record.narrativeHash).toBe("abc123");
    expect(record.narrativeGeneratedAt).toBe("2026-02-27T11:00:00.000Z");
    expect(record.richNarratives).toEqual({ manager: { story: "test" } });
    expect(record.needsNarrativeRefresh).toBe(false);
    expect(record.narrativeRefreshAttempts).toBe(0);
  });

  it("defaults narrative fields when not present on entity", () => {
    const entity = makeTaskEntity(); // minimal shape — no narrative fields
    (entity as any).taskSummaryIds = ["task-snap-1"];
    const record = mapUserSummaryRecord(entity as any);

    expect(record.narrative).toBeNull();
    expect(record.narrativeHash).toBeNull();
    expect(record.needsNarrativeRefresh).toBe(false);
    expect(record.narrativeRefreshAttempts).toBe(0);
  });
});

describe("mapProjectSummaryRecord", () => {
  it("maps DB entity to record shape with project name/key", () => {
    const entity = makeProjectEntity();
    const record = mapProjectSummaryRecord(entity as any);

    expect(record.id).toBe("proj-snap-1");
    expect(record.projectName).toBe("Jira++");
    expect(record.projectKey).toBe("JPP");
    expect(record.summaryDate).toBe("2026-02-27");
    expect(record.narrative).toBe("Sprint 14 on track.");
    expect(record.needsNarrativeRefresh).toBe(true);
    expect(record.narrativeRefreshAttempts).toBe(1);
  });

  it("sanitizes payload arrays to prevent undefined", () => {
    const entity = makeProjectEntity();
    (entity.payload as any).topHighlights = undefined;
    (entity.payload as any).criticalBlockers = null;
    const record = mapProjectSummaryRecord(entity as any);

    expect(record.payload.topHighlights).toEqual([]);
    expect(record.payload.criticalBlockers).toEqual([]);
  });

  it("handles missing project relation gracefully", () => {
    const entity = makeProjectEntity();
    (entity as any).project = undefined;
    const record = mapProjectSummaryRecord(entity as any);

    expect(record.projectName).toBeNull();
    expect(record.projectKey).toBeNull();
  });
});
