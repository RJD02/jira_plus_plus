import type { PrismaClient } from "@platform/cdm";

const DEFAULT_LOCK_SECONDS = 300;

export type NarrativeScope = "PROJECT" | "USER";

export interface NarrativeQueueItem {
  scope: NarrativeScope;
  snapshotId: string;
  projectId: string;
  tenantId: string;
  persona: string | null;
  attempts: number;
}

export interface EnqueueNarrativeOptions {
  persona?: string | null;
  requestedAt?: Date;
}

export async function enqueueProjectNarrativeRefresh(
  db: PrismaClient,
  tenantId: string,
  snapshotId: string,
  options: EnqueueNarrativeOptions = {},
): Promise<void> {
  const requestedAt = options.requestedAt ?? new Date();
  await db.projectSummarySnapshot.updateMany({
    where: { id: snapshotId, tenantId },
    data: {
      needsNarrativeRefresh: true,
      narrativeRefreshRequestedAt: requestedAt,
      narrativeRefreshLockedUntil: null,
      narrativeRefreshAttempts: 0,
      lastNarrativeError: null,
    },
  });
}

export async function enqueueUserNarrativeRefresh(
  db: PrismaClient,
  tenantId: string,
  snapshotId: string,
  options: EnqueueNarrativeOptions = {},
): Promise<void> {
  const requestedAt = options.requestedAt ?? new Date();
  await db.userSummarySnapshot.updateMany({
    where: { id: snapshotId, tenantId },
    data: {
      needsNarrativeRefresh: true,
      narrativeRefreshRequestedAt: requestedAt,
      narrativeRefreshLockedUntil: null,
      narrativeRefreshAttempts: 0,
      lastNarrativeError: null,
    },
  });
}

export interface ClaimNarrativeRefreshBatchArgs {
  db: PrismaClient;
  tenantId: string;
  projectId?: string | null;
  limit: number;
  lockSeconds?: number;
}

export async function claimNarrativeRefreshBatch(
  args: ClaimNarrativeRefreshBatchArgs,
): Promise<NarrativeQueueItem[]> {
  const { db, tenantId, projectId, limit, lockSeconds = DEFAULT_LOCK_SECONDS } = args;
  const now = new Date();

  const projectCandidates = await db.projectSummarySnapshot.findMany({
    where: {
      tenantId,
      needsNarrativeRefresh: true,
      ...(projectId ? { projectId } : {}),
      OR: [
        { narrativeRefreshLockedUntil: null },
        { narrativeRefreshLockedUntil: { lt: now } },
      ],
    },
    orderBy: [
      { narrativeRefreshRequestedAt: "asc" },
      { summaryDate: "desc" },
    ],
    take: limit,
    select: {
      id: true,
      tenantId: true,
      projectId: true,
      narrativeRefreshAttempts: true,
    },
  });

  const remaining = Math.max(limit - projectCandidates.length, 0);

  const userCandidates = remaining
    ? await db.userSummarySnapshot.findMany({
        where: {
          tenantId,
          needsNarrativeRefresh: true,
          ...(projectId ? { projectId } : {}),
          OR: [
            { narrativeRefreshLockedUntil: null },
            { narrativeRefreshLockedUntil: { lt: now } },
          ],
        },
        orderBy: [
          { narrativeRefreshRequestedAt: "asc" },
          { summaryDate: "desc" },
        ],
        take: remaining,
        select: {
          id: true,
          tenantId: true,
          projectId: true,
          narrativeRefreshAttempts: true,
        },
      })
    : [];

  const candidates = [
    ...projectCandidates.map((candidate) => ({ scope: "PROJECT" as NarrativeScope, ...candidate })),
    ...userCandidates.map((candidate) => ({ scope: "USER" as NarrativeScope, ...candidate })),
  ];

  if (!candidates.length) {
    return [];
  }

  const lockUntil = new Date(now.getTime() + lockSeconds * 1000);

  await db.$transaction(
    candidates.map((candidate) => {
      if (candidate.scope === "PROJECT") {
        return db.projectSummarySnapshot.update({
          where: { id: candidate.id },
          data: {
            narrativeRefreshLockedUntil: lockUntil,
            narrativeRefreshAttempts: { increment: 1 },
          },
        });
      }
      return db.userSummarySnapshot.update({
        where: { id: candidate.id },
        data: {
          narrativeRefreshLockedUntil: lockUntil,
          narrativeRefreshAttempts: { increment: 1 },
        },
      });
    }),
  );

  return candidates.map((candidate) => ({
    scope: candidate.scope,
    snapshotId: candidate.id,
    projectId: candidate.projectId,
    tenantId: candidate.tenantId,
    persona: null,
    attempts: candidate.narrativeRefreshAttempts + 1,
  }));
}

export async function markNarrativeRefreshSuccess(
  db: PrismaClient,
  scope: NarrativeScope,
  snapshotId: string,
): Promise<void> {
  if (scope === "PROJECT") {
    await db.projectSummarySnapshot.updateMany({
      where: { id: snapshotId },
      data: {
        needsNarrativeRefresh: false,
        narrativeRefreshLockedUntil: null,
        narrativeRefreshAttempts: 0,
        lastNarrativeError: null,
      },
    });
    return;
  }

  await db.userSummarySnapshot.updateMany({
    where: { id: snapshotId },
    data: {
      needsNarrativeRefresh: false,
      narrativeRefreshLockedUntil: null,
      narrativeRefreshAttempts: 0,
      lastNarrativeError: null,
    },
  });
}

export async function markNarrativeRefreshFailure(
  db: PrismaClient,
  scope: NarrativeScope,
  snapshotId: string,
  error: string,
  lockSeconds: number = DEFAULT_LOCK_SECONDS,
): Promise<void> {
  const lockUntil = new Date(Date.now() + lockSeconds * 1000);
  if (scope === "PROJECT") {
    await db.projectSummarySnapshot.updateMany({
      where: { id: snapshotId },
      data: {
        narrativeRefreshLockedUntil: lockUntil,
        lastNarrativeError: error,
      },
    });
    return;
  }

  await db.userSummarySnapshot.updateMany({
    where: { id: snapshotId },
    data: {
      narrativeRefreshLockedUntil: lockUntil,
      lastNarrativeError: error,
    },
  });
}

export async function countPendingNarrativeRefresh(
  db: PrismaClient,
  tenantId: string,
  projectId?: string | null,
): Promise<{ project: number; user: number }> {
  const [project, user] = await Promise.all([
    db.projectSummarySnapshot.count({
      where: {
        tenantId,
        needsNarrativeRefresh: true,
        ...(projectId ? { projectId } : {}),
      },
    }),
    db.userSummarySnapshot.count({
      where: {
        tenantId,
        needsNarrativeRefresh: true,
        ...(projectId ? { projectId } : {}),
      },
    }),
  ]);

  return { project, user };
}
