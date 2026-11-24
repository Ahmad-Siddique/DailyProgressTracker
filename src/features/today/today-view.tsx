"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSessionState } from "@/lib/supabase/use-session-ready";
import { loadTodayData } from "@/features/today/load-today-data";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  LoadingPulse,
  PageHeader,
  PageSection,
  SurfaceCard,
} from "@/components/ui/page-chrome";

export function TodayView() {
  const router = useRouter();
  const sessionState = useSessionState();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["today"],
    enabled: sessionState === "authed",
    retry: 2,
    queryFn: async () => {
      const supabase = createClient();
      return loadTodayData(supabase);
    },
  });

  React.useEffect(() => {
    if (sessionState === "guest") {
      router.replace("/login?next=/today");
    }
  }, [sessionState, router]);

  React.useEffect(() => {
    if (error instanceof Error && error.message === "Not signed in") {
      router.replace("/login?next=/today");
    }
  }, [error, router]);

  if (sessionState === "pending" || isLoading) {
    return (
      <section aria-labelledby="today-heading">
        <PageHeader title="Today" />
        <LoadingPulse label="Loading today" />
      </section>
    );
  }

  if (sessionState === "guest") {
    return null;
  }

  if (error || !data) {
    const message =
      error instanceof Error ? error.message : "Could not load Today.";
    return (
      <section aria-labelledby="today-heading">
        <PageHeader title="Today" />
        <p className="text-destructive" role="alert">
          {message === "Not signed in"
            ? "Session expired."
            : "Could not load Today."}
        </p>
        {message !== "Not signed in" ? (
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void refetch()} disabled={isFetching}>
            Retry
          </Button>
          <Link
            href="/login?next=/today"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium"
          >
            Sign in again
          </Link>
        </div>
      </section>
    );
  }

  const empty =
    data.agenda.timed.length === 0 &&
    data.agenda.untimed.length === 0 &&
    data.overdue.length === 0 &&
    data.goalDeadlines.length === 0;

  return (
    <section aria-labelledby="today-heading">
      <PageHeader
        title="Today"
        description={data.today}
      />

      {data.overdue.length > 0 ? (
        <PageSection title="Overdue" className="mt-2">
          <ul className="space-y-2">
            {data.overdue.map((t) => (
              <li key={t.id} data-testid="overdue-card">
                <SurfaceCard className="text-sm">
                  <span className="font-medium">{t.title}</span>
                  <span className="ml-2 text-muted-foreground">{t.localDate}</span>
                </SurfaceCard>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}

      <PageSection title="Agenda" className="mt-8">
        {data.agenda.timed.length + data.agenda.untimed.length === 0 ? (
          <EmptyState message="Nothing timed for today." />
        ) : (
          <ol className="space-y-2">
            {[...data.agenda.timed, ...data.agenda.untimed].map((t) => (
              <li key={t.id}>
                <SurfaceCard className="text-sm">
                  <span className="font-medium">{t.title}</span>
                  {t.startTime ? (
                    <span className="ml-2 text-muted-foreground">
                      {t.startTime.slice(0, 5)}
                    </span>
                  ) : null}
                </SurfaceCard>
              </li>
            ))}
          </ol>
        )}
      </PageSection>

      {data.goalDeadlines.length > 0 ? (
        <PageSection title="Goal deadlines" className="mt-8">
          <ul className="space-y-2">
            {data.goalDeadlines.map((g) => (
              <li key={g.id}>
                <SurfaceCard className="text-sm">
                  {g.title} — {g.deadlineDate}
                </SurfaceCard>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}

      {data.pastDeadlines.length > 0 ? (
        <PageSection title="Past deadline" className="mt-8">
          <ul className="space-y-2">
            {data.pastDeadlines.map((g) => (
              <li key={g.id}>
                <SurfaceCard className="text-sm text-muted-foreground">
                  {g.title} — {g.deadlineDate}
                </SurfaceCard>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}

      {empty ? (
        <EmptyState className="mt-8" message="Nothing due today." />
      ) : null}
    </section>
  );
}