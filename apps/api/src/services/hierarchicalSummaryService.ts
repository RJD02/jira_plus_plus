import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { v4 as uuid } from "uuid";
import type { Prisma, PrismaClient } from "@platform/cdm";
import type {
  DailySummarySnapshot,
  DailySummaryWorkItem,
  DailySummaryWorkItemGroup,
} from "./dailySummaryService";
import { generateSummariesForDate } from "./dailySummaryService";

export type TaskSummaryStatus = "BLOCKED" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "STALLED";

export interface TaskTimelineEvent {
  at: string;
  label: string;
  actorId: string | null;
}

export interface TaskParticipant {
  userId: string | null;
  displayName: string;
  contributionMinutes: number;
  commentCount: number;
  waitingOn?: boolean;
}

export type TaskLinkedResourceType = "issue" | "pr" | "doc" | "other";

export interface TaskLinkedResource {
  label: string;
  url: string;
  type: TaskLinkedResourceType;
}

export interface TaskSentimentSnapshot {
  label: string;
  score: number;
  provider: string;
}

export interface TaskSummaryPayload {
  issueId: string;
  issueKey: string;
  issueSummary: string;
  headline: string;
  status: TaskSummaryStatus;
  activityBullets: string[];
  nextStep: string | null;
  riskFlags: string[];
  totalWorklogMinutes: number;
  recentWorklogMinutes: number;
  commentCount: number;
  lastActivityAt: string | null;
  timeline: TaskTimelineEvent[];
  participants: TaskParticipant[];
  sentiment: TaskSentimentSnapshot | null;
  linkedResources: TaskLinkedResource[];
}

export interface CollaborationNote {
  partnerUserId: string | null;
  partnerDisplayName: string | null;
  issueId: string | null;
  issueKey: string | null;
  note: string;
}

export interface PendingDecisionItem {
  issueId: string;
  issueKey: string;
  description: string;
}

export interface PendingDecisionsPayload {
  ownedByUser: PendingDecisionItem[];
  waitingOnOthers: PendingDecisionItem[];
}

export interface MoodSnapshot {
  label: string;
  score: number;
  rationale?: string;
}

export interface UserSummaryPayload {
  identity: {
    userId: string | null;
    trackedUserId: string | null;
    displayName: string;
    jiraAccountId: string | null;
  };
  userId: string | null;
  headline: string;
  accomplishments: Array<{ issueId: string; issueKey: string; text: string }>;
  inFlight: Array<{ issueId: string; issueKey: string; status: TaskSummaryStatus; note: string }>;
  blockers: Array<{ issueId: string; issueKey: string; description: string; severity: "high" | "medium" | "low" }>;
  focusNext: string | null;
  activityMetrics: {
    worklogMinutes: number;
    tasksTouched: number;
    doneCount: number;
    blockerCount: number;
  };
  riskFlags: string[];
  collaborationNotes?: CollaborationNote[];
  pendingDecisions?: PendingDecisionsPayload;
  mood?: MoodSnapshot | null;
}

export interface ProjectSummaryPayload {
  projectId: string;
  executiveBrief: string;
  topHighlights: Array<{ issueId: string; issueKey: string; userId: string | null; text: string }>;
  criticalBlockers: Array<{
    issueId: string;
    issueKey: string;
    userId: string | null;
    description: string;
    severity: "high" | "medium" | "low";
  }>;
  atRiskWork: Array<{ flag: string; count: number }>;
  teamHealthSnapshot: {
    activeUsers: number;
    trackedUsers: number;
    idleUsers: number;
    offlineUsers: number;
    totalWorklogMinutes: number;
    doneCount: number;
    blockerCount: number;
    idleRate: number;
    blockerRate: number;
  };
  unassignedWatchlist: Array<{ issueId: string; issueKey: string; issueSummary: string }>;
  callsToAction: Array<{
    text: string;
    severity: "info" | "warning" | "critical";
  }>;
  atRiskDetails: Array<{
    issueId: string;
    issueKey: string;
    reason: string;
    severity: "info" | "warning" | "critical";
  }>;
  workspaceContext: string | null;
}

export interface TaskSummarySnapshotRecord {
  id: string;
  projectId: string;
  issueId: string;
  userId: string | null;
  summaryDate: string;
  runId: string;
  createdAt: string;
  payload: TaskSummaryPayload;
}

export interface UserSummarySnapshotRecord {
  id: string;
  projectId: string;
  userId: string | null;
  summaryDate: string;
  runId: string;
  taskSummaryIds: string[];
  createdAt: string;
  payload: UserSummaryPayload;
  narrative?: string | null;
  narrativeHash?: string | null;
  narrativeGeneratedAt?: string | null;
  richNarratives?: Record<string, unknown> | null;
  needsNarrativeRefresh?: boolean;
  narrativeRefreshRequestedAt?: string | null;
  narrativeRefreshLockedUntil?: string | null;
  narrativeRefreshAttempts?: number;
  lastNarrativeError?: string | null;
}

export interface ProjectSummarySnapshotRecord {
  id: string;
  projectId: string;
  summaryDate: string;
  runId: string;
  userSummaryIds: string[];
  createdAt: string;
  payload: ProjectSummaryPayload;
  narrative?: string | null;
  narrativeHash?: string | null;
  narrativeGeneratedAt?: string | null;
  richNarratives?: Record<string, unknown> | null;
  needsNarrativeRefresh?: boolean;
  narrativeRefreshRequestedAt?: string | null;
  narrativeRefreshLockedUntil?: string | null;
  narrativeRefreshAttempts?: number;
  lastNarrativeError?: string | null;
}

export interface ProjectDailySummaryRecord {
  projectSummary: ProjectSummarySnapshotRecord;
  userSummaries: UserSummarySnapshotRecord[];
  taskSummaries: TaskSummarySnapshotRecord[];
}

type TaskSummarySnapshotEntity = Prisma.TaskSummarySnapshotGetPayload<Prisma.TaskSummarySnapshotDefaultArgs>;
type UserSummarySnapshotEntity = Prisma.UserSummarySnapshotGetPayload<Prisma.UserSummarySnapshotDefaultArgs>;
type ProjectSummarySnapshotEntity = Prisma.ProjectSummarySnapshotGetPayload<Prisma.ProjectSummarySnapshotDefaultArgs>;

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

function coerceJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

interface GenerationContext {
  prisma: PrismaExecutor;
  projectId: string;
  standupDate: DateTime;
  runId: string;
  dailySnapshots: DailySummarySnapshot[];
}

export async function generateHierarchicalSummariesForDate(
  prisma: PrismaExecutor,
  dateInput: string | Date,
  projectId: string,
): Promise<ProjectDailySummaryRecord> {
  const standupDate = resolveSummaryDate(dateInput);
  const runId = uuid();
  const prismaForSummaries = prisma as unknown as PrismaClient;
  const dailySnapshots = await generateSummariesForDate(
    prismaForSummaries,
    standupDate.toISODate()!,
    projectId,
  );

  const ctx: GenerationContext = {
    prisma,
    projectId,
    standupDate,
    runId,
    dailySnapshots,
  };

  const runGeneration = async (tx: Prisma.TransactionClient) => {
    const scopedCtx: GenerationContext = { ...ctx, prisma: tx };
    const taskBundle = await persistTaskSummaries(tx, scopedCtx);
    const users = await persistUserSummaries(tx, scopedCtx, taskBundle);
    const project = await persistProjectSummary(tx, scopedCtx, users, taskBundle);
    return {
      projectSummary: project,
      userSummaries: users,
      taskSummaries: taskBundle.records,
    };
  };

  if (hasTransactionCapability(prisma)) {
    return prisma.$transaction((tx) => runGeneration(tx));
  }

  return runGeneration(prisma as Prisma.TransactionClient);
}

