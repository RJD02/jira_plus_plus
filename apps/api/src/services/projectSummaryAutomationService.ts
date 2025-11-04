import { DateTime } from "luxon";
import type { PrismaClient } from "@platform/cdm";
import { getTaskQueue, getTemporalClient } from "../temporal/client.js";
import { PROJECT_SUMMARY_AUTOMATION_WORKFLOW_NAME } from "../temporal/workflows/projectSummaryAutomationWorkflow.js";
import { generateHierarchicalSummariesForDate } from "./hierarchicalSummaryService.js";

export const DEFAULT_SUMMARY_FREQUENCY_MINUTES = 180;
const MIN_SUMMARY_FREQUENCY_MINUTES = 30;
const DEFAULT_AUTOMATION_LOCK_SECONDS = 5 * 60;

export interface SummaryScheduleUpdateInput {
  enabled?: boolean;
  frequencyMinutes?: number;
}

export interface AutomationRunOptions {
  limit?: number;
  lockSeconds?: number;
}

export interface AutomationRunResult {
  processed: number;
  attempted: number;
  remaining: number;
  errors: Array<{ projectId: string; message: string }>;
}

type ProjectSummaryScheduleRecord = {
  id: string;
  tenantId: string;
  projectId: string;
  frequencyMinutes: number;
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lockedUntil: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function schedules(prisma: PrismaClient) {
  return (prisma as unknown as { projectSummarySchedule: any }).projectSummarySchedule;
}

export async function ensureProjectSummarySchedule(
  prisma: PrismaClient,
  tenantId: string,
  projectId: string,
): Promise<ProjectSummaryScheduleRecord> {
  const delegate = schedules(prisma);
  const existing = await delegate.findUnique({
    where: { tenantId_projectId: { tenantId, projectId } },
  });
  if (existing) {
    return existing;
  }

  const now = DateTime.utc().toJSDate();

  return delegate.create({
    data: {
      tenantId,
      projectId,
      frequencyMinutes: DEFAULT_SUMMARY_FREQUENCY_MINUTES,
      enabled: true,
      nextRunAt: now,
    },
  });
}

export async function updateProjectSummarySchedule(
  prisma: PrismaClient,
  tenantId: string,
  projectId: string,
  input: SummaryScheduleUpdateInput,
): Promise<ProjectSummaryScheduleRecord> {
  const schedule = await ensureProjectSummarySchedule(prisma, tenantId, projectId);
  const now = DateTime.utc();

  const frequency =
    typeof input.frequencyMinutes === "number"
      ? clampFrequency(input.frequencyMinutes)
      : schedule.frequencyMinutes;
  const enabled = typeof input.enabled === "boolean" ? input.enabled : schedule.enabled;

  const data: Record<string, unknown> = {
    frequencyMinutes: frequency,
    enabled,
  };

  if (!enabled) {
    data.nextRunAt = null;
    data.lockedUntil = null;
  } else {
    const baseline =
      schedule.nextRunAt && DateTime.fromJSDate(schedule.nextRunAt) > now
        ? DateTime.fromJSDate(schedule.nextRunAt)
        : now;
    data.nextRunAt = baseline.toJSDate();
    if (input.frequencyMinutes !== undefined || schedule.nextRunAt === null) {
      data.nextRunAt = now.plus({ minutes: frequency }).toJSDate();
    }
  }

  const delegate = schedules(prisma);
  return delegate.update({
    where: { id: schedule.id },
    data,
  });
}

export async function runProjectSummaryAutomation(
  prisma: PrismaClient,
  tenantId: string,
  options: AutomationRunOptions = {},
): Promise<AutomationRunResult> {
  const limit = Math.max(1, options.limit ?? 5);
  const lockSeconds = Math.max(30, options.lockSeconds ?? DEFAULT_AUTOMATION_LOCK_SECONDS);
  const now = DateTime.utc();

  const delegate = schedules(prisma);
  const candidates = await delegate.findMany({
    where: {
      tenantId,
      enabled: true,
      AND: [
        {
          OR: [
            { nextRunAt: null },
            { nextRunAt: { lte: now.toJSDate() } },
          ],
        },
        {
          OR: [
            { lockedUntil: null },
            { lockedUntil: { lt: now.toJSDate() } },
          ],
        },
      ],
    },
    orderBy: [{ nextRunAt: "asc" }],
    take: limit * 3,
  });

  const claimed: ProjectSummaryScheduleRecord[] = [];
  const lockUntil = now.plus({ seconds: lockSeconds }).toJSDate();

  for (const candidate of candidates) {
    if (claimed.length >= limit) {
      break;
    }
    const updated = await delegate.updateMany({
      where: {
        id: candidate.id,
        tenantId,
        enabled: true,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now.toJSDate() } }],
      },
      data: {
        lockedUntil: lockUntil,
      },
    });
    if (updated.count > 0) {
      claimed.push(candidate);
    }
  }

  if (!claimed.length) {
    const remaining = await countDueSchedules(prisma, tenantId, now);
    return {
      processed: 0,
      attempted: 0,
      remaining,
      errors: [],
    };
  }

  let processed = 0;
  const errors: Array<{ projectId: string; message: string }> = [];

  for (const schedule of claimed) {
    const frequency = clampFrequency(schedule.frequencyMinutes);
    try {
      await generateHierarchicalSummariesForDate(prisma, now.toISODate(), schedule.projectId);
      await recordProjectSummaryRunSuccess(prisma, schedule.id, frequency, now);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown summary automation error";
      errors.push({ projectId: schedule.projectId, message });
      await recordProjectSummaryRunFailure(prisma, schedule.id, frequency, message, now);
    }
  }

  const remaining = await countDueSchedules(prisma, tenantId, DateTime.utc());

  return {
    processed,
    attempted: claimed.length,
    remaining,
    errors,
  };
}

