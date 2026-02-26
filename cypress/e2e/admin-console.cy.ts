const TOKEN_STORAGE_KEY = "jira-plus-plus/token";
const USER_STORAGE_KEY = "jira-plus-plus/user";

interface SiteState {
  id: string;
  alias: string;
  baseUrl: string;
  adminEmail: string;
  createdAt: string;
  projects: ProjectState[];
}

interface ProjectState {
  id: string;
  siteId: string;
  siteAlias: string;
  jiraId: string;
  key: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  trackedUsers: Array<{
    id: string;
    jiraAccountId: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
    isTracked: boolean;
  }>;
  syncJob: {
    id: string;
    status: string;
    cronSchedule: string;
    lastRunAt: string | null;
    nextRunAt: string | null;
  } | null;
  syncStates: Array<{
    id: string;
    entity: string;
    status: string;
    lastSyncTime: string | null;
  }>;
}

interface UserState {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  role: "ADMIN" | "USER" | "MANAGER";
  createdAt: string;
}

interface MappingState {
  id: string;
  userId: string;
  jiraAccountId: string;
  projectId: string;
  createdAt: string;
}

type AssignableState = Record<string, Array<{ accountId: string; displayName: string; email?: string | null }>>;
type ProjectOptionState = Record<string, Array<{ id: string; key: string; name: string }>>;
type SyncLogState = Record<string, Array<{ id: string; level: string; message: string; createdAt: string }>>;

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function iso(): string {
  return new Date().toISOString();
}

