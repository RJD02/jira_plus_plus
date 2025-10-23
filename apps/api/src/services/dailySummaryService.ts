import { GraphQLError } from "graphql";
import {
  Prisma,
  type Comment,
  type Issue,
  type JiraProject,
  type JiraSite,
  type PrismaClient,
  type ProjectTrackedUser,
  type User,
  type Worklog,
} from "@platform/cdm";
import path from "node:path";
import { promises as fs } from "node:fs";
import { DateTime } from "luxon";

const BLOCKER_KEYWORDS = ["block", "stuck", "waiting", "imped", "hold", "delay"];
const STATUS_PRIORITY = ["in progress", "doing", "active", "selected", "todo", "to do", "backlog"];
const ACTIVE_STATUS_VALUES = ["In Progress", "In Review", "Selected for Development", "Blocked", "Doing"];
const ACTIVE_STATUS_KEYWORDS = ["progress", "doing", "active", "block", "review"];
const DONE_STATUS_VALUES = ["Done", "Closed", "Resolved", "Completed", "Cancelled"];
const EMPTY_ISSUE_COUNTS: IssueCounts = { todo: 0, inProgress: 0, backlog: 0, done: 0, blocked: 0 };

const ISSUE_SUMMARY_INCLUDE = Prisma.validator<Prisma.IssueInclude>()({
  project: {
    include: { site: true },
  },
  assignee: {
    select: {
      id: true,
      displayName: true,
      email: true,
      avatarUrl: true,
    },
  },
  reporter: {
    select: {
      id: true,
      displayName: true,
      email: true,
      avatarUrl: true,
    },
  },
  parent: {
    select: {
      id: true,
      key: true,
      summary: true,
      status: true,
      statusCategory: true,
      priority: true,
    },
  },
  linksOut: {
    include: {
      target: {
        select: {
          id: true,
          key: true,
          summary: true,
          status: true,
          statusCategory: true,
          priority: true,
        },
      },
    },
  },
  linksIn: {
    include: {
      source: {
        select: {
          id: true,
          key: true,
          summary: true,
          status: true,
          statusCategory: true,
          priority: true,
        },
      },
    },
  },
  insight: true,
});

type IssueWithDetails = Prisma.IssueGetPayload<{
  include: typeof ISSUE_SUMMARY_INCLUDE;
}>;
type IssueWithBrowse = IssueWithDetails & { browseUrl: string | null };

export type DailySummaryStatus = "ON_TRACK" | "DELAYED" | "BLOCKED";

export interface IssueCounts {
  todo: number;
  inProgress: number;
  backlog: number;
  done: number;
  blocked: number;
}

export interface DailySummaryWorkItem {
  issue: Issue;
  recentWorklogs: Worklog[];
  recentComments: Comment[];
  totalWorklogHours: number;
}

export interface DailySummaryWorkItemGroup {
  status: string;
  items: DailySummaryWorkItem[];
}

export interface DailySummarySnapshot {
  id: string;
  user: User | null;
  trackedUser: ProjectTrackedUser | null;
  jiraAccountIds: string[];
  primaryAccountId: string | null;
  projectId: string;
  project?: JiraProject | null;
  date: Date;
  yesterday: string | null;
  today: string | null;
  blockers: string | null;
  updatedAt: Date;
  createdAt: Date;
  status: DailySummaryStatus;
  worklogHours: number;
  issueCounts: IssueCounts;
  workItems: DailySummaryWorkItemGroup[];
  persisted: boolean;
}

interface ContributionAccumulator {
  worklogSeconds: number;
  worklogCount: number;
  commentCount: number;
  issueTouched: boolean;
}

function normalizeDate(input: string | Date): DateTime {
  let date: DateTime;
  if (typeof input === "string") {
    date = DateTime.fromISO(input, { zone: "utc" });
  } else if (input instanceof Date) {
    date = DateTime.fromJSDate(input);
  } else {
    throw new GraphQLError("Invalid date input provided");
  }

  if (!date.isValid) {
    throw new GraphQLError("Date provided is not valid ISO format");
  }

  return date.startOf("day");
}

