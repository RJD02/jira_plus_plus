import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import {
  AISummaryDrawer,
  InlineActionPayload,
  IssueInsightsOverlay,
  ScrumHeader,
  ScrumQuickGlance,
  TeamMetricsBar,
  UserSummaryCard,
  formatNarrativeContent,
} from "../components/scrum";
import type {
  DailySummaryRecord,
  IssueInsight,
  ProjectDailySummaryRecord,
  TaskSummarySnapshotRecord,
  UserSummarySnapshotRecord,
  NarrativeVariant,
} from "../types/scrum";
import { Modal } from "../components/ui/modal";
import { Button } from "../components/ui/button";

const SUMMARY_FIELDS = gql`
  fragment SummaryFields on DailySummary {
    id
    projectId
    project {
      id
      key
      name
    }
    trackedUser {
      id
      jiraAccountId
      displayName
      email
      avatarUrl
      isTracked
    }
    jiraAccountId
    date
    yesterday
    today
    blockers
    createdAt
    updatedAt
    status
    isUnavailable
    worklogHours
    issueCounts {
      todo
      inProgress
      backlog
      done
      blocked
    }
    user {
      id
      displayName
      email
      role
    }
        workItems {
          status
          items {
            issue {
              id
              key
              summary
              status
              priority
              statusCategory
              dueDate
              resolvedAt
              startedAt
              jiraUpdatedAt
              browseUrl
              assignee {
                id
                displayName
                email
                avatarUrl
              }
              reporter {
                id
                displayName
                email
                avatarUrl
              }
              parent {
                id
                key
                summary
                status
              }
              project {
                id
                key
                name
              }
              linksOut {
                id
                linkType
                direction
                url
                target {
                  id
                  key
                  summary
                  status
                  statusCategory
                  priority
                }
              }
              linksIn {
                id
                linkType
                direction
                url
                source {
                  id
                  key
                  summary
                  status
                  statusCategory
                  priority
                }
              }
            }
            totalWorklogHours
            recentWorklogs {
              id
              description
          timeSpent
          jiraStartedAt
          author {
            id
            displayName
            email
            avatarUrl
          }
        }
        recentComments {
          id
          body
          jiraCreatedAt
          author {
            id
            displayName
            email
            avatarUrl
          }
        }
      }
    }
  }
`;

const SCRUM_PROJECTS_QUERY = gql`
  query ScrumProjects {
    scrumProjects {
      id
      key
      name
    }
  }
`;

const DAILY_SUMMARIES_QUERY = gql`
  ${SUMMARY_FIELDS}
  query DailySummaries($date: Date!, $projectId: ID!) {
    dailySummaries(date: $date, projectId: $projectId) {
      ...SummaryFields
    }
  }
`;

const REGENERATE_SUMMARY_MUTATION = gql`
  ${SUMMARY_FIELDS}
  mutation RegenerateDailySummary($userId: ID!, $date: Date!, $projectId: ID!) {
    regenerateDailySummary(userId: $userId, date: $date, projectId: $projectId) {
      ...SummaryFields
    }
  }
`;

const TASK_SUMMARY_FIELDS = gql`
  fragment TaskSummaryFields on TaskSummarySnapshot {
    id
    projectId
    issueId
    userId
    summaryDate
    runId
    createdAt
    payload {
      issueId
      issueKey
      issueSummary
      headline
      status
      activityBullets
      nextStep
      riskFlags
      totalWorklogMinutes
      commentCount
      lastActivityAt
      timeline {
        at
        label
        actorId
      }
      participants {
        userId
        displayName
        contributionMinutes
        commentCount
        waitingOn
      }
      sentiment {
        label
        score
        provider
      }
      linkedResources {
        label
        url
        type
      }
    }
  }
`;

const USER_SUMMARY_FIELDS = gql`
  fragment UserSummaryFields on UserSummarySnapshot {
    id
    projectId
    userId
    summaryDate
    runId
    taskSummaryIds
    createdAt
    narrative
    narrativeHash
    narrativeGeneratedAt
    richNarratives
    needsNarrativeRefresh
    narrativeRefreshRequestedAt
    narrativeRefreshLockedUntil
    narrativeRefreshAttempts
    lastNarrativeError
    payload {
      identity {
        userId
        trackedUserId
        displayName
        jiraAccountId
      }
      headline
      focusNext
      riskFlags
      activityMetrics {
        worklogMinutes
        tasksTouched
        doneCount
        blockerCount
      }
      accomplishments {
        issueId
        issueKey
        text
      }
      inFlight {
        issueId
        issueKey
        status
        note
      }
      blockers {
        issueId
        issueKey
        description
        severity
      }
      collaborationNotes {
        partnerUserId
        partnerDisplayName
        issueId
        issueKey
        note
      }
      pendingDecisions {
        ownedByUser {
          issueId
          issueKey
          description
        }
        waitingOnOthers {
          issueId
          issueKey
          description
        }
      }
      mood {
        label
        score
        rationale
      }
    }
  }
`;

const PROJECT_SUMMARY_FIELDS = gql`
  fragment ProjectSummaryFields on ProjectSummarySnapshot {
    id
    projectId
    summaryDate
    runId
    userSummaryIds
    createdAt
    narrative
    narrativeHash
    narrativeGeneratedAt
    richNarratives
    needsNarrativeRefresh
    narrativeRefreshRequestedAt
    narrativeRefreshLockedUntil
    narrativeRefreshAttempts
    lastNarrativeError
    payload {
      executiveBrief
      teamHealthSnapshot {
        activeUsers
        trackedUsers
        idleUsers
        offlineUsers
        totalWorklogMinutes
        doneCount
        blockerCount
        idleRate
        blockerRate
      }
      topHighlights {
        issueId
        issueKey
        userId
        text
      }
      criticalBlockers {
        issueId
        issueKey
        userId
        description
        severity
      }
      atRiskWork {
        flag
        count
      }
      unassignedWatchlist {
        issueId
        issueKey
        issueSummary
      }
      callsToAction {
        text
        severity
      }
      atRiskDetails {
        issueId
        issueKey
        reason
        severity
      }
      workspaceContext
    }
  }
`;

