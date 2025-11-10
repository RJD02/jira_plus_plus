import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "@temporalio/worker";
import { WORKFLOW_NAMES } from "@reporting/temporal";
import { activities } from "./activities.js";

const DEFAULT_TASK_QUEUE = process.env.REPORTING_TEMPORAL_TASK_QUEUE ?? "reporting";

async function main() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workflowsPath = path.resolve(currentDir, "./workflows.ts");

  const worker = await Worker.create({
    taskQueue: DEFAULT_TASK_QUEUE,
    workflowsPath,
    activities,
  });

  // eslint-disable-next-line no-console
  console.log(
    `Reporting Temporal worker listening on queue ${DEFAULT_TASK_QUEUE} (workflows: ${Object.values(WORKFLOW_NAMES).join(", ")})`,
  );

  await worker.run();
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Reporting Temporal worker failed", error);
  process.exit(1);
});
