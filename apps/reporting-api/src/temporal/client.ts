import { Connection, WorkflowClient } from "@temporalio/client";

const DEFAULT_TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const DEFAULT_TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? "default";
const DEFAULT_TASK_QUEUE =
  process.env.REPORTING_TEMPORAL_TASK_QUEUE ?? process.env.TEMPORAL_TASK_QUEUE ?? "reporting";

let cachedClient: WorkflowClient | null = null;
let cachedConnection: Connection | null = null;

export async function getTemporalClient() {
  if (!cachedClient || !cachedConnection) {
    cachedConnection = await Connection.connect({ address: DEFAULT_TEMPORAL_ADDRESS });
    cachedClient = new WorkflowClient({
      connection: cachedConnection,
      namespace: DEFAULT_TEMPORAL_NAMESPACE,
    });
  }

  return {
    client: cachedClient,
    taskQueue: DEFAULT_TASK_QUEUE,
  } as const;
}