export async function recordProjectSummaryRunSuccess(
  prisma: PrismaClient,
  scheduleId: string,
  frequencyMinutes: number,
  timestamp: DateTime = DateTime.utc(),
): Promise<void> {
  const delegate = schedules(prisma);
  await delegate.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: timestamp.toJSDate(),
      nextRunAt: timestamp.plus({ minutes: clampFrequency(frequencyMinutes) }).toJSDate(),
      lockedUntil: null,
      lastError: null,
      lastErrorAt: null,
    },
  });
}

export async function recordProjectSummaryRunFailure(
  prisma: PrismaClient,
  scheduleId: string,
  frequencyMinutes: number,
  message: string,
  timestamp: DateTime = DateTime.utc(),
): Promise<void> {
  const delegate = schedules(prisma);
  await delegate.update({
    where: { id: scheduleId },
    data: {
      lockedUntil: null,
      lastError: message,
      lastErrorAt: timestamp.toJSDate(),
      nextRunAt: timestamp.plus({ minutes: clampFrequency(frequencyMinutes) }).toJSDate(),
    },
  });
}

export async function triggerProjectSummaryAutomationWorkflow(): Promise<void> {
  const client = await getTemporalClient();
  const workflowId = `project-summary-automation-${Date.now()}`;
  await client.workflow.start(PROJECT_SUMMARY_AUTOMATION_WORKFLOW_NAME, {
    taskQueue: getTaskQueue(),
    workflowId,
    args: [{}],
  });
}

export const PROJECT_SUMMARY_AUTOMATION_SCHEDULE_ID = "project-summary-automation";
export const PROJECT_SUMMARY_AUTOMATION_CRON = "*/30 * * * *";

export async function ensureProjectSummaryAutomationSchedule(): Promise<void> {
  const client = await getTemporalClient();
  const scheduleId = PROJECT_SUMMARY_AUTOMATION_SCHEDULE_ID;

  try {
    await client.schedule.create({
      scheduleId,
      spec: {
        cronExpressions: [PROJECT_SUMMARY_AUTOMATION_CRON],
      },
      action: {
        type: "startWorkflow" as const,
        workflowType: PROJECT_SUMMARY_AUTOMATION_WORKFLOW_NAME,
        taskQueue: getTaskQueue(),
        args: [{}],
      },
    });
  } catch (error) {
    if (!(error instanceof Error) || !/Already exists/i.test(error.message)) {
      throw error;
    }
  }
}

async function countDueSchedules(prisma: PrismaClient, tenantId: string, now: DateTime): Promise<number> {
  const delegate = schedules(prisma);
  return delegate.count({
    where: {
      tenantId,
      enabled: true,
      AND: [
        {
          OR: [
            { nextRunAt: null },
            { nextRunAt: { lte: now.toJSDate() } },
          ],
        },
        {
          OR: [
            { lockedUntil: null },
            { lockedUntil: { lt: now.toJSDate() } },
          ],
        },
      ],
    },
  });
}

function clampFrequency(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_SUMMARY_FREQUENCY_MINUTES;
  }

  return Math.max(MIN_SUMMARY_FREQUENCY_MINUTES, Math.round(minutes));
}
