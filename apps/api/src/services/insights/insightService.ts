import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@platform/cdm";
import { z } from "zod";
import { getEnv } from "../../env.js";
import { executeIssueInsightSkill } from "../../llm/runtime.js";
import type { IssueInsightSkillInput } from "../../llm/types.js";


type Provider = "auto" | "openai" | "local";
type Severity = "low" | "medium" | "high";

export interface InsightSummary {
  text: string;
  provider: string;
  confidence?: number;
}

export interface InsightSentiment {
  label: "positive" | "negative" | "neutral";
  score: number;
  tones: string[];
  provider: string;
}

export interface InsightSignal {
  type: string;
  severity: Severity;
  detail: string;
  metadata?: Record<string, unknown>;
}

export interface IssueInsightDTO {
  issueId: string;
  summary: InsightSummary;
  sentiment: InsightSentiment;
  escalateScore: number;
  signals: InsightSignal[];
  computedAt: Date;
  expiresAt?: Date | null;
  providerMetadata?: Record<string, unknown> | null;
  provider?: string;
  stage?: StageProgressSnapshot | null;
  delta?: InsightDeltaSummary | null;
  requirement?: string | null;
  waitingOn?: string[];
  snapshotId?: string;
}

type SkillExecution = Awaited<ReturnType<typeof executeIssueInsightSkill>>;

