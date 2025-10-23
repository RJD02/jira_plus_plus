/* eslint-disable no-console */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { prisma } from "../src/prisma.js";
import { getEnv } from "../src/env.js";
import { getIssueInsights } from "../src/services/insights/insightService.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");

const candidateEnvPaths = [
  path.join(repoRoot, ".env"),
  path.join(apiRoot, ".env"),
];

for (const envPath of candidateEnvPaths) {
  config({ path: envPath, override: false });
}

async function main() {
  const env = getEnv();

  const issue = await prisma.issue.findFirst({
    select: {
      id: true,
      key: true,
      summary: true,
      status: true,
      project: { select: { key: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!issue) {
    console.warn("[check-insight] No issues found in database.");
    return;
  }

  console.log(`[check-insight] Computing insights for ${issue.key} (${issue.id})…`);
  const insight = await getIssueInsights(
    prisma,
    env.TENANT_ID,
    issue.id,
    "local",
    true,
  );

  console.log(
    JSON.stringify(
      {
        issue,
        insight,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[check-insight] Failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