function hasTransactionCapability(value: PrismaExecutor): value is PrismaClient {
  return typeof (value as PrismaClient).$transaction === "function";
}

export async function fetchProjectSummaries(
  prisma: PrismaClient,
  projectId: string,
  range: { start: string; end: string },
  includeTasks = false,
): Promise<ProjectDailySummaryRecord[]> {
  const start = resolveSummaryDate(range.start);
  const end = resolveSummaryDate(range.end);

  const projectSummaries = await prisma.projectSummarySnapshot.findMany({
    where: {
      projectId,
      summaryDate: {
        gte: start.toJSDate(),
        lte: end.toJSDate(),
      },
    },
    orderBy: [{ summaryDate: "desc" }, { createdAt: "desc" }],
  });

  const userSummaries = await prisma.userSummarySnapshot.findMany({
    where: {
      projectId,
      runId: { in: projectSummaries.map((record) => record.runId) },
    },
    orderBy: [{ summaryDate: "desc" }, { createdAt: "desc" }],
  });

  const taskSummaries = includeTasks
    ? await prisma.taskSummarySnapshot.findMany({
        where: {
          projectId,
          runId: { in: projectSummaries.map((record) => record.runId) },
        },
      })
    : [];

  return projectSummaries.map((project) => {
    const runId = project.runId;
    const usersForRun = userSummaries.filter((entry) => entry.runId === runId);
    const tasksForRun = includeTasks
      ? taskSummaries.filter((entry) => entry.runId === runId)
      : [];
    return {
      projectSummary: mapProjectSummaryRecord(project),
      userSummaries: usersForRun.map(mapUserSummaryRecord),
      taskSummaries: tasksForRun.map(mapTaskSummaryRecord),
    };
  });
}

export async function fetchLatestProjectSummary(
  prisma: PrismaClient,
  projectId: string,
): Promise<ProjectDailySummaryRecord | null> {
  const latest = await prisma.projectSummarySnapshot.findFirst({
    where: { projectId },
    orderBy: [{ summaryDate: "desc" }, { createdAt: "desc" }],
  });

  if (!latest) {
    return null;
  }

  const userSummaries = await prisma.userSummarySnapshot.findMany({
    where: { projectId, runId: latest.runId },
    orderBy: [{ summaryDate: "desc" }, { createdAt: "desc" }],
  });

  const taskSummaries = await prisma.taskSummarySnapshot.findMany({
    where: { projectId, runId: latest.runId },
  });

  return {
    projectSummary: mapProjectSummaryRecord(latest),
    userSummaries: userSummaries.map(mapUserSummaryRecord),
    taskSummaries: taskSummaries.map(mapTaskSummaryRecord),
  };
}

function resolveSummaryDate(dateInput: string | Date): DateTime {
  if (dateInput instanceof Date) {
    return DateTime.fromJSDate(dateInput).startOf("day");
  }
  return DateTime.fromISO(dateInput, { zone: "utc" }).startOf("day");
}

