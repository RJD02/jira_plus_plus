import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { Agent, fetch } from "undici";
import type { Prisma, PrismaClient } from "@platform/cdm";
import { getEnv } from "../../env.js";


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
}

interface IssueContext {
  issue: IssueWithRelations;
  comments: IssueWithRelations["comments"];
  worklogs: IssueWithRelations["worklogs"];
}

interface AdapterOutput {
  summary?: InsightSummary;
  sentiment?: InsightSentiment;
  metadata?: Record<string, unknown>;
}

const PROGRESS_STATUS_KEYWORDS = ["in progress", "in-review", "doing", "active"];
const RESOLVED_STATUS_KEYWORDS = ["done", "resolved", "closed", "completed", "closed (done)"];
const ESCALATION_KEYWORDS = [
  "urgent",
  "escalate",
  "blocker",
  "severity 1",
  "sev 1",
  "sev1",
  "outage",
  "sla",
  "breach",
];

type IssueWithRelations = Prisma.IssueGetPayload<{
  include: {
    project: { select: { id: true; key: true; name: true } };
    assignee: { select: { displayName: true; email: true } };
    reporter: { select: { displayName: true; email: true } };
    linksOut: { include: { target: true } };
    linksIn: { include: { source: true } };
    comments: { include: { author: { select: { displayName: true } } } };
    worklogs: { include: { author: { select: { displayName: true } } } };
  };
}>;

type IssueInsightRecord = Prisma.IssueInsightGetPayload<{}>;

type IssueEntity = Prisma.IssueGetPayload<{}>;

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

const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 0.2,
  medium: 0.5,
  high: 0.8,
};

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
  });

  if (
    !refresh &&
    existing &&
    existing.lastIssueHash === hash &&
    matchesProvider(existing.summary, effectiveProvider)
  ) {
    return mapInsightRecord(existing);
  }

  const result = await computeInsights(prisma, tenantId, context, hash, effectiveProvider);
  return result;
}

