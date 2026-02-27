import { test, expect } from "@playwright/test";
import { setupMockAuth, mockGraphql, testUsers } from "../helpers/mockAuth";

/**
 * AI Summaries E2E tests for the Daily Scrum Board.
 *
 * Validates the full user journey:
 *   S1: Scrum page loads with project selector
 *   S2: User summary cards display populated AI summary data
 *   S3: Offline user summaries display correctly
 *   S4: Empty state when no projects exist
 *   S5: Project-level narrative content renders
 *   S6: Clicking user card opens drawer with AI summary details
 *
 * All GraphQL responses are mocked via route interception.
 * Note: __typename fields are required because Apollo Client's InMemoryCache
 * (addTypename: true by default) needs them for proper cache normalisation.
 * Without them, nested fields like workItems may become null/undefined.
 */

// ---------------------------------------------------------------------------
// Fixture data — mirrors the real GraphQL response shapes
// ---------------------------------------------------------------------------

const MOCK_PROJECTS = [
  { __typename: "ScrumProject", id: "proj-1", key: "JPP", name: "Jira++" },
  { __typename: "ScrumProject", id: "proj-2", key: "META", name: "Metadata" },
];

const MOCK_DAILY_SUMMARIES = [
  {
    __typename: "DailySummary",
    id: "ds-1",
    projectId: "proj-1",
    project: { __typename: "Project", id: "proj-1", key: "JPP", name: "Jira++" },
    trackedUser: {
      __typename: "TrackedUser",
      id: "tracked-1",
      jiraAccountId: "jira-acc-1",
      displayName: "Alice Chen",
      email: "alice@test.local",
      avatarUrl: null,
      isTracked: true,
    },
    jiraAccountId: "jira-acc-1",
    date: "2026-02-27",
    yesterday: "Shipped auth module (AUTH-1), reviewed PR #38",
    today: "Deploy API-5 to staging, start INFRA-3",
    blockers: null,
    createdAt: "2026-02-27T08:00:00.000Z",
    updatedAt: "2026-02-27T08:00:00.000Z",
    status: "ON_TRACK",
    isUnavailable: false,
    worklogHours: 4.5,
    issueCounts: { __typename: "IssueStatusCounts", todo: 1, inProgress: 2, backlog: 0, done: 3, blocked: 0 },
    user: { __typename: "User", id: "user-1", displayName: "Alice Chen", email: "alice@test.local", role: "USER" },
    workItems: [],
  },
  {
    __typename: "DailySummary",
    id: "ds-2",
    projectId: "proj-1",
    project: { __typename: "Project", id: "proj-1", key: "JPP", name: "Jira++" },
    trackedUser: {
      __typename: "TrackedUser",
      id: "tracked-2",
      jiraAccountId: "jira-acc-2",
      displayName: "Bob Smith",
      email: "bob@test.local",
      avatarUrl: null,
      isTracked: true,
    },
    jiraAccountId: "jira-acc-2",
    date: "2026-02-27",
    yesterday: null,
    today: null,
    blockers: null,
    createdAt: "2026-02-27T08:00:00.000Z",
    updatedAt: "2026-02-27T08:00:00.000Z",
    status: "OFFLINE",
    isUnavailable: true,
    worklogHours: 0,
    issueCounts: { __typename: "IssueStatusCounts", todo: 0, inProgress: 0, backlog: 0, done: 0, blocked: 0 },
    user: { __typename: "User", id: "user-2", displayName: "Bob Smith", email: "bob@test.local", role: "USER" },
    workItems: [],
  },
];

