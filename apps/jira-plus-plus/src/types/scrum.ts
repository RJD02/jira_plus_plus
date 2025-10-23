export type DailySummaryStatus = "ON_TRACK" | "DELAYED" | "BLOCKED";

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
}

export interface InsightSignal {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  detail: string;
  metadata?: Record<string, unknown> | null;
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