function resolveStandupWindow(input: string | Date) {
  const dayStart = normalizeDate(input);
  const windowStart = dayStart.minus({ days: 1 });
  const windowEnd = dayStart.plus({ days: 1 });
  const recentCutoff = dayStart.minus({ days: 7 });
  return { dayStart, windowStart, windowEnd, recentCutoff };
}

function formatSummaryBullet(issue: Issue, details: ContributionAccumulator): string {
  const parts: string[] = [];
  if (details.worklogSeconds > 0) {
    parts.push(`${(details.worklogSeconds / 3600).toFixed(1)}h logged`);
  }
  if (details.commentCount > 0) {
    parts.push(`${details.commentCount} comment${details.commentCount > 1 ? "s" : ""}`);
  }
  if (!parts.length) {
    parts.push("marked progress");
  }
  return `• ${issue.key}: ${issue.summary ?? "No summary provided"} (${parts.join(", ")})`;
}

function summarizeAssignments(issues: Issue[]): IssueCounts {
  return issues.reduce<IssueCounts>(
    (acc, issue) => {
      const status = issue.status ?? "";
      const lowered = status.toLowerCase();
      if (lowered.includes("block")) {
        acc.blocked += 1;
      } else if (DONE_STATUS_VALUES.some((value) => lowered.includes(value.toLowerCase()))) {
        acc.done += 1;
      } else if (isActiveStatus(status)) {
        acc.inProgress += 1;
      } else if (lowered.includes("backlog") || lowered.includes("todo") || lowered.includes("to do")) {
        acc.backlog += 1;
      } else {
        acc.todo += 1;
      }
      return acc;
    },
    { todo: 0, inProgress: 0, backlog: 0, done: 0, blocked: 0 },
  );
}

function detectBlockerIssues(issues: Issue[]): Issue[] {
  return issues.filter((issue) => {
    const status = (issue.status ?? "").toLowerCase();
    return status.includes("block") || status.includes("hold");
  });
}

function detectBlockerComments(comments: Comment[]): Comment[] {
  return comments.filter((comment) => {
    const body = comment.body.toLowerCase();
    return BLOCKER_KEYWORDS.some((keyword) => body.includes(keyword));
  });
}

