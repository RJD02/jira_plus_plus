import { DateTime } from "luxon";
import pRetry, { AbortError } from "p-retry";
import { Prisma, PrismaClient } from "@platform/cdm";
import { prisma } from "../../prisma.js";
import {
  resolveSiteAuth,
  searchJiraIssues,
  fetchJiraIssueDetail,
  JiraClientError,
} from "../../jira-client.js";
import type { SyncCursor } from "../workflows/syncProjectWorkflow.js";
import { getEnv } from "../../env.js";
import { recordSyncFailure, recordSyncSuccess } from "../../services/telemetry/syncTelemetryService.js";
import { enqueueInsightRefresh } from "../../services/insights/insightQueueService.js";

const ENTITY_KEYS = ["issue", "comment", "worklog"] as const;

const PROGRESS_STATUS_KEYWORDS = ["in progress", "in-review", "doing", "active"];
const RESOLVED_STATUS_KEYWORDS = ["done", "resolved", "closed", "completed", "closed (done)"];

interface PrepareProjectSyncArgs {
  projectId: string;
  fullResync: boolean;
  accountIds: string[] | null;
  lookbackDays: number | null;
}

interface PrepareProjectSyncResult {
  projectId: string;
  projectKey: string;
  siteId: string;
  baseUrl: string;
  adminEmail: string;
  token: string;
  trackedAccountIds: string[];
  since: string | null;
  lookbackDays: number | null;
}

interface SyncIssuesBatchArgs extends PrepareProjectSyncResult {
  cursor: SyncCursor;
}

interface SyncIssuesBatchResult {
  hasMore: boolean;
  nextPageToken?: string | null;
  lastUpdatedAt?: string | null;
}

