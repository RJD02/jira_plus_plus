import path from "node:path";
import { promises as fs } from "node:fs";
import { GraphQLError } from "graphql";
import { DateResolver, DateTimeResolver, JSONResolver } from "graphql-scalars";
import { CredentialType, type PrismaClient, type ProjectTrackedUser } from "@platform/cdm";
import type { RequestContext } from "./context.js";
import {
  createAuthToken,
  encryptSecret,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from "./auth.js";
import { fetchJiraProjectOptions, fetchJiraProjectUsers } from "./jira-client.js";
import {
  sendPasswordResetEmail,
  sendUserInviteEmail,
} from "./services/communication/inviteService.js";
import {
  initializeProjectSync,
  pauseProjectSync,
  resumeProjectSync,
  rescheduleProjectSync,
  triggerProjectSync,
  startProjectSync,
  updateNextRunFromSchedule,
} from "./services/syncService.js";
import {
  exportSummariesToPdf,
  exportSummariesToSlackPayload,
  generateSummariesForDate,
  generateSummaryForUser,
} from "./services/dailySummaryService.js";
import { buildFocusBoard } from "./services/focusBoardService.js";
import { buildManagerSummary, buildPortfolioManagerSummary } from "./services/managerSummaryService.js";
import {
  getIssueInsights,
  mapInsightRecord,
  type InsightProvider,
  type IssueInsightDTO,
} from "./services/insights/insightService.js";

function requireUser(ctx: RequestContext) {
  if (!ctx.user) {
    throw new GraphQLError("Authentication required", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  return ctx.user;
}

function requireAdmin(ctx: RequestContext) {
  const user = requireUser(ctx);
  if (user.role !== "ADMIN") {
    throw new GraphQLError("Admin privileges required", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  return user;
}

const runAsTenant = <T>(ctx: RequestContext, fn: (tx: PrismaClient) => Promise<T>) =>
  ctx.withTenant(fn);

function mapInsightToGraphQL(dto: IssueInsightDTO) {
  return {
    issueId: dto.issueId,
    summary: dto.summary,
    sentiment: dto.sentiment,
    escalateScore: dto.escalateScore,
    signals: dto.signals.map((signal) => ({
      ...signal,
      severity: signal.severity.toUpperCase(),
    })),
    computedAt: dto.computedAt,
    expiresAt: dto.expiresAt ?? null,
    providerMetadata: dto.providerMetadata ?? {},
  };
}

export const resolvers = {
  DateTime: DateTimeResolver,
  Date: DateResolver,
  JSON: JSONResolver,
  Query: {
    health: () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
    me: async (_parent: unknown, _args: unknown, ctx: RequestContext) => {
      const auth = requireUser(ctx);
      return runAsTenant(ctx, (prisma) =>
        prisma.user.findUnique({ where: { id: auth.id } }),
      );
    },
    users: async (_parent: unknown, _args: unknown, ctx: RequestContext) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) =>
        prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
      );
    },
    jiraSites: async (_parent: unknown, _args: unknown, ctx: RequestContext) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) =>
        prisma.jiraSite.findMany({
          include: { projects: true },
          orderBy: { createdAt: "desc" },
        }),
      );
    },
    jiraProjects: async (
      _parent: unknown,
      args: { siteId: string },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) =>
        prisma.jiraProject.findMany({
          where: { siteId: args.siteId },
          include: {
            site: true,
            trackedUsers: true,
            syncJob: true,
            syncStates: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      );
    },
    userProjectLinks: async (
      _parent: unknown,
      args: { userId: string },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) =>
        prisma.userProjectLink.findMany({
          where: { userId: args.userId },
          include: { project: { include: { site: true } }, user: true },
          orderBy: { createdAt: "desc" },
        }),
      );
    },
    jiraProjectOptions: async (
      _parent: unknown,
      args: { siteId: string },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) =>
        fetchJiraProjectOptions(prisma, ctx.tenantId, args.siteId),
      );
    },
    jiraProjectUserOptions: async (
      _parent: unknown,
      args: { siteId: string; projectKey: string; forceRefresh?: boolean },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) =>
        fetchJiraProjectUsers(prisma, ctx.tenantId, args.siteId, args.projectKey, {
          forceRefresh: args.forceRefresh ?? false,
        }),
      );
    },
    projectTrackedUsers: async (
      _parent: unknown,
      args: { projectId: string },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) =>
        prisma.projectTrackedUser.findMany({
          where: { projectId: args.projectId },
          orderBy: { displayName: "asc" },
        }),
      );
    },
    issueInsights: async (
      _parent: unknown,
      args: { issueId: string; provider?: string; refresh?: boolean },
      ctx: RequestContext,
    ) => {
      const auth = requireUser(ctx);
      return runAsTenant(ctx, async (prisma) => {
        const issue = await prisma.issue.findUnique({
          where: { id: args.issueId },
          select: { id: true, projectId: true },
        });
        if (!issue) {
          throw new GraphQLError("Issue not found", { extensions: { code: "NOT_FOUND" } });
        }
        if (auth.role !== "ADMIN") {
          const membership = await prisma.userProjectLink.count({
            where: { projectId: issue.projectId, userId: auth.id },
          });
          if (!membership) {
            throw new GraphQLError("You do not have access to this issue", {
              extensions: { code: "FORBIDDEN" },
            });
          }
        }
        const provider = (args.provider ?? "auto").toLowerCase() as InsightProvider;
        const insight = await getIssueInsights(
          prisma,
          ctx.tenantId,
          issue.id,
          provider,
          Boolean(args.refresh),
        );
        return mapInsightToGraphQL(insight);
      });
    },
    dailySummaries: async (
      _parent: unknown,
      args: { date: string; projectId: string },
      ctx: RequestContext,
    ) => {
      const auth = requireUser(ctx);
      return runAsTenant(ctx, async (prisma) => {
        if (auth.role !== "ADMIN") {
          const membership = await prisma.userProjectLink.count({
            where: { projectId: args.projectId, userId: auth.id },
          });
          if (!membership) {
            throw new GraphQLError("You do not have access to this project", {
              extensions: { code: "FORBIDDEN" },
            });
          }
        }
        return generateSummariesForDate(prisma, args.date, args.projectId);
      });
    },
    scrumProjects: async (_parent: unknown, _args: unknown, ctx: RequestContext) => {
      const auth = requireUser(ctx);
      const projectInclude = {
        trackedUsers: {
          where: { isTracked: true },
          select: {
            id: true,
            displayName: true,
            jiraAccountId: true,
            email: true,
            avatarUrl: true,
            isTracked: true,
          },
        },
      } as const;
      return runAsTenant(ctx, (prisma) => {
        if (auth.role === "ADMIN") {
          return prisma.jiraProject.findMany({
            where: { isActive: true },
            orderBy: { name: "asc" },
            include: projectInclude,
          });
        }

        return prisma.jiraProject.findMany({
          where: {
            isActive: true,
            accountLinks: {
              some: { userId: auth.id },
            },
          },
          orderBy: { name: "asc" },
          include: projectInclude,
        });
      });
    },
    focusBoard: async (
      _parent: unknown,
      args: {
        projectIds?: string[] | null;
        start?: string | Date | null;
        end?: string | Date | null;
      },
      ctx: RequestContext,
    ) => {
      const auth = requireUser(ctx);
      return runAsTenant(ctx, (prisma) =>
        buildFocusBoard(prisma, auth.id, {
          projectIds: args.projectIds ?? null,
          start: args.start ?? null,
          end: args.end ?? null,
        }),
      );
    },
    syncStates: async (
      _parent: unknown,
      args: { projectId: string },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) =>
        prisma.syncState.findMany({
          where: { projectId: args.projectId },
          orderBy: { entity: "asc" },
        }),
      );
    },
    syncLogs: async (
      _parent: unknown,
      args: { projectId: string; limit?: number },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) =>
        prisma.syncLog.findMany({
          where: { projectId: args.projectId },
          orderBy: { createdAt: "desc" },
          take: args.limit ?? 50,
        }),
      );
    },
    projectSprints: async (
      _parent: unknown,
      args: { projectId: string },
      ctx: RequestContext,
    ) => {
      const auth = requireUser(ctx);
      return runAsTenant(ctx, async (prisma) => {
        if (auth.role !== "ADMIN") {
          const membership = await prisma.userProjectLink.count({
            where: { projectId: args.projectId, userId: auth.id },
          });
          if (!membership) {
            throw new GraphQLError("You do not have access to this project", {
              extensions: { code: "FORBIDDEN" },
            });
          }
        }

        return prisma.sprint.findMany({
          where: { issues: { some: { projectId: args.projectId } } },
          orderBy: [
            { startDate: "desc" },
            { endDate: "desc" },
            { createdAt: "desc" },
          ],
        });
      });
    },
    managerSummary: async (
      _parent: unknown,
      args: { projectId?: string | null; sprintId?: string | null },
      ctx: RequestContext,
    ) => {
      const auth = requireUser(ctx);
      try {
        return await runAsTenant(ctx, async (prisma) => {
          if (args.projectId) {
            return buildManagerSummary(prisma, auth, {
              projectId: args.projectId,
              sprintId: args.sprintId ?? null,
            });
          }

          const accessibleProjects =
            auth.role === "ADMIN"
              ? await prisma.jiraProject.findMany({
                  where: { isActive: true },
                  select: { id: true },
                })
              : await prisma.jiraProject.findMany({
                  where: {
                    isActive: true,
                    accountLinks: {
                      some: { userId: auth.id },
                    },
                  },
                  select: { id: true },
                });

          const projectIds = accessibleProjects.map(({ id }) => id);
          if (!projectIds.length) {
            throw new GraphQLError("No accessible projects available", {
              extensions: { code: "NOT_FOUND" },
            });
          }

          return buildPortfolioManagerSummary(prisma, auth, projectIds);
        });
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        if (error instanceof Error) {
          const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
          const code =
            statusCode === 403
              ? "FORBIDDEN"
              : statusCode === 404
                ? "NOT_FOUND"
                : "INTERNAL_SERVER_ERROR";
          throw new GraphQLError(error.message, {
            extensions: { code },
          });
        }
        throw error;
      }
    },
  },
  Mutation: {
    login: async (
      _parent: unknown,
      args: { input: { email: string; password: string } },
      ctx: RequestContext,
    ) => {
      const { email, password } = args.input;
      const user = await runAsTenant(ctx, (prisma) =>
        prisma.user.findUnique({
          where: { tenantId_email: { tenantId: ctx.tenantId, email } },
          include: { credential: true },
        }),
      );

      if (!user || !user.credential) {
        throw new GraphQLError("Invalid credentials", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      const isValid = await verifyPassword(password, user.credential.secretHash);
      if (!isValid) {
        throw new GraphQLError("Invalid credentials", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      return {
        token: createAuthToken({
          id: user.id,
          email: user.email,
          role: user.role,
        }),
        user,
      };
    },
    createUser: async (
      _parent: unknown,
      args: {
        input: {
          email: string;
          displayName: string;
          phone?: string | null;
          role?: "ADMIN" | "MANAGER" | "USER";
          sendInvite?: boolean | null;
        };
      },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      const {
        email,
        displayName,
        phone,
        role = "USER",
        sendInvite = true,
      } = args.input;

      const existing = await runAsTenant(ctx, (prisma) =>
        prisma.user.findUnique({
          where: { tenantId_email: { tenantId: ctx.tenantId, email } },
        }),
      );
      if (existing) {
        throw new GraphQLError("A user with this email already exists", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const user = await runAsTenant(ctx, (prisma) =>
        prisma.user.create({
          data: {
            tenantId: ctx.tenantId,
            email,
            displayName,
            phone,
            role,
            credential: {
              create: {
                tenantId: ctx.tenantId,
                type: CredentialType.LOCAL,
                secretHash: passwordHash,
              },
            },
          },
        }),
      );

      if (sendInvite) {
        try {
          await sendUserInviteEmail({
            email: user.email,
            displayName: user.displayName,
            temporaryPassword,
          });
        } catch (error) {
          console.error("Failed to send invite email", error);
          throw new GraphQLError("User created, but failed to send invitation email", {
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          });
        }
      }

      return user;
    },
    resetUserPassword: async (
      _parent: unknown,
      args: { input: { userId: string } },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      const { userId } = args.input;

      return runAsTenant(ctx, async (prisma) => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          throw new GraphQLError("User not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(temporaryPassword);

        await prisma.$transaction(async (tx) => {
          const credential = await tx.credential.findUnique({
            where: { userId: user.id },
          });

          if (credential) {
            await tx.credential.update({
              where: { id: credential.id },
              data: { secretHash: passwordHash },
            });
          } else {
            await tx.credential.create({
              data: {
                tenantId: ctx.tenantId,
                type: CredentialType.LOCAL,
                secretHash: passwordHash,
                userId: user.id,
              },
            });
          }
        });

        try {
          await sendPasswordResetEmail({
            email: user.email,
            displayName: user.displayName,
            temporaryPassword,
          });
        } catch (error) {
          console.error("Failed to send password reset email", error);
          throw new GraphQLError("Password updated, but failed to send reset email", {
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          });
        }

        return true;
      });
    },
    updateUserRole: async (
      _parent: unknown,
      args: { input: { userId: string; role: "ADMIN" | "MANAGER" | "USER" } },
      ctx: RequestContext,
    ) => {
      const requester = requireAdmin(ctx);

      if (requester.id === args.input.userId) {
        throw new GraphQLError("You cannot change your own role", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      return runAsTenant(ctx, (prisma) =>
        prisma.user.update({
          where: { id: args.input.userId },
          data: { role: args.input.role },
        }),
      );
    },
    registerJiraSite: async (
      _parent: unknown,
      args: {
        input: {
          alias: string;
          baseUrl: string;
          adminEmail: string;
          apiToken: string;
        };
      },
      ctx: RequestContext,
    ) => {
      const admin = requireAdmin(ctx);
      const { alias, baseUrl, adminEmail, apiToken } = args.input;

      try {
        // eslint-disable-next-line no-new
        new URL(baseUrl);
      } catch {
        throw new GraphQLError("Base URL must be a valid URL", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const encryptedToken = encryptSecret(apiToken);

      return runAsTenant(ctx, (prisma) =>
        prisma.jiraSite.create({
          data: {
            tenantId: ctx.tenantId,
            alias,
            baseUrl,
            adminEmail,
            tokenCipher: encryptedToken,
            createdById: admin.id,
          },
          include: { projects: true },
        }),
      );
    },
    registerJiraProject: async (
      _parent: unknown,
      args: {
        input: { siteId: string; jiraId: string; key: string; name: string };
      },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);

      return runAsTenant(ctx, async (prisma) => {
        const site = await prisma.jiraSite.findFirst({
          where: { id: args.input.siteId, tenantId: ctx.tenantId },
        });

        if (!site) {
          throw new GraphQLError("Jira site not found", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const project = await prisma.jiraProject.create({
          data: {
            tenantId: ctx.tenantId,
            siteId: args.input.siteId,
            jiraId: args.input.jiraId,
            key: args.input.key,
            name: args.input.name,
          },
          include: {
            site: true,
            trackedUsers: true,
            syncJob: true,
            syncStates: true,
          },
        });

        await initializeProjectSync(prisma, project.id);
        await triggerProjectSync(prisma, project.id, { full: true });
        await updateNextRunFromSchedule(prisma, project.id);

        return project;
      });
    },
    mapUserToProject: async (
      _parent: unknown,
      args: { input: { userId: string; projectId: string; jiraAccountId: string } },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);

      return runAsTenant(ctx, async (prisma) => {
        const [user, project] = await Promise.all([
          prisma.user.findFirst({ where: { id: args.input.userId, tenantId: ctx.tenantId } }),
          prisma.jiraProject.findFirst({
            where: { id: args.input.projectId, tenantId: ctx.tenantId },
            include: { site: true },
          }),
        ]);

        if (!user || !project) {
          throw new GraphQLError("User or project not found", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        return prisma.userProjectLink.upsert({
          where: {
            tenantId_userId_projectId: {
              tenantId: ctx.tenantId,
              userId: args.input.userId,
              projectId: args.input.projectId,
            },
          },
          update: {
            jiraAccountId: args.input.jiraAccountId,
          },
          create: {
            tenantId: ctx.tenantId,
            userId: args.input.userId,
            projectId: args.input.projectId,
            jiraAccountId: args.input.jiraAccountId,
          },
          include: {
            user: true,
            project: { include: { site: true } },
          },
        });
      });
    },
    unlinkUserFromProject: async (
      _parent: unknown,
      args: { linkId: string },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      try {
        await runAsTenant(ctx, (prisma) =>
          prisma.userProjectLink.delete({ where: { id: args.linkId } }),
        );
        return true;
      } catch {
        return false;
      }
    },
    setProjectTrackedUsers: async (
      _parent: unknown,
      args: {
        input: {
          projectId: string;
          users: Array<{
            jiraAccountId: string;
            displayName: string;
            email?: string | null;
            avatarUrl?: string | null;
            isTracked?: boolean | null;
          }>;
        };
      },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);

      return runAsTenant(ctx, async (prisma) => {
        const project = await prisma.jiraProject.findFirst({
          where: { id: args.input.projectId, tenantId: ctx.tenantId },
          include: { trackedUsers: true },
        });

        if (!project) {
            throw new GraphQLError("Project not found", {
              extensions: { code: "BAD_USER_INPUT" },
            });
        }

        const incomingIds = new Set(args.input.users.map((user) => user.jiraAccountId));

        if (project.trackedUsers.length) {
          await prisma.projectTrackedUser.deleteMany({
            where: {
              tenantId: ctx.tenantId,
              projectId: project.id,
              jiraAccountId: { notIn: Array.from(incomingIds) },
            },
          });
        }

        for (const user of args.input.users) {
          await prisma.projectTrackedUser.upsert({
            where: {
              tenantId_projectId_jiraAccountId: {
                tenantId: ctx.tenantId,
                projectId: project.id,
                jiraAccountId: user.jiraAccountId,
              },
            },
            update: {
              displayName: user.displayName,
              email: user.email ?? null,
              avatarUrl: user.avatarUrl ?? null,
              isTracked: user.isTracked ?? true,
            },
            create: {
              tenantId: ctx.tenantId,
              projectId: project.id,
              jiraAccountId: user.jiraAccountId,
              displayName: user.displayName,
              email: user.email ?? null,
              avatarUrl: user.avatarUrl ?? null,
              isTracked: user.isTracked ?? true,
            },
          });
        }

        const tracked: ProjectTrackedUser[] = await prisma.projectTrackedUser.findMany({
          where: { tenantId: ctx.tenantId, projectId: project.id },
          orderBy: { displayName: "asc" },
        });

        await triggerProjectSync(prisma, project.id, {
          full: true,
          accountIds: tracked.filter((user) => user.isTracked).map((user) => user.jiraAccountId),
        });

        return tracked;
      });
    },
    startProjectSync: async (
      _parent: unknown,
      args: { projectId: string; full?: boolean },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      await runAsTenant(ctx, async (prisma) => {
        await startProjectSync(prisma, args.projectId, args.full ?? false);
        await updateNextRunFromSchedule(prisma, args.projectId);
      });
      return true;
    },
    pauseProjectSync: async (_parent: unknown, args: { projectId: string }, ctx: RequestContext) => {
      requireAdmin(ctx);
      await runAsTenant(ctx, (prisma) => pauseProjectSync(prisma, args.projectId));
      return true;
    },
    resumeProjectSync: async (_parent: unknown, args: { projectId: string }, ctx: RequestContext) => {
      requireAdmin(ctx);
      await runAsTenant(ctx, async (prisma) => {
        await resumeProjectSync(prisma, args.projectId);
        await updateNextRunFromSchedule(prisma, args.projectId);
      });
      return true;
    },
    rescheduleProjectSync: async (
      _parent: unknown,
      args: { projectId: string; cron: string },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      await runAsTenant(ctx, async (prisma) => {
        await rescheduleProjectSync(prisma, args.projectId, args.cron);
        await updateNextRunFromSchedule(prisma, args.projectId);
      });
      return true;
    },
    triggerProjectSync: async (
      _parent: unknown,
      args: { projectId: string; full?: boolean; accountIds?: string[] | null },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      await runAsTenant(ctx, (prisma) =>
        triggerProjectSync(prisma, args.projectId, {
          full: args.full ?? false,
          accountIds: args.accountIds ?? undefined,
        }),
      );
      return true;
    },
    generateDailySummaries: async (
      _parent: unknown,
      args: { date: string; projectId: string },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);
      return runAsTenant(ctx, (prisma) => generateSummariesForDate(prisma, args.date, args.projectId));
    },
    regenerateDailySummary: async (
      _parent: unknown,
      args: { userId: string; date: string; projectId: string },
      ctx: RequestContext,
    ) => {
      const auth = requireUser(ctx);
      if (auth.role !== "ADMIN" && auth.id !== args.userId) {
        throw new GraphQLError("You can only regenerate your own summary", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      return runAsTenant(ctx, async (prisma) => {
        if (auth.role !== "ADMIN") {
          const membership = await prisma.userProjectLink.count({
            where: { projectId: args.projectId, userId: auth.id },
          });
          if (!membership) {
            throw new GraphQLError("You do not have access to this project", {
              extensions: { code: "FORBIDDEN" },
            });
          }
        }
        return generateSummaryForUser(prisma, args.userId, args.date, args.projectId);
      });
    },
    exportDailySummaries: async (
      _parent: unknown,
      args: { date: string; projectId: string; target: "PDF" | "SLACK" },
      ctx: RequestContext,
    ) => {
      requireAdmin(ctx);

      return runAsTenant(ctx, async (prisma) => {
        if (args.target === "PDF") {
          const pdfPath = path.join(process.cwd(), "exports", `daily-scrum-${args.date}.pdf`);
          await fs.mkdir(path.dirname(pdfPath), { recursive: true });
          const { path: generatedPath } = await exportSummariesToPdf(
            prisma,
            args.date,
            args.projectId,
            pdfPath,
          );
          return {
            success: true,
            message: "Daily scrum PDF generated",
            location: generatedPath,
          };
        }

        if (args.target === "SLACK") {
          const { payload } = await exportSummariesToSlackPayload(
            prisma,
            args.date,
            args.projectId,
          );
          const filePath = path.join(
            process.cwd(),
            "exports",
            `daily-scrum-${args.date}-slack.json`,
          );
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
          return {
            success: true,
            message: "Slack payload generated",
            location: filePath,
          };
        }

        throw new GraphQLError("Unsupported export target", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      });
    },
  },
  JiraProject: {
    site: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.site) return parent.site;
      return runAsTenant(ctx, (prisma) =>
        prisma.jiraProject.findUnique({ where: { id: parent.id } }).site(),
      );
    },
    trackedUsers: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.trackedUsers) return parent.trackedUsers;
      return runAsTenant(ctx, (prisma) =>
        prisma.projectTrackedUser.findMany({
          where: { projectId: parent.id },
          orderBy: { displayName: "asc" },
        }),
      );
    },
    syncJob: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.syncJob) return parent.syncJob;
      return runAsTenant(ctx, (prisma) =>
        prisma.syncJob.findUnique({ where: { projectId: parent.id } }),
      );
    },
    syncStates: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.syncStates) return parent.syncStates;
      return runAsTenant(ctx, (prisma) =>
        prisma.syncState.findMany({
          where: { projectId: parent.id },
          orderBy: { entity: "asc" },
        }),
      );
    },
  },
  Comment: {
    author: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.author) return parent.author;
      return runAsTenant(ctx, (prisma) =>
        prisma.comment.findUnique({ where: { id: parent.id } }).author(),
      );
    },
    issue: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.issue) return parent.issue;
      return runAsTenant(ctx, (prisma) =>
        prisma.comment.findUnique({ where: { id: parent.id } }).issue(),
      );
    },
  },
  Worklog: {
    author: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.author) return parent.author;
      return runAsTenant(ctx, (prisma) =>
        prisma.worklog.findUnique({ where: { id: parent.id } }).author(),
      );
    },
  },
  IssueLink: {
    source: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.source) return parent.source;
      return runAsTenant(ctx, (prisma) =>
        prisma.issueLink.findUnique({ where: { id: parent.id } }).source(),
      );
    },
    target: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.target) return parent.target;
      return runAsTenant(ctx, (prisma) =>
        prisma.issueLink.findUnique({ where: { id: parent.id } }).target(),
      );
    },
  },
  DailySummary: {
    user: (parent: any) => parent.user ?? null,
    trackedUser: async (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.trackedUser) {
        return parent.trackedUser;
      }
      const accountId = parent.primaryAccountId ?? parent.jiraAccountId ?? parent.jiraAccountIds?.[0];
      if (!accountId || !parent.projectId) {
        return null;
      }
      return runAsTenant(ctx, (prisma) =>
        prisma.projectTrackedUser.findFirst({
          where: { projectId: parent.projectId, jiraAccountId: accountId },
        }),
      );
    },
    jiraAccountId: (parent: any) => parent.primaryAccountId ?? parent.jiraAccountId ?? parent.jiraAccountIds?.[0] ?? null,
    project: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.project) return parent.project;
      return runAsTenant(ctx, (prisma) =>
        prisma.jiraProject.findUnique({ where: { id: parent.projectId } }),
      );
    },
  },
  Issue: {
    assignee: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.assignee) return parent.assignee;
      if (!parent.assigneeId) return null;
      return runAsTenant(ctx, (prisma) =>
        prisma.jiraUser.findUnique({ where: { id: parent.assigneeId } }),
      );
    },
    reporter: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.reporter) return parent.reporter;
      if (!parent.reporterId) return null;
      return runAsTenant(ctx, (prisma) =>
        prisma.jiraUser.findUnique({ where: { id: parent.reporterId } }),
      );
    },
    parent: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.parent) return parent.parent;
      if (!parent.parentIssueId) return null;
      return runAsTenant(ctx, (prisma) =>
        prisma.issue.findUnique({ where: { id: parent.parentIssueId } }),
      );
    },
    project: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.project) return parent.project;
      return runAsTenant(ctx, (prisma) =>
        prisma.issue.findUnique({ where: { id: parent.id } }).project(),
      );
    },
    linksOut: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.linksOut) return parent.linksOut;
      return runAsTenant(ctx, (prisma) =>
        prisma.issueLink.findMany({
          where: { sourceIssueId: parent.id },
          include: { target: true, source: true },
        }),
      );
    },
    linksIn: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.linksIn) return parent.linksIn;
      return runAsTenant(ctx, (prisma) =>
        prisma.issueLink.findMany({
          where: { targetIssueId: parent.id },
          include: { target: true, source: true },
        }),
      );
    },
    insight: async (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.insight) {
        try {
          return mapInsightToGraphQL(mapInsightRecord(parent.insight));
        } catch {
          // fall back to recomputation if stored record is malformed
        }
      }
      try {
        const insight = await runAsTenant(ctx, (prisma) =>
          getIssueInsights(prisma, ctx.tenantId, parent.id, "auto" as InsightProvider, false),
        );
        return mapInsightToGraphQL(insight);
      } catch {
        return null;
      }
    },
    comments: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.comments) return parent.comments;
      return runAsTenant(ctx, (prisma) =>
        prisma.comment.findMany({
          where: { issueId: parent.id },
          orderBy: { jiraCreatedAt: "asc" },
        }),
      );
    },
    worklogs: (parent: any, _args: unknown, ctx: RequestContext) => {
      if (parent.worklogs) return parent.worklogs;
      return runAsTenant(ctx, (prisma) =>
        prisma.worklog.findMany({
          where: { issueId: parent.id },
          orderBy: { jiraStartedAt: "asc" },
        }),
      );
    },
  },
};
