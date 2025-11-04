import clsx from 'clsx';
import { CheckCircle2, AlarmClock, AlertTriangle, Clock4, Moon } from 'lucide-react';
import { DailySummaryRecord } from '../../types/scrum';

interface ScrumQuickGlanceProps {
  summaries: DailySummaryRecord[];
  selectedId: string | null;
  onSelect: (summaryId: string) => void;
}

const STATUS_META: Record<
  DailySummaryRecord['status'],
  { icon: typeof CheckCircle2; pill: string; iconColor: string; label: string }
> = {
  ON_TRACK: {
    icon: CheckCircle2,
    pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
    label: 'On Track',
  },
  DELAYED: {
    icon: Clock4,
    pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    iconColor: 'text-amber-600 dark:text-amber-300',
    label: 'Delayed',
  },
  BLOCKED: {
    icon: AlertTriangle,
    pill: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
    iconColor: 'text-rose-600 dark:text-rose-300',
    label: 'Blocked',
  },
  OFFLINE: {
    icon: Moon,
    pill: 'bg-slate-200 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
    iconColor: 'text-slate-500 dark:text-slate-400',
    label: 'Out of office',
  },
};

export function ScrumQuickGlance({ summaries, selectedId, onSelect }: ScrumQuickGlanceProps) {
  const interactionScore = (summary: DailySummaryRecord) => {
    let interactions = 0;
    for (const group of summary.workItems) {
      for (const item of group.items) {
        interactions += item.recentWorklogs.length + item.recentComments.length;
      }
    }
    const pendingActive = summary.issueCounts.todo + summary.issueCounts.inProgress;
    return interactions * 10 + pendingActive - summary.issueCounts.blocked;
  };

  const orderedSummaries = summaries
    .slice()
    .sort((a, b) => {
      const worklogDelta = b.worklogHours - a.worklogHours;
      if (Math.abs(worklogDelta) > 0.01) {
        return worklogDelta;
      }

      const scoreDelta = interactionScore(b) - interactionScore(a);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return (b.issueCounts.todo + b.issueCounts.inProgress) - (a.issueCounts.todo + a.issueCounts.inProgress);
    });

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex snap-x snap-mandatory gap-2 pr-4">
        {orderedSummaries.map((summary) => {
          const displayName =
            summary.user?.displayName ?? summary.trackedUser?.displayName ?? 'Unassigned';
          const pendingCount = summary.issueCounts.todo + summary.issueCounts.inProgress;
          const statusMeta = STATUS_META[summary.status];
          const StatusIcon = statusMeta.icon;
          return (
            <button
              key={summary.id}
              type="button"
              onClick={() => onSelect(summary.id)}
              className={clsx(
                'flex min-w-[210px] flex-col items-stretch gap-2 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md dark:bg-slate-900/70',
                selectedId === summary.id
                  ? 'border-sky-300 shadow-sky-200/50 dark:border-sky-500/60'
                  : 'border-slate-200 dark:border-slate-800',
              )}
            >
              <div className="flex items-start justify-between gap-2 ">
                <div className="space-y-1">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100 capitalize max-w-[80px]">
                    {displayName}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {/* {summary.project?.key ?? 'Project'} · {summary.project?.name ?? 'Unknown'} */}
                  </p>
                </div>
                <div>
                  <div
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px]',
                      statusMeta.pill,
                    )}
                    title={statusMeta.label}
                  >
                    <StatusIcon className={clsx('h-3.5 w-3.5', statusMeta.iconColor)} />
                  </div>
                  <span className="inline-flex items-center gap-1 font-medium">
                    <AlarmClock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                    {summary.worklogHours.toFixed(1)}h
                  </span>
                </div>
              </div>

              <dl className="grid grid-cols-4 gap-1 text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Metric
                  label="Done"
                  value={summary.issueCounts.done}
                  accent="text-emerald-600 dark:text-emerald-300"
                />
                <Metric
                  label="Blocked"
                  value={summary.issueCounts.blocked}
                  accent="text-rose-600 dark:text-rose-300"
                />
                <Metric
                  label="Pending"
                  value={pendingCount}
                  accent="text-sky-600 dark:text-sky-300"
                />
                <Metric
                  label="Backlog"
                  value={summary.issueCounts.backlog}
                  accent="text-slate-600 dark:text-slate-300"
                />
              </dl>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-900/50">
      <span className="text-[7px] font-medium text-slate-400 dark:text-slate-500">{label}</span>
      <span className={clsx('text-sm font-semibold', accent)}>{value}</span>
    </div>
  );
}
