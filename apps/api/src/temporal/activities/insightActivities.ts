import { prisma } from "../../prisma.js";
import { getEnv } from "../../env.js";
import {
  claimInsightRefreshBatch,
  countPendingInsightRefresh,
  markInsightRefreshFailure,
  markInsightRefreshSuccess,
} from "../../services/insights/insightQueueService.js";
import { ensureIssueInsights, type InsightProvider } from "../../services/insights/insightService.js";
import { getTemporalClient, getTaskQueue } from "../client.js";
import { INSIGHT_WORKFLOW_NAME } from "../workflows/refreshIssueInsightsWorkflow.js";

export interface ProcessInsightQueueArgs {
  projectId?: string | null;
  limit?: number;
  lockSeconds?: number;
  provider?: InsightProvider;
  allowCache?: boolean;
}

export interface ProcessInsightQueueResult {
  processed: number;
  remaining: number;
  errors: Array<{ issueId: string; message: string }>;
}

export async function processInsightQueue(
  args: ProcessInsightQueueArgs = {},
): Promise<ProcessInsightQueueResult> {
  const env = getEnv();
  const tenantId = env.TENANT_ID;
  const limit = args.limit ?? 10;
  const provider = (args.provider ?? (env.INSIGHTS_PROVIDER ?? "auto")) as InsightProvider;

  const claimed = await claimInsightRefreshBatch({
    db: prisma,
    tenantId,
    projectId: args.projectId ?? null,
    limit,
    lockSeconds: args.lockSeconds,
  });

  if (!claimed.length) {
    const remaining = await countPendingInsightRefresh(prisma, tenantId, args.projectId ?? null);
    return { processed: 0, remaining, errors: [] };
  }

  const errors: Array<{ issueId: string; message: string }> = [];

  for (const issue of claimed) {
    try {
      await ensureIssueInsights(prisma, tenantId, issue.id, provider, args.allowCache ?? true);
      await markInsightRefreshSuccess(prisma, tenantId, issue.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown insight error";
      errors.push({ issueId: issue.id, message });
      await markInsightRefreshFailure(prisma, tenantId, issue.id, message);
    }
  }

  const remaining = await countPendingInsightRefresh(prisma, tenantId, args.projectId ?? null);

  return {
    processed: claimed.length - errors.length,
    remaining,
    errors,
  };
}

export interface RequestInsightRefreshArgs {
  projectId?: string | null;
  batchSize?: number;
}

export async function requestInsightRefreshWorkflow(
  args: RequestInsightRefreshArgs = {},
): Promise<void> {
  const client = await getTemporalClient();
  const workflowIdBase = args.projectId ? `insight-refresh-${args.projectId}` : "insight-refresh-all";
  const workflowId = `${workflowIdBase}-${Date.now()}`;

  await client.workflow.start(INSIGHT_WORKFLOW_NAME, {
    taskQueue: getTaskQueue(),
    workflowId,
    args: [
      {
        projectId: args.projectId ?? null,
        batchSize: args.batchSize,
      },
    ],
  });
}

export async function countPendingInsightRefreshActivity(
  args: { projectId?: string | null } = {},
): Promise<number> {
  const tenantId = getEnv().TENANT_ID;
  return countPendingInsightRefresh(prisma, tenantId, args.projectId ?? null);
}