const PROJECT_DAILY_SUMMARIES_QUERY = gql`
  ${TASK_SUMMARY_FIELDS}
  ${USER_SUMMARY_FIELDS}
  ${PROJECT_SUMMARY_FIELDS}
  query ProjectDailySummaries($projectId: ID!, $range: DateRangeInput!, $includeTasks: Boolean!) {
    projectDailySummaries(projectId: $projectId, range: $range, includeTasks: $includeTasks) {
      projectSummary {
        ...ProjectSummaryFields
      }
      userSummaries {
        ...UserSummaryFields
      }
      taskSummaries @include(if: $includeTasks) {
        ...TaskSummaryFields
      }
    }
  }
`;

const REGENERATE_PROJECT_SUMMARY_MUTATION = gql`
  ${TASK_SUMMARY_FIELDS}
  ${USER_SUMMARY_FIELDS}
  ${PROJECT_SUMMARY_FIELDS}
  mutation RegenerateProjectSummary($projectId: ID!, $date: Date) {
    regenerateProjectSummary(projectId: $projectId, date: $date) {
      projectSummary {
        ...ProjectSummaryFields
      }
      userSummaries {
        ...UserSummaryFields
      }
      taskSummaries {
        ...TaskSummaryFields
      }
    }
  }
`;

const REQUEST_NARRATIVE_REFRESH_MUTATION = gql`
  mutation RequestNarrativeRefresh(
    $projectId: ID!
    $scope: NarrativeScope!
    $snapshotId: ID
    $persona: String
    $days: Int
    $force: Boolean
  ) {
    requestNarrativeRefresh(
      projectId: $projectId
      scope: $scope
      snapshotId: $snapshotId
      persona: $persona
      days: $days
      force: $force
    ) {
      queuedProject
      queuedUser
    }
  }
`;

const ISSUE_INSIGHTS_QUERY = gql`
  query IssueInsights($issueId: ID!, $refresh: Boolean = false) {
    issueInsights(issueId: $issueId, refresh: $refresh) {
      summary {
        text
        provider
        confidence
      }
      sentiment {
        label
        score
        tones
        provider
      }
      escalateScore
      signals {
        type
        severity
        detail
        metadata
      }
      computedAt
      expiresAt
      providerMetadata
      provider
      requirement
      waitingOn
      stage {
        current
        breakdown {
          key
          label
          total
          inProgress
          done
          todo
        }
      }
      delta {
        newCommentCount
        latestCommentAuthors
        newWorklogHours
      }
      history(limit: 5) {
        id
        issueId
        summary {
          text
          provider
          confidence
        }
        sentiment {
          label
          score
          tones
          provider
        }
        escalateScore
        signals {
          type
          severity
          detail
          metadata
        }
        computedAt
        expiresAt
        provider
        providerMetadata
        requirement
        waitingOn
        stage {
          current
          breakdown {
            key
            label
            total
            inProgress
            done
            todo
          }
        }
        delta {
          newCommentCount
          latestCommentAuthors
          newWorklogHours
        }
      }
    }
  }
`;

interface ToastState {
  type: "success" | "error";
  message: string;
}

interface ScrumProject {
  id: string;
  key: string;
  name: string;
}

