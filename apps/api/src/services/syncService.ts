import type { PrismaClient } from "@platform/cdm";
import { getTemporalClient, getTaskQueue } from "../temporal/client.js";
import { getEnv } from "../env.js";
import { SYNC_WORKFLOW_NAME } from "../temporal/workflows/syncProjectWorkflow.js";

export async function initializeProjectSync(prisma: PrismaClient, projectId: string) {
  const env = getEnv();
  const project = await prisma.jiraProject.findUnique({
    where: { id: projectId },
    include: { syncJob: true, syncStates: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const workflowId = project.syncJob?.workflowId ?? `jira-sync-${projectId}`;
  const scheduleId = project.syncJob?.scheduleId ?? `jira-sync-schedule-${projectId}`;
  const cron = project.syncJob?.cronSchedule ?? env.SYNC_DEFAULT_CRON;

  if (!project.syncJob) {
    await prisma.syncJob.create({
      data: {
        tenantId: project.tenantId,
        projectId,
        workflowId,
        scheduleId,
        cronSchedule: cron,
        status: "ACTIVE",
      },
    });
  }

  const entities = ["issue", "comment", "worklog"];
  for (const entity of entities) {
    await prisma.syncState.upsert({
      where: {
        tenantId_projectId_entity: {
          tenantId: project.tenantId,
          projectId,
          entity,
        },
      },
      create: {
        tenantId: project.tenantId,
        projectId,
        entity,
      },
      update: {},
    });
  }

  const client = await getTemporalClient();
  const scheduleInput = {
    scheduleId,
    spec: {
      cronExpressions: [cron],
    },
    action: {
      type: "startWorkflow" as const,
      workflowType: SYNC_WORKFLOW_NAME,
      taskQueue: getTaskQueue(),
      args: [{ projectId }],
    },
  };

  try {
    await client.schedule.create(scheduleInput);
  } catch (error) {
    if (!(error instanceof Error) || !/Already exists/i.test(error.message)) {
      throw error;
    }
  }

  await updateNextRunFromSchedule(prisma, projectId);
}

export async function pauseProjectSync(prisma: PrismaClient, projectId: string) {
  const job = await prisma.syncJob.findUnique({ where: { projectId } });
  if (!job) {
    throw new Error("Sync job not found");
  }

  const client = await getTemporalClient();
  const schedule = client.schedule.getHandle(job.scheduleId);
  await schedule.pause("Paused by admin");

  await prisma.syncJob.update({
    where: { id: job.id },
    data: { status: "PAUSED" },
  });
}

export async function resumeProjectSync(prisma: PrismaClient, projectId: string) {
  let job = await prisma.syncJob.findUnique({ where: { projectId } });
  if (!job) {
    await initializeProjectSync(prisma, projectId)
    job = await prisma.syncJob.findUnique({ where: { projectId } });
    if (!job) {
      throw new Error("Sync job not found");
    }
  }

  const client = await getTemporalClient();
  const schedule = client.schedule.getHandle(job.scheduleId);
  await schedule.unpause("Resumed by admin");

  await prisma.syncJob.update({
    where: { id: job.id },
    data: { status: "ACTIVE" },
  });

  await updateNextRunFromSchedule(prisma, projectId);
}

export async function rescheduleProjectSync(
  prisma: PrismaClient,
  projectId: string,
  cron: string,
) {
  let job = await prisma.syncJob.findUnique({ where: { projectId } });
  if (!job) {
    await initializeProjectSync(prisma, projectId);
    job = await prisma.syncJob.findUnique({ where: { projectId } });
    if (!job) {
      throw new Error("Sync job not found");
    }
  }

  const client = await getTemporalClient();
  const schedule = client.schedule.getHandle(job.scheduleId);
  await schedule.update((scheduleDescription: any) => ({
    ...scheduleDescription,
    spec: { ...scheduleDescription.spec, cronExpressions: [cron] },
  }));

  await prisma.syncJob.update({
    where: { id: job.id },
    data: { cronSchedule: cron },
  });

  await updateNextRunFromSchedule(prisma, projectId);
}

interface TriggerSyncOptions {
  full?: boolean;
  accountIds?: string[];
  days?: number | null;
}

export async function triggerProjectSync(
  prisma: PrismaClient,
  projectId: string,
  options: TriggerSyncOptions = {},
) {
  let job = await prisma.syncJob.findUnique({ where: { projectId } });
  if (!job) {
    await initializeProjectSync(prisma, projectId);
    job = await prisma.syncJob.findUnique({ where: { projectId } });
    if (!job) {
      throw new Error("Sync job not found");
    }
  }

  let fullResync = options.full ?? false;
  let lookbackDays: number | null = null;
  if (typeof options.days === "number") {
    if (options.days < 0) {
      fullResync = true;
    } else {
      lookbackDays = options.days;
    }
  }

  const client = await getTemporalClient();

  await client.workflow.start(SYNC_WORKFLOW_NAME, {
    taskQueue: getEnv().TEMPORAL_TASK_QUEUE,
    workflowId: `${job.workflowId}-${Date.now()}`,
    args: [
      {
        projectId,
        fullResync,
        accountIds: options.accountIds ?? null,
        lookbackDays,
      },
    ],
  });

  await prisma.syncLog.create({
    data: {
      projectId,
      level: "INFO",
      message: "Manual sync triggered",
      details: {
        full: fullResync,
        accountIds: options.accountIds,
        days: options.days ?? null,
      },
    },
  });
}

export async function startProjectSync(prisma: PrismaClient, projectId: string, full = false) {
  await resumeProjectSync(prisma, projectId);
  await triggerProjectSync(prisma, projectId, { full });
}

export async function updateNextRunFromSchedule(prisma: PrismaClient, projectId: string) {
  let job = await prisma.syncJob.findUnique({ where: { projectId } });
  if (!job) {
    await initializeProjectSync(prisma, projectId);
    job = await prisma.syncJob.findUnique({ where: { projectId } });
    if (!job) {
      throw new Error("Sync job not found");
    }
  }

  const client = await getTemporalClient();
  const schedule = client.schedule.getHandle(job.scheduleId);
  const description = await schedule.describe();
  const now = Date.now();
  const nextRun =
    description.info.nextActionTimes && description.info.nextActionTimes.length > 0
      ? description.info.nextActionTimes
          .map((timestamp) => new Date(timestamp))
          .filter((date) => Number.isFinite(date.getTime()) && date.getTime() >= now)
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
      : null;

  await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      nextRunAt: nextRun,
      updatedAt: new Date(),
    },
  });
}
