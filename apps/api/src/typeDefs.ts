import { gql } from "graphql-tag";

export const typeDefs = gql`
  scalar DateTime
  scalar Date
  scalar JSON

  enum Role {
    ADMIN
    MANAGER
    USER
  }

  enum SyncJobStatus {
    ACTIVE
    PAUSED
    ERROR
  }

  enum SyncStatus {
    IDLE
    RUNNING
    SUCCESS
    FAILED
  }

  enum InsightsProvider {
    AUTO
    OPENAI
    LOCAL
  }

  enum InsightSeverity {
    LOW
    MEDIUM
    HIGH
  }

  type InsightSummary {
    text: String!
    provider: String!
    confidence: Float
  }

  type InsightSentiment {
    label: String!
    score: Float!
    tones: [String!]!
    provider: String!
  }

  type InsightSignal {
    type: String!
    severity: InsightSeverity!
    detail: String!
    metadata: JSON
  }

  type InsightDelta {
    newCommentCount: Int!
    latestCommentAuthors: [String!]!
    newWorklogHours: Float!
  }

  type InsightStageBucket {
    key: String!
    label: String!
    total: Int!
    inProgress: Int!
    done: Int!
    todo: Int!
  }

  type InsightStageProgress {
    current: String!
    breakdown: [InsightStageBucket!]!
  }

  type IssueInsightHistoryEntry {
    id: ID!
    issueId: ID!
    provider: String!
    summary: InsightSummary!
    sentiment: InsightSentiment!
    escalateScore: Float!
    signals: [InsightSignal!]!
    computedAt: DateTime!
    expiresAt: DateTime
    providerMetadata: JSON
    stage: InsightStageProgress
    delta: InsightDelta
    requirement: String
    waitingOn: [String!]!
  }

  type IssueInsight {
    issueId: ID!
    summary: InsightSummary!
    sentiment: InsightSentiment!
    escalateScore: Float!
    signals: [InsightSignal!]!
    computedAt: DateTime!
    expiresAt: DateTime
    providerMetadata: JSON
    provider: String!
    stage: InsightStageProgress
    delta: InsightDelta
    requirement: String
    waitingOn: [String!]!
    history(limit: Int = 5): [IssueInsightHistoryEntry!]!
  }

  type HealthCheck {
    status: String!
    timestamp: String!
  }

  type User {
    id: ID!
    email: String!
    displayName: String!
    phone: String
    role: Role!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type JiraSite {
    id: ID!
    alias: String!
    baseUrl: String!
    adminEmail: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    projects: [JiraProject!]!
  }

  type JiraUser {
    id: ID!
    accountId: String!
    displayName: String!
    email: String
    avatarUrl: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type JiraProject {
    id: ID!
    jiraId: String!
    key: String!
    name: String!
    isActive: Boolean!
    site: JiraSite!
    trackedUsers: [ProjectTrackedUser!]!
    syncJob: SyncJob
    syncStates: [SyncState!]!
    summarySchedule: ProjectSummarySchedule
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ProjectTrackedUser {
    id: ID!
    jiraAccountId: String!
    displayName: String!
    email: String
    avatarUrl: String
    isTracked: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SyncJob {
    id: ID!
    workflowId: String!
    scheduleId: String!
    cronSchedule: String!
    status: SyncJobStatus!
    lastRunAt: DateTime
    nextRunAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ProjectSummarySchedule {
    id: ID!
    frequencyMinutes: Int!
    enabled: Boolean!
    nextRunAt: DateTime
    lastRunAt: DateTime
    lockedUntil: DateTime
    lastError: String
    lastErrorAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SyncState {
    id: ID!
    entity: String!
    lastSyncTime: DateTime
    status: SyncStatus!
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SyncLog {
    id: ID!
    level: String!
    message: String!
    details: JSON
    createdAt: DateTime!
  }

  type Issue {
    id: ID!
    jiraId: String!
    key: String!
    summary: String
    status: String!
    browseUrl: String
    priority: String
    dueDate: DateTime
    resolvedAt: DateTime
    startedAt: DateTime
    statusCategory: String
    assignee: JiraUser
    reporter: JiraUser
    parent: Issue
    project: JiraProject!
    sprint: Sprint
    linksOut: [IssueLink!]!
    linksIn: [IssueLink!]!
    insight: IssueInsight
    jiraCreatedAt: DateTime!
    jiraUpdatedAt: DateTime!
    remoteData: JSON
    comments: [Comment!]!
    worklogs: [Worklog!]!
  }

  type IssueLink {
    id: ID!
    linkType: String!
    direction: String
    url: String
    source: Issue
    target: Issue
  }

  type Comment {
    id: ID!
    jiraId: String!
    author: JiraUser!
    body: String!
    jiraCreatedAt: DateTime!
    jiraUpdatedAt: DateTime
    issue: Issue!
  }

  type Worklog {
    id: ID!
    jiraId: String!
    author: JiraUser!
    description: String
    timeSpent: Int
    jiraStartedAt: DateTime!
    jiraUpdatedAt: DateTime!
  }

  enum DailySummaryStatus {
    ON_TRACK
    DELAYED
    BLOCKED
    OFFLINE
  }

  type IssueStatusCounts {
    todo: Int!
    inProgress: Int!
    backlog: Int!
    done: Int!
    blocked: Int!
  }

  type DailySummaryWorkItem {
    issue: Issue!
    recentWorklogs: [Worklog!]!
    recentComments: [Comment!]!
    totalWorklogHours: Float!
  }

  type DailySummaryWorkItemGroup {
    status: String!
    items: [DailySummaryWorkItem!]!
  }

  type DailySummary {
    id: ID!
    user: User
    trackedUser: ProjectTrackedUser
    jiraAccountId: String
    projectId: ID!
    project: JiraProject!
    date: Date!
    yesterday: String
    today: String
    blockers: String
    createdAt: DateTime!
    updatedAt: DateTime!
    status: DailySummaryStatus!
    isUnavailable: Boolean!
    worklogHours: Float!
    issueCounts: IssueStatusCounts!
    workItems: [DailySummaryWorkItemGroup!]!
  }

  enum TaskSummaryStatus {
    BLOCKED
    IN_PROGRESS
    IN_REVIEW
    DONE
    STALLED
  }

  type TaskTimelineEvent {
    at: DateTime!
    label: String!
    actorId: ID
  }

  type TaskParticipant {
    userId: ID
    displayName: String!
    contributionMinutes: Int!
    commentCount: Int!
    waitingOn: Boolean
  }

  enum TaskLinkedResourceType {
    issue
    pr
    doc
    other
  }

  type TaskLinkedResource {
    label: String!
    url: String!
    type: TaskLinkedResourceType!
  }

  type SentimentSnapshot {
    label: String!
    score: Float!
    provider: String!
  }

  type TaskSummaryPayload {
    issueId: ID!
    issueKey: String!
    issueSummary: String!
    headline: String!
    status: TaskSummaryStatus!
    activityBullets: [String!]!
    nextStep: String
    riskFlags: [String!]!
    totalWorklogMinutes: Int!
    commentCount: Int!
    lastActivityAt: DateTime
    timeline: [TaskTimelineEvent!]!
    participants: [TaskParticipant!]!
    sentiment: SentimentSnapshot
    linkedResources: [TaskLinkedResource!]!
  }

  type TaskSummarySnapshot {
    id: ID!
    projectId: ID!
    issueId: ID!
    userId: ID
    summaryDate: Date!
    runId: String!
    createdAt: DateTime!
    payload: TaskSummaryPayload!
  }

  type UserSummaryMetrics {
    worklogMinutes: Int!
    tasksTouched: Int!
    doneCount: Int!
    blockerCount: Int!
  }

  type UserSummaryIdentity {
    userId: ID
    trackedUserId: ID
    displayName: String!
    jiraAccountId: String
  }

  type UserSummaryPayload {
    identity: UserSummaryIdentity!
    headline: String!
    accomplishments: [UserSummaryHighlight!]!
    inFlight: [UserSummaryInFlight!]!
    blockers: [UserSummaryBlocker!]!
    focusNext: String
    activityMetrics: UserSummaryMetrics!
    riskFlags: [String!]!
    collaborationNotes: [CollaborationNote!]
    pendingDecisions: PendingDecisionSet
    mood: MoodSnapshot
  }

  type CollaborationNote {
    partnerUserId: ID
    partnerDisplayName: String
    issueId: ID
    issueKey: String
    note: String!
  }

  type PendingDecision {
    issueId: ID!
    issueKey: String!
    description: String!
  }

  type PendingDecisionSet {
    ownedByUser: [PendingDecision!]!
    waitingOnOthers: [PendingDecision!]!
  }

  type MoodSnapshot {
    label: String!
    score: Float!
    rationale: String
  }

  type UserSummaryHighlight {
    issueId: ID!
    issueKey: String!
    text: String!
  }

  type UserSummaryInFlight {
    issueId: ID!
    issueKey: String!
    status: TaskSummaryStatus!
    note: String!
  }

  type UserSummaryBlocker {
    issueId: ID!
    issueKey: String!
    description: String!
    severity: String!
  }

  type UserSummarySnapshot {
    id: ID!
    projectId: ID!
    userId: ID
    summaryDate: Date!
    runId: String!
    taskSummaryIds: [ID!]!
    createdAt: DateTime!
    payload: UserSummaryPayload!
    narrative: String
    narrativeHash: String
    narrativeGeneratedAt: DateTime
    richNarratives: JSON
    needsNarrativeRefresh: Boolean!
    narrativeRefreshRequestedAt: DateTime
    narrativeRefreshLockedUntil: DateTime
    narrativeRefreshAttempts: Int!
    lastNarrativeError: String
  }

  type ProjectSummaryPayload {
    executiveBrief: String!
    topHighlights: [ProjectSummaryHighlight!]!
    criticalBlockers: [ProjectSummaryBlocker!]!
    atRiskWork: [ProjectRiskTally!]!
    teamHealthSnapshot: ProjectTeamHealth!
    unassignedWatchlist: [ProjectWatchIssue!]!
    callsToAction: [ProjectCallToAction!]!
    atRiskDetails: [ProjectAtRiskDetail!]!
    workspaceContext: String
  }

  type ProjectCallToAction {
    text: String!
    severity: ProjectCallToActionSeverity!
  }

  enum ProjectCallToActionSeverity {
    info
    warning
    critical
  }

  type ProjectAtRiskDetail {
    issueId: ID!
    issueKey: String!
    reason: String!
    severity: ProjectCallToActionSeverity!
  }

  type ProjectSummaryHighlight {
    issueId: ID!
    issueKey: String!
    userId: ID
    text: String!
  }

  type ProjectSummaryBlocker {
    issueId: ID!
    issueKey: String!
    userId: ID
    description: String!
    severity: String!
  }

  type ProjectRiskTally {
    flag: String!
    count: Int!
  }

  type ProjectTeamHealth {
    activeUsers: Int!
    trackedUsers: Int!
    idleUsers: Int!
    offlineUsers: Int!
    totalWorklogMinutes: Int!
    doneCount: Int!
    blockerCount: Int!
    idleRate: Float!
    blockerRate: Float!
  }

  type ProjectWatchIssue {
    issueId: ID!
    issueKey: String!
    issueSummary: String!
  }

  type UserAvailability {
    id: ID!
    projectId: ID
    jiraAccountId: String!
    startDate: DateTime!
    endDate: DateTime!
    type: String!
    source: String!
    reason: String
    createdAt: DateTime!
    updatedAt: DateTime!
    project: JiraProject
  }

  type ProjectSummarySnapshot {
    id: ID!
    projectId: ID!
    summaryDate: Date!
    runId: String!
    userSummaryIds: [ID!]!
    createdAt: DateTime!
    payload: ProjectSummaryPayload!
    narrative: String
    narrativeHash: String
    narrativeGeneratedAt: DateTime
    richNarratives: JSON
    needsNarrativeRefresh: Boolean!
    narrativeRefreshRequestedAt: DateTime
    narrativeRefreshLockedUntil: DateTime
    narrativeRefreshAttempts: Int!
    lastNarrativeError: String
  }

  type ProjectDailySummary {
    projectSummary: ProjectSummarySnapshot!
    userSummaries: [UserSummarySnapshot!]!
    taskSummaries: [TaskSummarySnapshot!]!
  }

  type FocusDateRange {
    start: Date!
    end: Date!
  }

  type WorklogBucket {
    date: Date!
    hours: Float!
  }

  type FocusDashboardMetrics {
    totalIssues: Int!
    inProgressIssues: Int!
    blockerIssues: Int!
    hoursLogged: Float!
    averageHoursPerDay: Float!
  }

  enum FocusIssueEventType {
    COMMENT
    WORKLOG
  }

  type FocusIssueEvent {
    id: ID!
    type: FocusIssueEventType!
    occurredAt: DateTime!
    author: JiraUser
    body: String
    hours: Float
  }

  enum NarrativeScope {
    PROJECT
    USER
  }

  type NarrativeRefreshResult {
    queuedProject: Int!
    queuedUser: Int!
  }

  type FocusIssueEventGroup {
    issueId: ID!
    events: [FocusIssueEvent!]!
  }

  type FocusBoardWarning {
    code: String!
    message: String!
  }

  type FocusBoard {
    projects: [JiraProject!]!
    issues: [Issue!]!
    blockers: [Issue!]!
    comments: [Comment!]!
    issueEvents: [FocusIssueEventGroup!]!
    worklogTimeline: [WorklogBucket!]!
    metrics: FocusDashboardMetrics!
    dateRange: FocusDateRange!
    updatedAt: DateTime!
    warnings: [FocusBoardWarning!]!
  }

  type ManagerSummaryTotals {
    committedIssues: Int!
    completedIssues: Int!
    completionPercent: Float
    velocity: Float!
    activeBlockers: Int!
    riskLevel: String!
    riskReason: String
    timeProgressPercent: Float
  }

  type ManagerSummaryKpi {
    id: String!
    label: String!
    value: Float
    formattedValue: String
    subtitle: String
    delta: Float
    trendLabel: String
  }

  type ManagerSummaryBlocker {
    issue: Issue!
    assignee: JiraUser
    status: String
    priority: String
    daysOpen: Int!
  }

  type ManagerSummaryNarrative {
    headline: String!
    body: String!
    highlights: [String!]!
  }

  type ManagerSummary {
    project: JiraProject!
    sprint: Sprint
    range: FocusDateRange!
    totals: ManagerSummaryTotals!
    kpis: [ManagerSummaryKpi!]!
    blockers: [ManagerSummaryBlocker!]!
    aiSummary: ManagerSummaryNarrative
    warnings: [FocusBoardWarning!]!
    updatedAt: DateTime!
  }

  type Sprint {
    id: ID!
    jiraId: String!
    name: String!
    state: String!
    startDate: DateTime
    endDate: DateTime
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input CreateUserInput {
    email: String!
    displayName: String!
    phone: String
    role: Role = USER
    sendInvite: Boolean = true
  }

  input UpdateUserRoleInput {
    userId: ID!
    role: Role!
  }

  input ResetUserPasswordInput {
    userId: ID!
  }

  input RegisterJiraSiteInput {
    alias: String!
    baseUrl: String!
    adminEmail: String!
    apiToken: String!
  }

  input RegisterJiraProjectInput {
    siteId: ID!
    jiraId: String!
    key: String!
    name: String!
  }

  input MapUserInput {
    userId: ID!
    projectId: ID!
    jiraAccountId: String!
  }

  input UpdateProjectSummaryScheduleInput {
    enabled: Boolean
    frequencyMinutes: Int
  }

  input DateRangeInput {
    start: Date!
    end: Date!
  }

  input CreateUserAvailabilityInput {
    projectId: ID
    jiraAccountId: String!
    startDate: DateTime!
    endDate: DateTime!
    type: String
    reason: String
  }

  input ProjectTrackedUserInput {
    jiraAccountId: String!
    displayName: String!
    email: String
    avatarUrl: String
    isTracked: Boolean = true
  }

  input SetProjectTrackedUsersInput {
    projectId: ID!
    users: [ProjectTrackedUserInput!]!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Query {
    health: HealthCheck!
    me: User
    users: [User!]!
    jiraSites: [JiraSite!]!
    jiraProjects(siteId: ID!): [JiraProject!]!
    userProjectLinks(userId: ID!): [UserProjectLink!]!
    jiraProjectOptions(siteId: ID!): [JiraProjectOption!]!
    jiraProjectUserOptions(siteId: ID!, projectKey: String!, forceRefresh: Boolean = false): [JiraUserOption!]!
    projectTrackedUsers(projectId: ID!): [ProjectTrackedUser!]!
    dailySummaries(date: Date!, projectId: ID!): [DailySummary!]!
    projectDailySummaries(projectId: ID!, range: DateRangeInput!, includeTasks: Boolean = false): [ProjectDailySummary!]!
    latestProjectSummary(projectId: ID!): ProjectDailySummary
    scrumProjects: [JiraProject!]!
    focusBoard(projectIds: [ID!], start: Date, end: Date): FocusBoard!
    syncStates(projectId: ID!): [SyncState!]!
    syncLogs(projectId: ID!, limit: Int = 50): [SyncLog!]!
    projectSprints(projectId: ID!): [Sprint!]!
    managerSummary(projectId: ID, sprintId: ID): ManagerSummary!
    issueInsights(issueId: ID!, provider: InsightsProvider = AUTO, refresh: Boolean = false): IssueInsight!
    userAvailability(accountId: String, from: Date, to: Date): [UserAvailability!]!
  }

  type JiraProjectOption {
    id: String!
    key: String!
    name: String!
    projectTypeKey: String
    lead: String
  }

  type JiraUserOption {
    accountId: String!
    displayName: String!
    email: String
    avatarUrl: String
  }

  type UserProjectLink {
    id: ID!
    jiraAccountId: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    user: User!
    project: JiraProject!
  }

  enum SummaryExportTarget {
    PDF
    SLACK
  }

  type SummaryExportResult {
    success: Boolean!
    message: String!
    location: String
  }

  type Mutation {
    login(input: LoginInput!): AuthPayload!
    createUser(input: CreateUserInput!): User!
    resetUserPassword(input: ResetUserPasswordInput!): Boolean!
    updateUserRole(input: UpdateUserRoleInput!): User!
    registerJiraSite(input: RegisterJiraSiteInput!): JiraSite!
    registerJiraProject(input: RegisterJiraProjectInput!): JiraProject!
    mapUserToProject(input: MapUserInput!): UserProjectLink!
    unlinkUserFromProject(linkId: ID!): Boolean!
    setProjectTrackedUsers(input: SetProjectTrackedUsersInput!): [ProjectTrackedUser!]!
    startProjectSync(projectId: ID!, full: Boolean = false): Boolean!
    pauseProjectSync(projectId: ID!): Boolean!
    resumeProjectSync(projectId: ID!): Boolean!
    rescheduleProjectSync(projectId: ID!, cron: String!): Boolean!
    triggerProjectSync(projectId: ID!, full: Boolean = false, accountIds: [String!], days: Int): Boolean!
    createUserAvailability(input: CreateUserAvailabilityInput!): UserAvailability!
    deleteUserAvailability(id: ID!): Boolean!
    requestNarrativeRefresh(
      projectId: ID!
      scope: NarrativeScope!
      snapshotId: ID
      persona: String
      days: Int
      force: Boolean
    ): NarrativeRefreshResult!
    generateDailySummaries(date: Date!, projectId: ID!): [DailySummary!]!
    regenerateDailySummary(userId: ID!, date: Date!, projectId: ID!): DailySummary!
    exportDailySummaries(date: Date!, projectId: ID!, target: SummaryExportTarget!): SummaryExportResult!
    regenerateProjectSummary(projectId: ID!, date: Date): ProjectDailySummary!
    backfillProjectSummaries(projectId: ID!, days: Int = 15): ProjectBackfillResult!
    updateProjectSummarySchedule(projectId: ID!, input: UpdateProjectSummaryScheduleInput!): ProjectSummarySchedule!
    triggerProjectSummaryAutomation(projectId: ID!): Boolean!
    sendDailyNewsletter(date: Date, projectId: ID): Boolean!
  }

  type ProjectBackfillResult {
    projectId: ID!
    daysRequested: Int!
    runsGenerated: Int!
  }
`;
