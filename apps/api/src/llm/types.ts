export interface IssueInsightSkillInput {
  issueKey: string;
  issueSummary: string;
  issueStatus: string;
  statusCategory: string;
  priority: string;
  dueDate: string;
  resolvedAt: string;
  ruleSummary: string;
  incrementalSummary: string;
  heuristicSentimentLabel: string;
  heuristicSentimentScore: string;
  heuristicSentimentTones: string;
  stageSummary: string;
  recentComments: string;
  recentWorklogs: string;
  waitingOn: string;
  additionalNotes: string;
}

export interface ProjectNarrativeSkillInput {
  persona: string;
  summaryDate: string;
  executiveBrief: string;
  workspaceContext: string;
  teamHealth: string;
  highlights: string;
  collaboration: string;
  risks: string;
  callsToAction: string;
  userHeadlines: string;
  taskSignals: string;
  sentimentNotes: string;
}

export interface ProjectNarrativeSkillOutput {
  story: string;
  summaryBullets: string[];
  collaboration: string[];
  risks: string[];
  callsToAction: string[];
  tone: NarrativeTone;
}

export interface UserNarrativeSkillInput {
  persona: string;
  summaryDate: string;
  displayName: string;
  headline: string;
  metrics: string;
  accomplishments: string;
  inFlight: string;
  blockers: string;
  collaborationNotes: string;
  pendingDecisions: string;
  mood: string;
  taskHighlights: string;
  riskFlags: string;
  focusNext: string;
}

export interface UserNarrativeSkillOutput {
  story: string;
  spotlight: string[];
  risks: string[];
  nextMoves: string[];
  tone: NarrativeTone;
}

export type NarrativeTone = "positive" | "neutral" | "negative";
