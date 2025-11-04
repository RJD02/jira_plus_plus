import { DateTime } from "luxon";
import type { PrismaClient } from "@platform/cdm";
import {
  enqueueProjectNarrativeRefresh,
  enqueueUserNarrativeRefresh,
  type NarrativeScope,
} from "./narrativeQueueService.js";
import { requestNarrativeRefreshWorkflow } from "../../temporal/activities/narrativeActivities.js";

export interface TriggerNarrativeRefreshArgs {
  scope: NarrativeScope;
  projectId: string;
  snapshotId?: string | null;
  persona?: string | null;
  days?: number | null;
  force?: boolean;
}

export interface TriggerNarrativeRefreshResult {
  queuedProject: number;
  queuedUser: number;
}

export async function triggerNarrativeRefresh(
  db: PrismaClient,
  tenantId: string,
  args: TriggerNarrativeRefreshArgs,
): Promise<TriggerNarrativeRefreshResult> {
  const persona = args.persona ?? "manager";
  const days = args.days ?? null;

  const dateFilter = days !== null && days >= 0
    ? {
        gte: DateTime.utc().startOf("day").minus({ days }).toJSDate(),
      }
    : undefined;

  if (args.scope === "PROJECT") {
    const where = {
      tenantId,
      projectId: args.projectId,
      ...(args.snapshotId ? { id: args.snapshotId } : {}),
      ...(dateFilter ? { summaryDate: dateFilter } : {}),
    } as any;

    const snapshots = await db.projectSummarySnapshot.findMany({
      where,
      select: { id: true },
    });

    for (const snapshot of snapshots) {
      await enqueueProjectNarrativeRefresh(db, tenantId, snapshot.id, { persona });
    }

    if (snapshots.length > 0) {
      await requestNarrativeRefreshWorkflow({
        projectId: args.projectId,
        persona,
        force: args.force,
      });
    }

    return {
      queuedProject: snapshots.length,
      queuedUser: 0,
    };
  }

  const where = {
    tenantId,
    projectId: args.projectId,
    ...(args.snapshotId ? { id: args.snapshotId } : {}),
    ...(dateFilter ? { summaryDate: dateFilter } : {}),
  } as any;

  const snapshots = await db.userSummarySnapshot.findMany({
    where,
    select: { id: true },
  });

  for (const snapshot of snapshots) {
    await enqueueUserNarrativeRefresh(db, tenantId, snapshot.id, { persona });
  }

  if (snapshots.length > 0) {
    await requestNarrativeRefreshWorkflow({
      projectId: args.projectId,
      persona,
      force: args.force,
    });
  }

  return {
    queuedProject: 0,
    queuedUser: snapshots.length,
  };
}
