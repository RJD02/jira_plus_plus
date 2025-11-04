import { prisma } from "../../prisma.js";
import { getEnv } from "../../env.js";
import {
  claimNarrativeRefreshBatch,
  countPendingNarrativeRefresh,
  markNarrativeRefreshFailure,
  markNarrativeRefreshSuccess,
  type NarrativeQueueItem,
} from "../../services/narratives/narrativeQueueService.js";
import { generateNarrative } from "../../services/narratives/narrativeService.js";
import { getTemporalClient, getTaskQueue } from "../client.js";
import { NARRATIVE_WORKFLOW_NAME } from "../workflows/refreshNarrativesWorkflow.js";

export interface ProcessNarrativeQueueArgs {
  projectId?: string | null;
  limit?: number;
  lockSeconds?: number;
  persona?: string;
  force?: boolean;
}

export interface ProcessNarrativeQueueResult {
  processed: number;
  remainingProject: number;
  remainingUser: number;
  errors: Array<{ snapshotId: string; scope: string; message: string }>;
}

export interface RequestNarrativeRefreshArgs {
  projectId?: string | null;
  persona?: string;
  batchSize?: number;
  force?: boolean;
}

export async function processNarrativeQueue(
  args: ProcessNarrativeQueueArgs = {},
): Promise<ProcessNarrativeQueueResult> {
  const env = getEnv();
  const tenantId = env.TENANT_ID;
  const limit = args.limit ?? 10;
  const persona = args.persona ?? "manager";
  const claimed = await claimNarrativeRefreshBatch({
    db: prisma,
    tenantId,
    projectId: args.projectId ?? null,
    limit,
    lockSeconds: args.lockSeconds,
  });

  if (!claimed.length) {
    const remaining = await countPendingNarrativeRefresh(prisma, tenantId, args.projectId ?? null);
    return {
      processed: 0,
      remainingProject: remaining.project,
      remainingUser: remaining.user,
      errors: [],
    };
  }

  const errors: Array<{ snapshotId: string; scope: string; message: string }> = [];

  for (const item of claimed) {
    try {
      await generateNarrative(prisma, tenantId, item.scope, item.snapshotId, {
        persona,
        force: args.force,
      });
      await markNarrativeRefreshSuccess(prisma, item.scope, item.snapshotId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown narrative error";
      errors.push({ snapshotId: item.snapshotId, scope: item.scope, message });
      await markNarrativeRefreshFailure(prisma, item.scope, item.snapshotId, message, args.lockSeconds);
    }
  }

  const remaining = await countPendingNarrativeRefresh(prisma, tenantId, args.projectId ?? null);

  return {
    processed: claimed.length - errors.length,
    remainingProject: remaining.project,
    remainingUser: remaining.user,
    errors,
  };
}

export async function requestNarrativeRefreshWorkflow(
  args: RequestNarrativeRefreshArgs = {},
): Promise<void> {
  const client = await getTemporalClient();
  const workflowIdBase = args.projectId ? `narrative-refresh-${args.projectId}` : "narrative-refresh-all";
  const workflowId = `${workflowIdBase}-${Date.now()}`;

  await client.workflow.start(NARRATIVE_WORKFLOW_NAME, {
    taskQueue: getTaskQueue(),
    workflowId,
    args: [
      {
        projectId: args.projectId ?? null,
        persona: args.persona,
        batchSize: args.batchSize,
        force: args.force,
      },
    ],
  });
}
