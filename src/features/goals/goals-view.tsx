"use client";

import Link from "next/link";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  createGoal,
  fetchGoalItems,
  fetchGoals,
} from "@/features/goals/api";
import {
  formatGoalProgress,
  selectGoalProgress,
  selectGoalProgressStatus,
  summarizeItemStatuses,
  type GoalListSnapshot,
} from "@/features/goals/selectors";
import {
  GoalArchivedBadge,
  GoalItemStatusBadge,
  GoalProgressStatusBadge,
} from "@/features/goals/goal-status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EmptyState,
  LoadingPulse,
  PageHeader,
  PageSection,
  SurfaceCard,
} from "@/components/ui/page-chrome";

const LIST_ITEM_PREVIEW_LIMIT = 5;

function buildGoalSnapshot(
  goalId: string,
  items: Awaited<ReturnType<typeof fetchGoalItems>>,
): GoalListSnapshot {
  const progress = selectGoalProgress(items);
  return {
    progress,
    progressText: formatGoalProgress(progress),
    progressStatus: selectGoalProgressStatus(progress),
    itemSummary: summarizeItemStatuses(items),
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
    })),
  };
}

export function GoalsView() {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [segment, setSegment] = React.useState<"active" | "history">("active");

  const { data: goals, isLoading, error, refetch } = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const supabase = createClient();
      return fetchGoals(supabase);
    },
  });

  const snapshotByGoal = useQuery({
    queryKey: ["goals-progress", goals?.map((g) => g.id)],
    enabled: !!goals?.length,
    queryFn: async () => {
      const supabase = createClient();
      const out = new Map<string, GoalListSnapshot>();
      for (const g of goals ?? []) {
        const items = await fetchGoalItems(supabase, g.id);
        out.set(g.id, buildGoalSnapshot(g.id, items));
      }
      return out;
    },
  });

  const filtered = (goals ?? []).filter((g) =>
    segment === "active" ? g.archivedAt == null : g.archivedAt != null,
  );

  async function onAddGoal(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const supabase = createClient();
    const result = await createGoal(supabase, title);
    if (result.ok) {
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
    } else {
      setStatus(result.error);
    }
  }

  if (isLoading) {
    return (
      <section aria-labelledby="goals-heading">
        <PageHeader title="Goals" />
        <LoadingPulse label="Loading goals" />
      </section>
    );
  }

  if (error) {
    return (
      <section aria-labelledby="goals-heading">
        <PageHeader title="Goals" />
        <p className="text-destructive" role="alert">
          Could not load goals.
        </p>
        <Button type="button" className="mt-2" onClick={() => void refetch()}>
          Retry
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="goals-heading">
      <PageHeader title="Goals" />
      <div className="mt-4 flex gap-2" role="tablist" aria-label="Goal segments">
        <Button
          type="button"
          variant={segment === "active" ? "default" : "outline"}
          role="tab"
          aria-selected={segment === "active"}
          onClick={() => setSegment("active")}
        >
          Active
        </Button>
        <Button
          type="button"
          variant={segment === "history" ? "default" : "outline"}
          role="tab"
          aria-selected={segment === "history"}
          onClick={() => setSegment("history")}
        >
          History
        </Button>
      </div>

      <PageSection className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState
            message={segment === "active" ? "No goals yet" : "No archived goals"}
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((g) => {
              const snapshot = snapshotByGoal.data?.get(g.id);
              const preview = snapshot?.items ?? [];
              const overflow =
                preview.length > LIST_ITEM_PREVIEW_LIMIT
                  ? preview.length - LIST_ITEM_PREVIEW_LIMIT
                  : 0;
              const visible = preview.slice(0, LIST_ITEM_PREVIEW_LIMIT);
              return (
                <li key={g.id}>
                  <Link
                    href={`/goals/${g.id}`}
                    className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SurfaceCard interactive className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{g.title}</span>
                        {snapshot ? (
                          <GoalProgressStatusBadge status={snapshot.progressStatus} />
                        ) : null}
                        {g.archivedAt != null ? <GoalArchivedBadge /> : null}
                        {g.deadlineDate ? (
                          <span className="text-muted-foreground">
                            Due {g.deadlineDate}
                          </span>
                        ) : null}
                      </div>
                      <p
                        className="mt-2 text-muted-foreground"
                        data-testid="goal-progress"
                      >
                        {snapshot?.progressText ?? "—"}
                      </p>
                      {snapshot?.itemSummary ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Sub-goals: {snapshot.itemSummary}
                        </p>
                      ) : null}
                      {visible.length > 0 ? (
                        <ul
                          className="mt-3 space-y-1.5 border-t border-border/60 pt-3"
                          aria-label={`Sub-goals for ${g.title}`}
                        >
                          {visible.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="min-w-0 truncate">{item.title}</span>
                              <GoalItemStatusBadge status={item.status} />
                            </li>
                          ))}
                          {overflow > 0 ? (
                            <li className="text-xs text-muted-foreground">
                              +{overflow} more
                            </li>
                          ) : null}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No sub-goals yet
                        </p>
                      )}
                    </SurfaceCard>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>

      {segment === "active" ? (
        <form className="mt-8 space-y-3" onSubmit={(e) => void onAddGoal(e)}>
          <div>
            <Label htmlFor="goal-title">Add goal</Label>
            <Input
              id="goal-title"
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <Button type="submit">Save goal</Button>
          {status ? (
            <p className="text-sm text-destructive" role="alert">
              {status}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}