const MOCK_USER_SUMMARY = {
  __typename: "UserSummarySnapshot",
  id: "usnap-1",
  projectId: "proj-1",
  userId: "user-1",
  summaryDate: "2026-02-27",
  runId: "run-1",
  taskSummaryIds: ["tsnap-1"],
  createdAt: "2026-02-27T10:00:00.000Z",
  payload: {
    __typename: "UserSummaryPayload",
    identity: {
      __typename: "UserIdentity",
      userId: "user-1",
      trackedUserId: "tracked-1",
      displayName: "Alice Chen",
      jiraAccountId: "jira-acc-1",
    },
    headline: "Shipped auth module, starting API integration",
    accomplishments: [{ __typename: "Accomplishment", issueId: "iss-1", issueKey: "AUTH-1", text: "Auth module merged and deployed" }],
    inFlight: [{ __typename: "InFlightItem", issueId: "iss-2", issueKey: "API-5", status: "IN_PROGRESS", note: "In code review" }],
    blockers: [],
    focusNext: "Deploy API-5 to staging",
    activityMetrics: { __typename: "ActivityMetrics", worklogMinutes: 270, tasksTouched: 3, doneCount: 2, blockerCount: 0 },
    riskFlags: [],
    collaborationNotes: [
      { __typename: "CollaborationNote", partnerUserId: "user-2", partnerDisplayName: "Bob Smith", issueId: "iss-1", issueKey: "AUTH-1", note: "Paired on token refresh" },
    ],
    pendingDecisions: { __typename: "PendingDecisions", ownedByUser: [], waitingOnOthers: [] },
    mood: { __typename: "Mood", label: "positive", score: 0.8, rationale: null },
  },
  narrative: "Alice shipped the auth module and is now focusing on API-5 deployment. Paired with Bob on token refresh logic.",
  narrativeHash: "abc123",
  narrativeGeneratedAt: "2026-02-27T11:00:00.000Z",
  richNarratives: {
    manager: {
      text: "Alice had a highly productive day, completing the critical auth module (AUTH-1) and moving API-5 into code review.",
      generatedAt: "2026-02-27T11:00:00.000Z",
      hash: "rich-hash-1",
      model: "ollama/llama3",
      structured: {
        story: "Alice had a highly productive day, completing the critical auth module (AUTH-1).",
        spotlight: ["AUTH-1 merged and deployed", "API-5 in review"],
        risks: [],
        nextMoves: ["Deploy API-5 to staging"],
        tone: "positive",
      },
    },
  },
  needsNarrativeRefresh: false,
  narrativeRefreshRequestedAt: null,
  narrativeRefreshLockedUntil: null,
  narrativeRefreshAttempts: 0,
  lastNarrativeError: null,
};

const MOCK_IDLE_USER_SUMMARY = {
  __typename: "UserSummarySnapshot",
  id: "usnap-2",
  projectId: "proj-1",
  userId: "user-2",
  summaryDate: "2026-02-27",
  runId: "run-1",
  taskSummaryIds: [],
  createdAt: "2026-02-27T10:00:00.000Z",
  payload: {
    __typename: "UserSummaryPayload",
    identity: {
      __typename: "UserIdentity",
      userId: "user-2",
      trackedUserId: "tracked-2",
      displayName: "Bob Smith",
      jiraAccountId: "jira-acc-2",
    },
    headline: "No recorded activity for today",
    accomplishments: [],
    inFlight: [],
    blockers: [],
    focusNext: null,
    activityMetrics: { __typename: "ActivityMetrics", worklogMinutes: 0, tasksTouched: 0, doneCount: 0, blockerCount: 0 },
    riskFlags: [],
    collaborationNotes: [],
    pendingDecisions: null,
    mood: null,
  },
  narrative: null,
  narrativeHash: null,
  narrativeGeneratedAt: null,
  richNarratives: null,
  needsNarrativeRefresh: false,
  narrativeRefreshRequestedAt: null,
  narrativeRefreshLockedUntil: null,
  narrativeRefreshAttempts: 0,
  lastNarrativeError: null,
};