function buildBrowseUrl(issue: IssueWithDetails): string | null {
  const baseUrl = issue.project.site?.baseUrl;
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/$/, "")}/browse/${issue.key}`;
}

function isActiveStatus(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }
  const lowered = status.toLowerCase();
  return ACTIVE_STATUS_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

function deriveOverallStatus(
  blockers: Issue[],
  blockerComments: Comment[],
  assignments: Issue[],
  contributions: Map<string, ContributionAccumulator>,
  windowStart: DateTime,
): DailySummaryStatus {
  if (blockers.length > 0 || blockerComments.length > 0) {
    return "BLOCKED";
  }

  const delayedIssue = assignments.find((issue) => {
    const details = contributions.get(issue.id);
    if (!details) {
      return false;
    }
    const status = (issue.status ?? "").toLowerCase();
    if (!(status.includes("progress") || status.includes("doing") || status.includes("active"))) {
      return false;
    }
    const updatedAt = DateTime.fromJSDate(issue.jiraUpdatedAt);
    return details.worklogCount === 0 && details.commentCount === 0 && updatedAt < windowStart.plus({ hours: 12 });
  });

  if (delayedIssue) {
    return "DELAYED";
  }

  return "ON_TRACK";
}

function buildBlockerSummary(blockerIssues: Issue[], blockerComments: Comment[], issueById: Map<string, Issue>): string {
  const lines: string[] = [];

  for (const issue of blockerIssues) {
    lines.push(`• ${issue.key}: ${issue.summary ?? "No summary provided"} (${issue.status})`);
  }

  for (const comment of blockerComments) {
    const issue = issueById.get(comment.issueId);
    if (!issue) {
      continue;
    }
    const body = comment.body.length > 160 ? `${comment.body.slice(0, 157)}…` : comment.body;
    lines.push(`• ${issue.key} comment: "${body}"`);
  }

  if (!lines.length) {
    return "No blockers detected.";
  }

  return lines.join("\n");
}

function buildYesterdaySummary(
  issueById: Map<string, IssueWithBrowse>,
  contributions: Map<string, ContributionAccumulator>,
): string {
  const lines: string[] = [];
  for (const [issueId, details] of contributions.entries()) {
    const issue = issueById.get(issueId);
    if (!issue) {
      continue;
    }
    if (!details.issueTouched) {
      continue;
    }
    lines.push(formatSummaryBullet(issue, details));
  }

  if (!lines.length) {
    return "No Jira activity recorded in the past day.";
  }

  return lines.join("\n");
}

function buildTodaySummary(assignments: Issue[]): string {
  if (!assignments.length) {
    return "No active issues scheduled for today.";
  }

  const ordered = [...assignments].sort((a, b) => {
    const aStatus = STATUS_PRIORITY.findIndex((keyword) =>
      (a.status ?? "").toLowerCase().includes(keyword),
    );
    const bStatus = STATUS_PRIORITY.findIndex((keyword) =>
      (b.status ?? "").toLowerCase().includes(keyword),
    );
    const aRank = aStatus === -1 ? STATUS_PRIORITY.length : aStatus;
    const bRank = bStatus === -1 ? STATUS_PRIORITY.length : bStatus;
    if (aRank === bRank) {
      return a.key.localeCompare(b.key);
    }
    return aRank - bRank;
  });

  const lines = ordered.slice(0, 6).map((issue) => {
    const summary = issue.summary ? ` – ${issue.summary}` : "";
    return `• ${issue.key} (${issue.status ?? "Untriaged"})${summary}`;
  });

  return lines.join("\n");
}

function groupWorkItems(
  issues: IssueWithBrowse[],
  worklogs: Worklog[],
  comments: Comment[],
): DailySummaryWorkItemGroup[] {
  const grouped = new Map<string, DailySummaryWorkItem>();

  for (const issue of issues) {
    grouped.set(issue.id, {
      issue,
      recentComments: [],
      recentWorklogs: [],
      totalWorklogHours: 0,
    });
  }

  for (const worklog of worklogs) {
    const entry = grouped.get(worklog.issueId);
    if (!entry) {
      continue;
    }
    entry.recentWorklogs.push(worklog);
    entry.totalWorklogHours += (worklog.timeSpent ?? 0) / 3600;
  }

  for (const comment of comments) {
    const entry = grouped.get(comment.issueId);
    if (!entry) {
      continue;
    }
    entry.recentComments.push(comment);
  }

  const statusGroups = new Map<string, DailySummaryWorkItemGroup>();
  for (const entry of grouped.values()) {
    entry.recentWorklogs.sort(
      (a, b) => b.jiraStartedAt.getTime() - a.jiraStartedAt.getTime(),
    );
    entry.recentComments.sort(
      (a, b) => b.jiraCreatedAt.getTime() - a.jiraCreatedAt.getTime(),
    );
    const statusLabel = entry.issue.status ?? "Unspecified";
    const group = statusGroups.get(statusLabel);
    if (group) {
      group.items.push(entry);
    } else {
      statusGroups.set(statusLabel, {
        status: statusLabel,
        items: [entry],
      });
    }
  }

  const orderedGroups = Array.from(statusGroups.values()).sort((a, b) => {
    const aIndex = STATUS_PRIORITY.findIndex((keyword) => a.status.toLowerCase().includes(keyword));
    const bIndex = STATUS_PRIORITY.findIndex((keyword) => b.status.toLowerCase().includes(keyword));
    const aRank = aIndex === -1 ? STATUS_PRIORITY.length : aIndex;
    const bRank = bIndex === -1 ? STATUS_PRIORITY.length : bIndex;
    if (aRank === bRank) {
      return a.status.localeCompare(b.status);
    }
    return aRank - bRank;
  });

  orderedGroups.forEach((group) => {
    group.items.sort((a, b) => {
      const aTime =
        (a.recentWorklogs[0]?.jiraStartedAt.getTime() ??
          a.recentComments[0]?.jiraCreatedAt.getTime() ??
          a.issue.jiraUpdatedAt.getTime());
      const bTime =
        (b.recentWorklogs[0]?.jiraStartedAt.getTime() ??
          b.recentComments[0]?.jiraCreatedAt.getTime() ??
          b.issue.jiraUpdatedAt.getTime());
      return bTime - aTime;
    });
  });

  return orderedGroups;
}

function getDisplayName(user: User | null, trackedUser: ProjectTrackedUser | null): string {
  return trackedUser?.displayName ?? user?.displayName ?? "This teammate";
}

function normalizeAccountIds(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value && value.length > 0)),
    ),
  );
}

interface SummaryComputation {
  yesterday: string;
  today: string;
  blockers: string;
  status: DailySummaryStatus;
  issueCounts: IssueCounts;
  workItems: DailySummaryWorkItemGroup[];
  worklogSeconds: number;
}

interface FinalizeSummaryArgs {
  prisma: PrismaClient;
  project: JiraProject;
  projectId: string;
  dayStart: DateTime;
  user: User | null;
  trackedUser: ProjectTrackedUser | null;
  accountIds: string[];
  computation: SummaryComputation;
}

async function finalizeSummary({
  prisma,
  project,
  projectId,
  dayStart,
  user,
  trackedUser,
  accountIds,
  computation,
}: FinalizeSummaryArgs): Promise<DailySummarySnapshot> {
  const isoDate = dayStart.toISODate();
  if (!isoDate) {
    throw new GraphQLError("Unable to resolve stand-up date");
  }

  const primaryAccountId = accountIds[0] ?? null;
  const worklogHours = Number((computation.worklogSeconds / 3600).toFixed(2));
  const baseDate = dayStart.toJSDate();

  if (user) {
    const record = await prisma.dailySummary.upsert({
      where: {
        tenantId_userId_projectId_date: {
          tenantId: user.tenantId,
          userId: user.id,
          projectId,
          date: baseDate,
        },
      },
      include: { user: true, project: true },
      create: {
        tenantId: user.tenantId,
        userId: user.id,
        projectId,
        date: baseDate,
        yesterday: computation.yesterday,
        today: computation.today,
        blockers: computation.blockers,
      },
      update: {
        yesterday: computation.yesterday,
        today: computation.today,
        blockers: computation.blockers,
      },
    });

    return {
      id: record.id,
      user: record.user,
      trackedUser: trackedUser ?? null,
      jiraAccountIds: accountIds,
      primaryAccountId,
      projectId,
      project: record.project,
      date: record.date,
      yesterday: record.yesterday ?? null,
      today: record.today ?? null,
      blockers: record.blockers ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: computation.status,
      worklogHours,
      issueCounts: computation.issueCounts,
      workItems: computation.workItems,
      persisted: true,
    };
  }

  return {
    id: `virtual-${projectId}-${primaryAccountId ?? "unmapped"}-${isoDate}`,
    user: null,
    trackedUser: trackedUser ?? null,
    jiraAccountIds: accountIds,
    primaryAccountId,
    projectId,
    project,
    date: baseDate,
    yesterday: computation.yesterday,
    today: computation.today,
    blockers: computation.blockers,
    createdAt: baseDate,
    updatedAt: new Date(),
    status: computation.status,
    worklogHours,
    issueCounts: computation.issueCounts,
    workItems: computation.workItems,
    persisted: false,
  };
}

interface SummaryTargetParams {
  prisma: PrismaClient;
  project: JiraProject;
  dateInfo: ReturnType<typeof resolveStandupWindow>;
  accountIds: string[];
  user: User | null;
  trackedUser: ProjectTrackedUser | null;
}

async function generateSummaryForTarget({
  prisma,
  project,
  dateInfo,
  accountIds,
  user,
  trackedUser,
}: SummaryTargetParams): Promise<DailySummarySnapshot> {
  const normalizedAccountIds = normalizeAccountIds(accountIds);
  const { dayStart, windowStart, windowEnd, recentCutoff } = dateInfo;
  const projectId = project.id;

  if (normalizedAccountIds.length === 0) {
    const displayName = getDisplayName(user, trackedUser);
    const computation: SummaryComputation = {
      yesterday: `No Jira account linked to ${displayName} for this project.`,
      today: `Link ${displayName}'s Jira account to surface today's plan.`,
      blockers: "Blocker detection requires a Jira account link.",
      status: "DELAYED",
      issueCounts: { ...EMPTY_ISSUE_COUNTS },
      workItems: [],
      worklogSeconds: 0,
    };
    return finalizeSummary({
      prisma,
      project,
      projectId,
      dayStart,
      user,
      trackedUser,
      accountIds: normalizedAccountIds,
      computation,
    });
  }

  const jiraUsers = await prisma.jiraUser.findMany({
    where: { accountId: { in: normalizedAccountIds } },
  });

  if (!jiraUsers.length) {
    const displayName = getDisplayName(user, trackedUser);
    const computation: SummaryComputation = {
      yesterday: `${displayName}'s Jira profile has not been synced yet.`,
      today: "Trigger a Jira sync to populate today's plan.",
      blockers: "Blocker detection will resume after the next sync.",
      status: "DELAYED",
    issueCounts: { ...EMPTY_ISSUE_COUNTS },
      workItems: [],
      worklogSeconds: 0,
    };
    return finalizeSummary({
      prisma,
      project,
      projectId,
      dayStart,
      user,
      trackedUser,
      accountIds: normalizedAccountIds,
      computation,
    });
  }

  const jiraUserIds = jiraUsers.map((jiraUser) => jiraUser.id);

  const [worklogs, comments, updatedIssuesRaw, assignedIssuesRaw] = await Promise.all([
    prisma.worklog.findMany({
      where: {
        authorId: { in: jiraUserIds },
        jiraUpdatedAt: {
          gte: windowStart.toJSDate(),
          lt: windowEnd.toJSDate(),
        },
        issue: {
          projectId,
        },
      },
      include: {
        issue: true,
        author: true,
      },
      orderBy: { jiraStartedAt: "desc" },
    }),
    prisma.comment.findMany({
      where: {
        authorId: { in: jiraUserIds },
        jiraCreatedAt: {
          gte: windowStart.toJSDate(),
          lt: windowEnd.toJSDate(),
        },
        issue: {
          projectId,
        },
      },
      include: {
        issue: true,
        author: true,
      },
      orderBy: { jiraCreatedAt: "desc" },
    }),
    prisma.issue.findMany({
      where: {
        assigneeId: { in: jiraUserIds },
        projectId,
        jiraUpdatedAt: {
          gte: windowStart.toJSDate(),
          lt: windowEnd.toJSDate(),
        },
      },
      include: ISSUE_SUMMARY_INCLUDE,
    }),
    prisma.issue.findMany({
      where: {
        assigneeId: { in: jiraUserIds },
        projectId,
        NOT: { status: { in: DONE_STATUS_VALUES } },
        OR: [
          {
            jiraUpdatedAt: {
              gte: windowStart.toJSDate(),
            },
          },
          {
            jiraUpdatedAt: {
              gte: recentCutoff.toJSDate(),
            },
          },
          {
            status: {
              in: ACTIVE_STATUS_VALUES,
            },
          },
        ],
      },
      include: ISSUE_SUMMARY_INCLUDE,
      orderBy: { jiraUpdatedAt: "desc" },
      take: 30,
    }),
  ]);

  const assignedIssues = assignedIssuesRaw.map<IssueWithBrowse>((issue) => ({
    ...issue,
    browseUrl: buildBrowseUrl(issue),
  }));

  const updatedIssues = updatedIssuesRaw.map<IssueWithBrowse>((issue) => ({
    ...issue,
    browseUrl: buildBrowseUrl(issue),
  }));

  const touchedIssueIds = new Set<string>();
  for (const worklog of worklogs) {
    touchedIssueIds.add(worklog.issueId);
  }
  for (const comment of comments) {
    touchedIssueIds.add(comment.issueId);
  }
  for (const issue of updatedIssues) {
    touchedIssueIds.add(issue.id);
  }

  const issuesRaw = await prisma.issue.findMany({
    where: {
      id: { in: Array.from(touchedIssueIds) },
    },
    include: ISSUE_SUMMARY_INCLUDE,
  });

  const issues = issuesRaw.map<IssueWithBrowse>((issue) => ({
    ...issue,
    browseUrl: buildBrowseUrl(issue),
  }));

  const issueById = new Map<string, IssueWithBrowse>();
  for (const issue of [...issues, ...assignedIssues]) {
    issueById.set(issue.id, issue);
  }

  const contributions = new Map<string, ContributionAccumulator>();
  for (const issueId of issueById.keys()) {
    contributions.set(issueId, {
      worklogSeconds: 0,
      worklogCount: 0,
      commentCount: 0,
      issueTouched: false,
    });
  }

  for (const worklog of worklogs) {
    const bucket = contributions.get(worklog.issueId);
    if (!bucket) {
      continue;
    }
    bucket.worklogSeconds += worklog.timeSpent ?? 0;
    bucket.worklogCount += 1;
    bucket.issueTouched = true;
  }

  for (const comment of comments) {
    const bucket = contributions.get(comment.issueId);
    if (!bucket) {
      continue;
    }
    bucket.commentCount += 1;
    bucket.issueTouched = true;
  }

  for (const issue of updatedIssues) {
    const bucket = contributions.get(issue.id);
    if (!bucket) {
      continue;
    }
    bucket.issueTouched = true;
  }

  const worklogSecondsTotal = Array.from(contributions.values()).reduce(
    (sum, entry) => sum + entry.worklogSeconds,
    0,
  );

  const blockerIssues = detectBlockerIssues(assignedIssues);
  const blockerComments = detectBlockerComments(comments);
  const overallStatus = deriveOverallStatus(
    blockerIssues,
    blockerComments,
    assignedIssues,
    contributions,
    windowStart,
  );

  const yesterdaySummary = buildYesterdaySummary(issueById, contributions);
  const todaySummary = buildTodaySummary(assignedIssues);
  const blockersSummary = buildBlockerSummary(blockerIssues, blockerComments, issueById);
  const issueCounts = summarizeAssignments(assignedIssues);
  const issuesForGrouping =
    assignedIssues.length > 0
      ? assignedIssues.filter((issue) => issueById.has(issue.id))
      : issues;
  const workItemGroups = groupWorkItems(issuesForGrouping, worklogs, comments);

  const computation: SummaryComputation = {
    yesterday: yesterdaySummary,
    today: todaySummary,
    blockers: blockersSummary,
    status: overallStatus,
    issueCounts,
    workItems: workItemGroups,
    worklogSeconds: worklogSecondsTotal,
  };

  return finalizeSummary({
    prisma,
    project,
    projectId,
    dayStart,
    user,
    trackedUser,
    accountIds: normalizedAccountIds,
    computation,
  });
}

