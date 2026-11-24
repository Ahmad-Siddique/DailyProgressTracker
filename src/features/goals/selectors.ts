export type GoalItemStatus =
  | "not_started"
  | "in_progress"
  | "practicing"
  | "done";

export const GOAL_ITEM_STATUS_LABEL: Record<GoalItemStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  practicing: "Practicing",
  done: "Done",
};

export type GoalProgressStatus = "empty" | "in_progress" | "complete";

export const GOAL_PROGRESS_STATUS_LABEL: Record<GoalProgressStatus, string> = {
  empty: "No items",
  in_progress: "In progress",
  complete: "Complete",
};

export type GoalItemRow = {
  id: string;
  title: string;
  status: GoalItemStatus;
  position: string;
  statusChangedAt: string;
};

export type GoalProgress =
  | { state: "empty" }
  | { state: "ratio"; done: number; active: number; percent: number };

export function selectGoalProgress(items: GoalItemRow[]): GoalProgress {
  if (items.length === 0) return { state: "empty" };
  const done = items.filter((i) => i.status === "done").length;
  const active = items.length;
  const percent = Math.round((done / active) * 100);
  return { state: "ratio", done, active, percent };
}

export function formatGoalProgress(progress: GoalProgress): string {
  if (progress.state === "empty") return "Empty";
  return `${progress.done} of ${progress.active} (${progress.percent}%)`;
}

export function selectGoalProgressStatus(
  progress: GoalProgress,
): GoalProgressStatus {
  if (progress.state === "empty") return "empty";
  if (progress.done === progress.active) return "complete";
  return "in_progress";
}

export function summarizeItemStatuses(items: GoalItemRow[]): string {
  const counts: Record<GoalItemStatus, number> = {
    not_started: 0,
    in_progress: 0,
    practicing: 0,
    done: 0,
  };
  for (const item of items) counts[item.status] += 1;
  const parts: string[] = [];
  if (counts.done) parts.push(`${counts.done} done`);
  if (counts.in_progress) parts.push(`${counts.in_progress} in progress`);
  if (counts.practicing) parts.push(`${counts.practicing} practicing`);
  if (counts.not_started) parts.push(`${counts.not_started} not started`);
  return parts.length === 0 ? "No sub-goals" : parts.join(" · ");
}

export type GoalListItemPreview = {
  id: string;
  title: string;
  status: GoalItemStatus;
};

export type GoalListSnapshot = {
  progress: GoalProgress;
  progressText: string;
  progressStatus: GoalProgressStatus;
  itemSummary: string;
  items: GoalListItemPreview[];
};

export type LinkedTaskRef = {
  goalItemId: string;
  id: string;
  status: string;
  localDate: string | null;
};

export type StallAsOf = { localDate: string };

export function selectStalledItems(
  items: GoalItemRow[],
  links: LinkedTaskRef[],
  goalDeadline: string | null,
  asOf: StallAsOf,
): GoalItemRow[] {
  const asOfMs = Date.parse(`${asOf.localDate}T12:00:00Z`);
  const upcoming = new Set<string>();
  for (const t of links) {
    if (t.status === "done") continue;
    if (t.localDate && t.localDate >= asOf.localDate) {
      upcoming.add(t.goalItemId);
    }
  }
  return items.filter((item) => {
    if (item.status !== "not_started" && item.status !== "in_progress") {
      return false;
    }
    if (upcoming.has(item.id)) return false;
    const changedMs = Date.parse(item.statusChangedAt);
    const stalledByAge =
      !Number.isNaN(changedMs) &&
      (asOfMs - changedMs) / 86_400_000 > 14;
    let stalledByDeadline = false;
    if (goalDeadline) {
      const dlMs = Date.parse(`${goalDeadline}T12:00:00Z`);
      const days = (dlMs - asOfMs) / 86_400_000;
      stalledByDeadline = days <= 14;
    }
    return stalledByAge || stalledByDeadline;
  });
}

export type GoalDetailGoal = {
  id: string;
  title: string;
  notes: string | null;
  deadlineDate: string | null;
  archivedAt: string | null;
};

export type GoalDetailTask = {
  id: string;
  title: string;
  status: string;
  localDate: string | null;
  goalItemId: string | null;
};

export function selectGoalDetail(
  goal: GoalDetailGoal,
  items: GoalItemRow[],
  tasks: GoalDetailTask[],
  asOf: StallAsOf,
) {
  const ordered = [...items].sort((a, b) =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
  );
  const links = tasks
    .filter((t) => t.goalItemId)
    .map((t) => ({
      goalItemId: t.goalItemId!,
      id: t.id,
      status: t.status,
      localDate: t.localDate,
    }));
  return {
    id: goal.id,
    title: goal.title,
    notes: goal.notes,
    deadline: goal.deadlineDate,
    archived: goal.archivedAt != null,
    progress: selectGoalProgress(ordered),
    items: ordered.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      position: i.position,
      statusChangedAt: i.statusChangedAt,
    })),
    stalledItemIds: selectStalledItems(
      ordered,
      links,
      goal.deadlineDate,
      asOf,
    ).map((i) => i.id),
    linkedTasks: tasks
      .filter((t) => t.goalItemId)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        localDate: t.localDate,
        goalItemId: t.goalItemId,
      })),
  };
}