function extractCommentBody(comment: any): string {
  if (!comment) {
    return "";
  }

  if (typeof comment.body === "string") {
    return comment.body;
  }

  const collectText = (node: any): string => {
    if (!node) {
      return "";
    }
    let text = "";
    if (typeof node.text === "string") {
      text += node.text;
    }
    if (Array.isArray(node.content)) {
      text += node.content.map(collectText).join("");
    }
    return text;
  };

  if (comment.body && typeof comment.body === "object") {
    const docText = collectText(comment.body);
    if (docText.trim()) {
      return docText.trim();
    }
  }

  if (typeof comment.renderedBody === "string") {
    return comment.renderedBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return "";
}

export async function prepareProjectSync(
  args: PrepareProjectSyncArgs,
): Promise<PrepareProjectSyncResult> {
  const project = await prisma.jiraProject.findUnique({
    where: { id: args.projectId },
    include: {
      site: true,
      trackedUsers: true,
      syncStates: true,
      syncJob: true,
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const trackedUsers: Array<{
    jiraAccountId: string;
    displayName: string;
    isTracked?: boolean;
  }> = args.accountIds
    ? args.accountIds.map((accountId) => ({
        jiraAccountId: accountId,
        displayName: accountId,
      }))
    : project.trackedUsers.filter((user) => user.isTracked);

  const trackedAccountIds = trackedUsers.map((user) => user.jiraAccountId);

  await ensureSyncJobRecord(prisma, project, trackedAccountIds);
  await ensureSyncStates(prisma, project.id, project.tenantId);

  const states = await prisma.syncState.findMany({
    where: { projectId: project.id },
  });

  const lastSyncTimes = states
    .map((state) => state.lastSyncTime)
    .filter((value): value is Date => Boolean(value));

  let since: string | null = null;
  if (!args.fullResync) {
    if (args.lookbackDays !== null && args.lookbackDays >= 0) {
      const lookbackStart = DateTime.utc().startOf("day").minus({ days: args.lookbackDays });
      since = lookbackStart.toISO();
    } else if (lastSyncTimes.length > 0) {
      since = DateTime.fromJSDate(new Date(Math.min(...lastSyncTimes.map((d) => d.getTime()))))
        .toUTC()
        .toISO();
    }
  }

  await prisma.syncState.updateMany({
    where: { projectId: project.id, entity: { in: ENTITY_KEYS as unknown as string[] } },
    data: {
      status: "RUNNING",
      updatedAt: new Date(),
    },
  });

  await prisma.syncJob.update({
    where: { projectId: project.id },
    data: {
      status: "ACTIVE",
      lastRunAt: new Date(),
    },
  });

  await prisma.syncLog.create({
    data: {
      projectId: project.id,
      level: "INFO",
      message: `Sync starting${args.fullResync ? " (full)" : ""} for project ${project.key}`,
      details: {
        trackedUsers: trackedAccountIds,
        since,
        lookbackDays: args.lookbackDays,
      },
    },
  });

  const { site, token } = await resolveSiteAuth(prisma, project.tenantId, project.siteId);

  return {
    projectId: project.id,
    projectKey: project.key,
    siteId: site.id,
    baseUrl: site.baseUrl,
    adminEmail: site.adminEmail,
    token,
    trackedAccountIds,
    since,
    lookbackDays: args.lookbackDays,
  };
}

export async function syncIssuesBatch(args: SyncIssuesBatchArgs): Promise<SyncIssuesBatchResult> {
  if (!args.trackedAccountIds.length) {
    return { hasMore: false, lastUpdatedAt: args.since };
  }

  const quotedAccounts = args.trackedAccountIds.map((id) => `"${id}"`).join(", ");
  let jql =
    `project = "${args.projectKey}" AND (` +
    `assignee in (${quotedAccounts}) OR ` +
    `assignee was in (${quotedAccounts}) OR ` +
    `worklogAuthor in (${quotedAccounts}))`;

  if (args.cursor.since) {
    const formatted = DateTime.fromISO(args.cursor.since, { zone: "utc" }).toFormat("yyyy/MM/dd HH:mm");
    jql += ` AND updated >= "${formatted}"`;
  }

  let searchResponse;
  try {
    searchResponse = await pRetry(
      async () => {
        try {
          return await searchJiraIssues({
            baseUrl: args.baseUrl,
            adminEmail: args.adminEmail,
            token: args.token,
            jql,
            nextPageToken: args.cursor.nextPageToken ?? undefined,
            maxResults: 100,
          });
        } catch (error) {
          if (error instanceof JiraClientError && !error.classification.retryable) {
            throw new AbortError(error);
          }
          throw error;
        }
      },
      { retries: 3 },
    );
  } catch (error) {
    if (error instanceof AbortError) {
      const originalError = (error as AbortError & { originalError?: unknown }).originalError;
      if (originalError instanceof JiraClientError) {
        await recordSyncFailure({
          projectId: args.projectId,
          classification: originalError.classification,
          message: originalError.message,
          metadata: { stage: "searchIssues" },
        });
        throw originalError;
      }
    }
    if (error instanceof JiraClientError) {
      await recordSyncFailure({
        projectId: args.projectId,
        classification: error.classification,
        message: error.message,
        metadata: { stage: "searchIssues" },
      });
    }
    throw error;
  }

  if (!searchResponse.issues.length) {
    return {
      hasMore: false,
      nextPageToken: searchResponse.nextPageToken,
      lastUpdatedAt: args.cursor.lastUpdatedAt ?? args.since,
    };
  }

  let lastUpdatedAt = args.cursor.lastUpdatedAt ?? args.since ?? null;
  let processedCount = 0;

  for (const issueSummary of searchResponse.issues) {
    let detail: any;
    try {
      detail = await pRetry(
        async () => {
          try {
            return await fetchJiraIssueDetail({
              baseUrl: args.baseUrl,
              adminEmail: args.adminEmail,
              token: args.token,
              issueIdOrKey: issueSummary.key,
            });
          } catch (error) {
            if (error instanceof JiraClientError && !error.classification.retryable) {
              throw new AbortError(error);
            }
            throw error;
          }
        },
        { retries: 3 },
      );
    } catch (error) {
      if (error instanceof AbortError) {
        const original = (error as AbortError & { originalError?: unknown }).originalError;
        if (original instanceof JiraClientError) {
          await recordSyncFailure({
            projectId: args.projectId,
            classification: original.classification,
            message: original.message,
            metadata: { stage: "issueDetail", issueKey: issueSummary.key },
          });
          throw original;
        }
      }
      if (error instanceof JiraClientError) {
        await recordSyncFailure({
          projectId: args.projectId,
          classification: error.classification,
          message: error.message,
          metadata: { stage: "issueDetail", issueKey: issueSummary.key },
        });
      }
      throw error;
    }

    await upsertIssueFromDetail(args.projectId, detail);
    processedCount += 1;

    const updated = detail.fields?.updated ?? issueSummary.fields.updated;
    if (updated) {
      const iso = DateTime.fromISO(updated).toUTC().toISO();
      if (!lastUpdatedAt || (iso && iso > lastUpdatedAt)) {
        lastUpdatedAt = iso;
      }
    }
  }

  await prisma.syncLog.create({
    data: {
      projectId: args.projectId,
      level: 'INFO',
      message: `Synced ${processedCount} issues (startAt=${searchResponse.nextPageToken})`,
      details: {
        startAt: searchResponse.nextPageToken,
        total: searchResponse.total,
      },
    },
  });

  return {
    hasMore: !searchResponse.isLast,
    nextPageToken: searchResponse.nextPageToken,
    lastUpdatedAt,
  };
}

export async function finalizeProjectSync(args: {
  projectId: string;
  status: "SUCCESS" | "FAILED";
  lastUpdatedAt: string | null;
  message?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const lastSyncTime = args.lastUpdatedAt ? new Date(args.lastUpdatedAt) : undefined;

  if (args.status === "SUCCESS") {
    await recordSyncSuccess(args.projectId);
  }

  await prisma.syncState.updateMany({
    where: { projectId: args.projectId, entity: { in: ENTITY_KEYS as unknown as string[] } },
    data: {
      status: args.status === "SUCCESS" ? "SUCCESS" : "FAILED",
      lastSyncTime,
      updatedAt: new Date(),
    },
  });

  await prisma.syncJob.update({
    where: { projectId: args.projectId },
    data: {
      status: args.status === "SUCCESS" ? "ACTIVE" : "ERROR",
      lastRunAt: new Date(),
    },
  });

  await prisma.syncLog.create({
    data: {
      projectId: args.projectId,
      level: args.status === "SUCCESS" ? "INFO" : "ERROR",
      message: args.message ?? `Sync ${args.status.toLowerCase()}`,
      details: args.details ? (args.details as Prisma.InputJsonValue) : undefined,
    },
  });
}

export async function failProjectSync(args: { projectId: string; error: string }): Promise<void> {
  await prisma.syncState.updateMany({
    where: { projectId: args.projectId, entity: { in: ENTITY_KEYS as unknown as string[] } },
    data: {
      status: "FAILED",
      updatedAt: new Date(),
    },
  });

  await prisma.syncJob.update({
    where: { projectId: args.projectId },
    data: {
      status: "ERROR",
    },
  });

  await prisma.syncLog.create({
    data: {
      projectId: args.projectId,
      level: "ERROR",
      message: "Sync failed",
      details: { error: args.error },
    },
  });
}

async function ensureSyncJobRecord(
  db: PrismaClient,
  project: Prisma.JiraProjectGetPayload<{
    include: { syncJob: true };
  }>,
  trackedAccountIds: string[],
) {
  if (!project.syncJob) {
    const env = getEnv();
    await db.syncJob.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        workflowId: `jira-sync-${project.id}`,
        scheduleId: `jira-sync-schedule-${project.id}`,
        cronSchedule: env.SYNC_DEFAULT_CRON,
        status: "ACTIVE",
        lastRunAt: null,
        nextRunAt: null,
      },
    });
  } else {
    await db.syncJob.update({
      where: { id: project.syncJob.id },
      data: {
        status: "ACTIVE",
      },
    });
  }

  await db.syncLog.create({
    data: {
      projectId: project.id,
      level: "DEBUG",
      message: "Sync job ensured",
      details: { trackedAccountIds },
    },
  });
}

async function ensureSyncStates(db: PrismaClient, projectId: string, tenantId: string) {
  for (const entity of ENTITY_KEYS) {
    await db.syncState.upsert({
      where: {
        tenantId_projectId_entity: {
          tenantId,
          projectId,
          entity,
        },
      },
      create: {
        tenantId,
        projectId,
        entity,
        status: "IDLE",
      },
      update: {},
    });
  }
}

async function upsertIssueFromDetail(projectId: string, detail: any) {
  const tenantId = getEnv().TENANT_ID;
  const fields = detail.fields ?? {};
  const assigneeId = await upsertJiraUser(fields.assignee, tenantId, detail.id);
  const reporterId = fields.reporter ? await upsertJiraUser(fields.reporter, tenantId, `${detail.id}-reporter`) : null;

  let assigneeChangedAt: Date | null = null;
  let startedAt: Date | null = null;
  let resolvedAt: Date | null = fields.resolutiondate ? new Date(fields.resolutiondate) : null;

  for (const entry of detail.changelog?.histories ?? []) {
    if (!entry || !entry.created) continue;
    const createdAt = new Date(entry.created);
    const items = Array.isArray(entry.items) ? entry.items : [];

    if (!assigneeChangedAt && items.some((item: any) => item?.field === "assignee")) {
      assigneeChangedAt = createdAt;
    }

    if (!startedAt && items.some((item: any) => typeof item?.toString === "string" && PROGRESS_STATUS_KEYWORDS.some((keyword) => item.toString.toLowerCase().includes(keyword)))) {
      startedAt = createdAt;
    }

    if (!resolvedAt && items.some((item: any) => typeof item?.toString === "string" && RESOLVED_STATUS_KEYWORDS.some((keyword) => item.toString.toLowerCase().includes(keyword)))) {
      resolvedAt = createdAt;
    }
  }

  const statusCategory = fields.status?.statusCategory?.name ?? null;
  const dueDate = fields.duedate ? new Date(fields.duedate) : null;

  let browseUrl: string | null = null;
  if (detail.self) {
    try {
      const url = new URL(detail.self);
      url.pathname = `/browse/${detail.key}`;
      url.search = "";
      url.hash = "";
      browseUrl = url.toString();
    } catch {
      browseUrl = null;
    }
  }

  let sprintId: string | null = null;
  const sprintField = fields.sprint ?? (fields.closedSprints?.[0] ?? null);
  if (sprintField?.id && sprintField?.name) {
    const sprint = await prisma.sprint.upsert({
      where: { tenantId_jiraId: { tenantId, jiraId: sprintField.id } },
      create: {
        tenantId,
        jiraId: sprintField.id,
        name: sprintField.name,
        state: sprintField.state ?? "UNKNOWN",
        startDate: sprintField.startDate ? new Date(sprintField.startDate) : undefined,
        endDate: sprintField.endDate ? new Date(sprintField.endDate) : undefined,
      },
      update: {
        name: sprintField.name,
        state: sprintField.state ?? "UNKNOWN",
        startDate: sprintField.startDate ? new Date(sprintField.startDate) : undefined,
        endDate: sprintField.endDate ? new Date(sprintField.endDate) : undefined,
      },
    });
    sprintId = sprint.id;
  }

  const parentIssueId = fields.parent?.id ? await ensureIssueStub(fields.parent, tenantId, projectId) : null;

  const issueRecord = await prisma.issue.upsert({
    where: {
      tenantId_jiraId: {
        tenantId,
        jiraId: detail.id,
      },
    },
    create: {
      tenantId,
      jiraId: detail.id,
      key: detail.key,
      projectId,
      summary: fields.summary ?? null,
      status: fields.status?.name ?? "Unknown",
      priority: fields.priority?.name ?? null,
      assigneeId,
      reporterId,
      sprintId,
      parentIssueId,
      dueDate,
      assigneeChangedAt,
      resolvedAt,
      startedAt,
      statusCategory,
      browseUrl,
      jiraCreatedAt: fields.created ? new Date(fields.created) : new Date(),
      jiraUpdatedAt: fields.updated ? new Date(fields.updated) : new Date(),
      remoteData: detail,
    },
    update: {
      key: detail.key,
      summary: fields.summary ?? null,
      status: fields.status?.name ?? "Unknown",
      priority: fields.priority?.name ?? null,
      assigneeId,
      reporterId,
      sprintId,
      parentIssueId,
      dueDate,
      assigneeChangedAt,
      resolvedAt,
      startedAt,
      statusCategory,
      browseUrl,
      jiraUpdatedAt: fields.updated ? new Date(fields.updated) : new Date(),
      remoteData: detail,
    },
  });

  await prisma.issueLink.deleteMany({
    where: {
      tenantId,
      OR: [
        { sourceIssueId: issueRecord.id },
        { targetIssueId: issueRecord.id },
      ],
    },
  });

  const issueLinks: any[] = fields.issuelinks ?? [];
  for (const link of issueLinks) {
    if (!link?.outwardIssue?.id) {
      continue;
    }

    const targetId = await ensureIssueStub(link.outwardIssue, tenantId, projectId);
    if (!targetId) {
      continue;
    }

    const linkUrl = buildBrowseUrl(link.outwardIssue.self, link.outwardIssue.key ?? link.outwardIssue.id ?? detail.key);

    await prisma.issueLink.create({
      data: {
        tenantId,
        sourceIssueId: issueRecord.id,
        targetIssueId: targetId,
        linkType: link.type?.name ?? "UNKNOWN",
        direction: link.type?.outward ?? "outward",
        url: linkUrl,
      },
    });
  }

  const comments = detail.fields?.comment?.comments ?? [];
  for (const comment of comments) {
    const commentAuthorId = await upsertJiraUser(comment.author, tenantId, comment.id);
    const commentBody = extractCommentBody(comment);
    await prisma.comment.upsert({
      where: {
        tenantId_jiraId: {
          tenantId,
          jiraId: comment.id,
        },
      },
      create: {
        tenantId,
        jiraId: comment.id,
        issueId: issueRecord.id,
        authorId: commentAuthorId,
        body: commentBody,
        jiraCreatedAt: comment.created ? new Date(comment.created) : new Date(),
        jiraUpdatedAt: comment.updated ? new Date(comment.updated) : null,
      },
      update: {
        issueId: issueRecord.id,
        authorId: commentAuthorId,
        body: commentBody,
        jiraUpdatedAt: comment.updated ? new Date(comment.updated) : null,
      },
    });
  }

  const worklogs = detail.fields?.worklog?.worklogs ?? [];
  for (const worklog of worklogs) {
    const worklogAuthorId = await upsertJiraUser(worklog.author, tenantId, worklog.id);
    await prisma.worklog.upsert({
      where: {
        tenantId_jiraId: {
          tenantId,
          jiraId: worklog.id,
        },
      },
      create: {
        tenantId,
        jiraId: worklog.id,
        issueId: issueRecord.id,
        authorId: worklogAuthorId,
        description: typeof worklog.comment === "string" ? worklog.comment : null,
        timeSpent: worklog.timeSpentSeconds ?? 0,
        jiraStartedAt: worklog.started ? new Date(worklog.started) : new Date(),
        jiraUpdatedAt: worklog.updated ? new Date(worklog.updated) : new Date(),
      },
      update: {
        issueId: issueRecord.id,
        authorId: worklogAuthorId,
        description: typeof worklog.comment === "string" ? worklog.comment : null,
        timeSpent: worklog.timeSpentSeconds ?? 0,
        jiraStartedAt: worklog.started ? new Date(worklog.started) : new Date(),
        jiraUpdatedAt: worklog.updated ? new Date(worklog.updated) : new Date(),
      },
    });
  }
  if (shouldRefreshInsights(issueRecord, detail, comments, worklogs)) {
    await enqueueInsightRefresh(prisma, tenantId, issueRecord.id);
  }
}

async function upsertJiraUser(user: any, tenantId: string, fallbackKey?: string): Promise<string> {
  const accountId =
    user?.accountId ??
    (fallbackKey ? `anon-${fallbackKey}` : `anon-${Math.random().toString(36).slice(2)}`);

  const record = await prisma.jiraUser.upsert({
    where: {
      tenantId_accountId: {
        tenantId,
        accountId,
      },
    },
    create: {
      tenantId,
      accountId,
      displayName: user?.displayName ?? accountId,
      email: user?.emailAddress ?? null,
      avatarUrl: user?.avatarUrls?.["48x48"] ?? user?.avatarUrls?.["24x24"] ?? null,
    },
    update: {
      displayName: user?.displayName ?? accountId,
      email: user?.emailAddress ?? null,
      avatarUrl: user?.avatarUrls?.["48x48"] ?? user?.avatarUrls?.["24x24"] ?? null,
      updatedAt: new Date(),
    },
  });

  return record.id;
}

function shouldRefreshInsights(
  issueRecord: Prisma.IssueGetPayload<Prisma.IssueDefaultArgs>,
  detail: any,
  comments: any[],
  worklogs: any[],
): boolean {
  if (issueRecord.needsInsightRefresh) {
    return true;
  }

  const refreshedAt = issueRecord.insightRefreshedAt;
  if (!refreshedAt) {
    return true;
  }

  const candidates: Date[] = [];
  const pushIfValid = (value: string | Date | null | undefined) => {
    if (!value) return;
    const dateValue = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(dateValue.getTime())) {
      candidates.push(dateValue);
    }
  };

  pushIfValid(detail?.fields?.updated);
  pushIfValid(detail?.fields?.statuscategorychangedate);
  pushIfValid(issueRecord.jiraUpdatedAt);

  for (const comment of comments) {
    pushIfValid(comment.updated);
    pushIfValid(comment.created);
  }

  for (const worklog of worklogs) {
    pushIfValid(worklog.updated);
    pushIfValid(worklog.started);
  }

  if (!candidates.length) {
    return true;
  }

  const latestActivity = candidates.reduce(
    (latest, current) => (current > latest ? current : latest),
    candidates[0],
  );

  const DRIFT_MS = 60_000;
  return refreshedAt.getTime() + DRIFT_MS < latestActivity.getTime();
}


async function ensureIssueStub(reference: any, tenantId: string, fallbackProjectId: string): Promise<string | null> {
  if (!reference?.id) {
    return null;
  }

  const jiraId: string = reference.id;
  const key: string = reference.key ?? reference.keyString ?? reference.id;

  const existing = await prisma.issue.findUnique({
    where: {
      tenantId_jiraId: {
        tenantId,
        jiraId,
      },
    },
  });
  if (existing) {
    return existing.id;
  }

  let projectId = fallbackProjectId;
  const projectKey: string | undefined = reference.fields?.project?.key ?? reference.fields?.projectKey;
  if (projectKey) {
    const projectRecord = await prisma.jiraProject.findFirst({
      where: { tenantId, key: projectKey },
    });
    if (projectRecord) {
      projectId = projectRecord.id;
    }
  }

  const summary = reference.fields?.summary ?? key;
  const status = reference.fields?.status?.name ?? "Unknown";
  const priority = reference.fields?.priority?.name ?? null;
  const jiraCreatedAt = reference.fields?.created ? new Date(reference.fields.created) : new Date();
  const jiraUpdatedAt = reference.fields?.updated ? new Date(reference.fields.updated) : new Date();
  const stubAssigneeId = reference.fields?.assignee
    ? await upsertJiraUser(reference.fields.assignee, tenantId, `${reference.id}-assignee`)
    : null;

  const stub = await prisma.issue.upsert({
    where: {
      tenantId_jiraId: {
        tenantId,
        jiraId,
      },
    },
    create: {
      tenantId,
      jiraId,
      key,
      projectId,
      summary,
      status,
      priority,
      assigneeId: stubAssigneeId,
      jiraCreatedAt,
      jiraUpdatedAt,
      remoteData: reference,
    },
    update: {
      key,
      summary,
      status,
      priority,
      assigneeId: stubAssigneeId ?? undefined,
      jiraUpdatedAt,
      remoteData: reference,
    },
  });

  return stub.id;
}

function buildBrowseUrl(self: string | undefined, key: string | undefined | null): string | null {
  if (!self || !key) {
    return null;
  }
  try {
    const url = new URL(self);
    url.pathname = `/browse/${key}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
