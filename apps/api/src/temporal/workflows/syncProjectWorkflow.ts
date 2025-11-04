import { proxyActivities } from '@temporalio/workflow';

type SyncActivities = typeof import('../activities/syncActivities.js');
type InsightActivities = typeof import('../activities/insightActivities.js');
type NarrativeActivities = typeof import('../activities/narrativeActivities.js');

export const SYNC_WORKFLOW_NAME = 'syncProjectWorkflow';

type Activities = SyncActivities & InsightActivities & NarrativeActivities;

const {
  prepareProjectSync,
  syncIssuesBatch,
  finalizeProjectSync,
  failProjectSync,
  requestInsightRefreshWorkflow,
  countPendingInsightRefreshActivity,
  requestNarrativeRefreshWorkflow,
} = proxyActivities<Activities>({
    startToCloseTimeout: '10 minute',
    // heartbeatTimeout: '5 seconds',
    retry: {
      maximumAttempts: 5,
    },
  });

export interface SyncProjectInput {
  projectId: string;
  fullResync?: boolean;
  accountIds?: string[];
  lookbackDays?: number | null;
}

export interface SyncCursor {
  nextPageToken: string | null;
  since?: string | null;
  lastUpdatedAt?: string | null;
}

export async function syncProjectWorkflow(input: SyncProjectInput): Promise<void> {
  const config = await prepareProjectSync({
    projectId: input.projectId,
    fullResync: input.fullResync ?? false,
    accountIds: input.accountIds ?? null,
    lookbackDays: input.lookbackDays ?? null,
  });

  if (!config.trackedAccountIds.length) {
    await finalizeProjectSync({
      projectId: input.projectId,
      status: 'SUCCESS',
      lastUpdatedAt: config.since ?? null,
      message: 'No tracked Jira users. Skipping sync.',
    });
    return;
  }

  let cursor: SyncCursor = {
    nextPageToken: null,
    since: config.since ?? null,
    lastUpdatedAt: config.since ?? null,
  };

  try {
    // Each loop retrieves up to 100 issues.
    // The activity returns whether more data is available and the updated cursor.
    let hasMore = true;
    while (hasMore) {
      const result = await syncIssuesBatch({
        ...config,
        cursor,
      });


      hasMore = result.hasMore;
      cursor = {
        nextPageToken: result.nextPageToken ?? null,
        since: config.since ?? null,
        lastUpdatedAt: result.lastUpdatedAt ?? cursor.lastUpdatedAt ?? config.since ?? null,
      };

      if (hasMore) {
        // reset pagination if Jira response indicates we've consumed the window
        if (!result.hasMore) {
          hasMore = false;
        }
      }
    }

    await finalizeProjectSync({
      projectId: input.projectId,
      status: 'SUCCESS',
      lastUpdatedAt: cursor.lastUpdatedAt ?? config.since ?? null,
      message: 'Sync completed successfully',
    });

    const pendingInsights = await countPendingInsightRefreshActivity({ projectId: input.projectId });
    if (pendingInsights > 0) {
      await requestInsightRefreshWorkflow({ projectId: input.projectId, batchSize: 25 });
    }
    await requestNarrativeRefreshWorkflow({ projectId: input.projectId, persona: "manager" });
  } catch (error) {
    await failProjectSync({
      projectId: input.projectId,
      error: error instanceof Error ? error.message : 'Unknown sync error',
    });
    throw error;
  }
}
