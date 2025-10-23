import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IssueInsightsOverlay } from "../IssueInsightsOverlay";
import type { DailySummaryRecord } from "../../../types/scrum";

const summary: DailySummaryRecord = {
  id: "summary-1",
  projectId: "project-1",
  project: {
    id: "project-1",
    key: "JPP",
    name: "Jira Plus Plus",
  },
  trackedUser: {
    id: "tracked-1",
    jiraAccountId: "jira-acc-1",
    displayName: "Asha Dev",
    email: "asha@example.com",
    avatarUrl: null,
    isTracked: true,
  },
  jiraAccountId: "jira-acc-1",
  date: "2024-09-18",
  yesterday: "- Wrapped up context service extraction\n- Reviewed PR #456",
  today: "- Kick off vector sync\n- Draft incident timeline",
  blockers: "Waiting on access to incident report.",
  createdAt: "2024-09-18T08:00:00.000Z",
  updatedAt: "2024-09-18T11:00:00.000Z",
  status: "ON_TRACK",
  worklogHours: 6.5,
  issueCounts: {
    todo: 2,
    inProgress: 3,
    backlog: 1,
    done: 4,
    blocked: 1,
  },
  user: {
    id: "user-1",
    displayName: "Asha Dev",
    email: "asha@example.com",
    role: "ENGINEER",
  },
  workItems: [
    {
      status: "In Progress",
      items: [
        {
          issue: {
            id: "JPP-42",
            key: "JPP-42",
            summary: "Implement tenant aware insights overlay",
            status: "In Progress",
            statusCategory: "IN_PROGRESS",
            priority: "High",
            dueDate: "2024-09-22",
            resolvedAt: null,
            startedAt: "2024-09-15",
            jiraUpdatedAt: "2024-09-18T09:45:00.000Z",
            browseUrl: "https://your-domain.atlassian.net/browse/JPP-42",
            assignee: {
              id: "user-1",
              displayName: "Asha Dev",
              email: "asha@example.com",
              avatarUrl: null,
            },
            reporter: {
              id: "user-ops",
              displayName: "Ops Bot",
              email: "ops@example.com",
              avatarUrl: null,
            },
            parent: {
              id: "JPP-10",
              key: "JPP-10",
              summary: "Tenant enablement epic",
              status: "In Progress",
            },
            project: {
              id: "project-1",
              key: "JPP",
              name: "Jira Plus Plus",
            },
            linksOut: [
              {
                id: "link-1",
                linkType: "relates to",
                direction: "OUT",
                url: "https://your-domain.atlassian.net/browse/JPP-44",
                target: {
                  id: "JPP-44",
                  key: "JPP-44",
                  summary: "QA automation for overlay",
                  status: "To Do",
                  statusCategory: "TO_DO",
                  priority: "Medium",
                },
              },
            ],
            linksIn: [
              {
                id: "link-2",
                linkType: "is blocked by",
                direction: "IN",
                source: {
                  id: "JPP-40",
                  key: "JPP-40",
                  summary: "Provision local vector DB",
                  status: "Blocked",
                  statusCategory: "BLOCKED",
                  priority: "High",
                },
              },
            ],
            insight: {
              summary: {
                text: "Overlay is close to ready. Track migration of the last legacy drawers.",
                provider: "local-llm",
                confidence: 0.76,
              },
              sentiment: {
                label: "neutral",
                score: 0.15,
                tones: ["focused", "cautious"],
                provider: "local-llm",
              },
              escalateScore: 0.35,
              signals: [
                {
                  type: "cycle_health",
                  severity: "MEDIUM",
                  detail: "Adaptive overlay still relies on manual QA.",
                  metadata: { overdueByDays: 2 },
                },
                {
                  type: "jira_dependency",
                  severity: "HIGH",
                  detail: "Blocked by provisioning task JPP-40.",
                },
              ],
              computedAt: "2024-09-18T10:00:00.000Z",
              expiresAt: "2024-09-19T10:00:00.000Z",
              providerMetadata: {
                model: "mistral",
                version: "0.3",
              },
            },
          },
          totalWorklogHours: 3.5,
          recentWorklogs: [
            {
              id: "log-1",
              description: "Hooked overlay launch into feature flag.",
              timeSpent: 7200,
              jiraStartedAt: "2024-09-18T07:30:00.000Z",
              author: {
                id: "user-1",
                displayName: "Asha Dev",
                email: "asha@example.com",
              },
            },
          ],
          recentComments: [
            {
              id: "comment-1",
              body: "Blocking task is close. Tracking in https://your-domain.atlassian.net/browse/JPP-40",
              jiraCreatedAt: "2024-09-18T09:00:00.000Z",
              author: {
                id: "user-pm",
                displayName: "PM Rahul",
                email: "rahul@example.com",
              },
            },
          ],
        },
      ],
    },
  ],
};

const localeStringSpy = vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("2024-09-18 09:00");
const localeDateSpy = vi.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("2024-09-18");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-09-18T10:00:00.000Z"));
});

afterAll(() => {
  vi.useRealTimers();
  localeStringSpy.mockRestore();
  localeDateSpy.mockRestore();
});

describe("IssueInsightsOverlay", () => {
  it("renders insights snapshot", () => {
    const markup = renderToStaticMarkup(
      <IssueInsightsOverlay
        open
        summary={summary}
        initialIssueId="JPP-42"
        onClose={() => undefined}
      />,
    );

    expect(markup).toMatchSnapshot();
  });

  it("renders nothing when closed", () => {
    const markup = renderToStaticMarkup(
      <IssueInsightsOverlay
        open={false}
        summary={summary}
        initialIssueId="JPP-42"
        onClose={() => undefined}
      />,
    );

    expect(markup).toBe("");
  });
});
