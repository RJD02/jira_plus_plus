import { DateTime } from "luxon";
import type { Prisma, PrismaClient } from "@platform/cdm";
import {
  composeProjectNarrative,
  composeUserNarrative,
  buildProjectNarrativeInput,
  buildUserNarrativeInput,
  hashObject,
  mapProjectSummaryRecord,
  mapTaskSummaryRecord,
  mapUserSummaryRecord,
} from "../hierarchicalSummaryService";
import type { NarrativeScope } from "./narrativeQueueService";

export interface GenerateNarrativeOptions {
  persona?: string;
  force?: boolean;
}

interface NarrativeVariant {
  text: string;
  generatedAt: string;
  hash: string;
  model: string;
  tokens?: {
    prompt: number;
    completion: number;
  } | null;
}

function ensureRichNarratives(value: Prisma.JsonValue | null | undefined): Record<string, NarrativeVariant> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries: Record<string, NarrativeVariant> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const candidate = raw as Record<string, unknown>;
    if (
      typeof candidate.text === "string" &&
      typeof candidate.generatedAt === "string" &&
      typeof candidate.hash === "string" &&
      typeof candidate.model === "string"
    ) {
      const tokensRaw = candidate.tokens;
      let tokens: NarrativeVariant["tokens"] = null;
      if (
        tokensRaw &&
        typeof tokensRaw === "object" &&
        !Array.isArray(tokensRaw) &&
        typeof (tokensRaw as Record<string, unknown>).prompt === "number" &&
        typeof (tokensRaw as Record<string, unknown>).completion === "number"
      ) {
        tokens = {
          prompt: (tokensRaw as Record<string, number>).prompt,
          completion: (tokensRaw as Record<string, number>).completion,
        };
      }

      entries[key] = {
        text: candidate.text,
        generatedAt: candidate.generatedAt,
        hash: candidate.hash,
        model: candidate.model,
        tokens,
      };
    }
  }

  return entries;
}

function serializeNarratives(variants: Record<string, NarrativeVariant>): Prisma.InputJsonValue {
  return variants as unknown as Prisma.InputJsonValue;
}

export async function generateNarrativeForProjectSnapshot(
  db: PrismaClient,
  tenantId: string,
  snapshotId: string,
  options: GenerateNarrativeOptions = {},
): Promise<void> {
  const snapshot = await db.projectSummarySnapshot.findFirst({
    where: { id: snapshotId, tenantId },
  });

  if (!snapshot) {
    throw new Error(`ProjectSummarySnapshot ${snapshotId} not found`);
  }

  const persona = options.persona ?? "manager";

  const projectRecord = mapProjectSummaryRecord(snapshot as any);
  const usersRaw = await db.userSummarySnapshot.findMany({
    where: { id: { in: snapshot.userSummaryIds } },
  });
  const runTasks = await db.taskSummarySnapshot.findMany({
    where: {
      projectId: snapshot.projectId,
      runId: snapshot.runId,
    },
  });

  const userRecords = usersRaw.map((record) => mapUserSummaryRecord(record as any));
  const taskRecords = runTasks.map((record) => mapTaskSummaryRecord(record as any));

  const input = buildProjectNarrativeInput(projectRecord.payload, userRecords, taskRecords);
  const inputHash = hashObject(input);

  const existingVariants = ensureRichNarratives(snapshot.richNarratives as any);
  const existing = existingVariants[persona];

  if (!options.force && existing?.hash === inputHash) {
    await db.projectSummarySnapshot.update({
      where: { id: snapshot.id },
      data: {
        narrative: existing.text,
        narrativeHash: existing.hash,
        narrativeGeneratedAt: new Date(existing.generatedAt),
        needsNarrativeRefresh: false,
        narrativeRefreshLockedUntil: null,
        narrativeRefreshAttempts: 0,
        lastNarrativeError: null,
      },
    });
    return;
  }

  const narrativeText = composeProjectNarrative(projectRecord.payload, userRecords, taskRecords);
  const generatedAt = DateTime.utc().toISO();

  const variant: NarrativeVariant = {
    text: narrativeText,
    generatedAt,
    hash: inputHash,
    model: "deterministic-template",
    tokens: null,
  };

  const updatedVariants = {
    ...existingVariants,
    [persona]: variant,
  };

  await db.projectSummarySnapshot.update({
    where: { id: snapshot.id },
    data: {
      narrative: narrativeText,
      narrativeHash: inputHash,
      narrativeGeneratedAt: new Date(generatedAt),
      richNarratives: serializeNarratives(updatedVariants),
      needsNarrativeRefresh: false,
      narrativeRefreshLockedUntil: null,
      narrativeRefreshAttempts: 0,
      lastNarrativeError: null,
    },
  });
}

export async function generateNarrativeForUserSnapshot(
  db: PrismaClient,
  tenantId: string,
  snapshotId: string,
  options: GenerateNarrativeOptions = {},
): Promise<void> {
  const snapshot = await db.userSummarySnapshot.findFirst({
    where: { id: snapshotId, tenantId },
  });

  if (!snapshot) {
    throw new Error(`UserSummarySnapshot ${snapshotId} not found`);
  }

  const persona = options.persona ?? "manager";

  const userRecord = mapUserSummaryRecord(snapshot as any);

  const taskRecords = await db.taskSummarySnapshot.findMany({
    where: {
      projectId: snapshot.projectId,
      runId: snapshot.runId,
      id: { in: snapshot.taskSummaryIds },
    },
  });

  const mappedTasks = taskRecords.map((record) => mapTaskSummaryRecord(record as any));

  const input = buildUserNarrativeInput(userRecord.payload);
  const inputHash = hashObject(input);

  const existingVariants = ensureRichNarratives(snapshot.richNarratives as any);
  const existing = existingVariants[persona];

  if (!options.force && existing?.hash === inputHash) {
    await db.userSummarySnapshot.update({
      where: { id: snapshot.id },
      data: {
        narrative: existing.text,
        narrativeHash: existing.hash,
        narrativeGeneratedAt: new Date(existing.generatedAt),
        needsNarrativeRefresh: false,
        narrativeRefreshLockedUntil: null,
        narrativeRefreshAttempts: 0,
        lastNarrativeError: null,
      },
    });
    return;
  }

  const narrativeText = composeUserNarrative(userRecord.payload, mappedTasks);
  const generatedAt = DateTime.utc().toISO();

  const variant: NarrativeVariant = {
    text: narrativeText,
    generatedAt,
    hash: inputHash,
    model: "deterministic-template",
    tokens: null,
  };

  const updatedVariants = {
    ...existingVariants,
    [persona]: variant,
  };

  await db.userSummarySnapshot.update({
    where: { id: snapshot.id },
    data: {
      narrative: narrativeText,
      narrativeHash: inputHash,
      narrativeGeneratedAt: new Date(generatedAt),
      richNarratives: serializeNarratives(updatedVariants),
      needsNarrativeRefresh: false,
      narrativeRefreshLockedUntil: null,
      narrativeRefreshAttempts: 0,
      lastNarrativeError: null,
    },
  });
}

export async function generateNarrative(
  db: PrismaClient,
  tenantId: string,
  scope: NarrativeScope,
  snapshotId: string,
  options: GenerateNarrativeOptions = {},
): Promise<void> {
  if (scope === "PROJECT") {
    await generateNarrativeForProjectSnapshot(db, tenantId, snapshotId, options);
    return;
  }
  await generateNarrativeForUserSnapshot(db, tenantId, snapshotId, options);
}
