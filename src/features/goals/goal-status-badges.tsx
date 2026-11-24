import { cn } from "@/lib/utils";
import {
  GOAL_ITEM_STATUS_LABEL,
  GOAL_PROGRESS_STATUS_LABEL,
  type GoalItemStatus,
  type GoalProgressStatus,
} from "@/features/goals/selectors";

const itemStatusClass: Record<GoalItemStatus, string> = {
  not_started: "border-border/80 bg-muted/80 text-muted-foreground",
  in_progress: "border-primary/50 bg-primary/10 text-foreground",
  practicing: "border-accent-foreground/30 bg-accent/80 text-accent-foreground",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
};

const progressStatusClass: Record<GoalProgressStatus, string> = {
  empty: "border-border/80 bg-muted/60 text-muted-foreground",
  in_progress: "border-primary/50 bg-primary/10 text-foreground",
  complete: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
};

export function GoalItemStatusBadge({
  status,
  className,
}: {
  status: GoalItemStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        itemStatusClass[status],
        className,
      )}
      data-goal-item-status={status}
    >
      {GOAL_ITEM_STATUS_LABEL[status]}
    </span>
  );
}

export function GoalProgressStatusBadge({
  status,
  className,
}: {
  status: GoalProgressStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        progressStatusClass[status],
        className,
      )}
      data-goal-status={status}
    >
      {GOAL_PROGRESS_STATUS_LABEL[status]}
    </span>
  );
}

export function GoalArchivedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border/80 bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
      data-goal-status="archived"
    >
      Archived
    </span>
  );
}