async function fetchProjectOrThrow(prisma: PrismaClient, projectId: string): Promise<JiraProject> {
  const project = await prisma.jiraProject.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new GraphQLError("Project not found");
  }
  return project;
}

export async function generateSummaryForUser(
  prisma: PrismaClient,
  userId: string,
  dateInput: string | Date,
  projectId: string,
): Promise<DailySummarySnapshot> {
  const project = await fetchProjectOrThrow(prisma, projectId);
  const dateInfo = resolveStandupWindow(dateInput);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new GraphQLError("User not found");
  }

  const projectLink = await prisma.userProjectLink.findFirst({
    where: {
      userId: user.id,
      projectId,
    },
  });

  const accountIds = normalizeAccountIds([projectLink?.jiraAccountId ?? null]);

  let trackedUser: ProjectTrackedUser | null = null;
  if (accountIds.length > 0) {
    trackedUser = await prisma.projectTrackedUser.findFirst({
      where: {
        projectId,
        jiraAccountId: { in: accountIds },
      },
    });
  }

  return generateSummaryForTarget({
    prisma,
    project,
    dateInfo,
    accountIds,
    user,
    trackedUser,
  });
}

export async function generateSummariesForDate(
  prisma: PrismaClient,
  dateInput: string | Date,
  projectId: string,
): Promise<DailySummarySnapshot[]> {
  const project = await fetchProjectOrThrow(prisma, projectId);
  const dateInfo = resolveStandupWindow(dateInput);

  const trackedUsers = await prisma.projectTrackedUser.findMany({
    where: { projectId, isTracked: true },
    orderBy: { displayName: "asc" },
  });

  const trackedByAccountId = new Map<string, ProjectTrackedUser>();
  for (const tracked of trackedUsers) {
    if (tracked.jiraAccountId) {
      trackedByAccountId.set(tracked.jiraAccountId, tracked);
    }
  }

  const results: DailySummarySnapshot[] = [];
  const processedAccountIds = new Set<string>();

  for (const tracked of trackedUsers) {
    const seeds: Array<string | null> = [tracked.jiraAccountId];
    let user: User | null = null;

    if (tracked.jiraAccountId) {
      const link = await prisma.userProjectLink.findFirst({
        where: { projectId, jiraAccountId: tracked.jiraAccountId },
        include: { user: true },
      });
      if (link?.user) {
        user = link.user;
        seeds.push(link.jiraAccountId);
      }
    }

    const uniqueAccountIds = normalizeAccountIds(seeds);
    uniqueAccountIds.forEach((accountId) => processedAccountIds.add(accountId));

    const summary = await generateSummaryForTarget({
      prisma,
      project,
      dateInfo,
      accountIds: uniqueAccountIds,
      user,
      trackedUser: tracked,
    });
    results.push(summary);
  }

  const additionalLinks = await prisma.userProjectLink.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { user: { displayName: "asc" } },
  });

  for (const link of additionalLinks) {
    if (processedAccountIds.has(link.jiraAccountId)) {
      continue;
    }

    const trackedUser = trackedByAccountId.get(link.jiraAccountId) ?? null;
    const summary = await generateSummaryForTarget({
      prisma,
      project,
      dateInfo,
      accountIds: [link.jiraAccountId],
      user: link.user,
      trackedUser,
    });
    results.push(summary);
    processedAccountIds.add(link.jiraAccountId);
  }

  results.sort((a, b) => {
    const aName = getDisplayName(a.user, a.trackedUser).toLocaleLowerCase();
    const bName = getDisplayName(b.user, b.trackedUser).toLocaleLowerCase();
    return aName.localeCompare(bName);
  });

  return results;
}