type ScrumViewMode = "team" | "focus";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const addDays = (date: string, days: number): string => {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

export function ScrumPage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayIsoDate);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ScrumViewMode>("team");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [actionModal, setActionModal] = useState<InlineActionPayload | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [regenerating, setRegenerating] = useState<boolean>(false);
  const overlayEnabled = true;
  const [overlayOpen, setOverlayOpen] = useState<boolean>(false);
  const [overlayIssueId, setOverlayIssueId] = useState<string | null>(null);
  const [overlayIssueFilter, setOverlayIssueFilter] = useState<string[] | null>(null);
  const [overlayProjectTasks, setOverlayProjectTasks] = useState<TaskSummarySnapshotRecord[] | null>(
    null,
  );
  const [refreshingNarrativeScope, setRefreshingNarrativeScope] = useState<"PROJECT" | "USER" | null>(
    null,
  );
  const [insightsByIssueId, setInsightsByIssueId] = useState<Record<string, IssueInsight>>({});
  const [loadingInsightId, setLoadingInsightId] = useState<string | null>(null);
  const inflightInsights = useRef<Set<string>>(new Set());
  const overlayIssueIdRef = useRef<string | null>(null);
  const projectRangeEnd = useMemo(() => addDays(selectedDate, 1), [selectedDate]);

  const {
    data: projectsData,
    loading: projectsLoading,
    error: projectsError,
  } = useQuery<{ scrumProjects: ScrumProject[] }>(SCRUM_PROJECTS_QUERY, {
    fetchPolicy: "cache-first",
  });

  const projects = useMemo(
    () => projectsData?.scrumProjects ?? [],
    [projectsData?.scrumProjects],
  );

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]?.id ?? null);
    }
  }, [projects, selectedProjectId]);

  const {
    data: summariesData,
    loading: summariesLoading,
    error: summariesError,
    refetch: refetchSummaries,
  } = useQuery<{ dailySummaries: DailySummaryRecord[] }>(DAILY_SUMMARIES_QUERY, {
    variables: selectedProjectId
      ? {
          date: selectedDate,
          projectId: selectedProjectId,
        }
      : undefined,
    skip: !selectedProjectId,
    fetchPolicy: "cache-and-network",
  });

  const summaries = useMemo(
    () => summariesData?.dailySummaries ?? [],
    [summariesData?.dailySummaries],
  );

  const summaryByIssueId = useMemo(() => {
    const mapping = new Map<string, string>();
    for (const summary of summaries) {
      for (const group of summary.workItems) {
        for (const item of group.items) {
          mapping.set(item.issue.id, summary.id);
        }
      }
    }
    return mapping;
  }, [summaries]);

  const {
    data: projectSummariesData,
    loading: projectSummaryLoading,
    error: projectSummaryError,
    refetch: refetchProjectSummary,
  } = useQuery<{ projectDailySummaries: ProjectDailySummaryRecord[] }>(
    PROJECT_DAILY_SUMMARIES_QUERY,
    {
      variables: selectedProjectId
        ? {
            projectId: selectedProjectId,
            range: { start: selectedDate, end: projectRangeEnd },
            includeTasks: true,
          }
        : undefined,
      skip: !selectedProjectId,
      fetchPolicy: "network-only",
    },
  );

  const [regenerateSummary] = useMutation(REGENERATE_SUMMARY_MUTATION);
  const [regenerateProjectSummaryMutation] = useMutation(REGENERATE_PROJECT_SUMMARY_MUTATION);
  const [requestNarrativeRefreshMutation] = useMutation(REQUEST_NARRATIVE_REFRESH_MUTATION);

  const latestProjectSummary = useMemo(() => {
    const records = projectSummariesData?.projectDailySummaries ?? [];
    return records.find((entry) => entry.projectSummary.summaryDate === selectedDate) ?? null;
  }, [projectSummariesData?.projectDailySummaries, selectedDate]);

  const refreshProjectNarrative = useCallback(async () => {
    if (!selectedProjectId || !latestProjectSummary) {
      return;
    }
    try {
      setRefreshingNarrativeScope("PROJECT");
      await requestNarrativeRefreshMutation({
        variables: {
          projectId: selectedProjectId,
          scope: "PROJECT",
          snapshotId: latestProjectSummary.projectSummary.id,
          persona: "manager",
          force: true,
        },
      });
      setToast({ type: "success", message: "Project story refresh queued" });
    } catch (mutationError) {
      setToast({ type: "error", message: friendlyError(mutationError) });
    } finally {
      setRefreshingNarrativeScope(null);
    }
  }, [latestProjectSummary, requestNarrativeRefreshMutation, selectedProjectId]);

  const projectTaskIndex = useMemo(() => {
    const index = new Map<string, TaskSummarySnapshotRecord>();
    if (!latestProjectSummary) {
      return index;
    }
    for (const task of latestProjectSummary.taskSummaries ?? []) {
      index.set(task.id, task);
      index.set(task.payload.issueId, task);
    }
    return index;
  }, [latestProjectSummary]);

  const userSummaryIndex = useMemo(() => {
    const index = new Map<string, UserSummarySnapshotRecord>();
    if (!latestProjectSummary) {
      return index;
    }
    for (const snapshot of latestProjectSummary.userSummaries) {
      const identity = snapshot.payload.identity;
      if (identity.userId) {
        index.set(`user:${identity.userId}`, snapshot);
      }
      if (identity.trackedUserId) {
        index.set(`tracked:${identity.trackedUserId}`, snapshot);
      }
      if (identity.jiraAccountId) {
        index.set(`account:${identity.jiraAccountId}`, snapshot);
      }
    }
    return index;
  }, [latestProjectSummary]);

  const selectedSummary = useMemo(
    () => summaries.find((summary) => summary.id === selectedSummaryId) ?? null,
    [summaries, selectedSummaryId],
  );

  const selectedUserSnapshot = useMemo(() => {
    if (!selectedSummary) {
      return null;
    }
    const keys = [
      selectedSummary.user?.id ? `user:${selectedSummary.user.id}` : null,
      selectedSummary.trackedUser?.id ? `tracked:${selectedSummary.trackedUser.id}` : null,
      selectedSummary.trackedUser?.jiraAccountId
        ? `account:${selectedSummary.trackedUser.jiraAccountId}`
        : null,
      selectedSummary.jiraAccountId ? `account:${selectedSummary.jiraAccountId}` : null,
    ].filter(Boolean) as string[];
    for (const key of keys) {
      const snapshot = userSummaryIndex.get(key);
      if (snapshot) {
        return snapshot;
      }
    }
    if (latestProjectSummary) {
      const displayName =
        selectedSummary.user?.displayName ??
        selectedSummary.trackedUser?.displayName ??
        null;
      if (displayName) {
        const fallback = latestProjectSummary.userSummaries.find(
          (snapshot) => snapshot.payload.identity.displayName === displayName,
        );
        if (fallback) {
          return fallback;
        }
      }
    }
    return null;
  }, [latestProjectSummary, selectedSummary, userSummaryIndex]);

  const selectedTaskSummaries = useMemo(() => {
    if (!selectedUserSnapshot) {
      return [] as TaskSummarySnapshotRecord[];
    }
    return selectedUserSnapshot.taskSummaryIds
      .map((taskId) => projectTaskIndex.get(taskId))
      .filter((task): task is TaskSummarySnapshotRecord => Boolean(task));
  }, [projectTaskIndex, selectedUserSnapshot]);

  const refreshUserNarrative = useCallback(async () => {
    if (!selectedProjectId || !selectedUserSnapshot) {
      return;
    }
    try {
      setRefreshingNarrativeScope("USER");
      await requestNarrativeRefreshMutation({
        variables: {
          projectId: selectedProjectId,
          scope: "USER",
          snapshotId: selectedUserSnapshot.id,
          persona: "manager",
          force: true,
        },
      });
      setToast({ type: "success", message: "Teammate story refresh queued" });
    } catch (mutationError) {
      setToast({ type: "error", message: friendlyError(mutationError) });
    } finally {
      setRefreshingNarrativeScope(null);
    }
  }, [requestNarrativeRefreshMutation, selectedProjectId, selectedUserSnapshot]);

  const [fetchIssueInsights, { loading: insightsLoading }] = useLazyQuery<
    { issueInsights: IssueInsight }
  >(ISSUE_INSIGHTS_QUERY, {
    fetchPolicy: "network-only",
    onError: (error) => {
      setToast({ type: "error", message: friendlyError(error) });
    },
    onCompleted: (data) => {
      if (!overlayIssueIdRef.current || !data?.issueInsights) {
        return;
      }
      setInsightsByIssueId((current) => ({
        ...current,
        [overlayIssueIdRef.current as string]: data.issueInsights,
      }));
      setLoadingInsightId((current) =>
        current === overlayIssueIdRef.current ? null : current,
      );
    },
  });

  const ensureInsight = useCallback(
    async (issueId: string | null | undefined) => {
      if (!issueId || inflightInsights.current.has(issueId) || insightsByIssueId[issueId]) {
        return;
      }
      inflightInsights.current.add(issueId);
      overlayIssueIdRef.current = issueId;
      try {
        setLoadingInsightId(issueId);
        await fetchIssueInsights({ variables: { issueId } });
      } finally {
        inflightInsights.current.delete(issueId);
        setLoadingInsightId((current) => (current === issueId ? null : current));
      }
    },
    [fetchIssueInsights, insightsByIssueId],
  );

  useEffect(() => {
    setInsightsByIssueId({});
    inflightInsights.current.clear();
    setLoadingInsightId(null);
    setOverlayIssueFilter(null);
    setOverlayProjectTasks(null);
    overlayIssueIdRef.current = null;
  }, [selectedDate, selectedProjectId]);

  useEffect(() => {
    if (!autoRefresh || !selectedProjectId) {
      return;
    }
    const timer = window.setInterval(() => {
      void refetchSummaries({ date: selectedDate, projectId: selectedProjectId });
      void refetchProjectSummary({
        projectId: selectedProjectId,
        range: { start: selectedDate, end: projectRangeEnd },
        includeTasks: true,
      });
    }, 60000);
    return () => window.clearInterval(timer);
  }, [
    autoRefresh,
    refetchProjectSummary,
    refetchSummaries,
    selectedDate,
    selectedProjectId,
    projectRangeEnd,
  ]);

  useEffect(() => {
    if (!summaries.length) {
      setSelectedSummaryId(null);
      return;
    }
    if (!selectedSummaryId || !summaries.some((summary) => summary.id === selectedSummaryId)) {
      setSelectedSummaryId(summaries[0].id);
    }
  }, [summaries, selectedSummaryId]);

  const getDisplayName = (record: DailySummaryRecord) =>
    record.user?.displayName ?? record.trackedUser?.displayName ?? "Unassigned";
  useEffect(() => {
    if (!overlayEnabled || !overlayOpen) {
      return;
    }
    if (!selectedSummary) {
      setOverlayOpen(false);
      setOverlayIssueId(null);
      setOverlayIssueFilter(null);
      setOverlayProjectTasks(null);
    }
  }, [overlayEnabled, overlayOpen, selectedSummary]);

  const legacyTeamMetrics = useMemo(() => {
    if (!summaries.length) {
      return {
        hoursLogged: 0,
        pending: 0,
        blocked: 0,
        done: 0,
        backlog: 0,
        headline: null as string | null,
      };
    }

    let hoursLogged = 0;
    let pending = 0;
    let blocked = 0;
    let done = 0;
    let backlog = 0;
    let topByHours: DailySummaryRecord | null = null;
    let topBlocked: DailySummaryRecord | null = null;

    for (const summary of summaries) {
      hoursLogged += summary.worklogHours;
      done += summary.issueCounts.done;
      blocked += summary.issueCounts.blocked;
      pending += summary.issueCounts.todo + summary.issueCounts.inProgress;
      backlog += summary.issueCounts.backlog;

      if (!topByHours || summary.worklogHours > topByHours.worklogHours) {
        topByHours = summary;
      }
      if (!topBlocked && summary.issueCounts.blocked > 0) {
        topBlocked = summary;
      }
    }

    let headline: string | null = null;
    if (topBlocked) {
      headline = `${getDisplayName(topBlocked)} has ${topBlocked.issueCounts.blocked} blocker(s)`;
    } else if (topByHours && topByHours.worklogHours > 0) {
      headline = `Top output: ${getDisplayName(topByHours)} (${topByHours.worklogHours.toFixed(1)}h)`;
    }

    return {
      hoursLogged,
      pending,
      blocked,
      done,
      backlog,
      headline,
    };
  }, [summaries]);

  const legacyProjectMetrics = useMemo(
    () => ({
      hoursLogged: legacyTeamMetrics.hoursLogged,
      done: legacyTeamMetrics.done,
      blocked: legacyTeamMetrics.blocked,
    }),
    [legacyTeamMetrics],
  );

  const lastUpdated = useMemo(() => {
    if (!summaries.length) {
      return null;
    }
    const timestamps = summaries
      .map((summary) => new Date(summary.updatedAt).getTime())
      .filter((value) => !Number.isNaN(value));
    if (!timestamps.length) {
      return null;
    }
    return new Date(Math.max(...timestamps)).toLocaleTimeString();
  }, [summaries]);

  useEffect(() => {
    if (viewMode === "focus" && !selectedSummary && summaries.length) {
      setSelectedSummaryId(summaries[0].id);
    }
  }, [viewMode, selectedSummary, summaries]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleDateChange = (value: string) => {
    setSelectedDate(value);
    setSelectedSummaryId(null);
  };

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value || null);
    setSelectedSummaryId(null);
  };

  const handleRefresh = async () => {
    if (!selectedProjectId) {
      return;
    }
    try {
      await refetchSummaries({ date: selectedDate, projectId: selectedProjectId });
      await refetchProjectSummary({
        projectId: selectedProjectId,
        range: { start: selectedDate, end: projectRangeEnd },
        includeTasks: true,
      });
      setToast({ type: "success", message: "Summaries refreshed" });
    } catch (refreshError) {
      setToast({ type: "error", message: friendlyError(refreshError) });
    }
  };

  const handleRegenerate = async () => {
    if (!selectedSummary || !selectedProjectId) {
      return;
    }
    if (!selectedSummary.user?.id) {
      setToast({ type: "error", message: "Link this teammate to a Jira++ user to regenerate." });
      return;
    }
    try {
      setRegenerating(true);
      const teammateName =
        selectedSummary.user?.displayName ?? selectedSummary.trackedUser?.displayName ?? "teammate";
      await regenerateSummary({
        variables: {
          userId: selectedSummary.user.id,
          date: selectedDate,
          projectId: selectedProjectId,
        },
      });
      await regenerateProjectSummaryMutation({
        variables: {
          projectId: selectedProjectId,
          date: selectedDate,
        },
      });
      await refetchSummaries({ date: selectedDate, projectId: selectedProjectId });
      await refetchProjectSummary({
        projectId: selectedProjectId,
        range: { start: selectedDate, end: projectRangeEnd },
        includeTasks: true,
      });
      setToast({ type: "success", message: `Summary regenerated for ${teammateName}` });
    } catch (mutationError) {
      setToast({ type: "error", message: friendlyError(mutationError) });
    } finally {
      setRegenerating(false);
    }
  };

  const handleAction = (payload: InlineActionPayload) => {
    setActionModal(payload);
  };

  const openDetailView = (
    issueId?: string | null,
    options?: { filterIssueIds?: string[] | null; tasks?: TaskSummarySnapshotRecord[] | null },
  ) => {
    const filter = options?.filterIssueIds?.filter(Boolean) ?? [];
    const tasks = options?.tasks ?? null;
    const shouldOpenOverlay =
      overlayEnabled && (Boolean(issueId) || filter.length > 0 || (tasks && tasks.length > 0));

    if (shouldOpenOverlay) {
      let resolvedIssueId = issueId ?? null;
      if (!resolvedIssueId && filter.length) {
        resolvedIssueId = filter[0] ?? null;
      }
      if (!resolvedIssueId && selectedSummary) {
        for (const group of selectedSummary.workItems) {
          const candidate = group.items[0]?.issue.id;
          if (candidate) {
            resolvedIssueId = candidate;
            break;
          }
        }
      }
      setOverlayIssueFilter(filter.length ? filter : null);
      setOverlayProjectTasks(tasks);
      setOverlayIssueId(resolvedIssueId);
      overlayIssueIdRef.current = resolvedIssueId;
      setOverlayOpen(true);
      setDrawerOpen(false);
      if (resolvedIssueId) {
        void ensureInsight(resolvedIssueId);
      }
      return;
    }
    if (overlayOpen) {
      setOverlayOpen(false);
      setOverlayIssueId(null);
      setOverlayIssueFilter(null);
      setOverlayProjectTasks(null);
    }
    setOverlayIssueFilter(null);
    setOverlayProjectTasks(null);
    setDrawerOpen(true);
  };

  const closeDetailView = () => {
    if (overlayEnabled) {
      setOverlayOpen(false);
      setOverlayIssueId(null);
      setOverlayIssueFilter(null);
      setOverlayProjectTasks(null);
      overlayIssueIdRef.current = null;
    }
    setDrawerOpen(false);
  };

  const handleActionSubmit = (message: string) => {
    setToast({ type: "success", message });
    setActionModal(null);
  };

  const handleSelectSummary = (summaryId: string) => {
    setSelectedSummaryId(summaryId);
    openDetailView();
  };

  const handleOpenAtRiskIssues = (details: ProjectRiskDetail[]) => {
    if (!details.length) {
      return;
    }

    const detailByIssueId = new Map<string, ProjectRiskDetail>();
    for (const detail of details) {
      if (detail.issueId) {
        detailByIssueId.set(detail.issueId, detail);
      }
    }

    const uniqueIds = Array.from(detailByIssueId.keys());
    if (!uniqueIds.length) {
      return;
    }

    let targetSummaryId: string | null = null;
    for (const id of uniqueIds) {
      const summaryId = summaryByIssueId.get(id);
      if (summaryId) {
        targetSummaryId = summaryId;
        break;
      }
    }

    if (targetSummaryId && selectedSummaryId !== targetSummaryId) {
      setSelectedSummaryId(targetSummaryId);
    }

    const fallbackTasks = uniqueIds
      .map((id) => {
        const existing = projectTaskIndex.get(id);
        if (existing) {
          return existing;
        }

        const detail = detailByIssueId.get(id);
        if (!detail || !latestProjectSummary) {
          return null;
        }

        const headline = detail.reason?.trim() || "Flagged for attention";
        const severityFlag =
          detail.severity === "critical"
            ? "critical_risk"
            : detail.severity === "warning"
              ? "caution_risk"
              : "at_risk";

        const fallback: TaskSummarySnapshotRecord = {
          id: `at-risk-${id}`,
          projectId: latestProjectSummary.projectSummary.projectId,
          issueId: id,
          userId: null,
          summaryDate: latestProjectSummary.projectSummary.summaryDate,
          runId: latestProjectSummary.projectSummary.runId,
          createdAt: latestProjectSummary.projectSummary.createdAt,
          payload: {
            issueId: id,
            issueKey: detail.issueKey,
            issueSummary: headline,
            headline,
            status: "STALLED",
            activityBullets: headline ? [headline] : [],
            nextStep: null,
            riskFlags: [severityFlag],
            totalWorklogMinutes: 0,
            recentWorklogMinutes: 0,
            commentCount: 0,
            lastActivityAt: null,
            timeline: [],
            participants: [],
            sentiment: null,
            linkedResources: [],
          },
        };

        return fallback;
      })
      .filter((task): task is TaskSummarySnapshotRecord => Boolean(task));

    openDetailView(uniqueIds[0], {
      filterIssueIds: uniqueIds,
      tasks: fallbackTasks.length ? fallbackTasks : null,
    });
  };

  const handleOpenCallToActionIssues = (issueIds: string[]) => {
    const uniqueIds = Array.from(new Set(issueIds.filter(Boolean)));
    if (!uniqueIds.length) {
      return;
    }

    const fallbackTasks = uniqueIds
      .map((id) => projectTaskIndex.get(id))
      .filter((task): task is TaskSummarySnapshotRecord => Boolean(task));

    openDetailView(uniqueIds[0], {
      filterIssueIds: uniqueIds,
      tasks: fallbackTasks.length ? fallbackTasks : null,
    });
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-10 xl:px-16">
      <section className="space-y-6">
        <ScrumHeader
          date={selectedDate}
          projectId={selectedProjectId}
          projects={projects}
          onDateChange={handleDateChange}
          onProjectChange={handleProjectChange}
          onRefresh={handleRefresh}
          isRefreshing={summariesLoading || projectSummaryLoading}
          projectsLoading={projectsLoading}
          lastUpdated={lastUpdated}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
        />

        <TeamMetricsBar
          hoursLogged={legacyTeamMetrics.hoursLogged}
          pending={legacyTeamMetrics.pending}
          blocked={legacyTeamMetrics.blocked}
          done={legacyTeamMetrics.done}
          backlog={legacyTeamMetrics.backlog}
          focusHeadline={legacyTeamMetrics.headline}
        />

        {selectedProjectId ? (
          projectSummaryLoading && !latestProjectSummary ? (
            <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              Generating project summary…
            </div>
          ) : latestProjectSummary ? (
            <ProjectOverviewCard
              summary={latestProjectSummary}
              onOpenRiskList={handleOpenAtRiskIssues}
              onOpenCallsList={handleOpenCallToActionIssues}
              legacyMetrics={legacyProjectMetrics}
              onRefreshNarrative={refreshProjectNarrative}
              narrativeRefreshing={refreshingNarrativeScope === "PROJECT"}
            />
          ) : null
        ) : null}

        {toast ? <ToastBanner toast={toast} onDismiss={() => setToast(null)} /> : null}

        {projectsError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {friendlyError(projectsError)}
          </div>
        ) : null}

        {summariesError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {friendlyError(summariesError)}
          </div>
        ) : null}

        {projectSummaryError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {friendlyError(projectSummaryError)}
          </div>
        ) : null}

        {!projectsLoading && projects.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            No Jira projects linked to your account. Map users in the Admin Console to enable scrum summaries.
          </div>
        ) : null}

        {selectedProjectId ? null : projectsLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            Loading projects…
          </div>
        ) : null}

        {selectedProjectId ? (
          <>
            {summaries.length ? (
              <section className="space-y-4">
                <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/60 dark:border-slate-700 dark:bg-slate-950/40 dark:shadow-slate-950/50">
                  {(
                    [
                      { id: "team" as ScrumViewMode, label: "Team Overview" },
                      { id: "focus" as ScrumViewMode, label: "Focus Mode" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setViewMode(option.id);
                        if (option.id === "focus") {
                          setDrawerOpen(true);
                        }
                      }}
                      disabled={option.id === "focus" && !summaries.length}
                      className={clsx(
                        "rounded-full px-4 py-2 text-sm font-medium transition",
                        viewMode === option.id
                          ? "bg-sky-500 text-white shadow-sm shadow-sky-500/40 dark:bg-sky-400 dark:text-slate-900"
                          : "text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-900/60",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <ScrumQuickGlance
                  summaries={summaries}
                  selectedId={selectedSummaryId}
                  onSelect={handleSelectSummary}
                />
              </section>
            ) : null}

            {viewMode === "team" ? (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {summariesLoading && !summaries.length
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`placeholder-${index}`}
                        className="h-64 rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
                      />
                    ))
                  : null}
                {summaries.map((summary) => (
                  <UserSummaryCard
                    key={summary.id}
                    summary={summary}
                    expanded={false}
                    onToggle={() => {
                      setSelectedSummaryId(summary.id);
                      openDetailView();
                    }}
                    onAction={handleAction}
                    insightsByIssueId={insightsByIssueId}
                    onShowInsights={
                      overlayEnabled
                        ? (issueId) => {
                            setSelectedSummaryId(summary.id);
                            openDetailView(issueId);
                          }
                        : undefined
                    }
                  />
                ))}
                {!summariesLoading && selectedProjectId && !summaries.length ? (
                  <div className="col-span-full rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                    No summaries available for this date.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                {selectedSummary ? (
                  <UserSummaryCard
                    summary={selectedSummary}
                    expanded
                    onToggle={() => openDetailView()}
                    onAction={handleAction}
                    insightsByIssueId={insightsByIssueId}
                    onShowInsights={
                      overlayEnabled
                        ? (issueId) => {
                            openDetailView(issueId);
                          }
                        : undefined
                    }
                  />
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                    Select a teammate from the quick glance to view their full update.
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}

        <ActionModal
          payload={actionModal}
          onClose={() => setActionModal(null)}
          onSubmit={handleActionSubmit}
        />
      </section>
      {overlayEnabled ? (
        <IssueInsightsOverlay
          open={overlayOpen && Boolean(selectedSummary)}
          summary={selectedSummary}
          initialIssueId={overlayIssueId}
          filterIssueIds={overlayIssueFilter}
          filterTasks={overlayProjectTasks ?? undefined}
          insights={insightsByIssueId}
          loadingIssueId={loadingInsightId}
          insightsLoading={insightsLoading}
          onRequestInsight={(issueId) => {
            overlayIssueIdRef.current = issueId;
            void ensureInsight(issueId);
          }}
          onClose={closeDetailView}
        />
      ) : null}
      <AISummaryDrawer
        open={drawerOpen && Boolean(selectedSummary)}
        summary={selectedSummary}
        userSnapshot={selectedUserSnapshot}
        taskSummaries={selectedTaskSummaries}
        regenerating={regenerating}
        onRegenerate={handleRegenerate}
        onOpenIssue={(issueId) => openDetailView(issueId)}
        onRefreshNarrative={refreshUserNarrative}
        narrativeRefreshing={refreshingNarrativeScope === "USER"}
        onClose={closeDetailView}
      />
    </div>
  );
}

function ToastBanner({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  const Icon = toast.type === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={
        toast.type === "success"
          ? "flex items-center gap-2 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "flex items-center gap-2 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
      }
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        className="text-xs font-medium uppercase tracking-wide text-current"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}

function ActionModal({
  payload,
  onClose,
  onSubmit,
}: {
  payload: InlineActionPayload | null;
  onClose: () => void;
  onSubmit: (message: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState("In Progress");

  useEffect(() => {
    setComment("");
    setAssignee("");
    setStatus("In Progress");
  }, [payload?.item.issue.id, payload?.type]);

  if (!payload) {
    return null;
  }

  const issueKey = payload.item.issue.key;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (payload.type === "comment") {
      if (!comment.trim()) {
        return;
      }
      onSubmit(`Comment queued for ${issueKey}`);
      return;
    }
    if (payload.type === "reassign") {
      if (!assignee.trim()) {
        return;
      }
      onSubmit(`Reassignment queued for ${issueKey}`);
      return;
    }
    onSubmit(`Status update queued for ${issueKey}`);
  };

  return (
    <Modal
      open={Boolean(payload)}
      onClose={onClose}
      title={modalTitle(payload.type, issueKey)}
      description={`Updates will sync to Jira when integrations are connected.`}
      primaryAction={
        <Button type="submit" form="scrum-action-form">
          Continue
        </Button>
      }
    >
      <form id="scrum-action-form" className="space-y-4" onSubmit={handleSubmit}>
        {payload.type === "comment" ? (
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            Comment
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="mt-2 h-32 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-600"
              placeholder="Share context or blockers..."
            />
          </label>
        ) : null}
        {payload.type === "reassign" ? (
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            New assignee email
            <input
              type="email"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-600"
              placeholder="dev@example.com"
            />
          </label>
        ) : null}
        {payload.type === "status" ? (
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            New status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-600"
            >
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Blocked">Blocked</option>
              <option value="Review">Review</option>
              <option value="Done">Done</option>
            </select>
          </label>
        ) : null}
      </form>
    </Modal>
  );
}

function modalTitle(action: InlineActionPayload["type"], issueKey: string) {
  if (action === "comment") {
    return `Add comment to ${issueKey}`;
  }
  if (action === "reassign") {
    return `Reassign ${issueKey}`;
  }
  return `Update ${issueKey} status`;
}

type ProjectRiskDetail = ProjectDailySummaryRecord["projectSummary"]["payload"]["atRiskDetails"][number];

function ProjectOverviewCard({
  summary,
  onOpenRiskList,
  onOpenCallsList,
  legacyMetrics,
  onRefreshNarrative,
  narrativeRefreshing,
}: {
  summary: ProjectDailySummaryRecord;
  onOpenRiskList: (details: ProjectRiskDetail[]) => void;
  onOpenCallsList: (issueIds: string[]) => void;
  legacyMetrics: {
    hoursLogged: number;
    done: number;
    blocked: number;
  };
  onRefreshNarrative?: () => void;
  narrativeRefreshing?: boolean;
}) {
  const { projectSummary } = summary;
  const payload = projectSummary.payload;
  const metrics = payload.teamHealthSnapshot;
  const summaryDate = new Date(projectSummary.summaryDate).toLocaleDateString();
  const legacyHours = legacyMetrics.hoursLogged;
  const legacyDone = legacyMetrics.done;
  const legacyBlocked = legacyMetrics.blocked;
  const showRefreshButton = typeof onRefreshNarrative === "function";
  const richNarratives = projectSummary.richNarratives as Record<string, NarrativeVariant> | null;
  const managerNarrativeText = richNarratives?.manager?.text?.trim() ?? projectSummary.narrative?.trim() ?? null;
  const executiveBriefText = payload.executiveBrief?.trim?.() ?? "";
  const callIssueIds = useMemo(() => {
    if (!payload.callsToAction.length) {
      return [];
    }
    const ids = new Set<string>();
    const keyIndex = new Map<string, string>();
    for (const task of summary.taskSummaries) {
      if (task.payload.issueKey) {
        keyIndex.set(task.payload.issueKey, task.issueId);
        keyIndex.set(task.payload.issueKey.toUpperCase(), task.issueId);
      }
    }
    for (const action of payload.callsToAction) {
      const issueKey = extractIssueKey(action.text);
      if (!issueKey) {
        continue;
      }
      const normalized = issueKey.toUpperCase();
      const issueId = keyIndex.get(issueKey) ?? keyIndex.get(normalized);
      if (issueId) {
        ids.add(issueId);
      }
    }
    return Array.from(ids);
  }, [payload.callsToAction, summary.taskSummaries]);
  const narrativeDisplay = managerNarrativeText ?? executiveBriefText;
  const narrativeNode = formatNarrativeContent(narrativeDisplay);
  const executiveNode = managerNarrativeText && executiveBriefText && managerNarrativeText !== executiveBriefText
    ? formatNarrativeContent(executiveBriefText)
    : null;
  const workspaceContextNode = payload.workspaceContext
    ? formatNarrativeContent(payload.workspaceContext)
    : null;

  return (
    <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-slate-950/40">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Project Snapshot
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{summaryDate}</h3>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
              Run {projectSummary.runId.slice(0, 8)}
            </div>
          </div>
        </div>
        {showRefreshButton ? (
          <Button
            type="button"
            variant="outline"
            onClick={onRefreshNarrative}
            disabled={Boolean(narrativeRefreshing)}
            className="inline-flex items-center gap-2 text-xs"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", narrativeRefreshing ? "animate-spin" : "")} />
            {narrativeRefreshing ? "Refreshing…" : "Refresh story"}
          </Button>
        ) : null}
      </header>

      <div className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {narrativeNode}
        {executiveNode ? (
          <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-3 text-xs text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-400">
            <p className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Executive brief</p>
            <div className="mt-1 space-y-1 text-slate-600 dark:text-slate-300">{executiveNode}</div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <ProjectMetric
              label="Active"
              value={`${metrics.activeUsers}/${metrics.trackedUsers}`}
              hint={`${metrics.offlineUsers} out today`}
            />
            <ProjectMetric
              label="Idle Rate"
              value={`${Math.round(metrics.idleRate * 100)}%`}
              hint={`${metrics.idleUsers} teammates idle`}
            />
            <ProjectMetric
              label="Blockers"
              value={legacyBlocked.toString()}
              hint={`${Math.round(metrics.blockerRate * 100)}% of team`}
            />
            <ProjectMetric
              label="Out"
              value={metrics.offlineUsers.toString()}
              hint="marked unavailable"
            />
            <ProjectMetric label="Done" value={legacyDone.toString()} hint="tasks completed" />
            <ProjectMetric
              label="Logged"
              value={`${legacyHours.toFixed(1)}h`}
              hint="worklog captured"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ProjectList
              title="Highlights"
              items={payload.topHighlights.map((item) => ({
                id: `${item.issueId}-highlight`,
                primary: item.text,
                secondary: item.issueKey,
              }))}
              emptyLabel="No highlights captured."
              variant="expanded"
            />
            <ProjectList
              title="Critical Blockers"
              items={payload.criticalBlockers.map((item) => ({
                id: `${item.issueId}-blocker`,
                primary: item.description,
                secondary: `${item.issueKey} · ${item.severity.toUpperCase()}`,
              }))}
              emptyLabel="No critical blockers flagged."
              variant="compact"
            />
          </div>

          {workspaceContextNode ? (
            <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Workspace context
              </h4>
              <div className="space-y-1 leading-relaxed">{workspaceContextNode}</div>
            </section>
          ) : null}
        </div>

        <div className="space-y-4">
          <ProjectSignalsCard
            calls={payload.callsToAction}
            callIssueIds={callIssueIds}
            atRiskAggregated={payload.atRiskWork}
            atRiskDetails={payload.atRiskDetails}
            watchlist={payload.unassignedWatchlist}
            onOpenCalls={onOpenCallsList}
            onOpenAtRisk={onOpenRiskList}
          />
        </div>
      </div>
    </section>
  );
}

function ProjectMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
      <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {hint ? <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ProjectSignalsCard({
  calls,
  callIssueIds,
  atRiskAggregated,
  atRiskDetails,
  watchlist,
  onOpenCalls,
  onOpenAtRisk,
}: {
  calls: ProjectDailySummaryRecord["projectSummary"]["payload"]["callsToAction"];
  callIssueIds: string[];
  atRiskAggregated: ProjectDailySummaryRecord["projectSummary"]["payload"]["atRiskWork"];
  atRiskDetails: ProjectDailySummaryRecord["projectSummary"]["payload"]["atRiskDetails"];
  watchlist: ProjectDailySummaryRecord["projectSummary"]["payload"]["unassignedWatchlist"];
  onOpenCalls: (issueIds: string[]) => void;
  onOpenAtRisk: (issueDetails: ProjectRiskDetail[]) => void;
}) {
  const severityCounts = calls.reduce<Record<"info" | "warning" | "critical", number>>(
    (acc, call) => {
      acc[call.severity] = (acc[call.severity] ?? 0) + 1;
      return acc;
    },
    { info: 0, warning: 0, critical: 0 },
  );

  const hasCalls = calls.length > 0;
  const hasRisks = atRiskAggregated.length > 0;
  const hasWatchlist = watchlist.length > 0;
  const watchPreview = watchlist.slice(0, 3);
  const watchRemainder = Math.max(0, watchlist.length - watchPreview.length);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
      <div className="space-y-3">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Calls to Action
          </h4>
          {hasCalls ? (
            <>
              <ul className="flex flex-wrap gap-2">
                {(["critical", "warning", "info"] as const).map((severity) =>
                  severityCounts[severity] ? (
                    <li
                      key={severity}
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        severity === "critical"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                          : severity === "warning"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                            : "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
                      )}
                    >
                      {severity.replace(/_/g, " ")} · {severityCounts[severity]}
                    </li>
                  ) : null,
                )}
              </ul>
              <button
                type="button"
                onClick={() => onOpenCalls(callIssueIds)}
                disabled={!callIssueIds.length}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
                  callIssueIds.length
                    ? "border-sky-200 text-sky-700 hover:border-sky-300 hover:text-sky-600 dark:border-sky-800 dark:text-sky-200 dark:hover:border-sky-700"
                    : "border-slate-200 text-slate-400 dark:border-slate-800 dark:text-slate-600",
                )}
              >
                View {calls.length} call{calls.length === 1 ? "" : "s"}
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">No calls to action.</p>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-300">
            At-Risk
          </h4>
          {hasRisks ? (
            <>
              <ul className="flex flex-wrap gap-2">
                {atRiskAggregated.map((item) => (
                  <li
                    key={item.flag}
                    className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                  >
                    {item.flag.replace(/_/g, " ")} · {item.count}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onOpenAtRisk(atRiskDetails)}
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:text-rose-600 dark:border-rose-800 dark:text-rose-200 dark:hover:border-rose-700"
              >
                View {atRiskDetails.length} at-risk issue{atRiskDetails.length === 1 ? "" : "s"}
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">No risks detected.</p>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Unassigned Watchlist
          </h4>
          {hasWatchlist ? (
            <div className="space-y-1">
              <ul className="space-y-1">
                {watchPreview.map((item) => (
                  <li key={item.issueId} className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{item.issueKey}</span>
                    <span className="ml-2 text-slate-500 dark:text-slate-400">{item.issueSummary}</span>
                  </li>
                ))}
              </ul>
              {watchRemainder > 0 ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">+{watchRemainder} more awaiting assignment.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">No unassigned work drift detected.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ProjectList({
  title,
  items,
  emptyLabel,
  variant = "default",
}: {
  title: string;
  items: Array<{ id: string; primary: string; secondary?: string }>;
  emptyLabel: string;
  variant?: "default" | "compact" | "expanded";
}) {
  const listClass = variant === "compact" ? "grid gap-1.5" : "grid gap-2";
  const itemClass =
    variant === "compact"
      ? "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
      : "rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300";
  const secondaryClass =
    variant === "compact"
      ? "text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500"
      : "text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500";
  const emptyClass =
    variant === "compact"
      ? "rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
      : "rounded-2xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400";

  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h4>
      {items.length ? (
        <ul className={listClass}>
          {items.map((item) => (
            <li
              key={item.id}
              className={itemClass}
            >
              <p className={variant === "expanded" ? "font-medium leading-relaxed" : "font-medium"}>{item.primary}</p>
              {item.secondary ? (
                <p className={secondaryClass}>{item.secondary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={emptyClass}>{emptyLabel}</p>
      )}
    </section>
  );
}

function extractIssueKey(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }
  const match = text.match(/\b[A-Z][A-Z0-9]+-\d+\b/);
  return match ? match[0] : null;
}

function friendlyError(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred";
}
