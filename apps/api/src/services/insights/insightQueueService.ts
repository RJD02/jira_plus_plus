import type { PrismaClient } from "@platform/cdm";

const DEFAULT_LOCK_SECONDS = 300;

export interface EnqueueInsightRefreshOptions {
  requestedAt?: Date;
}

export async function enqueueInsightRefresh(
  db: PrismaClient,
  tenantId: string,
  issueId: string,
  options: EnqueueInsightRefreshOptions = {},
): Promise<void> {
  const requestedAt = options.requestedAt ?? new Date();
  const result = await db.issue.updateMany({
    where: { id: issueId, tenantId },
    data: {
      needsInsightRefresh: true,
      insightRefreshRequestedAt: requestedAt,
      insightRefreshLockedUntil: null,
      insightRefreshAttempts: 0,
      lastInsightError: null,
    },
  });

  if (result.count === 0) {
    throw new Error(`Issue ${issueId} not found for tenant ${tenantId}`);
  }
}

export interface ClaimInsightRefreshBatchArgs {
  db: PrismaClient;
  tenantId: string;
  projectId?: string | null;
  limit: number;
  lockSeconds?: number;
}

export interface ClaimedInsightIssue {
  id: string;
  tenantId: string;
  projectId: string;
  attempts: number;
}

export async function claimInsightRefreshBatch(args: ClaimInsightRefreshBatchArgs): Promise<ClaimedInsightIssue[]> {
  const { db, tenantId, projectId, limit, lockSeconds = DEFAULT_LOCK_SECONDS } = args;
  const now = new Date();

  const candidates = await db.issue.findMany({
    where: {
      tenantId,
      needsInsightRefresh: true,
      ...(projectId ? { projectId } : {}),
      OR: [
        { insightRefreshLockedUntil: null },
        { insightRefreshLockedUntil: { lt: now } },
      ],
    },
    orderBy: [
      { insightRefreshRequestedAt: "asc" },
      { jiraUpdatedAt: "desc" },
    ],
    take: limit,
    select: {
      id: true,
      tenantId: true,
      projectId: true,
    },
  });

  if (!candidates.length) {
    return [];
  }

  const lockUntil = new Date(now.getTime() + lockSeconds * 1000);

  const locked = await db.$transaction(
    candidates.map((candidate) =>
      db.issue.update({
        where: { id: candidate.id },
        data: {
          insightRefreshLockedUntil: lockUntil,
          insightRefreshAttempts: { increment: 1 },
        },
        select: {
          id: true,
          tenantId: true,
          projectId: true,
          insightRefreshAttempts: true,
        },
      }),
    ),
  );

  return locked.map((issue) => ({
    id: issue.id,
    tenantId: issue.tenantId,
    projectId: issue.projectId,
    attempts: issue.insightRefreshAttempts,
  }));
}

export async function markInsightRefreshSuccess(
  db: PrismaClient,
  tenantId: string,
  issueId: string,
): Promise<void> {
  await db.issue.updateMany({
    where: { id: issueId, tenantId },
    data: {
      needsInsightRefresh: false,
      insightRefreshedAt: new Date(),
      insightRefreshLockedUntil: null,
      insightRefreshAttempts: 0,
      lastInsightError: null,
    },
  });
}

export interface MarkInsightRefreshFailureOptions {
  lockSeconds?: number;
}

export async function markInsightRefreshFailure(
  db: PrismaClient,
  tenantId: string,
  issueId: string,
  error: string,
  options: MarkInsightRefreshFailureOptions = {},
): Promise<void> {
  const lockSeconds = options.lockSeconds ?? DEFAULT_LOCK_SECONDS;
  const lockUntil = new Date(Date.now() + lockSeconds * 1000);

  await db.issue.updateMany({
    where: { id: issueId, tenantId },
    data: {
      insightRefreshLockedUntil: lockUntil,
      lastInsightError: error,
    },
  });
}

export async function countPendingInsightRefresh(
  db: PrismaClient,
  tenantId: string,
  projectId?: string | null,
): Promise<number> {
  return db.issue.count({
    where: {
      tenantId,
      needsInsightRefresh: true,
      ...(projectId ? { projectId } : {}),
    },
  });
}