export async function exportSummariesToPdf(
  prisma: PrismaClient,
  dateInput: string | Date,
  projectId: string,
  destinationPath: string,
): Promise<{ path: string }> {
  const standupDate = normalizeDate(dateInput);
  const isoDate = standupDate.toISODate();
  if (!isoDate) {
    throw new Error("Unable to resolve stand-up date");
  }
  const summaries = await generateSummariesForDate(prisma, isoDate, projectId);
  const resolvedPath = path.resolve(destinationPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  const pdfBuffer = buildPdfDocument(isoDate, summaries);
  await fs.writeFile(resolvedPath, pdfBuffer);

  return { path: resolvedPath };
}

export async function exportSummariesToSlackPayload(
  prisma: PrismaClient,
  dateInput: string | Date,
  projectId: string,
): Promise<{ payload: Record<string, unknown> }> {
  const standupDate = normalizeDate(dateInput);
  const isoDate = standupDate.toISODate();
  if (!isoDate) {
    throw new Error("Unable to resolve stand-up date");
  }
  const summaries = await generateSummariesForDate(prisma, isoDate, projectId);

  const blocks = summaries.flatMap((summary) => [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${getDisplayName(summary.user, summary.trackedUser)}* — ${summary.status.replace("_", " ")}`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Yesterday*\n${summary.yesterday ?? "—"}` },
        { type: "mrkdwn", text: `*Today*\n${summary.today ?? "—"}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Blockers*\n${summary.blockers ?? "—"}` },
    },
    { type: "divider" },
  ]);

  return {
    payload: {
      text: `Daily Scrum Summaries for ${isoDate}`,
      blocks,
    },
  };
}

