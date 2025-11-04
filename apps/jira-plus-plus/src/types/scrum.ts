export type DailySummaryStatus = "ON_TRACK" | "DELAYED" | "BLOCKED" | "OFFLINE";

export interface IssueStatusCounts {
  todo: number;
  inProgress: number;
  backlog: number;
  done: number;
  blocked: number;
}

export interface JiraUserRef {
  id: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface WorklogEntry {
  id: string;
  description?: string | null;
  timeSpent?: number | null;
  jiraStartedAt: string;
  author: JiraUserRef;
}

export interface CommentEntry {
  id: string;
  body: string;
  jiraCreatedAt: string;
  author: JiraUserRef;
}

export interface IssueRef {
  id: string;
  key: string;
  summary?: string | null;
  status: string;
  statusCategory?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  resolvedAt?: string | null;
  startedAt?: string | null;
  jiraUpdatedAt: string;
  browseUrl?: string | null;
  assignee?: JiraUserRef | null;
  reporter?: JiraUserRef | null;
  parent?: {
    id: string;
    key: string;
    summary?: string | null;
    status?: string | null;
  } | null;
  linksOut?: IssueLinkRef[];
  linksIn?: IssueLinkRef[];
  insight?: IssueInsight | null;
  project?: {
    id: string;
    key: string;
    name: string;
  } | null;
}

export interface IssueLinkRef {
  id: string;
  linkType: string;
  direction?: string | null;
  url?: string | null;
  target?: {
    id: string;
    key: string;
    summary?: string | null;
    status?: string | null;
    statusCategory?: string | null;
    priority?: string | null;
  } | null;
  source?: {
    id: string;
    key: string;
    summary?: string | null;
    status?: string | null;
    statusCategory?: string | null;
    priority?: string | null;
  } | null;
}

export interface IssueInsight {
  summary: {
    text: string;
    provider: string;
    confidence?: number | null;
  } | null;
  sentiment: {
    label: string;
    score: number;
    tones: string[];
    provider: string;
  } | null;
  escalateScore: number;
  signals: InsightSignal[];
  computedAt: string;
  expiresAt?: string | null;
  providerMetadata?: Record<string, unknown> | null;
  provider: string;
  requirement?: string | null;
  stage?: {
    current: string;
    breakdown: Array<{
      key: string;
      label: string;
      total: number;
      inProgress: number;
      done: number;
      todo: number;
    }>;
  } | null;
  delta?: {
    newCommentCount: number;
    latestCommentAuthors: string[];
    newWorklogHours: number;
  } | null;
  waitingOn?: string[];
  history?: IssueInsightHistoryEntry[];
}

export interface IssueInsightHistoryEntry {
  id: string;
  issueId: string;
  summary: IssueInsight["summary"];
  sentiment: IssueInsight["sentiment"];
  escalateScore: number;
  signals: InsightSignal[];
  computedAt: string;
  expiresAt?: string | null;
  providerMetadata?: Record<string, unknown> | null;
  provider: string;
  stage?: IssueInsight["stage"];
  delta?: IssueInsight["delta"];
  requirement?: string | null;
  waitingOn?: string[];
}

export interface InsightSignal {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  detail: string;
  metadata?: Record<string, unknown> | null;
}

export interface NarrativeVariant {
  text: string;
  generatedAt: string;
  hash: string;
  model: string;
  tokens?: {
    prompt: number;
    completion: number;
  } | null;
  structured?: ProjectNarrativeStructured | UserNarrativeStructured | null;
}

export type NarrativeTone = "positive" | "neutral" | "negative";

export interface ProjectNarrativeStructured {
  story: string;
  summaryBullets: string[];
  collaboration: string[];
  risks: string[];
  callsToAction: string[];
  tone: NarrativeTone;
}

export interface UserNarrativeStructured {
  story: string;
  spotlight: string[];
  risks: string[];
  nextMoves: string[];
  tone: NarrativeTone;
}

export interface DailySummaryWorkItem {
  issue: IssueRef;
  totalWorklogHours: number;
  recentWorklogs: WorklogEntry[];
  recentComments: CommentEntry[];
}

export interface DailySummaryWorkItemGroup {
  status: string;
  items: DailySummaryWorkItem[];
}

export interface DailySummaryRecord {
  id: string;
  projectId: string;
  project: {
    id: string;
    key: string;
    name: string;
  } | null;
  trackedUser?: {
    id: string;
    jiraAccountId: string;
    displayName: string;
    email?: string | null;
    avatarUrl?: string | null;
    isTracked: boolean;
  } | null;
  jiraAccountId?: string | null;
  date: string;
  yesterday?: string | null;
  today?: string | null;
  blockers?: string | null;
  createdAt: string;
  updatedAt: string;
  status: DailySummaryStatus;
  isUnavailable: boolean;
  worklogHours: number;
  issueCounts: IssueStatusCounts;
  workItems: DailySummaryWorkItemGroup[];
  user: {
    id: string;
    displayName: string;
    email: string;
    role: string;
  } | null;
}

export type TaskSummaryStatus = "BLOCKED" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "STALLED";

export interface TaskTimelineEvent {
  at: string;
  label: string;
  actorId: string | null;
}

export interface TaskParticipant {
  userId: string | null;
  displayName: string;
  contributionMinutes: number;
  commentCount: number;
  waitingOn?: boolean;
}

export interface TaskLinkedResource {
  label: string;
  url: string;
  type: "issue" | "pr" | "doc" | "other";
}

export interface TaskSummaryPayload {
  issueId: string;
  issueKey: string;
  issueSummary: string;
  headline: string;
  status: TaskSummaryStatus;
  activityBullets: string[];
  nextStep?: string | null;
  riskFlags: string[];
  totalWorklogMinutes: number;
  recentWorklogMinutes: number;
  commentCount: number;
  lastActivityAt?: string | null;
  timeline: TaskTimelineEvent[];
  participants: TaskParticipant[];
  sentiment: {
    label: string;
    score: number;
    provider: string;
  } | null;
  linkedResources: TaskLinkedResource[];
}

export interface CollaborationNote {
  partnerUserId: string | null;
  partnerDisplayName: string | null;
  issueId: string | null;
  issueKey: string | null;
  note: string;
}

export interface PendingDecisionItem {
  issueId: string;
  issueKey: string;
  description: string;
}

export interface PendingDecisionsPayload {
  ownedByUser: PendingDecisionItem[];
  waitingOnOthers: PendingDecisionItem[];
}

export interface MoodSnapshot {
  label: string;
  score: number;
  rationale?: string;
}

export interface TaskSummarySnapshotRecord {
  id: string;
  projectId: string;
  issueId: string;
  userId?: string | null;
  summaryDate: string;
  runId: string;
  createdAt: string;
  payload: TaskSummaryPayload;
}

export interface UserSummaryMetrics {
  worklogMinutes: number;
  tasksTouched: number;
  doneCount: number;
  blockerCount: number;
}

export interface UserSummaryPayload {
  identity: {
    userId?: string | null;
    trackedUserId?: string | null;
    displayName: string;
    jiraAccountId?: string | null;
  };
  headline: string;
  accomplishments: Array<{ issueId: string; issueKey: string; text: string }>;
  inFlight: Array<{ issueId: string; issueKey: string; status: TaskSummaryStatus; note: string }>;
  blockers: Array<{ issueId: string; issueKey: string; description: string; severity: string }>;
  focusNext?: string | null;
  activityMetrics: UserSummaryMetrics;
  riskFlags: string[];
  collaborationNotes?: CollaborationNote[];
  pendingDecisions?: PendingDecisionsPayload;
  mood?: MoodSnapshot | null;
}

export interface UserSummarySnapshotRecord {
  id: string;
  projectId: string;
  userId?: string | null;
  summaryDate: string;
  runId: string;
  taskSummaryIds: string[];
  createdAt: string;
  payload: UserSummaryPayload;
  narrative?: string | null;
  narrativeHash?: string | null;
  narrativeGeneratedAt?: string | null;
  richNarratives?: Record<string, NarrativeVariant> | null;
  needsNarrativeRefresh?: boolean;
  narrativeRefreshRequestedAt?: string | null;
  narrativeRefreshLockedUntil?: string | null;
  narrativeRefreshAttempts?: number;
  lastNarrativeError?: string | null;
}

export interface ProjectSummaryPayload {
  executiveBrief: string;
  topHighlights: Array<{ issueId: string; issueKey: string; userId?: string | null; text: string }>;
  criticalBlockers: Array<{ issueId: string; issueKey: string; userId?: string | null; description: string; severity: string }>;
  atRiskWork: Array<{ flag: string; count: number }>;
  teamHealthSnapshot: {
    activeUsers: number;
    trackedUsers: number;
    idleUsers: number;
    offlineUsers: number;
    totalWorklogMinutes: number;
    doneCount: number;
    blockerCount: number;
    idleRate: number;
    blockerRate: number;
  };
  unassignedWatchlist: Array<{ issueId: string; issueKey: string; issueSummary: string }>;
  callsToAction: Array<{ text: string; severity: "info" | "warning" | "critical" }>;
  atRiskDetails: Array<{ issueId: string; issueKey: string; reason: string; severity: "info" | "warning" | "critical" }>;
  workspaceContext: string | null;
}

export interface ProjectSummarySnapshotRecord {
  id: string;
  projectId: string;
  summaryDate: string;
  runId: string;
  userSummaryIds: string[];
  createdAt: string;
  payload: ProjectSummaryPayload;
  narrative?: string | null;
  narrativeHash?: string | null;
  narrativeGeneratedAt?: string | null;
  richNarratives?: Record<string, NarrativeVariant> | null;
  needsNarrativeRefresh?: boolean;
  narrativeRefreshRequestedAt?: string | null;
  narrativeRefreshLockedUntil?: string | null;
  narrativeRefreshAttempts?: number;
  lastNarrativeError?: string | null;
}

export interface ProjectDailySummaryRecord {
  projectSummary: ProjectSummarySnapshotRecord;
  userSummaries: UserSummarySnapshotRecord[];
  taskSummaries: TaskSummarySnapshotRecord[];
}