const MOCK_TASK_SUMMARY = {
  __typename: "TaskSummarySnapshot",
  id: "tsnap-1",
  projectId: "proj-1",
  issueId: "iss-1",
  userId: "user-1",
  summaryDate: "2026-02-27",
  runId: "run-1",
  createdAt: "2026-02-27T10:00:00.000Z",
  payload: {
    __typename: "TaskSummaryPayload",
    issueId: "iss-1",
    issueKey: "AUTH-1",
    issueSummary: "Implement auth module",
    headline: "Auth module completed and merged",
    status: "DONE",
    activityBullets: ["Merged PR #38", "Updated integration tests"],
    nextStep: null,
    riskFlags: [],
    totalWorklogMinutes: 480,
    commentCount: 5,
    lastActivityAt: "2026-02-27T09:00:00.000Z",
    timeline: [],
    participants: [{ __typename: "Participant", userId: "user-1", displayName: "Alice Chen", contributionMinutes: 360, commentCount: 3, waitingOn: false }],
    sentiment: { __typename: "Sentiment", label: "positive", score: 0.85, provider: "heuristic" },
    linkedResources: [],
  },
};

const MOCK_PROJECT_SUMMARY = {
  __typename: "ProjectSummarySnapshot",
  id: "psnap-1",
  projectId: "proj-1",
  summaryDate: "2026-02-27",
  runId: "run-1",
  userSummaryIds: ["usnap-1", "usnap-2"],
  createdAt: "2026-02-27T10:00:00.000Z",
  payload: {
    __typename: "ProjectSummaryPayload",
    executiveBrief: "Sprint 14 is on track with 70% completion. Auth module shipped successfully.",
    topHighlights: [{ __typename: "Highlight", issueId: "iss-1", issueKey: "AUTH-1", userId: "user-1", text: "Auth module shipped" }],
    criticalBlockers: [],
    atRiskWork: [],
    teamHealthSnapshot: {
      __typename: "TeamHealthSnapshot",
      activeUsers: 1,
      trackedUsers: 2,
      idleUsers: 1,
      offlineUsers: 0,
      totalWorklogMinutes: 270,
      doneCount: 2,
      blockerCount: 0,
      idleRate: 0.5,
      blockerRate: 0,
    },
    unassignedWatchlist: [],
    callsToAction: [{ __typename: "CallToAction", text: "Check on idle team members", severity: "info" }],
    atRiskDetails: [],
    workspaceContext: "Sprint 14, Team Alpha",
  },
  narrative: "Sprint 14 is on track. Auth module shipped. 1 idle team member to follow up on.",
  narrativeHash: "proj-hash-1",
  narrativeGeneratedAt: "2026-02-27T11:00:00.000Z",
  richNarratives: null,
  needsNarrativeRefresh: false,
  narrativeRefreshRequestedAt: null,
  narrativeRefreshLockedUntil: null,
  narrativeRefreshAttempts: 0,
  lastNarrativeError: null,
};

const MOCK_PROJECT_DAILY_SUMMARY = {
  __typename: "ProjectDailySummary",
  projectSummary: MOCK_PROJECT_SUMMARY,
  userSummaries: [MOCK_USER_SUMMARY, MOCK_IDLE_USER_SUMMARY],
  taskSummaries: [MOCK_TASK_SUMMARY],
};

// ---------------------------------------------------------------------------
// GraphQL handler builder
// ---------------------------------------------------------------------------