describe("Admin Console", () => {
  const adminAuth = {
    id: "admin-1",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "ADMIN" as const,
  };

  const nonAdminAuth = {
    id: "user-1",
    email: "user@example.com",
    displayName: "Regular User",
    role: "USER" as const,
  };

  interface AdminState {
    failSiteOnce: boolean;
    sites: SiteState[];
    users: UserState[];
    mappings: MappingState[];
    projectOptions: ProjectOptionState;
    assignable: AssignableState;
    syncLogs: SyncLogState;
  }

  const buildInitialState = (): AdminState => {
    const projectId = "project-1";
    const siteId = "site-1";
    return {
      failSiteOnce: false,
      sites: [
        {
          id: siteId,
          alias: "Primary Site",
          baseUrl: "https://primary.atlassian.net",
          adminEmail: "jira-admin@primary.com",
          createdAt: iso(),
          projects: [
            {
              id: projectId,
              siteId,
              siteAlias: "Primary Site",
              jiraId: "10000",
              key: "PRM",
              name: "Primary Delivery",
              isActive: true,
              createdAt: iso(),
              trackedUsers: [
                {
                  id: "tracked-1",
                  jiraAccountId: "acct-1",
                  displayName: "Alex Jira",
                  email: "alex@jira.com",
                  avatarUrl: null,
                  isTracked: true,
                },
              ],
              syncJob: {
                id: "job-1",
                status: "ACTIVE",
                cronSchedule: "*/15 * * * *",
                lastRunAt: iso(),
                nextRunAt: iso(),
              },
              syncStates: [
                { id: "state-1", entity: "issue", status: "SUCCESS", lastSyncTime: iso() },
                { id: "state-2", entity: "comment", status: "SUCCESS", lastSyncTime: iso() },
              ],
            },
          ],
        },
      ],
      users: [
        { id: adminAuth.id, email: adminAuth.email, displayName: adminAuth.displayName, phone: null, role: "ADMIN", createdAt: iso() },
        { id: "user-2", email: "lead@example.com", displayName: "Delivery Lead", phone: "+1 555 0001", role: "USER", createdAt: iso() },
      ],
      mappings: [],
      projectOptions: {
        [siteId]: [
          { id: "20000", key: "OPS", name: "Operations" },
          { id: "20001", key: "ANL", name: "Analytics" },
        ],
      },
      assignable: {
        [`${siteId}:${projectId}`]: [
          { accountId: "acct-1", displayName: "Alex Jira", email: "alex@jira.com" },
          { accountId: "acct-2", displayName: "Bailey Blocker", email: "bailey@jira.com" },
        ],
      },
      syncLogs: {
        [projectId]: [
          { id: nextId("log"), level: "INFO", message: "Sync completed successfully", createdAt: iso() },
          { id: nextId("log"), level: "WARN", message: "Encountered rate limit, retry scheduled", createdAt: iso() },
        ],
      },
    };
  };

  let state: AdminState;

  const initialiseAdminConsole = () => {
    state = buildInitialState();

    cy.mockGraphql({
      AdminConsoleData: () => ({
        data: {
          users: state.users,
          jiraSites: state.sites.map((site) => ({
            ...site,
            projects: site.projects.map((project) => ({
              id: project.id,
              jiraId: project.jiraId,
              key: project.key,
              name: project.name,
              isActive: project.isActive,
              createdAt: project.createdAt,
              trackedUsers: project.trackedUsers,
              syncJob: project.syncJob,
              syncStates: project.syncStates,
            })),
          })),
        },
      }),
      UserProjectLinks: (req) => {
        const { userId } = req.body.variables;
        return {
          data: {
            userProjectLinks: state.mappings
              .filter((link) => link.userId === userId)
              .map((link) => {
                const { project, site } = findProject(link.projectId);
                return {
                  id: link.id,
                  jiraAccountId: link.jiraAccountId,
                  createdAt: link.createdAt,
                  project: {
                    id: project.id,
                    key: project.key,
                    name: project.name,
                    site: { id: site.id, alias: site.alias },
                  },
                };
              }),
          },
        };
      },
      RegisterJiraSite: (req) => {
        const { input } = req.body.variables;
        if (state.failSiteOnce) {
          state.failSiteOnce = false;
          return { errors: [{ message: "Unable to verify base URL" }] };
        }
        const newSite: SiteState = {
          id: nextId("site"),
          alias: input.alias,
          baseUrl: input.baseUrl,
          adminEmail: input.adminEmail,
          createdAt: iso(),
          projects: [],
        };
        state.sites.push(newSite);
        return { data: { registerJiraSite: { id: newSite.id, alias: newSite.alias } } };
      },
      RegisterJiraProject: (req) => {
        const { input } = req.body.variables;
        const site = state.sites.find((candidate) => candidate.id === input.siteId);
        if (!site) {
          return { errors: [{ message: "Site not found" }] };
        }
        const newProject: ProjectState = {
          id: nextId("project"),
          siteId: site.id,
          siteAlias: site.alias,
          jiraId: input.jiraId,
          key: input.key,
          name: input.name,
          isActive: true,
          createdAt: iso(),
          trackedUsers: [],
          syncJob: {
            id: nextId("job"),
            status: "ACTIVE",
            cronSchedule: "*/15 * * * *",
            lastRunAt: iso(),
            nextRunAt: iso(),
          },
          syncStates: [
            { id: nextId("state"), entity: "issue", status: "SUCCESS", lastSyncTime: iso() },
          ],
        };
        site.projects.push(newProject);
        // seed assignable/sync log entries
        state.assignable[`${site.id}:${newProject.id}`] = [
          { accountId: "acct-3", displayName: "Casey Creator", email: "casey@jira.com" },
        ];
        state.syncLogs[newProject.id] = [
          { id: nextId("log"), level: "INFO", message: "Sync pending", createdAt: iso() },
        ];
        return { data: { registerJiraProject: { id: newProject.id, name: newProject.name } } };
      },
      CreateUser: (req) => {
        const { input } = req.body.variables;
        const newUser: UserState = {
          id: nextId("user"),
          email: input.email,
          displayName: input.displayName,
          phone: input.phone ?? null,
          role: input.role,
          createdAt: iso(),
        };
        state.users.push(newUser);
        return {
          data: {
            createUser: {
              id: newUser.id,
              email: newUser.email,
              displayName: newUser.displayName,
              phone: newUser.phone,
              role: newUser.role,
            },
          },
        };
      },
      MapUserToProject: (req) => {
        const { input } = req.body.variables;
        const newLink: MappingState = {
          id: nextId("link"),
          userId: input.userId,
          projectId: input.projectId,
          jiraAccountId: input.jiraAccountId,
          createdAt: iso(),
        };
        state.mappings.push(newLink);
        return { data: { mapUserToProject: { id: newLink.id, jiraAccountId: newLink.jiraAccountId } } };
      },
      UnlinkUserFromProject: (req) => {
        const { linkId } = req.body.variables;
        state.mappings = state.mappings.filter((link) => link.id !== linkId);
        return { data: { unlinkUserFromProject: true } };
      },
      JiraProjectOptions: (req) => {
        const { siteId } = req.body.variables;
        return {
          data: {
            jiraProjectOptions: state.projectOptions[siteId] ?? [],
          },
        };
      },
      JiraProjectUserOptions: (req) => {
        const { siteId, projectKey } = req.body.variables;
        const project = findProjectByKey(siteId, projectKey);
        const key = project ? `${siteId}:${project.project.id}` : `${siteId}:${projectKey}`;
        const options = state.assignable[key] ?? [];
        return {
          data: {
            jiraProjectUserOptions: options.map((user) => ({
              accountId: user.accountId,
              displayName: user.displayName,
              email: user.email ?? null,
              avatarUrl: null,
            })),
          },
        };
      },
      ProjectTrackedUsers: (req) => {
        const { projectId } = req.body.variables;
        const { project } = findProject(projectId);
        return { data: { projectTrackedUsers: project.trackedUsers } };
      },
      SetProjectTrackedUsers: (req) => {
        const { input } = req.body.variables;
        const { project } = findProject(input.projectId);
        project.trackedUsers = input.users.map((user: TrackedUserInput) => ({
          id: nextId("tracked"),
          jiraAccountId: user.jiraAccountId,
          displayName: user.displayName,
          email: user.email ?? null,
          avatarUrl: user.avatarUrl ?? null,
          isTracked: true,
        }));
        return { data: { setProjectTrackedUsers: project.trackedUsers } };
      },
      SyncLogs: (req) => {
        const { projectId } = req.body.variables;
        return { data: { syncLogs: state.syncLogs[projectId] ?? [] } };
      },
      StartProjectSync: (req) => {
        updateSyncJob(req.body.variables.projectId, { status: "ACTIVE", lastRunAt: iso() });
        appendSyncLog(req.body.variables.projectId, "INFO", "Manual sync started");
        return { data: { startProjectSync: true } };
      },
      PauseProjectSync: (req) => {
        updateSyncJob(req.body.variables.projectId, { status: "PAUSED" });
        appendSyncLog(req.body.variables.projectId, "INFO", "Schedule paused");
        return { data: { pauseProjectSync: true } };
      },
      ResumeProjectSync: (req) => {
        updateSyncJob(req.body.variables.projectId, { status: "ACTIVE" });
        appendSyncLog(req.body.variables.projectId, "INFO", "Schedule resumed");
        return { data: { resumeProjectSync: true } };
      },
      RescheduleProjectSync: (req) => {
        updateSyncJob(req.body.variables.projectId, { cronSchedule: req.body.variables.cron });
        appendSyncLog(req.body.variables.projectId, "INFO", `Cron updated to ${req.body.variables.cron}`);
        return { data: { rescheduleProjectSync: true } };
      },
      TriggerProjectSync: (req) => {
        appendSyncLog(
          req.body.variables.projectId,
          "INFO",
          req.body.variables.full ? "Full resync triggered" : "Incremental sync triggered",
        );
        return { data: { triggerProjectSync: true } };
      },
      SendUserInviteEmail: () => ({ data: { sendUserInviteEmail: true } }),
      UpdateJiraSite: (req) => {
        const { input } = req.body.variables;
        const site = state.sites.find((s) => s.id === input.id);
        if (!site) return { errors: [{ message: "Site not found" }] };
        if (input.alias) site.alias = input.alias;
        if (input.adminEmail) site.adminEmail = input.adminEmail;
        return { data: { updateJiraSite: { id: site.id, alias: site.alias, adminEmail: site.adminEmail } } };
      },
      TestJiraConnection: () => ({ data: { testJiraConnection: true } }),
      DeleteJiraSite: (req) => {
        const { id } = req.body.variables;
        state.sites = state.sites.filter((s) => s.id !== id);
        return { data: { deleteJiraSite: true } };
      },
    });
  };

  function findProject(projectId: string): { project: ProjectState; site: SiteState } {
    for (const site of state.sites) {
      const project = site.projects.find((candidate) => candidate.id === projectId);
      if (project) {
        return { project, site };
      }
    }
    throw new Error(`Project ${projectId} not found`);
  }

  function findProjectByKey(siteId: string, projectKey: string) {
    const site = state.sites.find((candidate) => candidate.id === siteId);
    if (!site) return null;
    const project = site.projects.find((candidate) => candidate.key === projectKey);
    if (!project) return null;
    return { site, project };
  }

  function updateSyncJob(projectId: string, updates: Partial<ProjectState["syncJob"]>): void {
    const { project } = findProject(projectId);
    if (!project.syncJob) {
      project.syncJob = {
        id: nextId("job"),
        status: "ACTIVE",
        cronSchedule: "*/15 * * * *",
        lastRunAt: null,
        nextRunAt: null,
      };
    }
    project.syncJob = {
      ...project.syncJob,
      ...updates,
    };
  }

  function appendSyncLog(projectId: string, level: string, message: string): void {
    const logs = state.syncLogs[projectId] ?? [];
    logs.unshift({
      id: nextId("log"),
      level,
      message,
      createdAt: iso(),
    });
    state.syncLogs[projectId] = logs;
  }

  const visitAdmin = () => {
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem(TOKEN_STORAGE_KEY, "admin-token");
        win.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(adminAuth));
      },
    });
    cy.visit("/admin");
    cy.wait("@gqlAdminConsoleData");
  };

  it("redirects non-admin users away from /admin", () => {
    cy.mockGraphql({});
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem(TOKEN_STORAGE_KEY, "user-token");
        win.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nonAdminAuth));
      },
    });
    cy.visit("/admin");
    cy.location("pathname").should("eq", "/");
  });

  describe("admin flows", () => {
    beforeEach(() => {
      initialiseAdminConsole();
      visitAdmin();
    });

    it("registers a Jira site and surfaces validation errors", () => {
      state.sites = [];
      state.failSiteOnce = true;
      cy.visit("/admin");
      cy.wait("@gqlAdminConsoleData");

      cy.contains("button", "Add Jira site").click();
      cy.contains("Register Jira site");
      cy.get("input[placeholder='Acme Corp']").type("New Site");
      cy.get("input[placeholder='https://acme.atlassian.net']").type("https://new.atlassian.net");
      cy.get("input[placeholder='admin@acme.com']").type("ops@new.com");
      cy.get("input[placeholder='••••••••']").type("token123");
      cy.contains("button", "Register site").click();
      cy.contains("Unable to verify base URL");

      cy.contains("button", "Register site").click();
      cy.wait("@gqlRegisterJiraSite");
      cy.wait("@gqlAdminConsoleData");
      cy.contains("td", "New Site").should("be.visible");
    });

    it("registers a Jira project via discovery and manual entry fallback", () => {
      cy.contains("button", "Register project").click();
      cy.contains("Register Jira project");
      cy.wait("@gqlJiraProjectOptions");
      cy.get("select").eq(1).select("Operations (OPS)");
      cy.get("input[placeholder='10001']").should("have.value", "20000");
      cy.get("input[placeholder='PROJ']").should("have.value", "OPS");
      cy.get("input[placeholder='Project Mars']").should("have.value", "Operations");

      cy.get("select").eq(1).select("Manual entry");
      cy.get("input[placeholder='10001']").clear().type("30000");
      cy.get("input[placeholder='PROJ']").clear().type("BETA");
      cy.get("input[placeholder='Project Mars']").clear().type("Beta Project");
      cy.contains("button", "Register project").click();
      cy.wait("@gqlRegisterJiraProject");
      cy.wait("@gqlAdminConsoleData");
      cy.contains("td", "Beta Project").should("be.visible");
    });

    it("manages tracked Jira users for a project", () => {
      cy.contains("button", "Manage Jira users").click();
      cy.contains("Manage Jira users");
      cy.wait("@gqlProjectTrackedUsers");
      cy.wait("@gqlJiraProjectUserOptions");
      cy.contains("li", "Bailey Blocker").find("input[type='checkbox']").check({ force: true });
      cy.contains("button", "Save selection").click();
      cy.wait("@gqlSetProjectTrackedUsers");
      cy.wait("@gqlAdminConsoleData");
      cy.contains("tr", "Primary Delivery").within(() => {
        cy.get("td").eq(4).should("contain.text", "2");
      });
    });

    it("controls sync schedules and reviews sync logs", () => {
      cy.contains("button", "Manage sync").click();
      cy.contains("Manage sync");
      cy.wait("@gqlSyncLogs");
      cy.contains("Sync completed successfully").should("be.visible");

      cy.contains("button", "Start schedule & run").click();
      cy.wait("@gqlStartProjectSync");
      cy.wait("@gqlAdminConsoleData");

      cy.contains("button", "Manage sync").click();
      cy.wait("@gqlSyncLogs");
      cy.contains("Manual sync started").should("be.visible");

      cy.contains("button", "Pause schedule").click();
      cy.wait("@gqlPauseProjectSync");
      cy.wait("@gqlAdminConsoleData");

      cy.contains("button", "Manage sync").click();
      cy.wait("@gqlSyncLogs");
      cy.contains("Status: PAUSED").should("be.visible");
      cy.contains("button", "Resume schedule").click();
      cy.wait("@gqlResumeProjectSync");
      cy.wait("@gqlAdminConsoleData");

      cy.contains("button", "Manage sync").click();
      cy.wait("@gqlSyncLogs");
      cy.contains("Status: ACTIVE").should("be.visible");
      cy.contains("button", "Trigger incremental").click();
      cy.wait("@gqlTriggerProjectSync");
      cy.wait("@gqlAdminConsoleData");

      cy.contains("button", "Manage sync").click();
      cy.wait("@gqlSyncLogs");
      cy.contains("Incremental sync triggered").should("be.visible");
      cy.get("input[placeholder='*/15 * * * *']").clear().type("0 */2 * * *");
      cy.contains("form", "Cron schedule").within(() => {
        cy.contains("button", "Update").click();
      });
      cy.wait("@gqlRescheduleProjectSync");
      cy.wait("@gqlAdminConsoleData");
    });

    it("imports Jira users as platform accounts", () => {
      cy.contains("button", "Import Jira users").click();
      cy.contains("Import Jira users");
      cy.wait("@gqlJiraProjectUserOptions");

      cy.get("table thead input[type='checkbox']").uncheck({ force: true });
      cy.contains("tr", "Bailey Blocker").find("input[type='checkbox']").check({ force: true });
      cy.contains("tr", "Bailey Blocker")
        .find("input[type='tel']")
        .clear()
        .type("+1 555 0102");

      cy.contains("button", "Import 1 user").click();
      cy.wait("@gqlCreateUser");
      cy.wait("@gqlMapUserToProject");
      cy.wait("@gqlSendUserInviteEmail");
      cy.wait("@gqlAdminConsoleData");

      cy.contains("td", "Bailey Blocker")
        .parent("tr")
        .within(() => {
          cy.contains("td", "+1 555 0102").should("exist");
        });

      cy.contains("section", "Account mapping").within(() => {
        cy.get("select")
          .first()
          .select("Bailey Blocker (bailey@jira.com)");
      });
      cy.wait("@gqlUserProjectLinks");
      cy.contains("td", "acct-2").should("exist");
    });

    it("invites a user and maps/unlinks Jira accounts", () => {
      cy.contains("button", "Invite user").click();
      cy.get("input[placeholder='teammate@acme.com']").type("analyst@example.com");
      cy.get("input[placeholder='Taylor Jenkins']").type("Taylor Jenkins");
      cy.get("input[placeholder='Temporary password']").type("TempPass!123");
      cy.get("select").last().select("ADMIN");
      cy.contains("button", "Invite user").click();
      cy.wait("@gqlCreateUser");
      cy.wait("@gqlAdminConsoleData");
      cy.contains("td", "Taylor Jenkins").should("be.visible");

      cy.contains("section", "Account mapping").within(() => {
        cy.get("select").first().select("Taylor Jenkins (analyst@example.com)");
      });
      cy.wait("@gqlUserProjectLinks");
      cy.contains("button", "Map Jira account").click();
      cy.contains("Map Jira account");
      cy.get("input[placeholder='557058:abcd-1234']").clear().type("acct-1");
      cy.contains("button", "Save mapping").click();
      cy.wait("@gqlMapUserToProject");
      cy.wait("@gqlAdminConsoleData");
      cy.wait("@gqlUserProjectLinks");
      cy.contains("td", "acct-1").should("be.visible");

      cy.contains("button", "Remove").click();
      cy.wait("@gqlUnlinkUserFromProject");
      cy.wait("@gqlUserProjectLinks");
      cy.contains("No mappings yet for this user.").should("exist");
    });
  });
});
