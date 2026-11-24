export type TaskStatus = "backlog" | "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high";

export type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  localDate: string | null;
  startTime: string | null;
  endTime: string | null;
  completedAt: string | null;
  position: string;
};

export type TaskWindow = { from: string; to: string };

export type TodayAgendaTask = {
  id: string;
  title: string;
  localDate: string;
  startTime: string | null;
  endTime: string | null;
  status: TaskStatus;
};

export function selectTodayAgenda(
  tasks: TaskRow[],
  today: string,
): { timed: TodayAgendaTask[]; untimed: TodayAgendaTask[] } {
  const open = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.localDate === today,
  );
  const timed = open
    .filter((t) => t.startTime != null)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const untimed = open
    .filter((t) => t.startTime == null)
    .sort((a, b) => a.position.localeCompare(b.position));
  const map = (t: TaskRow): TodayAgendaTask => ({
    id: t.id,
    title: t.title,
    localDate: t.localDate!,
    startTime: t.startTime,
    endTime: t.endTime,
    status: t.status,
  });
  return {
    timed: timed.map(map),
    untimed: untimed.map(map),
  };
}

export function selectOverdueTasks(
  tasks: TaskRow[],
  today: string,
): Array<{ id: string; title: string; localDate: string }> {
  return tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        t.localDate != null &&
        t.localDate < today,
    )
    .sort((a, b) => (a.localDate ?? "").localeCompare(b.localDate ?? ""))
    .map((t) => ({
      id: t.id,
      title: t.title,
      localDate: t.localDate!,
    }));
}

export type TaskSummaryWindow = { from: string; to: string };

export type TaskSummary = {
  window: TaskSummaryWindow;
  counts: {
    backlog: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number | null;
  };
  openTitles: Array<{
    id: string;
    title: string;
    status: "backlog" | "todo" | "in_progress";
    localDate: string | null;
    priority: TaskPriority | null;
  }>;
};

function completedOnLocalDate(
  completedAt: string | null,
  timezone: string,
): string | null {
  if (!completedAt) return null;
  const d = new Date(completedAt);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function dateInWindow(
  date: string | null,
  from: string,
  to: string,
): boolean {
  if (!date) return false;
  return date >= from && date <= to;
}

export function selectTaskSummary(
  tasks: TaskRow[],
  window: TaskSummaryWindow,
  today: string,
  timezone: string,
  view: "all" | "today" | "week" = "all",
): TaskSummary {
  const windowContainsToday = today >= window.from && today <= window.to;

  const backlog = tasks.filter((t) => t.status === "backlog").length;
  const todo = tasks.filter((t) => t.status === "todo").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;

  const done = tasks.filter((t) => {
    if (!t.completedAt) return false;
    const local = completedOnLocalDate(t.completedAt, timezone);
    return local != null && dateInWindow(local, window.from, window.to);
  }).length;

  const overdue =
    windowContainsToday
      ? tasks.filter(
          (t) =>
            t.status !== "done" &&
            t.localDate != null &&
            t.localDate < today,
        ).length
      : null;

  const openStatuses = new Set<TaskStatus>(["backlog", "todo", "in_progress"]);

  const openInWindow = tasks.filter((t) => {
    if (!openStatuses.has(t.status)) return false;
    if (view === "all") {
      if (t.localDate == null) return true;
      return dateInWindow(t.localDate, window.from, window.to);
    }
    if (t.localDate == null) return false;
    return dateInWindow(t.localDate, window.from, window.to);
  });

  const overdueOpen =
    overdue != null && overdue > 0
      ? tasks.filter(
          (t) =>
            openStatuses.has(t.status) &&
            t.localDate != null &&
            t.localDate < today,
        )
      : [];

  const otherOpen = openInWindow.filter(
    (t) =>
      !overdueOpen.some((o) => o.id === t.id),
  );

  const combined = [...overdueOpen, ...otherOpen].slice(0, 40);

  return {
    window,
    counts: { backlog, todo, inProgress, done, overdue },
    openTitles: combined.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status as "backlog" | "todo" | "in_progress",
      localDate: t.localDate,
      priority: t.priority,
    })),
  };
}

export const BOARD_COLUMNS: Array<{ id: TaskStatus; label: string }> = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};