function buildPdfDocument(date: string, summaries: DailySummarySnapshot[]): Buffer {
  const lines = buildPdfLines(date, summaries);

  let textStream = "BT\n/F1 12 Tf\n14 TL\n72 800 Td\n";
  lines.forEach((line, index) => {
    const escaped = escapePdfText(line);
    if (index === 0) {
      textStream += `(${escaped}) Tj\n`;
    } else {
      textStream += `T* (${escaped}) Tj\n`;
    }
  });
  textStream += "ET\n";

  const contentBuffer = Buffer.from(textStream, "utf-8");

  const buffers: Buffer[] = [];
  buffers.push(Buffer.from("%PDF-1.4\n", "utf-8"));
  const offsets: number[] = [];
  let currentOffset = buffers[0].length;

  const pushObject = (content: string) => {
    offsets.push(currentOffset);
    const buffer = Buffer.from(content, "utf-8");
    buffers.push(buffer);
    currentOffset += buffer.length;
  };

  const pushObjectWithStream = (prefix: string, stream: Buffer, suffix: string) => {
    offsets.push(currentOffset);
    const prefixBuffer = Buffer.from(prefix, "utf-8");
    buffers.push(prefixBuffer);
    currentOffset += prefixBuffer.length;

    buffers.push(stream);
    currentOffset += stream.length;

    const suffixBuffer = Buffer.from(suffix, "utf-8");
    buffers.push(suffixBuffer);
    currentOffset += suffixBuffer.length;
  };

  pushObject("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  pushObject("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n");
  pushObject(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
  );
  pushObjectWithStream(`4 0 obj << /Length ${contentBuffer.length} >> stream\n`, contentBuffer, "\nendstream\nendobj\n");
  pushObject("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n");

  const xrefOffset = currentOffset;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  offsets.forEach((offset) => {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  buffers.push(Buffer.from(xref, "utf-8"));

  const trailer = `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  buffers.push(Buffer.from(trailer, "utf-8"));

  return Buffer.concat(buffers);
}

function buildPdfLines(date: string, summaries: DailySummarySnapshot[]): string[] {
  const lines: string[] = [`Daily Scrum Summaries – ${date}`, ""];
  summaries.forEach((summary, index) => {
    lines.push(`${getDisplayName(summary.user, summary.trackedUser)} – ${summary.status.replace("_", " ")}`);
    lines.push(`Project: ${summary.project?.key ?? summary.projectId}`);
    lines.push(`Yesterday: ${truncateLine(collapseMultiline(summary.yesterday))}`);
    lines.push(`Today: ${truncateLine(collapseMultiline(summary.today))}`);
    lines.push(`Blockers: ${truncateLine(collapseMultiline(summary.blockers))}`);
    lines.push(`Hours logged: ${summary.worklogHours.toFixed(1)} | In progress: ${summary.issueCounts.inProgress}`);
    if (index !== summaries.length - 1) {
      lines.push("");
    }
  });
  return lines;
}

function collapseMultiline(value?: string | null): string {
  if (!value) {
    return "—";
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");
}

function truncateLine(value: string, limit = 110): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