function buildHandlers(options: { empty?: boolean } = {}) {
  return {
    ScrumProjects: () => ({
      data: { scrumProjects: options.empty ? [] : MOCK_PROJECTS },
    }),
    DailySummaries: () => ({
      data: { dailySummaries: options.empty ? [] : MOCK_DAILY_SUMMARIES },
    }),
    ProjectDailySummaries: () => ({
      data: {
        projectDailySummaries: options.empty ? [] : [MOCK_PROJECT_DAILY_SUMMARY],
      },
    }),
    RegenerateDailySummary: () => ({
      data: { regenerateDailySummary: MOCK_DAILY_SUMMARIES[0] },
    }),
    RegenerateProjectSummary: () => ({
      data: {
        regenerateProjectSummary: MOCK_PROJECT_DAILY_SUMMARY,
      },
    }),
    RequestNarrativeRefresh: () => ({
      data: { requestNarrativeRefresh: { __typename: "NarrativeRefreshResult", queuedProject: 1, queuedUser: 2 } },
    }),
    IssueInsights: () => ({
      data: { issueInsights: null },
    }),
    ReportingDefinitions: () => ({
      data: { reportingDefinitions: [] },
    }),
    ReportingRuns: () => ({
      data: { reportingRuns: [] },
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Daily Scrum Board — AI Summaries", () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAuth(page, testUsers.admin);
  });

  test("S1: Scrum page loads and shows project selector", async ({ page }) => {
    await mockGraphql(page, buildHandlers());
    await page.goto("/scrum");

    // Page should load with heading
    await expect(page.getByRole("heading", { name: /daily scrum/i })).toBeVisible({
      timeout: 10_000,
    });

    // Project selector should show the first project option
    const projectSelect = page.locator("select");
    await expect(projectSelect).toBeVisible();
    await expect(projectSelect.locator("option", { hasText: "JPP" })).toBeAttached();
  });

  test("S2: User summary card shows populated daily summary", async ({ page }) => {
    await mockGraphql(page, buildHandlers());
    await page.goto("/scrum");

    // Wait for user cards to load — Alice's name appears in the UserSummaryCard
    // Target the card's button wrapper (contains name + email) to avoid drawer duplicate
    const aliceCard = page.getByRole("button", { name: /Alice Chen/i }).first();
    await expect(aliceCard).toBeVisible({ timeout: 10_000 });

    // Alice's card should show worklog hours (4.5h)
    await expect(page.getByText("4.5h").first()).toBeVisible();

    // Alice's card should show yesterday content (auth module)
    await expect(page.getByText(/auth module/i).first()).toBeVisible();
  });

  test("S3: Offline user summary shows out-of-office status", async ({ page }) => {
    await mockGraphql(page, buildHandlers());
    await page.goto("/scrum");

    // Bob should appear with Out of office badge (OFFLINE → "Out of office" in STATUS_UI)
    await expect(page.getByRole("heading", { name: "Bob Smith" })).toBeVisible({ timeout: 10_000 });

    // Bob's card should show the "Out of office" status badge
    await expect(page.getByText("Out of office").first()).toBeVisible();
  });

  test("S4: Empty state when no projects exist", async ({ page }) => {
    await mockGraphql(page, buildHandlers({ empty: true }));
    await page.goto("/scrum");

    // Should show the "No Jira projects" empty state message
    await expect(
      page.getByText(/No Jira projects linked/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("S5: Project summary narrative content is displayed", async ({ page }) => {
    await mockGraphql(page, buildHandlers());
    await page.goto("/scrum");

    // Project overview card should display the executive brief / narrative
    // The narrative text is: "Sprint 14 is on track. Auth module shipped."
    await expect(
      page.getByText(/Sprint 14/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("S6: Clicking user card opens drawer with AI summary details", async ({ page }) => {
    await mockGraphql(page, buildHandlers());
    await page.goto("/scrum");

    // Wait for cards and click Alice's card button to open the drawer
    const aliceCard = page.getByRole("button", { name: /Alice Chen/i }).first();
    await expect(aliceCard).toBeVisible({ timeout: 10_000 });
    await aliceCard.click();

    // The AISummaryDrawer panel renders "Daily Story" section (unique to the panel)
    await expect(
      page.getByText("Daily Story"),
    ).toBeVisible({ timeout: 5_000 });

    // Should show accomplishment text from the userSnapshot (unique to the drawer, not the card)
    await expect(
      page.getByText("Auth module merged and deployed"),
    ).toBeVisible();
  });
});
