import { prisma } from "../../prisma.js";
import { getEnv } from "../../env.js";
import {
  ensureProjectSummarySchedule,
  runProjectSummaryAutomation,
  type AutomationRunResult,
  type AutomationRunOptions,
} from "../../services/projectSummaryAutomationService.js";

export interface ProjectSummaryAutomationArgs extends AutomationRunOptions {
  ensureProjects?: boolean;
}

export async function runProjectSummaryAutomationActivity(
  args: ProjectSummaryAutomationArgs = {},
): Promise<AutomationRunResult> {
  const env = getEnv();
  const tenantId = env.TENANT_ID;

  if (args.ensureProjects !== false) {
    const projects = await prisma.jiraProject.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    });

    await Promise.all(
      projects.map((project) => ensureProjectSummarySchedule(prisma, tenantId, project.id)),
    );
  }

  return runProjectSummaryAutomation(prisma, tenantId, {
    limit: args.limit,
    lockSeconds: args.lockSeconds,
  });
}