async function persistTaskSummaries(
  prisma: Prisma.TransactionClient,
  ctx: GenerationContext,
): Promise<{
  records: TaskSummarySnapshotRecord[];
  tasksByDailyId: Map<string, TaskSummarySnapshotRecord[]>;
}> {
  const records: TaskSummarySnapshotRecord[] = [];
  const tasksByDailyId = new Map<string, TaskSummarySnapshotRecord[]>();
  for (const daily of ctx.dailySnapshots) {
    for (const group of daily.workItems) {
      for (const item of group.items) {
        const payload = buildTaskPayload(ctx, group, item);
        const created = await prisma.taskSummarySnapshot.create({
          data: {
            projectId: ctx.projectId,
            issueId: item.issue.id,
            userId: daily.user?.id ?? null,
            summaryDate: ctx.standupDate.toJSDate(),
            runId: ctx.runId,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
        const mapped = mapTaskSummaryRecord(created);
        records.push(mapped);
        const bucket = tasksByDailyId.get(daily.id) ?? [];
        bucket.push(mapped);
        tasksByDailyId.set(daily.id, bucket);
      }
    }
  }
  return { records, tasksByDailyId };
}

async function persistUserSummaries(
  prisma: Prisma.TransactionClient,
  ctx: GenerationContext,
  taskBundle: {
    records: TaskSummarySnapshotRecord[];
    tasksByDailyId: Map<string, TaskSummarySnapshotRecord[]>;
  },
): Promise<UserSummarySnapshotRecord[]> {
  const records: UserSummarySnapshotRecord[] = [];
  for (const daily of ctx.dailySnapshots) {
    const userTasks = taskBundle.tasksByDailyId.get(daily.id) ?? [];
    const payload = buildUserPayload(daily, userTasks);
    const narrativeInput = buildUserNarrativeInput(payload);
    const narrativeHash = hashObject(narrativeInput);
    let narrativeGeneratedAt = new Date();
    let narrative = composeUserNarrative(payload, userTasks);

    if (daily.user?.id) {
      const previous = (await prisma.userSummarySnapshot.findFirst({
        where: {
          projectId: ctx.projectId,
          userId: daily.user.id,
          summaryDate: { lt: ctx.standupDate.toJSDate() },
        },
        orderBy: { summaryDate: "desc" },
        select: {
          narrative: true,
          narrativeHash: true,
          narrativeGeneratedAt: true,
        },
      } as any)) as { narrative?: string | null; narrativeHash?: string | null; narrativeGeneratedAt?: Date | null } | null;
      if (previous?.narrative && previous.narrativeHash === narrativeHash) {
        narrative = previous.narrative;
        narrativeGeneratedAt = previous.narrativeGeneratedAt ?? narrativeGeneratedAt;
      }
    }

    const created = await prisma.userSummarySnapshot.create({
      data: {
        projectId: ctx.projectId,
        userId: daily.user?.id ?? null,
        summaryDate: ctx.standupDate.toJSDate(),
        runId: ctx.runId,
        taskSummaryIds: userTasks.map((task) => task.id),
        payload: payload as unknown as Prisma.InputJsonValue,
        narrative,
        narrativeHash,
        narrativeGeneratedAt,
        needsNarrativeRefresh: true,
        narrativeRefreshRequestedAt: new Date(),
        richNarratives: {
          manager: {
            text: narrative,
            generatedAt: narrativeGeneratedAt,
            hash: narrativeHash,
            model: "deterministic-template",
          },
        } satisfies Record<string, unknown>,
      } as any,
    });
    records.push(mapUserSummaryRecord(created));
  }
  return records;
}

async function persistProjectSummary(
  prisma: Prisma.TransactionClient,
  ctx: GenerationContext,
  users: UserSummarySnapshotRecord[],
  taskBundle: {
    records: TaskSummarySnapshotRecord[];
  },
): Promise<ProjectSummarySnapshotRecord> {
  const payload = buildProjectPayload(ctx, users, taskBundle.records);
  const projectNarrativeInput = buildProjectNarrativeInput(payload, users, taskBundle.records);
  const projectNarrativeHash = hashObject(projectNarrativeInput);
  let projectNarrativeGeneratedAt = new Date();
  let projectNarrative = composeProjectNarrative(payload, users, taskBundle.records);

  const previous = (await prisma.projectSummarySnapshot.findFirst({
    where: {
      projectId: ctx.projectId,
      summaryDate: { lt: ctx.standupDate.toJSDate() },
    },
    orderBy: { summaryDate: "desc" },
    select: {
      narrative: true,
      narrativeHash: true,
      narrativeGeneratedAt: true,
    },
  } as any)) as { narrative?: string | null; narrativeHash?: string | null; narrativeGeneratedAt?: Date | null } | null;

  if (previous?.narrative && previous.narrativeHash === projectNarrativeHash) {
    projectNarrative = previous.narrative;
    projectNarrativeGeneratedAt = previous.narrativeGeneratedAt ?? projectNarrativeGeneratedAt;
  }

  const created = await prisma.projectSummarySnapshot.create({
    data: {
      projectId: ctx.projectId,
      summaryDate: ctx.standupDate.toJSDate(),
      runId: ctx.runId,
      userSummaryIds: users.map((summary) => summary.id),
      payload: payload as unknown as Prisma.InputJsonValue,
      narrative: projectNarrative,
      narrativeHash: projectNarrativeHash,
      narrativeGeneratedAt: projectNarrativeGeneratedAt,
      needsNarrativeRefresh: true,
      narrativeRefreshRequestedAt: new Date(),
      richNarratives: {
        manager: {
          text: projectNarrative,
          generatedAt: projectNarrativeGeneratedAt,
          hash: projectNarrativeHash,
          model: "deterministic-template",
        },
      } satisfies Record<string, unknown>,
    } as any,
  });
  return mapProjectSummaryRecord(created);
}

function buildTaskPayload(
  ctx: GenerationContext,
  group: DailySummaryWorkItemGroup,
  item: DailySummaryWorkItem,
): TaskSummaryPayload {
  const status = normalizeTaskStatus(group.status, item);
  const riskFlags = deriveRiskFlags(status, item);

  const worklogMinutes = Math.round((item.totalWorklogHours ?? 0) * 60);
  const recentCutoff = ctx.standupDate.minus({ days: 1 });
  const recentWorklogMinutes = item.recentWorklogs.reduce((total, worklog) => {
    const startedAt = DateTime.fromJSDate(worklog.jiraStartedAt);
    if (startedAt < recentCutoff) {
      return total;
    }
    return total + Math.max(0, Math.round((worklog.timeSpent ?? 0) / 60));
  }, 0);
  const commentCount = item.recentComments.length;
  const lastActivity = resolveLastActivity(item);
  const timeline = buildTaskTimeline(item);
  const participants = buildTaskParticipants(item, riskFlags);
  const sentiment = extractTaskSentiment(item);
  const linkedResources = buildTaskLinkedResources(item);

  return {
    issueId: item.issue.id,
    issueKey: item.issue.key,
    issueSummary: item.issue.summary ?? "Untitled task",
    headline: generateHeadline(status, item),
    status,
    activityBullets: buildActivityBullets(item),
    nextStep: deriveNextStep(status, item),
    riskFlags,
    totalWorklogMinutes: worklogMinutes,
    recentWorklogMinutes,
    commentCount,
    lastActivityAt: lastActivity,
    timeline,
    participants,
    sentiment,
    linkedResources,
  };
}

function buildTaskTimeline(item: DailySummaryWorkItem): Array<{ at: string; label: string; actorId: string | null }> {
  const events: Array<{ at: string; label: string; actorId: string | null }> = [];

  const pushEvent = (dateValue: Date | string | null | undefined, label: string, actorId: string | null) => {
    if (!dateValue) return;
    const iso =
      typeof dateValue === "string"
        ? new Date(dateValue).toISOString()
        : dateValue instanceof Date
          ? dateValue.toISOString()
          : null;
    if (!iso) return;
    events.push({ at: iso, label, actorId });
  };

  const issueRecord = item.issue as unknown as {
    assigneeId?: string | null;
    assignee?: { id?: string | null; displayName?: string | null } | null;
  };
  const assigneeId = issueRecord.assigneeId ?? issueRecord.assignee?.id ?? null;
  if (item.issue.jiraUpdatedAt) {
    const statusLabel = item.issue.status ?? "Updated";
    pushEvent(item.issue.jiraUpdatedAt, `Status updated to ${statusLabel}`, assigneeId);
  }

  for (const worklog of item.recentWorklogs) {
    const minutes = Math.max(0, Math.round((worklog.timeSpent ?? 0) / 60));
    const worklogRecord = worklog as unknown as {
      author?: { id?: string | null; displayName?: string | null } | null;
    };
    const label = minutes
      ? `Worklog ${formatDurationMinutes(minutes)} by ${worklogRecord.author?.displayName ?? "Unknown"}`
      : `Worklog added by ${worklogRecord.author?.displayName ?? "Unknown"}`;
    pushEvent(worklog.jiraStartedAt, label, worklog.authorId ?? worklogRecord.author?.id ?? null);
  }

  for (const comment of item.recentComments) {
    const commentRecord = comment as unknown as {
      body?: string | null;
      author?: { id?: string | null; displayName?: string | null } | null;
    };
    const body = typeof commentRecord.body === "string" ? commentRecord.body : "";
    pushEvent(comment.jiraCreatedAt, `Comment: ${truncateText(body, 140)}`, comment.authorId ?? commentRecord.author?.id ?? null);
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return events;
}

function buildTaskParticipants(
  item: DailySummaryWorkItem,
  riskFlags: string[],
): Array<{ userId: string | null; displayName: string; contributionMinutes: number; commentCount: number; waitingOn?: boolean }> {
  const participants = new Map<
    string,
    { userId: string | null; displayName: string; contributionMinutes: number; commentCount: number; waitingOn?: boolean }
  >();

  const ensureParticipant = (userId: string | null, displayName: string) => {
    const key = userId ?? `anon:${displayName}`;
    let entry = participants.get(key);
    if (!entry) {
      entry = { userId, displayName, contributionMinutes: 0, commentCount: 0 };
      participants.set(key, entry);
    }
    return entry;
  };

  for (const worklog of item.recentWorklogs) {
    const worklogRecord = worklog as unknown as {
      author?: { id?: string | null; displayName?: string | null } | null;
    };
    const entry = ensureParticipant(
      worklog.authorId ?? worklogRecord.author?.id ?? null,
      worklogRecord.author?.displayName ?? "Unknown",
    );
    entry.contributionMinutes += Math.max(0, Math.round((worklog.timeSpent ?? 0) / 60));
  }

  for (const comment of item.recentComments) {
    const commentRecord = comment as unknown as {
      author?: { id?: string | null; displayName?: string | null } | null;
    };
    const entry = ensureParticipant(
      comment.authorId ?? commentRecord.author?.id ?? null,
      commentRecord.author?.displayName ?? "Unknown",
    );
    entry.commentCount += 1;
  }

  const issueRecord = item.issue as unknown as {
    assigneeId?: string | null;
    assignee?: { id?: string | null; displayName?: string | null } | null;
  };
  const assignee = issueRecord.assignee;
  const assigneeId = issueRecord.assigneeId ?? assignee?.id ?? null;
  if (assignee) {
    ensureParticipant(assigneeId, assignee.displayName ?? "Unassigned");
  }

  if (assigneeId) {
    const waitingState =
      riskFlags.includes("blocked") ||
      riskFlags.includes("blockers_present") ||
      (item.issue.status ?? "").toLowerCase().includes("review");
    if (waitingState) {
      const key = participants.has(assigneeId) ? assigneeId : `anon:${assignee?.displayName ?? "Unassigned"}`;
      const entry = participants.get(key);
      if (entry) {
        entry.waitingOn = true;
      }
    }
  }

  return Array.from(participants.values()).sort((a, b) => {
    if (b.contributionMinutes !== a.contributionMinutes) {
      return b.contributionMinutes - a.contributionMinutes;
    }
    if (b.commentCount !== a.commentCount) {
      return b.commentCount - a.commentCount;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

function extractTaskSentiment(item: DailySummaryWorkItem): { label: string; score: number; provider: string } | null {
  const issueRecord = item.issue as unknown as { insight?: { sentiments?: unknown } | null };
  const raw = issueRecord.insight?.sentiments as unknown;
  if (!raw) return null;
  const sentimentObject = Array.isArray(raw) ? raw[0] : raw;
  if (typeof sentimentObject !== "object" || sentimentObject === null) return null;

  const label = typeof (sentimentObject as Record<string, unknown>).label === "string"
    ? (sentimentObject as Record<string, string>).label
    : null;
  const scoreValue = (sentimentObject as Record<string, unknown>).score;
  const score = typeof scoreValue === "number" ? scoreValue : Number(scoreValue ?? NaN);
  const provider =
    typeof (sentimentObject as Record<string, unknown>).provider === "string"
      ? (sentimentObject as Record<string, string>).provider
      : "llm";

  if (!label || Number.isNaN(score)) {
    return null;
  }

  return { label, score, provider };
}

function buildTaskLinkedResources(
  item: DailySummaryWorkItem,
): Array<{ label: string; url: string; type: "issue" | "pr" | "doc" | "other" }> {
  const resources: Array<{ label: string; url: string; type: "issue" | "pr" | "doc" | "other" }> = [];
  const issueRecord = item.issue as unknown as {
    browseUrl?: string | null;
    linksOut?: Array<{ url?: string | null; linkType?: string | null; target?: { key?: string | null } | null }> | null;
  };

  if (issueRecord.browseUrl) {
    resources.push({ label: item.issue.key, url: issueRecord.browseUrl, type: "issue" });
  }

  for (const link of issueRecord.linksOut ?? []) {
    if (!link.url) continue;
    const normalized = link.linkType?.toLowerCase() ?? "";
    const type: "issue" | "pr" | "doc" | "other" =
      normalized.includes("pull") || normalized.includes("merge") || normalized.includes("pr")
        ? "pr"
        : normalized.includes("doc")
          ? "doc"
          : "other";
    resources.push({ label: link.target?.key ?? link.url, url: link.url, type });
  }

  return resources;
}

function buildCollaborationNotes(
  tasks: TaskSummarySnapshotRecord[],
  currentUser: { userId: string | null; trackedUserId: string | null; displayName: string },
): CollaborationNote[] {
  const notes: CollaborationNote[] = [];
  const seen = new Set<string>();
  const selfUserIds = new Set<string>(
    [currentUser.userId, currentUser.trackedUserId].filter(
      (identifier): identifier is string => Boolean(identifier),
    ),
  );
  const selfNames = new Set<string>();
  if (currentUser.displayName) {
    selfNames.add(currentUser.displayName.trim().toLowerCase());
  }

  for (const task of tasks) {
    for (const participant of task.payload.participants) {
      const participantName = participant.displayName?.trim() ?? "";
      const normalizedName = participantName.toLowerCase();
      const participantId = participant.userId ?? null;

      const isSelf =
        (participantId && selfUserIds.has(participantId)) ||
        (normalizedName && selfNames.has(normalizedName));
      if (!participantId && !participantName) continue;
      if (isSelf) continue;

      const keySource = participantId ?? normalizedName;
      if (!keySource) continue;
      const key = `${keySource}:${task.payload.issueId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push({
        partnerUserId: participant.userId,
        partnerDisplayName: participant.displayName,
        issueId: task.payload.issueId,
        issueKey: task.payload.issueKey,
        note: `${participant.displayName} collaborated on ${task.payload.issueKey}`,
      });
    }
  }

  return notes;
}

function buildPendingDecisions(tasks: TaskSummarySnapshotRecord[], currentUserId: string | null) {
  const ownedByUser: Array<{ issueId: string; issueKey: string; description: string }> = [];
  const waitingOnOthers: Array<{ issueId: string; issueKey: string; description: string }> = [];
  const ownedSeen = new Set<string>();
  const othersSeen = new Set<string>();

  for (const task of tasks) {
    const description = task.payload.nextStep ?? task.payload.headline;
    const issueId = task.payload.issueId;
    const issueKey = task.payload.issueKey;

    const currentWaiting = task.payload.participants.some(
      (participant) => participant.userId === currentUserId && participant.waitingOn,
    );
    const othersWaiting = task.payload.participants.some(
      (participant) => participant.userId !== currentUserId && participant.waitingOn,
    );

    if (currentWaiting && !ownedSeen.has(issueId)) {
      ownedByUser.push({ issueId, issueKey, description });
      ownedSeen.add(issueId);
    } else if (othersWaiting && !othersSeen.has(issueId)) {
      waitingOnOthers.push({ issueId, issueKey, description });
      othersSeen.add(issueId);
    }
  }

  return { ownedByUser, waitingOnOthers };
}

function calculateUserMood(tasks: TaskSummarySnapshotRecord[]) {
  const sentiments = tasks
    .map((task) => task.payload.sentiment)
    .filter((sentiment): sentiment is { label: string; score: number; provider: string } => Boolean(sentiment));

  if (!sentiments.length) {
    return null;
  }

  const averageScore = sentiments.reduce((total, current) => total + current.score, 0) / sentiments.length;
  const score = Number(averageScore.toFixed(2));
  const label = score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral";
  const rationale = tasks.find((task) => task.payload.sentiment)?.payload.headline;

  return { label, score, rationale };
}

function truncateText(value: string, maxLength = 140): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function formatDurationMinutes(minutes: number): string {
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)}h`;
  }
  if (minutes === 0) {
    return "0m";
  }
  return `${minutes}m`;
}

function buildProjectCallsToAction(users: UserSummarySnapshotRecord[], tasks: TaskSummarySnapshotRecord[]) {
  const actions: ProjectSummaryPayload["callsToAction"] = [];
  const pushAction = (text: string, severity: "info" | "warning" | "critical") => {
    if (!text) return;
    if (actions.some((action) => action.text === text)) return;
    actions.push({ text, severity });
  };

  for (const summary of users) {
    const name = summary.payload.identity.displayName;
    const pending = summary.payload.pendingDecisions;
    if (pending) {
      for (const decision of pending.ownedByUser) {
        pushAction(`Follow up ${name} on ${decision.issueKey}`, "info");
      }
      for (const decision of pending.waitingOnOthers) {
        pushAction(`Unblock ${name} on ${decision.issueKey}`, "warning");
      }
    }
  }

  for (const task of tasks) {
    if (task.payload.riskFlags.includes("blocked")) {
      pushAction(`Resolve blocker on ${task.payload.issueKey}`, "critical");
    } else if (task.payload.riskFlags.includes("stale")) {
      pushAction(`${task.payload.issueKey} is stale`, "warning");
    } else if (task.payload.riskFlags.includes("unassigned")) {
      pushAction(`Assign owner for ${task.payload.issueKey}`, "warning");
    }
  }

  return actions.slice(0, 6);
}

function buildAtRiskDetails(tasks: TaskSummarySnapshotRecord[]) {
  const details: ProjectSummaryPayload["atRiskDetails"] = [];
  for (const task of tasks) {
    if (!task.payload.riskFlags.length) continue;
    let severity: "info" | "warning" | "critical" = "info";
    if (task.payload.riskFlags.includes("blocked")) {
      severity = "critical";
    } else if (task.payload.riskFlags.includes("stale") || task.payload.riskFlags.includes("unassigned")) {
      severity = "warning";
    }
    details.push({
      issueId: task.payload.issueId,
      issueKey: task.payload.issueKey,
      reason: task.payload.riskFlags.join(", ").replace(/_/g, " "),
      severity,
    });
  }
  return details;
}

function normalizeTaskStatus(
  status: string,
  item: DailySummaryWorkItem,
): TaskSummaryStatus {
  const lowered = status.toLowerCase();
  if (lowered.includes("block")) return "BLOCKED";
  if (lowered.includes("review") || lowered.includes("qa")) return "IN_REVIEW";
  if (lowered.includes("done") || lowered.includes("resolved") || (item.issue.statusCategory ?? "").toLowerCase() === "done") {
    return "DONE";
  }
  if (lowered.includes("backlog") || lowered.includes("todo") || lowered.includes("to do")) {
    return "STALLED";
  }
  return "IN_PROGRESS";
}

function generateHeadline(status: TaskSummaryStatus, item: DailySummaryWorkItem): string {
  const summary = item.issue.summary ?? "task update";
  switch (status) {
    case "DONE":
      return `Completed ${item.issue.key} – ${summary}`;
    case "IN_REVIEW":
      return `Pushed ${item.issue.key} for review (${summary})`;
    case "BLOCKED":
      return `Blocked on ${item.issue.key} – ${summary}`;
    case "STALLED":
      return `No recent motion on ${item.issue.key} (${summary})`;
    default:
      return `Progressed ${item.issue.key} – ${summary}`;
  }
}

function buildActivityBullets(item: DailySummaryWorkItem): string[] {
  const bullets: string[] = [];
  if (item.totalWorklogHours > 0) {
    bullets.push(`${item.totalWorklogHours.toFixed(1)}h logged`);
  }
  if (item.recentComments.length > 0) {
    bullets.push(`${item.recentComments.length} new comment${item.recentComments.length > 1 ? "s" : ""}`);
  }
  if (!bullets.length) {
    bullets.push("No fresh activity captured");
  }
  return bullets;
}

function deriveNextStep(status: TaskSummaryStatus, item: DailySummaryWorkItem): string | null {
  const summary = item.issue.summary ?? item.issue.key;
  if (status === "DONE") {
    return null;
  }
  if (status === "IN_REVIEW") {
    return "Await reviewer sign-off";
  }
  if (status === "BLOCKED") {
    return "Resolve blocker and resume implementation";
  }
  if (status === "STALLED") {
    return `Re-engage ${item.issue.key} – ${summary}`;
  }
  return `Continue progressing ${item.issue.key}`;
}

function deriveRiskFlags(status: TaskSummaryStatus, item: DailySummaryWorkItem): string[] {
  const flags: string[] = [];
  if (status === "BLOCKED") {
    flags.push("blocked");
  }
  if (!("assigneeId" in item.issue) || !item.issue.assigneeId) {
    flags.push("unassigned");
  }
  const lastActivity = resolveLastActivity(item);
  if (lastActivity) {
    const last = DateTime.fromISO(lastActivity);
    if (last < DateTime.utc().minus({ days: 2 })) {
      flags.push("stale");
    }
  }
  if (item.totalWorklogHours === 0 && item.recentComments.length === 0) {
    flags.push("no_activity");
  }
  return flags;
}

function resolveLastActivity(item: DailySummaryWorkItem): string | null {
  const timestamps: DateTime[] = [];
  if (item.recentWorklogs.length) {
    timestamps.push(
      ...item.recentWorklogs
        .map((entry) => resolveDateTime(entry.jiraStartedAt ?? entry.jiraUpdatedAt))
        .filter((value): value is DateTime => Boolean(value)),
    );
  }
  if (item.recentComments.length) {
    timestamps.push(
      ...item.recentComments
        .map((entry) => resolveDateTime(entry.jiraCreatedAt))
        .filter((value): value is DateTime => Boolean(value)),
    );
  }
  if (item.issue.jiraUpdatedAt) {
    const resolved = resolveDateTime(item.issue.jiraUpdatedAt as unknown as Date | string);
    if (resolved) {
      timestamps.push(resolved);
    }
  }
  if (!timestamps.length) {
    return null;
  }
  const latest = timestamps.reduce((max, current) => (current > max ? current : max));
  return latest.toUTC().toISO();
}

function resolveDateTime(value: string | Date | null | undefined): DateTime | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value);
  }
  const parsed = DateTime.fromISO(value);
  return parsed.isValid ? parsed : null;
}

function buildUserPayload(
  daily: DailySummarySnapshot,
  tasks: TaskSummarySnapshotRecord[],
): UserSummaryPayload {
  const displayName = daily.user?.displayName ?? daily.trackedUser?.displayName ?? "Unknown teammate";

  if (daily.isUnavailable) {
    return {
      identity: {
        userId: daily.user?.id ?? null,
        trackedUserId: daily.trackedUser?.id ?? null,
        displayName,
        jiraAccountId: daily.jiraAccountIds[0] ?? null,
      },
      userId: daily.user?.id ?? null,
      headline: `${displayName} is out today.`,
      accomplishments: [],
      inFlight: [],
      blockers: [],
      focusNext: null,
      activityMetrics: {
        worklogMinutes: 0,
        tasksTouched: 0,
        doneCount: 0,
        blockerCount: 0,
      },
      riskFlags: ["unavailable"],
      collaborationNotes: [],
      pendingDecisions: { ownedByUser: [], waitingOnOthers: [] },
      mood: null,
    };
  }

  const accomplishments = tasks
    .filter((task) => task.payload.status === "DONE" || task.payload.status === "IN_REVIEW")
    .slice(0, 3)
    .map((task) => ({
      issueId: task.payload.issueId,
      issueKey: task.payload.issueKey,
      text: task.payload.headline,
    }));

  const inFlight = tasks
    .filter((task) => ["IN_PROGRESS", "IN_REVIEW"].includes(task.payload.status))
    .map((task) => ({
      issueId: task.payload.issueId,
      issueKey: task.payload.issueKey,
      status: task.payload.status,
      note: task.payload.activityBullets[0] ?? `Working on ${task.payload.issueKey}`,
    }));

  const blockers = tasks
    .filter((task) => task.payload.status === "BLOCKED")
    .map((task) => ({
      issueId: task.payload.issueId,
      issueKey: task.payload.issueKey,
      description: task.payload.headline,
      severity: "high" as const,
    }));

  const worklogMinutes = tasks.reduce(
    (total, task) => total + (task.payload.recentWorklogMinutes ?? task.payload.totalWorklogMinutes),
    0,
  );
  const blockerCount = blockers.length;
  const doneCount = tasks.filter((task) => task.payload.status === "DONE").length;

  const headline = buildUserHeadline(daily, tasks, blockerCount);

  const riskFlags: string[] = [];
  if (!tasks.length && worklogMinutes === 0) {
    riskFlags.push("idle");
  }
  if (blockerCount > 0) {
    riskFlags.push("blockers_present");
  }

  return {
    identity: {
      userId: daily.user?.id ?? null,
      trackedUserId: daily.trackedUser?.id ?? null,
      displayName,
      jiraAccountId: daily.jiraAccountIds[0] ?? null,
    },
    userId: daily.user?.id ?? null,
    headline,
    accomplishments,
    inFlight,
    blockers,
    focusNext: daily.today ?? null,
    activityMetrics: {
      worklogMinutes,
      tasksTouched: tasks.length,
      doneCount,
      blockerCount,
    },
    riskFlags,
    collaborationNotes: buildCollaborationNotes(tasks, {
      userId: daily.user?.id ?? null,
      trackedUserId: daily.trackedUser?.id ?? null,
      displayName,
    }),
    pendingDecisions: buildPendingDecisions(tasks, daily.user?.id ?? null),
    mood: calculateUserMood(tasks),
  };
}

function buildUserHeadline(
  daily: DailySummarySnapshot,
  tasks: TaskSummarySnapshotRecord[],
  blockerCount: number,
): string {
  const name = daily.user?.displayName ?? daily.trackedUser?.displayName ?? "Unknown teammate";
  if (daily.isUnavailable) {
    return `${name} is out today.`;
  }
  if (!tasks.length) {
    return `${name} has no recorded activity for the selected window.`;
  }
  if (blockerCount > 0) {
    return `${name} is blocked on ${blockerCount} task${blockerCount > 1 ? "s" : ""}.`;
  }
  const doneCount = tasks.filter((task) => task.payload.status === "DONE").length;
  if (doneCount > 0) {
    return `${name} completed ${doneCount} task${doneCount > 1 ? "s" : ""} and is on track.`;
  }
  return `${name} is progressing on ${tasks.length} active item${tasks.length > 1 ? "s" : ""}.`;
}

function buildProjectPayload(
  ctx: GenerationContext,
  users: UserSummarySnapshotRecord[],
  tasks: TaskSummarySnapshotRecord[],
): ProjectSummaryPayload {
  const recentWorklogMinutes = users.reduce(
    (total, user) => total + user.payload.activityMetrics.worklogMinutes,
    0,
  );
  const windowWorklogMinutes = tasks.reduce(
    (total, task) => total + task.payload.totalWorklogMinutes,
    0,
  );
  const totalWorklogMinutes = recentWorklogMinutes || windowWorklogMinutes;
  const blockerCount = tasks.filter((task) => task.payload.status === "BLOCKED").length;
  const doneCount = tasks.filter((task) => task.payload.status === "DONE").length;

  const unavailableUsers = users.filter((user) => user.payload.riskFlags.includes("unavailable"));
  const offlineUsers = unavailableUsers.length;
  const trackedUsers = users.length - offlineUsers;
  const idleUsers = users.filter(
    (user) =>
      !user.payload.riskFlags.includes("unavailable") &&
      user.payload.activityMetrics.tasksTouched === 0,
  ).length;
  const activeUsers = Math.max(trackedUsers - idleUsers, 0);
  const idleRate = trackedUsers === 0 ? 0 : idleUsers / trackedUsers;
  const blockerRate = trackedUsers === 0 ? 0 : blockerCount / Math.max(trackedUsers, 1);

  const executiveBrief = composeExecutiveBrief(doneCount, blockerCount, totalWorklogMinutes);

  const callsToAction = buildProjectCallsToAction(users, tasks);
  const atRiskDetails = buildAtRiskDetails(tasks);

  const topHighlights = users
    .flatMap((user) =>
      user.payload.accomplishments.map((accomplishment) => ({
        issueId: accomplishment.issueId,
        issueKey: accomplishment.issueKey,
        userId: user.userId,
        text: accomplishment.text,
      })),
    )
    .slice(0, 3);

  const criticalBlockers = tasks
    .filter((task) => task.payload.status === "BLOCKED")
    .map((task) => ({
      issueId: task.payload.issueId,
      issueKey: task.payload.issueKey,
      userId: task.userId,
      description: task.payload.headline,
      severity: "high" as const,
    }));

  const atRiskWork = tallyRiskFlags(tasks);

  const unassignedWatchlist = tasks
    .filter((task) => task.payload.riskFlags.includes("unassigned"))
    .map((task) => ({
      issueId: task.payload.issueId,
      issueKey: task.payload.issueKey,
      issueSummary: task.payload.issueSummary,
    }));

  return {
    projectId: ctx.projectId,
    executiveBrief,
    topHighlights,
    criticalBlockers,
    atRiskWork,
    teamHealthSnapshot: {
      activeUsers,
      trackedUsers,
      idleUsers,
      offlineUsers,
      totalWorklogMinutes,
      doneCount,
      blockerCount,
      idleRate,
      blockerRate,
    },
    unassignedWatchlist,
    callsToAction,
    atRiskDetails,
    workspaceContext: null,
  };
}

function composeExecutiveBrief(doneCount: number, blockerCount: number, worklogMinutes: number): string {
  const completed = doneCount > 0 ? `${doneCount} completion${doneCount > 1 ? "s" : ""}` : "no completed items";
  const blockerSentence =
    blockerCount > 0
      ? `${blockerCount} blocker${blockerCount > 1 ? "s" : ""} need attention`
      : "no critical blockers surfaced";
  const hours = (worklogMinutes / 60).toFixed(1);
  return `Team logged ${hours}h with ${completed}; ${blockerSentence}.`;
}

function tallyRiskFlags(tasks: TaskSummarySnapshotRecord[]): Array<{ flag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    for (const flag of task.payload.riskFlags) {
      counts.set(flag, (counts.get(flag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).map(([flag, count]) => ({ flag, count }));
}

export function hashObject(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

export function buildUserNarrativeInput(payload: UserSummaryPayload) {
  return {
    headline: payload.headline,
    accomplishments: payload.accomplishments,
    inFlight: payload.inFlight,
    blockers: payload.blockers,
    focusNext: payload.focusNext,
    riskFlags: payload.riskFlags,
    collaborationNotes: payload.collaborationNotes ?? [],
    pendingDecisions: payload.pendingDecisions ?? { ownedByUser: [], waitingOnOthers: [] },
    metrics: payload.activityMetrics,
  };
}

export function composeUserNarrative(payload: UserSummaryPayload, tasks: TaskSummarySnapshotRecord[]): string {
  const parts: string[] = [];
  const name = payload.identity.displayName;
  const metrics = payload.activityMetrics;
  const hours = (metrics.worklogMinutes / 60).toFixed(1);

  parts.push(
    `${name} logged ${hours}h across ${metrics.tasksTouched} task${metrics.tasksTouched === 1 ? "" : "s"}, closing ${metrics.doneCount} and encountering ${metrics.blockerCount} blocker${metrics.blockerCount === 1 ? "" : "s"}.`,
  );

  if (tasks.length) {
    const keyTasks = tasks
      .slice(0, 2)
      .map((task) => `${task.payload.issueKey} (${task.payload.headline.toLowerCase()})`)
      .join("; ");
    parts.push(`Key focus: ${keyTasks}.`);
  }

  if (payload.accomplishments.length) {
    const wins = payload.accomplishments
      .map((item) => `${item.issueKey} (${item.text})`)
      .join("; ");
    parts.push(`Wins: ${wins}.`);
  }

  if (payload.inFlight.length) {
    const inProgress = payload.inFlight.map((item) => `${item.issueKey} – ${formatStatusLabel(item.status)}`).join("; ");
    parts.push(`In motion: ${inProgress}.`);
  }

  if (payload.blockers.length) {
    const blockers = payload.blockers.map((item) => `${item.issueKey} (${item.description})`).join("; ");
    parts.push(`Blockers flagged: ${blockers}.`);
  }

  if (payload.collaborationNotes && payload.collaborationNotes.length) {
    const partners = Array.from(new Set(payload.collaborationNotes.map((note) => note.partnerDisplayName).filter(Boolean)));
    if (partners.length) {
      parts.push(`Collaboration: paired with ${partners.join(", ")}.`);
    }
  }

  if (payload.pendingDecisions) {
    const owned = payload.pendingDecisions.ownedByUser.length;
    const waiting = payload.pendingDecisions.waitingOnOthers.length;
    if (owned || waiting) {
      const segments = [] as string[];
      if (owned) segments.push(`${owned} decision${owned === 1 ? "" : "s"} to resolve`);
      if (waiting) segments.push(`${waiting} awaiting others`);
      parts.push(`Pending: ${segments.join("; ")}.`);
    }
  }

  if (payload.focusNext) {
    parts.push(`Next up: ${payload.focusNext}.`);
  }

  if (parts.length === 0) {
    parts.push(payload.headline);
  }

  return parts.join(" ");
}

export function buildProjectNarrativeInput(
  payload: ProjectSummaryPayload,
  users: UserSummarySnapshotRecord[],
  tasks: TaskSummarySnapshotRecord[],
) {
  return {
    executiveBrief: payload.executiveBrief,
    highlights: payload.topHighlights,
    criticalBlockers: payload.criticalBlockers,
    callsToAction: payload.callsToAction,
    atRiskWork: payload.atRiskWork,
    atRiskDetails: payload.atRiskDetails,
    teamHealthSnapshot: payload.teamHealthSnapshot,
    workspaceContext: payload.workspaceContext,
    unassignedWatchlist: payload.unassignedWatchlist,
    userHeadlines: users.map((user) => user.payload.headline),
    taskCount: tasks.length,
  };
}

export function composeProjectNarrative(
  payload: ProjectSummaryPayload,
  users: UserSummarySnapshotRecord[],
  tasks: TaskSummarySnapshotRecord[],
): string {
  const sections: string[] = [];
  sections.push(payload.executiveBrief.trim());

  if (payload.topHighlights.length) {
    const highlights = payload.topHighlights.map((item) => `${item.issueKey}: ${item.text}`).join("; ");
    sections.push(`Highlights: ${highlights}.`);
  }

  if (payload.callsToAction.length) {
    const actions = payload.callsToAction
      .slice(0, 3)
      .map((cta) => `${cta.severity.toUpperCase()}: ${cta.text}`)
      .join("; ");
    sections.push(`Calls to action: ${actions}.`);
  }

  if (payload.criticalBlockers.length) {
    const blockers = payload.criticalBlockers.map((item) => item.issueKey).join(", ");
    sections.push(`Blockers under watch: ${blockers}.`);
  }

  if (payload.atRiskWork.length) {
    const risks = payload.atRiskWork.map((risk) => `${risk.flag.replace(/_/g, " ")}: ${risk.count}`).join("; ");
    sections.push(`Risk signals: ${risks}.`);
  }

  const team = payload.teamHealthSnapshot;
  const utilisation = `${Math.round(team.activeUsers / Math.max(team.trackedUsers, 1) * 100)}% active, idle ${Math.round(team.idleRate * 100)}%`;
  sections.push(
    `Team health: ${utilisation}. Logged ${(team.totalWorklogMinutes / 60).toFixed(1)}h across ${tasks.length} tracked issue${tasks.length === 1 ? "" : "s"}.`,
  );

  if (users.length) {
    const standout = users
      .slice(0, 3)
      .map((user) => user.payload.identity.displayName)
      .join(", ");
    sections.push(`Standouts: ${standout}.`);
  }

  return sections.join(" ");
}

export function mapTaskSummaryRecord(record: TaskSummarySnapshotEntity): TaskSummarySnapshotRecord {
  const payload = normalizeTaskSummaryPayload(record);
  return {
    id: record.id,
    projectId: record.projectId,
    issueId: record.issueId,
    userId: record.userId ?? null,
    summaryDate: formatDateOnly(record.summaryDate),
    runId: record.runId,
    createdAt: record.createdAt.toISOString(),
    payload,
  };
}

export function mapUserSummaryRecord(record: UserSummarySnapshotEntity): UserSummarySnapshotRecord {
  const payload = normalizeUserSummaryPayload(record);
  const anyRecord = record as unknown as {
    narrative?: string | null;
    narrativeHash?: string | null;
    narrativeGeneratedAt?: Date | null;
    richNarratives?: Prisma.JsonValue | null;
    needsNarrativeRefresh?: boolean;
    narrativeRefreshRequestedAt?: Date | null;
    narrativeRefreshLockedUntil?: Date | null;
    narrativeRefreshAttempts?: number;
    lastNarrativeError?: string | null;
  };
  return {
    id: record.id,
    projectId: record.projectId,
    userId: record.userId,
    summaryDate: formatDateOnly(record.summaryDate),
    runId: record.runId,
    taskSummaryIds: record.taskSummaryIds,
    createdAt: record.createdAt.toISOString(),
    payload,
    narrative: anyRecord.narrative ?? null,
    narrativeHash: anyRecord.narrativeHash ?? null,
    narrativeGeneratedAt: anyRecord.narrativeGeneratedAt?.toISOString() ?? null,
    richNarratives: coerceJsonObject(anyRecord.richNarratives),
    needsNarrativeRefresh: anyRecord.needsNarrativeRefresh ?? false,
    narrativeRefreshRequestedAt: anyRecord.narrativeRefreshRequestedAt?.toISOString() ?? null,
    narrativeRefreshLockedUntil: anyRecord.narrativeRefreshLockedUntil?.toISOString() ?? null,
    narrativeRefreshAttempts: anyRecord.narrativeRefreshAttempts ?? 0,
    lastNarrativeError: anyRecord.lastNarrativeError ?? null,
  };
}

export function mapProjectSummaryRecord(record: ProjectSummarySnapshotEntity): ProjectSummarySnapshotRecord {
  const payload = normalizeProjectSummaryPayload(record);
  const sanitizedPayload: ProjectSummaryPayload = {
    ...payload,
    topHighlights: Array.isArray(payload.topHighlights) ? payload.topHighlights : [],
    criticalBlockers: Array.isArray(payload.criticalBlockers) ? payload.criticalBlockers : [],
    atRiskWork: Array.isArray(payload.atRiskWork) ? payload.atRiskWork : [],
    unassignedWatchlist: Array.isArray(payload.unassignedWatchlist) ? payload.unassignedWatchlist : [],
    callsToAction: Array.isArray(payload.callsToAction) ? payload.callsToAction : [],
    atRiskDetails: Array.isArray(payload.atRiskDetails) ? payload.atRiskDetails : [],
  };
  const anyRecord = record as unknown as {
    narrative?: string | null;
    narrativeHash?: string | null;
    narrativeGeneratedAt?: Date | null;
    richNarratives?: Prisma.JsonValue | null;
    needsNarrativeRefresh?: boolean;
    narrativeRefreshRequestedAt?: Date | null;
    narrativeRefreshLockedUntil?: Date | null;
    narrativeRefreshAttempts?: number;
    lastNarrativeError?: string | null;
  };
  return {
    id: record.id,
    projectId: record.projectId,
    summaryDate: formatDateOnly(record.summaryDate),
    runId: record.runId,
    userSummaryIds: record.userSummaryIds,
    createdAt: record.createdAt.toISOString(),
    payload: sanitizedPayload,
    narrative: anyRecord.narrative ?? null,
    narrativeHash: anyRecord.narrativeHash ?? null,
    narrativeGeneratedAt: anyRecord.narrativeGeneratedAt?.toISOString() ?? null,
    richNarratives: coerceJsonObject(anyRecord.richNarratives),
    needsNarrativeRefresh: anyRecord.needsNarrativeRefresh ?? false,
    narrativeRefreshRequestedAt: anyRecord.narrativeRefreshRequestedAt?.toISOString() ?? null,
    narrativeRefreshLockedUntil: anyRecord.narrativeRefreshLockedUntil?.toISOString() ?? null,
    narrativeRefreshAttempts: anyRecord.narrativeRefreshAttempts ?? 0,
    lastNarrativeError: anyRecord.lastNarrativeError ?? null,
  };
}

function formatDateOnly(value: Date): string {
  return value.toISOString().split("T")[0]!;
}

function normalizeTaskSummaryPayload(record: TaskSummarySnapshotEntity): TaskSummaryPayload {
  const raw = (record.payload ?? {}) as Record<string, unknown>;
  const activityBullets = Array.isArray(raw.activityBullets)
    ? (raw.activityBullets.filter((entry) => typeof entry === "string") as string[])
    : [];
  const riskFlags = Array.isArray(raw.riskFlags)
    ? (raw.riskFlags.filter((entry) => typeof entry === "string") as string[])
    : [];
  const timeline = Array.isArray(raw.timeline)
    ? (raw.timeline.filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        return true;
      }) as TaskTimelineEvent[])
    : [];
  const participants = Array.isArray(raw.participants)
    ? (raw.participants.filter((entry) => entry && typeof entry === "object") as TaskParticipant[])
    : [];
  const linkedResources = Array.isArray(raw.linkedResources)
    ? (raw.linkedResources.filter((entry) => entry && typeof entry === "object") as TaskLinkedResource[])
    : [];

  const totalWorklogMinutesValue =
    typeof raw.totalWorklogMinutes === "number" && Number.isFinite(raw.totalWorklogMinutes)
      ? raw.totalWorklogMinutes
      : 0;
  const recentWorklogMinutesValue =
    typeof raw.recentWorklogMinutes === "number" && Number.isFinite(raw.recentWorklogMinutes)
      ? raw.recentWorklogMinutes
      : 0;

  const fallbackIssueId = typeof raw.issueId === "string" ? raw.issueId : record.issueId;
  const fallbackIssueKey =
    typeof raw.issueKey === "string"
      ? raw.issueKey
      : typeof raw.issueId === "string"
        ? raw.issueId
        : record.issueId;

  return {
    issueId: fallbackIssueId,
    issueKey: fallbackIssueKey,
    issueSummary: typeof raw.issueSummary === "string" ? raw.issueSummary : "Untitled task",
    headline: typeof raw.headline === "string" ? raw.headline : "",
    status: (raw.status as TaskSummaryStatus) ?? "IN_PROGRESS",
    activityBullets,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : null,
    riskFlags,
    totalWorklogMinutes: totalWorklogMinutesValue,
    recentWorklogMinutes: recentWorklogMinutesValue,
    commentCount:
      typeof raw.commentCount === "number" && Number.isFinite(raw.commentCount) ? raw.commentCount : 0,
    lastActivityAt: typeof raw.lastActivityAt === "string" ? raw.lastActivityAt : null,
    timeline,
    participants,
    sentiment:
      raw.sentiment && typeof raw.sentiment === "object"
        ? (raw.sentiment as TaskSentimentSnapshot)
        : null,
    linkedResources,
  };
}

function normalizeUserSummaryPayload(record: UserSummarySnapshotEntity): UserSummaryPayload {
  const raw = (record.payload ?? {}) as Record<string, any>;
  const identity = raw.identity ?? {};
  const accomplishments = Array.isArray(raw.accomplishments) ? raw.accomplishments : [];
  const inFlight = Array.isArray(raw.inFlight) ? raw.inFlight : [];
  const blockers = Array.isArray(raw.blockers) ? raw.blockers : [];
  const riskFlags = Array.isArray(raw.riskFlags) ? raw.riskFlags : [];
  const collaborationNotes = Array.isArray(raw.collaborationNotes) ? raw.collaborationNotes : [];
  const pending = raw.pendingDecisions ?? null;

  const activityMetrics = raw.activityMetrics ?? {};

  return {
    identity: {
      userId: identity.userId ?? record.userId ?? null,
      trackedUserId: identity.trackedUserId ?? null,
      displayName:
        typeof identity.displayName === "string"
          ? identity.displayName
          : "Unknown teammate",
      jiraAccountId: identity.jiraAccountId ?? null,
    },
    userId: raw.userId ?? record.userId ?? null,
    headline: typeof raw.headline === "string" ? raw.headline : "",
    accomplishments,
    inFlight,
    blockers,
    focusNext: typeof raw.focusNext === "string" ? raw.focusNext : null,
    activityMetrics: {
      worklogMinutes:
        typeof activityMetrics.worklogMinutes === "number"
          ? activityMetrics.worklogMinutes
          : 0,
      tasksTouched:
        typeof activityMetrics.tasksTouched === "number" ? activityMetrics.tasksTouched : 0,
      doneCount:
        typeof activityMetrics.doneCount === "number" ? activityMetrics.doneCount : 0,
      blockerCount:
        typeof activityMetrics.blockerCount === "number" ? activityMetrics.blockerCount : 0,
    },
    riskFlags,
    collaborationNotes,
    pendingDecisions: pending
      ? {
          ownedByUser: Array.isArray(pending.ownedByUser) ? pending.ownedByUser : [],
          waitingOnOthers: Array.isArray(pending.waitingOnOthers) ? pending.waitingOnOthers : [],
        }
      : { ownedByUser: [], waitingOnOthers: [] },
    mood:
      raw.mood && typeof raw.mood === "object"
        ? (raw.mood as MoodSnapshot)
        : null,
  };
}

function normalizeProjectSummaryPayload(record: ProjectSummarySnapshotEntity): ProjectSummaryPayload {
  const raw = (record.payload ?? {}) as Record<string, any>;
  const teamHealth = raw.teamHealthSnapshot ?? {};
  return {
    projectId: raw.projectId ?? record.projectId,
    executiveBrief: typeof raw.executiveBrief === "string" ? raw.executiveBrief : "",
    topHighlights: Array.isArray(raw.topHighlights) ? raw.topHighlights : [],
    criticalBlockers: Array.isArray(raw.criticalBlockers) ? raw.criticalBlockers : [],
    atRiskWork: Array.isArray(raw.atRiskWork) ? raw.atRiskWork : [],
    teamHealthSnapshot: {
      activeUsers:
        typeof teamHealth.activeUsers === "number" ? teamHealth.activeUsers : 0,
      trackedUsers:
        typeof teamHealth.trackedUsers === "number" ? teamHealth.trackedUsers : 0,
      idleUsers:
        typeof teamHealth.idleUsers === "number" ? teamHealth.idleUsers : 0,
      offlineUsers:
        typeof teamHealth.offlineUsers === "number" ? teamHealth.offlineUsers : 0,
      totalWorklogMinutes:
        typeof teamHealth.totalWorklogMinutes === "number"
          ? teamHealth.totalWorklogMinutes
          : 0,
      doneCount: typeof teamHealth.doneCount === "number" ? teamHealth.doneCount : 0,
      blockerCount:
        typeof teamHealth.blockerCount === "number" ? teamHealth.blockerCount : 0,
      idleRate: typeof teamHealth.idleRate === "number" ? teamHealth.idleRate : 0,
      blockerRate:
        typeof teamHealth.blockerRate === "number" ? teamHealth.blockerRate : 0,
    },
    unassignedWatchlist: Array.isArray(raw.unassignedWatchlist)
      ? raw.unassignedWatchlist
      : [],
    callsToAction: Array.isArray(raw.callsToAction) ? raw.callsToAction : [],
    atRiskDetails: Array.isArray(raw.atRiskDetails) ? raw.atRiskDetails : [],
    workspaceContext:
      typeof raw.workspaceContext === "string" ? raw.workspaceContext : null,
  };
}