const InsightSkillResponseSchema = z.object({
  summary: z.object({
    text: z.string().min(1),
    confidence: z.number().nullable().optional(),
    provider: z.string().nullable().optional(),
  }),
  sentiment: z.object({
    label: z.enum(["positive", "neutral", "negative"]),
    score: z.number(),
    tones: z.array(z.string()).optional(),
    provider: z.string().nullable().optional(),
  }),
  signals: z
    .array(
      z.object({
        type: z.string(),
        severity: z.string(),
        detail: z.string(),
        metadata: z.record(z.any()).nullish(),
      }),
    )
    .optional(),
  escalationScore: z.number(),
  expiresAt: z.string().nullable().optional(),
  requirement: z.string().nullable().optional(),
  waitingOn: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

type InsightSkillResponse = z.infer<typeof InsightSkillResponseSchema>;

interface IssueContext {
  issue: IssueWithRelations;
  comments: IssueWithRelations["comments"];
  worklogs: IssueWithRelations["worklogs"];
}

type IssueWithRelations = Prisma.IssueGetPayload<{
  include: {
    project: { select: { id: true; key: true; name: true } };
    assignee: { select: { displayName: true; email: true } };
    reporter: { select: { displayName: true; email: true } };
    linksOut: { include: { target: true } };
    linksIn: { include: { source: true } };
    comments: { include: { author: { select: { displayName: true } } } };
    worklogs: { include: { author: { select: { displayName: true } } } };
    children: {
      select: {
        id: true;
        key: true;
        summary: true;
        status: true;
        statusCategory: true;
        assigneeId: true;
        jiraUpdatedAt: true;
      };
    };
  };
}>;

type IssueInsightRecord = Prisma.IssueInsightGetPayload<Prisma.IssueInsightDefaultArgs>;
type IssueInsightSnapshotRecord = Prisma.IssueInsightSnapshotGetPayload<Prisma.IssueInsightSnapshotDefaultArgs>;

type IssueEntity = Prisma.IssueGetPayload<Prisma.IssueDefaultArgs>;

const NEGATIVE_WORDS = [
  "angry",
  "broken",
  "crash",
  "delay",
  "fail",
  "frustrated",
  "issue",
  "problem",
  "stuck",
  "unhappy",
  "urgent",
  "worried",
];

const POSITIVE_WORDS = [
  "appreciate",
  "awesome",
  "fixed",
  "good",
  "great",
  "happy",
  "helpful",
  "improved",
  "resolved",
  "thanks",
];

interface StageProgressSnapshot {
  currentStage: string;
  breakdown: Array<{
    key: string;
    label: string;
    total: number;
    inProgress: number;
    done: number;
    todo: number;
  }>;
}

interface InsightDeltaSummary {
  newCommentCount: number;
  latestCommentAuthors: string[];
  newWorklogSeconds: number;
  newWorklogHours: number;
}

interface ComputeInsightsArgs {
  prisma: PrismaClient;
  tenantId: string;
  context: IssueContext;
  hash: string;
  previousSnapshot: IssueInsightSnapshotRecord | null;
  previousSummary: InsightSummary | null;
  newComments: IssueContext["comments"];
  newWorklogs: IssueContext["worklogs"];
  env: ReturnType<typeof getEnv>;
  allowCache: boolean;
  logger: Console;
  userId?: string | null;
  providerOverride?: string | null;
}

export async function getIssueInsights(
  prisma: PrismaClient,
  tenantId: string,
  issueId: string,
  provider: Provider,
  refresh: boolean,
): Promise<IssueInsightDTO> {
  const context = await loadIssueContext(prisma, tenantId, issueId);
  const env = getEnv();
  const effectiveProvider = resolveProvider(provider, env.INSIGHTS_PROVIDER);
  const hash = computeIssueHash(context);

  const existing = await prisma.issueInsight.findUnique({
    where: { issueId },
    include: { latestSnapshot: true },
  });

  const latestSnapshot =
    existing?.latestSnapshot ??
    (existing
      ? await prisma.issueInsightSnapshot.findFirst({
          where: { issueId, tenantId },
          orderBy: { createdAt: "desc" },
        })
      : null);

  if (
    !refresh &&
    latestSnapshot &&
    latestSnapshot.inputsHash === hash &&
    matchesProvider(latestSnapshot.summary, effectiveProvider)
  ) {
    return mapSnapshotRecord(latestSnapshot);
  }

  if (
    !refresh &&
    existing &&
    existing.lastIssueHash === hash &&
    matchesProvider(existing.summary, effectiveProvider)
  ) {
    return mapInsightRecord(existing);
  }

  const previousSummary =
    latestSnapshot && typeof latestSnapshot.summary === "object" && !Array.isArray(latestSnapshot.summary)
      ? sanitizeSummary(latestSnapshot.summary)
      : null;
  const previousCommentCursor = latestSnapshot?.commentCursor
    ? new Date(latestSnapshot.commentCursor)
    : null;
  const previousWorklogCursor = latestSnapshot?.worklogCursor
    ? new Date(latestSnapshot.worklogCursor)
    : null;

  const newComments = filterNewComments(context.comments, previousCommentCursor);
  const newWorklogs = filterNewWorklogs(context.worklogs, previousWorklogCursor);

  const result = await computeInsights({
    prisma,
    tenantId,
    context,
    hash,
    previousSnapshot: latestSnapshot ?? null,
    previousSummary,
    newComments,
    newWorklogs,
    env,
    allowCache: !refresh,
    logger: console,
    userId: null,
    providerOverride: resolveProvider(provider, env.INSIGHTS_PROVIDER),
  });

  return result;
}

export async function ensureIssueInsights(
  prisma: PrismaClient,
  tenantId: string,
  issueId: string,
  provider: Provider,
  allowCache = true,
): Promise<void> {
  try {
    await getIssueInsights(prisma, tenantId, issueId, provider, !allowCache);
  } catch (error) {
    console.error("[insights] ensureIssueInsights failed", { issueId, provider, error });
  }
}

function matchesProvider(summary: Prisma.JsonValue | null, expected: Provider): boolean {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return expected === "auto";
  }
  const provider = (summary as Record<string, unknown>).provider;
  if (typeof provider !== "string") {
    return expected === "auto";
  }
  if (expected === "auto") {
    return true;
  }
  return provider === expected;
}

function resolveProvider(requested: Provider, defaultProvider: string): Provider {
  if (requested !== "auto") {
    return requested;
  }
  if (defaultProvider === "openai" || defaultProvider === "local") {
    return defaultProvider;
  }
  return "auto";
}

async function loadIssueContext(
  prisma: PrismaClient,
  tenantId: string,
  issueId: string,
): Promise<IssueContext> {
  const issue = (await prisma.issue.findFirst({
    where: { id: issueId, tenantId },
    include: {
      project: { select: { id: true, key: true, name: true } },
      assignee: { select: { displayName: true, email: true } },
      reporter: { select: { displayName: true, email: true } },
      linksOut: {
        include: {
          target: true,
        },
      },
      linksIn: {
        include: {
          source: true,
        },
      },
      comments: {
        include: { author: { select: { displayName: true } } },
        orderBy: { jiraCreatedAt: "desc" },
        take: 10,
      },
      worklogs: {
        include: { author: { select: { displayName: true } } },
        orderBy: { jiraUpdatedAt: "desc" },
        take: 5,
      },
      children: {
        select: {
          id: true,
          key: true,
          summary: true,
          status: true,
          statusCategory: true,
          assigneeId: true,
          jiraUpdatedAt: true,
        },
      },
    },
  })) as IssueWithRelations | null;

  if (!issue) {
    throw new Error("Issue not found");
  }

  return {
    issue,
    comments: issue.comments,
    worklogs: issue.worklogs,
  };
}

function filterNewComments(
  comments: IssueContext["comments"],
  cursor: Date | null,
): IssueContext["comments"] {
  if (!cursor) {
    return comments;
  }
  const cutoff = cursor.getTime();
  return comments.filter((comment) => comment.jiraCreatedAt.getTime() > cutoff);
}

function filterNewWorklogs(
  worklogs: IssueContext["worklogs"],
  cursor: Date | null,
): IssueContext["worklogs"] {
  if (!cursor) {
    return worklogs;
  }
  const cutoff = cursor.getTime();
  return worklogs.filter((worklog) => worklog.jiraUpdatedAt.getTime() > cutoff);
}

async function computeInsights({
  prisma,
  tenantId,
  context,
  hash,
  previousSnapshot,
  previousSummary,
  newComments,
  newWorklogs,
  env,
  allowCache,
  logger,
  userId,
}: ComputeInsightsArgs): Promise<IssueInsightDTO> {
  const ttlMinutes = env.INSIGHTS_CACHE_TTL_MINUTES ?? 0;
  const expiresAt = ttlMinutes > 0 ? new Date(Date.now() + ttlMinutes * 60 * 1000) : null;

  const baselineSummary = buildRuleBasedSummary(context);
  const incrementalSummary = buildIncrementalSummary(baselineSummary, previousSummary, newComments);
  const summarySeed = incrementalSummary ?? baselineSummary;
  const heuristicSentiment = computeHeuristicSentiment(context);
  const stageProgress = computeStageProgress(context.issue);
  const deltaSummary = buildDeltaSummary(newComments, newWorklogs);
  const waitingOn = deriveWaitingOn(context);

  let resolvedSummary: InsightSummary | null = null;
  let resolvedSentiment: InsightSentiment | null = null;
  let signals: InsightSignal[] = [];
  let escalateScore = 0;
  let resolvedExpiresAt = expiresAt ?? null;
  let requirement = extractRequirement(context.issue);
  let waitingList = waitingOn;
  let providerMetadata: Record<string, unknown> = {};
  let providerTag: string | null = null;

  let skillExecution: SkillExecution | null = null;
  let skillResponse: InsightSkillResponse | null = null;

  try {
    const skillInput = buildIssueInsightSkillInput({
      issue: context.issue,
      summarySeed,
      incrementalSummary,
      heuristicSentiment,
      stageProgress,
      delta: deltaSummary,
      waitingOn,
      comments: context.comments,
      worklogs: context.worklogs,
    });

    skillExecution = await executeIssueInsightSkill({
      tenantId,
      userId,
      requestId: hash,
      payload: skillInput,
      allowCache,
    });

    skillResponse = parseInsightSkillOutput(skillExecution.output);
  } catch (error) {
    logger.error("[insights] deterministic skill execution failed", error);
    throw error instanceof Error ? error : new Error("Deterministic skill execution failed");
  }

  if (!skillResponse || !skillExecution) {
    throw new Error("Skill execution did not return a valid response");
  }

  const rawConfidence = skillResponse.summary.confidence;
  const confidence =
    typeof rawConfidence === "number"
      ? Math.min(1, Math.max(0, rawConfidence))
      : undefined;

  providerTag = skillResponse.summary.provider ?? skillExecution.model.provider ?? "llm";
  const providerValue = providerTag ?? "llm";
  resolvedSummary = {
    text: skillResponse.summary.text,
    provider: providerValue,
    confidence,
  };
  resolvedSentiment = {
    label: skillResponse.sentiment.label,
    score: Number(skillResponse.sentiment.score.toFixed(2)),
    tones: skillResponse.sentiment.tones ?? [],
    provider: skillResponse.sentiment.provider ?? providerValue,
  };
  signals = (skillResponse.signals ?? []).map((signal) => ({
    type: signal.type,
    severity: (signal.severity ?? "medium").toLowerCase() as Severity,
    detail: signal.detail,
    metadata: signal.metadata ?? undefined,
  }));
  escalateScore = skillResponse.escalationScore;
  resolvedExpiresAt = skillResponse.expiresAt ? new Date(skillResponse.expiresAt) : resolvedExpiresAt;
  requirement = skillResponse.requirement ?? requirement;
  waitingList = skillResponse.waitingOn && skillResponse.waitingOn.length ? skillResponse.waitingOn : waitingList;

  providerMetadata = {
    traceId: skillExecution.traceId,
    cached: skillExecution.cached,
    model: skillExecution.model,
    usage: skillExecution.usage,
    stage: stageProgress,
    delta: deltaSummary,
    requirement,
    waitingOn: waitingList,
    ruleSummary: summarySeed.text,
    incrementalSummary: incrementalSummary?.text ?? null,
  };
  providerTag = providerValue;

  const latestCommentCursor = determineLatestCommentCursor(context.comments, previousSnapshot?.commentCursor ?? null);
  const latestWorklogCursor = determineLatestWorklogCursor(context.worklogs, previousSnapshot?.worklogCursor ?? null);

  providerMetadata = {
    ...providerMetadata,
    ruleSummary: providerMetadata.ruleSummary ?? summarySeed.text,
    incrementalSummary: providerMetadata.incrementalSummary ?? incrementalSummary?.text ?? null,
  };

  const snapshot = await prisma.issueInsightSnapshot.create({
    data: {
      tenantId,
      issueId: context.issue.id,
      provider: String(providerTag ?? "rule_based"),
      inputsHash: hash,
      summary: resolvedSummary as unknown as Prisma.InputJsonValue,
      sentiments: resolvedSentiment as unknown as Prisma.InputJsonValue,
      escalationScore: escalateScore,
      signals: signals as unknown as Prisma.InputJsonValue,
      providerMetadata: providerMetadata as unknown as Prisma.InputJsonValue,
      deltaSummary: deltaSummary as unknown as Prisma.InputJsonValue,
      commentCursor: latestCommentCursor,
      worklogCursor: latestWorklogCursor,
      statusStage: stageProgress.currentStage,
      stageBreakdown: stageProgress.breakdown as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.issueInsight.upsert({
    where: { issueId: context.issue.id },
    create: {
      tenantId,
      issueId: context.issue.id,
      summary: resolvedSummary as unknown as Prisma.InputJsonValue,
      sentiments: resolvedSentiment as unknown as Prisma.InputJsonValue,
      escalationScore: escalateScore,
      signals: signals as unknown as Prisma.InputJsonValue,
      providerMetadata: providerMetadata as unknown as Prisma.InputJsonValue,
      lastIssueHash: hash,
      metadata: buildMetadata(context, stageProgress) as unknown as Prisma.InputJsonValue,
      computedAt: snapshot.createdAt,
      expiresAt,
      latestSnapshotId: snapshot.id,
    },
    update: {
      summary: resolvedSummary as unknown as Prisma.InputJsonValue,
      sentiments: resolvedSentiment as unknown as Prisma.InputJsonValue,
      escalationScore: escalateScore,
      signals: signals as unknown as Prisma.InputJsonValue,
      providerMetadata: providerMetadata as unknown as Prisma.InputJsonValue,
      lastIssueHash: hash,
      metadata: buildMetadata(context, stageProgress) as unknown as Prisma.InputJsonValue,
      computedAt: snapshot.createdAt,
      expiresAt: resolvedExpiresAt,
      latestSnapshotId: snapshot.id,
    },
  });

  return mapSnapshotRecord(snapshot);
}

function determineLatestCommentCursor(
  comments: IssueContext["comments"],
  fallback: string | null,
): string | null {
  if (!comments.length) {
    return fallback;
  }
  const latest = comments.reduce((acc, comment) => {
    if (!acc) {
      return comment.jiraCreatedAt;
    }
    return comment.jiraCreatedAt.getTime() > acc.getTime() ? comment.jiraCreatedAt : acc;
  }, comments[0].jiraCreatedAt);
  return latest ? latest.toISOString() : fallback;
}

function determineLatestWorklogCursor(
  worklogs: IssueContext["worklogs"],
  fallback: string | null,
): string | null {
  if (!worklogs.length) {
    return fallback;
  }
  const latest = worklogs.reduce((acc, worklog) => {
    if (!acc) {
      return worklog.jiraUpdatedAt;
    }
    return worklog.jiraUpdatedAt.getTime() > acc.getTime() ? worklog.jiraUpdatedAt : acc;
  }, worklogs[0].jiraUpdatedAt);
  return latest ? latest.toISOString() : fallback;
}

function buildDeltaSummary(
  newComments: IssueContext["comments"],
  newWorklogs: IssueContext["worklogs"],
): InsightDeltaSummary {
  const newWorklogSeconds = newWorklogs.reduce((total, worklog) => total + (worklog.timeSpent ?? 0), 0);
  const authors = Array.from(
    new Set(
      newComments.map((comment) => comment.author?.displayName ?? "User"),
    ),
  ).slice(0, 5);

  return {
    newCommentCount: newComments.length,
    latestCommentAuthors: authors,
    newWorklogSeconds,
    newWorklogHours: Number((newWorklogSeconds / 3600).toFixed(2)),
  };
}

interface BuildIssueInsightSkillInputArgs {
  issue: IssueWithRelations;
  summarySeed: InsightSummary;
  incrementalSummary: InsightSummary | null;
  heuristicSentiment: InsightSentiment;
  stageProgress: StageProgressSnapshot;
  delta: InsightDeltaSummary;
  waitingOn: string[];
  comments: IssueContext["comments"];
  worklogs: IssueContext["worklogs"];
}

function buildIssueInsightSkillInput(args: BuildIssueInsightSkillInputArgs): IssueInsightSkillInput {
  const dueDate = args.issue.dueDate ? new Date(args.issue.dueDate).toISOString() : "Not set";
  const resolvedAt = args.issue.resolvedAt ? new Date(args.issue.resolvedAt).toISOString() : "Not resolved";
  const tones = args.heuristicSentiment.tones.length ? args.heuristicSentiment.tones.join(", ") : "none";

  return {
    issueKey: args.issue.key,
    issueSummary: args.issue.summary ?? "No summary provided",
    issueStatus: args.issue.status ?? "Unspecified",
    statusCategory: args.issue.statusCategory ?? "Unknown",
    priority: args.issue.priority ?? "Unspecified",
    dueDate,
    resolvedAt,
    ruleSummary: args.summarySeed.text,
    incrementalSummary: args.incrementalSummary?.text ?? "No incremental context detected.",
    heuristicSentimentLabel: args.heuristicSentiment.label,
    heuristicSentimentScore: args.heuristicSentiment.score.toFixed(2),
    heuristicSentimentTones: tones,
    stageSummary: formatStageSummary(args.stageProgress),
    recentComments: formatRecentComments(args.comments),
    recentWorklogs: formatRecentWorklogs(args.worklogs),
    waitingOn: formatWaitingOnSummary(args.waitingOn),
    additionalNotes: buildAdditionalNotes(args.delta, args.waitingOn),
  };
}

function parseInsightSkillOutput(raw: string): InsightSkillResponse {
  const trimmed = raw.trim();
  const normalized = extractJsonPayload(trimmed);
  const parsed = InsightSkillResponseSchema.parse(JSON.parse(normalized));
  return parsed;
}

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/^```(?:json)?\s*\n([\s\S]*?)```$/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  return raw;
}

function formatStageSummary(stage: StageProgressSnapshot): string {
  if (!stage.breakdown.length) {
    return "No sub-task breakdown available.";
  }
  return stage.breakdown
    .map(
      (bucket) =>
        `${bucket.label}: total ${bucket.total}, in progress ${bucket.inProgress}, done ${bucket.done}, todo ${bucket.todo}`,
    )
    .join(" | ");
}

function formatRecentComments(comments: IssueContext["comments"]): string {
  if (!comments.length) {
    return "No recent comments.";
  }
  return comments
    .map((comment) => {
      const author = comment.author?.displayName ?? "Unknown";
      const timestamp = comment.jiraCreatedAt.toISOString();
      const body = truncate((comment.body ?? "").replace(/\s+/g, " ").trim(), 200);
      return `${timestamp} — ${author}: ${body}`;
    })
    .join("\n");
}

function formatRecentWorklogs(worklogs: IssueContext["worklogs"]): string {
  if (!worklogs.length) {
    return "No recent worklogs.";
  }
  return worklogs
    .map((log) => {
      const author = log.author?.displayName ?? "Unknown";
      const timestamp = log.jiraUpdatedAt.toISOString();
      const hours = formatHours(log.timeSpent ?? 0);
      const description = truncate((log.description ?? "").replace(/\s+/g, " ").trim(), 160);
      return `${timestamp} — ${author}: ${hours} · ${description || "No description provided."}`;
    })
    .join("\n");
}

function formatWaitingOnSummary(waitingOn: string[]): string {
  if (!waitingOn.length) {
    return "None";
  }
  return waitingOn.join("; ");
}

function buildAdditionalNotes(delta: InsightDeltaSummary, waitingOn: string[]): string {
  return `New comments: ${delta.newCommentCount}. Worklog hours added: ${delta.newWorklogHours.toFixed(
    2,
  )}. Pending dependencies: ${waitingOn.length}.`;
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toFixed(2)}h`;
}

const STAGE_PIPELINE: Array<{
  key: string;
  label: string;
  keywords: string[];
}> = [
  { key: "REQUIREMENT", label: "Requirement", keywords: ["todo", "backlog", "plan", "analysis", "refine"] },
  { key: "DEVELOPMENT", label: "Development", keywords: ["progress", "dev", "implement", "coding", "build"] },
  { key: "QA", label: "QA", keywords: ["test", "qa", "review", "verify"] },
  { key: "DEPLOYMENT", label: "Deployment", keywords: ["deploy", "release", "done", "closed", "complete"] },
];

function computeStageProgress(issue: IssueWithRelations): StageProgressSnapshot {
  const breakdown = STAGE_PIPELINE.map((stage) => ({
    key: stage.key,
    label: stage.label,
    total: 0,
    inProgress: 0,
    done: 0,
    todo: 0,
  }));

  const classify = (status?: string | null, statusCategory?: string | null): string => {
    const value = (status ?? "").toLowerCase();
    for (const stage of STAGE_PIPELINE) {
      if (stage.key === "DEPLOYMENT" && (statusCategory ?? "").toLowerCase() === "done") {
        return stage.key;
      }
      if (stage.keywords.some((keyword) => value.includes(keyword))) {
        return stage.key;
      }
    }
    return STAGE_PIPELINE[0].key;
  };

  const increment = (stageKey: string, status?: string | null, statusCategory?: string | null) => {
    const bucket = breakdown.find((entry) => entry.key === stageKey);
    if (!bucket) {
      return;
    }
    bucket.total += 1;
    const normalisedCategory = (statusCategory ?? "").toLowerCase();
    const normalisedStatus = (status ?? "").toLowerCase();
    if (
      normalisedCategory === "done" ||
      normalisedStatus.includes("done") ||
      normalisedStatus.includes("closed") ||
      normalisedStatus.includes("resolved")
    ) {
      bucket.done += 1;
    } else if (
      normalisedCategory === "in progress" ||
      normalisedStatus.includes("progress") ||
      normalisedStatus.includes("review") ||
      normalisedStatus.includes("test") ||
      normalisedStatus.includes("qa")
    ) {
      bucket.inProgress += 1;
    } else {
      bucket.todo += 1;
    }
  };

  if (issue.children?.length) {
    for (const child of issue.children) {
      increment(classify(child.status, child.statusCategory), child.status, child.statusCategory);
    }
  } else {
    increment(classify(issue.status, issue.statusCategory), issue.status, issue.statusCategory);
  }

  const currentCandidate = [...breakdown]
    .reverse()
    .find((bucket) => bucket.inProgress > 0 || bucket.done > 0) ?? breakdown.find((bucket) => bucket.total > 0);

  const derivedStage = currentCandidate?.key ?? classify(issue.status, issue.statusCategory);

  return {
    currentStage: derivedStage,
    breakdown,
  };
}

function extractRequirement(issue: IssueWithRelations): string | null {
  const remote = issue.remoteData as Record<string, unknown> | null | undefined;
  if (!remote || typeof remote !== "object") {
    return null;
  }
  const description = remote.description ?? remote.summary ?? null;
  if (typeof description === "string" && description.trim().length > 0) {
    return truncate(description.trim(), 800);
  }
  return null;
}

function deriveWaitingOn(context: IssueContext): string[] {
  return context.issue.linksOut
    .filter((link) => (link.linkType ?? "").toLowerCase().includes("block") && !isResolved(link.target))
    .map((link) => {
      const key = link.target?.key ?? link.target?.id ?? "unknown";
      const status = link.target?.status ?? "";
      return status ? `${key} (${status})` : key;
    });
}

function buildIncrementalSummary(
  baseline: InsightSummary,
  previousSummary: InsightSummary | null,
  newComments: IssueContext["comments"],
): InsightSummary | null {
  if (!previousSummary) {
    return null;
  }
  if (!newComments.length) {
    return null;
  }

  const updates = newComments
    .slice(0, 3)
    .map((comment) => {
      const author = comment.author?.displayName ?? "User";
      const body = truncate(comment.body.replace(/\s+/g, " ").trim(), 140);
      return `${author}: ${body}`;
    })
    .join(" ");

  const merged = truncate(
    `${previousSummary.text}\nUpdates: ${updates}`,
    1200,
  );

  return {
    text: merged,
    provider: "incremental_rule",
    confidence: Math.min(0.9, (previousSummary.confidence ?? baseline.confidence ?? 0.6) + 0.05),
  };
}

function buildRuleBasedSummary(context: IssueContext): InsightSummary {
  const fragments: string[] = [];
  const issue = context.issue;
  if (issue.summary) {
    fragments.push(issue.summary.trim());
  }

  const requirement = extractRequirement(issue);
  if (requirement) {
    fragments.push(`Requirement: ${truncate(requirement, 240)}`);
  }

  const latestComments = [...context.comments]
    .sort((a, b) => b.jiraCreatedAt.getTime() - a.jiraCreatedAt.getTime())
    .slice(0, 3);

  for (const comment of latestComments) {
    const author = comment.author?.displayName ?? "User";
    const body = comment.body.replace(/\s+/g, " ").trim();
    fragments.push(`${author}: ${truncate(body, 160)}`);
  }

  if (!fragments.length) {
    fragments.push(`Issue ${issue.key} currently ${issue.status}.`);
  }

  return {
    text: fragments.join(" "),
    provider: "rule_based",
    confidence: 0.6,
  };
}

function computeHeuristicSentiment(context: IssueContext): InsightSentiment {
  const combined = [
    context.issue.summary ?? "",
    ...context.comments.map((c) => c.body ?? ""),
  ].join(" ");
  const tokens = combined.toLowerCase().split(/\W+/);
  let score = 0;
  for (const token of tokens) {
    if (NEGATIVE_WORDS.includes(token)) {
      score -= 1;
    }
    if (POSITIVE_WORDS.includes(token)) {
      score += 1;
    }
  }
  const normalised = tokens.length ? score / Math.sqrt(tokens.length) : 0;
  let label: InsightSentiment["label"] = "neutral";
  if (normalised >= 0.25) {
    label = "positive";
  } else if (normalised <= -0.25) {
    label = "negative";
  }

  const tones: string[] = [];
  if (label === "negative") {
    tones.push("frustrated");
    if (Math.abs(normalised) >= 0.6) {
      tones.push("escalating");
    }
  } else if (label === "positive") {
    tones.push("reassuring");
  }

  return {
    label,
    score: Number(normalised.toFixed(2)),
    tones,
    provider: "heuristic",
  };
}

function buildMetadata(context: IssueContext, stage: StageProgressSnapshot): Record<string, unknown> {
  return {
    projectKey: context.issue.project.key,
    priority: context.issue.priority,
    status: context.issue.status,
    sentimentTokens: context.comments.length,
    stage: stage.currentStage,
    stageBreakdown: stage.breakdown,
    requirement: extractRequirement(context.issue),
  };
}

function computeIssueHash(context: IssueContext): string {
  const data = {
    issue: {
      updatedAt: context.issue.updatedAt?.toISOString(),
      status: context.issue.status,
      priority: context.issue.priority,
      dueDate: context.issue.dueDate ? new Date(context.issue.dueDate).toISOString() : null,
      resolvedAt: context.issue.resolvedAt ? new Date(context.issue.resolvedAt).toISOString() : null,
      startedAt: context.issue.startedAt ? new Date(context.issue.startedAt).toISOString() : null,
      summary: context.issue.summary,
      assigneeId: context.issue.assigneeId,
      reporterId: context.issue.reporterId,
      parentIssueId: context.issue.parentIssueId,
      statusCategory: context.issue.statusCategory,
    },
    comments: context.comments.map((comment) => ({
      id: comment.id,
      updatedAt: comment.jiraUpdatedAt
        ? comment.jiraUpdatedAt.toISOString()
        : comment.jiraCreatedAt.toISOString(),
      body: truncate(comment.body ?? "", 120),
    })),
    worklogs: context.worklogs.map((worklog) => ({
      id: worklog.id,
      updatedAt: worklog.jiraUpdatedAt.toISOString(),
      timeSpent: worklog.timeSpent,
    })),
    links: context.issue.linksOut.map((link) => ({
      type: link.linkType,
      targetStatus: link.target?.status,
      targetKey: link.target?.key,
    })),
  };
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function isResolved(issue: IssueEntity | null | undefined): boolean {
  if (!issue) return false;
  if (issue.statusCategory) {
    return issue.statusCategory.toLowerCase() === "done";
  }
  const status = issue.status?.toLowerCase() ?? "";
  return status.includes("done") || status.includes("resolved") || status.includes("closed");
}

function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}


export function mapSnapshotRecord(record: IssueInsightSnapshotRecord): IssueInsightDTO {
  const summary = sanitizeSummary(record.summary ?? null);
  const sentiment = sanitizeSentiment(record.sentiments ?? null);
  const metadata = (record.providerMetadata as Record<string, unknown> | null) ?? {};
  const stage = deserializeStageSnapshot(record.statusStage ?? null, record.stageBreakdown) ?? normalizeStageSnapshot(metadata.stage);
  const delta = normalizeDeltaSummary(record.deltaSummary) ?? normalizeDeltaSummary(metadata.delta);
  const requirement = typeof metadata.requirement === "string" ? metadata.requirement : null;
  const waitingOn = normalizeStringArray(metadata.waitingOn) ?? [];

  return {
    issueId: record.issueId,
    summary,
    sentiment,
    escalateScore: record.escalationScore ?? 0,
    signals: sanitizeSignals(record.signals ?? null),
    computedAt: record.createdAt,
    expiresAt: null,
    providerMetadata: metadata,
    provider: record.provider ?? summary.provider,
    stage,
    delta,
    requirement,
    waitingOn,
    snapshotId: record.id,
  };
}

export function mapInsightRecord(record: IssueInsightRecord): IssueInsightDTO {
  const metadata = (record.providerMetadata as Record<string, unknown> | null) ?? {};
  const summary = sanitizeSummary(record.summary);
  const sentiment = sanitizeSentiment(record.sentiments);
  const stage = normalizeStageSnapshot(metadata.stage);
  const delta = normalizeDeltaSummary(metadata.delta);
  const requirement = typeof metadata.requirement === "string" ? metadata.requirement : null;
  const waitingOn = normalizeStringArray(metadata.waitingOn) ?? [];
  const provider = (typeof metadata.provider === "string" && metadata.provider) || summary.provider;

  return {
    issueId: record.issueId,
    summary,
    sentiment,
    escalateScore: record.escalationScore ?? 0,
    signals: sanitizeSignals(record.signals),
    computedAt: record.computedAt,
    expiresAt: record.expiresAt,
    providerMetadata: metadata,
    provider,
    stage,
    delta,
    requirement,
    waitingOn,
  };
}

function deserializeStageSnapshot(
  statusStage: string | null | undefined,
  value: Prisma.JsonValue | null,
): StageProgressSnapshot | null {
  if (!statusStage) {
    return null;
  }
  if (!Array.isArray(value)) {
    return { currentStage: statusStage, breakdown: [] };
  }
  const breakdown = value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const obj = entry as Record<string, unknown>;
      return {
        key: String(obj.key ?? obj.label ?? ""),
        label: typeof obj.label === "string" ? obj.label : String(obj.key ?? obj.stage ?? ""),
        total: Number(obj.total ?? 0),
        inProgress: Number(obj.inProgress ?? 0),
        done: Number(obj.done ?? 0),
        todo: Number(obj.todo ?? 0),
      };
    })
    .filter((bucket): bucket is StageProgressSnapshot["breakdown"][number] => bucket !== null);
  return {
    currentStage: statusStage,
    breakdown,
  };
}

function normalizeStageSnapshot(value: unknown): StageProgressSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const currentStage = typeof obj.current === "string"
    ? obj.current
    : typeof obj.currentStage === "string"
      ? obj.currentStage
      : null;
  if (!currentStage) {
    return null;
  }
  const breakdownRaw = Array.isArray(obj.breakdown) ? obj.breakdown : [];
  const breakdown = breakdownRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const bucket = entry as Record<string, unknown>;
      return {
        key: String(bucket.key ?? bucket.label ?? ""),
        label: typeof bucket.label === "string" ? bucket.label : String(bucket.key ?? ""),
        total: Number(bucket.total ?? 0),
        inProgress: Number(bucket.inProgress ?? 0),
        done: Number(bucket.done ?? 0),
        todo: Number(bucket.todo ?? 0),
      };
    })
    .filter((bucket): bucket is StageProgressSnapshot["breakdown"][number] => bucket !== null);
  return { currentStage, breakdown };
}

function normalizeDeltaSummary(value: unknown): InsightDeltaSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const newCommentCount = Number(obj.newCommentCount ?? obj.commentCount ?? 0);
  const authors = normalizeStringArray(obj.latestCommentAuthors) ?? [];
  const seconds = Number(obj.newWorklogSeconds ?? obj.worklogSeconds ?? 0);
  const hours = obj.newWorklogHours !== undefined ? Number(obj.newWorklogHours) : Number((seconds / 3600).toFixed(2));
  return {
    newCommentCount,
    latestCommentAuthors: authors,
    newWorklogSeconds: seconds,
    newWorklogHours: hours,
  };
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const result = value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
  return result;
}

function sanitizeSummary(value: Prisma.JsonValue | null): InsightSummary {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    return {
      text: typeof obj.text === "string" ? obj.text : "",
      provider: typeof obj.provider === "string" ? (obj.provider as string) : "rule_based",
      confidence: typeof obj.confidence === "number" ? obj.confidence : undefined,
    };
  }
  return { text: "", provider: "rule_based", confidence: 0 };
}

function sanitizeSentiment(value: Prisma.JsonValue | null): InsightSentiment {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const label = typeof obj.label === "string" ? (obj.label as InsightSentiment["label"]) : "neutral";
    const score = typeof obj.score === "number" ? Number(obj.score.toFixed(2)) : 0;
    const tones = Array.isArray(obj.tones)
      ? (obj.tones as unknown[]).filter((tone) => typeof tone === "string") as string[]
      : [];
    const provider = typeof obj.provider === "string" ? (obj.provider as string) : "heuristic";
    return { label, score, tones, provider } as InsightSentiment;
  }
  return { label: "neutral", score: 0, tones: [], provider: "heuristic" };
}

function sanitizeSignals(value: Prisma.JsonValue | null): InsightSignal[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[])
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const obj = entry as Record<string, unknown>;
      const type = typeof obj.type === "string" ? obj.type : "unknown";
      const severityValue =
        typeof obj.severity === "string" ? (obj.severity as string).toLowerCase() : "low";
      const severity: Severity = severityValue === "high" || severityValue === "medium" ? (severityValue as Severity) : "low";
      const detail = typeof obj.detail === "string" ? obj.detail : "";
      const metadata =
        obj.metadata && typeof obj.metadata === "object"
          ? (obj.metadata as Record<string, unknown>)
          : undefined;
      return { type, severity, detail, metadata } as InsightSignal;
    })
    .filter((entry): entry is InsightSignal => Boolean(entry));
}

export type InsightProvider = Provider;
