import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import { getEnv } from "../env.js";
import * as syncActivities from "./activities/syncActivities.js";
import * as insightActivities from "./activities/insightActivities.js";
import * as narrativeActivities from "./activities/narrativeActivities.js";
import * as summaryAutomationActivities from "./activities/summaryAutomationActivities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function startHealthServer(port: number) {
  const server = createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }

    if (req.method?.toUpperCase() === "GET" && (req.url === "/health" || req.url === "/healthz")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.on("clientError", (err, socket) => {
    console.warn("Worker health server client error", err);
    socket.destroy();
  });

  server.listen(port, () => {
    /* eslint-disable no-console */
    console.log(`[worker] health server listening on ${port}`);
  });
}

async function run() {
  const env = getEnv();
  const workflowsEntry = path.join(__dirname, "workflows");

  startHealthServer(env.WORKER_PORT);

  const connection = await NativeConnection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    workflowsPath: workflowsEntry,
    activities: {
      ...syncActivities,
      ...insightActivities,
      ...narrativeActivities,
      ...summaryAutomationActivities,
    },
    taskQueue: env.TEMPORAL_TASK_QUEUE,
  });

  await worker.run();
}

run().catch((error) => {
  console.error("Temporal worker failed", error);
  process.exit(1);
});