export async function ensureIssueInsights(
  prisma: PrismaClient,
  tenantId: string,
  issueId: string,
  provider: Provider,
): Promise<void> {
  try {
    await getIssueInsights(prisma, tenantId, issueId, provider, false);
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

async function computeInsights(
  prisma: PrismaClient,
  tenantId: string,
  context: IssueContext,
  hash: string,
  provider: Provider,
): Promise<IssueInsightDTO> {
  const env = getEnv();
  const ttlMinutes = env.INSIGHTS_CACHE_TTL_MINUTES ?? 0;
  const expiresAt =
    ttlMinutes > 0 ? new Date(Date.now() + ttlMinutes * 60 * 1000) : null;

  const ruleSummary = buildRuleBasedSummary(context);
  const heuristicSentiment = computeHeuristicSentiment(context);

  const adapterOutput = await runAdapter(provider, context, ruleSummary, heuristicSentiment);

  const summary = adapterOutput.summary ?? ruleSummary;
  const sentiment = adapterOutput.sentiment ?? heuristicSentiment;
  const signals = computeSignals(context, sentiment);
  const escalateScore = computeEscalationScore(signals);

  const stored = await prisma.issueInsight.upsert({
    where: { issueId: context.issue.id },
    create: {
      tenantId,
      issueId: context.issue.id,
      summary: summary as unknown as Prisma.InputJsonValue,
      sentiments: sentiment as unknown as Prisma.InputJsonValue,
      escalationScore: escalateScore,
      signals: signals as unknown as Prisma.InputJsonValue,
      providerMetadata: (adapterOutput.metadata ?? {}) as unknown as Prisma.InputJsonValue,
      lastIssueHash: hash,
      metadata: buildMetadata(context) as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
    update: {
      summary: summary as unknown as Prisma.InputJsonValue,
      sentiments: sentiment as unknown as Prisma.InputJsonValue,
      escalationScore: escalateScore,
      signals: signals as unknown as Prisma.InputJsonValue,
      providerMetadata: (adapterOutput.metadata ?? {}) as unknown as Prisma.InputJsonValue,
      lastIssueHash: hash,
      metadata: buildMetadata(context) as unknown as Prisma.InputJsonValue,
      computedAt: new Date(),
      expiresAt,
    },
  });

  return mapInsightRecord(stored);
}

function buildRuleBasedSummary(context: IssueContext): InsightSummary {
  const fragments: string[] = [];
  const issue = context.issue;
  if (issue.summary) {
    fragments.push(issue.summary.trim());
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

async function runAdapter(
  provider: Provider,
  context: IssueContext,
  ruleSummary: InsightSummary,
  heuristicSentiment: InsightSentiment,
): Promise<AdapterOutput> {
  const env = getEnv();
  const effective = provider === "auto" ? resolveProviderFromEnv(env) : provider;
  if (effective === "openai") {
    const output = await callOpenAI(context, ruleSummary, heuristicSentiment);
    if (output) {
      return output;
    }
  }
  if (effective === "local") {
    const output = await callLocalModel(context, ruleSummary, heuristicSentiment);
    if (output) {
      return output;
    }
  }
  return { summary: ruleSummary, sentiment: heuristicSentiment };
}

function resolveProviderFromEnv(env: ReturnType<typeof getEnv>): Provider {
  if (env.INSIGHTS_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return "openai";
  }
  if (env.INSIGHTS_PROVIDER === "local") {
    return "local";
  }
  if (env.OPENAI_API_KEY) {
    return "openai";
  }
  return "local";
}

async function callOpenAI(
  context: IssueContext,
  ruleSummary: InsightSummary,
  heuristicSentiment: InsightSentiment,
): Promise<AdapterOutput | null> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You summarise Jira tickets and assess sentiment. Return JSON with keys summary.text, summary.confidence, sentiment.label, sentiment.score, sentiment.tones[].",
          },
          {
            role: "user",
            content: buildPrompt(context, ruleSummary, heuristicSentiment),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}`);
    }

    const json = (await response.json()) as any;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return null;
    }
    const payload = JSON.parse(content);
    const summary: InsightSummary = {
      text: payload?.summary?.text ?? ruleSummary.text,
      confidence: payload?.summary?.confidence ?? 0.7,
      provider: "openai",
    };
    const sentiment: InsightSentiment = {
      label: payload?.sentiment?.label ?? heuristicSentiment.label,
      score:
        typeof payload?.sentiment?.score === "number"
          ? Number(payload.sentiment.score.toFixed(2))
          : heuristicSentiment.score,
      tones: Array.isArray(payload?.sentiment?.tones)
        ? payload.sentiment.tones.filter((item: unknown) => typeof item === "string")
        : heuristicSentiment.tones,
      provider: "openai",
    };

    return {
      summary,
      sentiment,
      metadata: {
        openai: {
          model: env.OPENAI_MODEL,
        },
      },
    };
  } catch (error) {
    console.error("[insights] OpenAI adapter failed", error);
    return null;
  }
}

async function callLocalModel(
  context: IssueContext,
  ruleSummary: InsightSummary,
  heuristicSentiment: InsightSentiment,
): Promise<AdapterOutput | null> {
  const env = getEnv();
  if (!env.LOCAL_LLM_URL) {
    return null;
  }

  const timeoutMs = env.INSIGHTS_LOCAL_TIMEOUT_MS ?? 120000;
  const agent = new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });

  try {
    const response = await fetch(env.LOCAL_LLM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.LOCAL_LLM_MODEL,
        prompt: buildPrompt(context, ruleSummary, heuristicSentiment),
        format: "json",
        stream: false,
      }),
      dispatcher: agent,
    });

    if (!response.ok) {
      throw new Error(`Local LLM HTTP ${response.status}`);
    }

    const payload = (await response.json()) as any;
    const raw = typeof payload?.response === "string" ? payload.response.trim() : "";
    const parsed = raw ? safeParseJson(raw) : null;

    const summary: InsightSummary = {
      text: parsed?.summary?.text ?? ruleSummary.text,
      confidence: parsed?.summary?.confidence ?? 0.65,
      provider: "local",
    };
    const sentiment: InsightSentiment = {
      label: parsed?.sentiment?.label ?? heuristicSentiment.label,
      score:
        typeof parsed?.sentiment?.score === "number"
          ? Number(parsed.sentiment.score.toFixed(2))
          : heuristicSentiment.score,
      tones: Array.isArray(parsed?.sentiment?.tones)
        ? parsed.sentiment.tones.filter((item: unknown) => typeof item === "string")
        : heuristicSentiment.tones,
      provider: "local",
    };

    return {
      summary,
      sentiment,
      metadata: {
        local: {
          endpoint: env.LOCAL_LLM_URL,
          model: env.LOCAL_LLM_MODEL,
        },
      },
    };
  } catch (error) {
    console.error("[insights] Local LLM adapter failed", error);
    return null;
  } finally {
    await agent.close();
  }
}

function buildPrompt(
  context: IssueContext,
  ruleSummary: InsightSummary,
  heuristicSentiment: InsightSentiment,
): string {
  const issue = context.issue;
  const recentComments = context.comments
    .slice(0, 5)
    .map(
      (comment) =>
        `- ${comment.author?.displayName ?? "User"} (${comment.jiraCreatedAt.toISOString()}): ${truncate(
          comment.body.replace(/\s+/g, " ").trim(),
          280,
        )}`,
    )
    .join("\n");

  return `
Issue Key: ${issue.key}
Summary: ${issue.summary ?? "N/A"}
Status: ${issue.status}
Priority: ${issue.priority ?? "N/A"}
Due Date: ${issue.dueDate ? new Date(issue.dueDate).toISOString() : "N/A"}
Resolved At: ${issue.resolvedAt ? new Date(issue.resolvedAt).toISOString() : "N/A"}
Existing Summary: ${ruleSummary.text}
Existing Sentiment Guess: ${heuristicSentiment.label} (${heuristicSentiment.score})

Recent Comments:
${recentComments}

Return JSON with fields:
{
  "summary": { "text": string, "confidence": number },
  "sentiment": { "label": "positive"|"neutral"|"negative", "score": number, "tones": string[] }
}
`.trim();
}

function computeSignals(
  context: IssueContext,
  sentiment: InsightSentiment,
): InsightSignal[] {
  const signals: InsightSignal[] = [];
  const issue = context.issue;
  const now = DateTime.utc();

  if (sentiment.label === "negative" && sentiment.score <= -0.4) {
    signals.push({
      type: "negative_sentiment",
      severity: sentiment.score <= -0.7 ? "high" : "medium",
      detail: `Average score ${sentiment.score}`,
    });
  }

  const keywordHits = countKeywords(context);
  if (keywordHits >= 2) {
    signals.push({
      type: "escalation_keywords",
      severity: "high",
      detail: `Escalation keywords detected (${keywordHits})`,
      metadata: { keywords: ESCALATION_KEYWORDS },
    });
  }

  if (issue.dueDate && issue.statusCategory !== "Done") {
    const due = DateTime.fromJSDate(new Date(issue.dueDate));
    const hoursRemaining = due.diff(now, "hours").hours;
    if (hoursRemaining <= 6) {
      signals.push({
        type: "sla_risk",
        severity: hoursRemaining <= 2 ? "high" : "medium",
        detail: `Due in ${hoursRemaining.toFixed(1)}h`,
      });
    }
  }

  const lastUpdatedDiff = now.diff(DateTime.fromJSDate(issue.jiraUpdatedAt), "days").days;
  if (issue.statusCategory !== "Done" && lastUpdatedDiff >= 3) {
    signals.push({
      type: "stalled_progress",
      severity: lastUpdatedDiff >= 7 ? "high" : "medium",
      detail: `No updates for ${Math.floor(lastUpdatedDiff)} days`,
    });
  }

  const reopenCount = countReopens(context);
  if (reopenCount >= 2) {
    signals.push({
      type: "reopened_multiple",
      severity: reopenCount >= 4 ? "high" : "medium",
      detail: `Reopened ${reopenCount} times`,
    });
  }

  const blockedLinks = context.issue.linksOut.filter((link) =>
    (link.linkType ?? "").toLowerCase().includes("block"),
  );
  if (blockedLinks.some((link) => !isResolved(link.target))) {
    signals.push({
      type: "linked_blocker",
      severity: "high",
      detail: "Blocking unresolved issue",
      metadata: {
        blockedIssues: blockedLinks
          .filter((link) => !isResolved(link.target))
          .map((link) => link.target?.key ?? link.target?.id),
      },
    });
  }

  const unresolvedDependencies = context.issue.linksOut.filter(
    (link) => !isResolved(link.target),
  );
  if (unresolvedDependencies.length >= 3) {
    signals.push({
      type: "dependency_cascade",
      severity: "medium",
      detail: `Has ${unresolvedDependencies.length} unresolved dependencies`,
    });
  }

  if (issue.resolvedAt && issue.statusCategory !== "Done") {
    signals.push({
      type: "resolution_regression",
      severity: "medium",
      detail: "Resolved but re-opened",
    });
  }

  const assigneeChangeCount = countAssigneeChanges(context);
  if (assigneeChangeCount >= 3) {
    signals.push({
      type: "assignment_churn",
      severity: "medium",
      detail: `Assignee changed ${assigneeChangeCount} times`,
    });
  }

  const ageDays = now.diff(DateTime.fromJSDate(issue.jiraCreatedAt), "days").days;
  if (issue.statusCategory !== "Done" && ageDays >= 30) {
    signals.push({
      type: "long_running",
      severity: ageDays >= 60 ? "high" : "medium",
      detail: `Open for ${Math.floor(ageDays)} days`,
    });
  }

  if (sentiment.label === "positive" && sentiment.score >= 0.6) {
    signals.push({
      type: "positive_feedback",
      severity: "low",
      detail: "Conversation trending positive",
    });
  }

  return signals;
}

function computeEscalationScore(signals: InsightSignal[]): number {
  if (!signals.length) {
    return 0.1;
  }
  const raw = signals.reduce((acc, signal) => acc + SEVERITY_WEIGHT[signal.severity], 0);
  return Math.min(1, Number(raw.toFixed(2)));
}

function buildMetadata(context: IssueContext): Record<string, unknown> {
  return {
    projectKey: context.issue.project.key,
    priority: context.issue.priority,
    status: context.issue.status,
    sentimentTokens: context.comments.length,
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

function countKeywords(context: IssueContext): number {
  const text = [
    context.issue.summary ?? "",
    ...context.comments.map((c) => c.body ?? ""),
  ].join(" ");
  const lower = text.toLowerCase();
  return ESCALATION_KEYWORDS.reduce(
    (acc, keyword) => (lower.includes(keyword) ? acc + 1 : acc),
    0,
  );
}

function countReopens(context: IssueContext): number {
  const remote = context.issue.remoteData as Prisma.JsonObject | null | undefined;
  const histories = (remote?.changelog as Prisma.JsonObject | undefined)?.histories;
  if (!Array.isArray(histories)) {
    return 0;
  }
  let count = 0;
  for (const entry of histories) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const items = (entry as Record<string, unknown>).items;
    if (!Array.isArray(items)) {
      continue;
    }
    for (const item of items) {
      const obj = item as Record<string, unknown>;
      const field = typeof obj.field === "string" ? (obj.field as string).toLowerCase() : null;
      const toStatus = typeof obj["toString"] === "string" ? (obj["toString"] as string).toLowerCase() : "";
      if (field === "status" && toStatus.includes("reopen")) {
        count += 1;
      }
    }
  }
  return count;
}

function countAssigneeChanges(context: IssueContext): number {
  const remote = context.issue.remoteData as Prisma.JsonObject | null | undefined;
  const histories = (remote?.changelog as Prisma.JsonObject | undefined)?.histories;
  if (!Array.isArray(histories)) {
    return 0;
  }
  let count = 0;
  for (const entry of histories) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const items = (entry as Record<string, unknown>).items;
    if (!Array.isArray(items)) {
      continue;
    }
    if (
      items.some((item) => {
        if (!item || typeof item !== "object") {
          return false;
        }
        const field = (item as Record<string, unknown>).field;
        return typeof field === "string" && field.toLowerCase() === "assignee";
      })
    ) {
      count += 1;
    }
  }
  return count;
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


function safeParseJson(content: string): any | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function mapInsightRecord(record: IssueInsightRecord): IssueInsightDTO {
  return {
    issueId: record.issueId,
    summary: sanitizeSummary(record.summary),
    sentiment: sanitizeSentiment(record.sentiments),
    escalateScore: record.escalationScore ?? 0,
    signals: sanitizeSignals(record.signals),
    computedAt: record.computedAt,
    expiresAt: record.expiresAt,
    providerMetadata: (record.providerMetadata as Record<string, unknown>) ?? {},
  };
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
