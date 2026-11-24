"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  countPendingJobs,
  latestRecordSyncAt,
  listOutboxJobs,
} from "@/lib/pwa/idb";
import { replayOutbox } from "@/lib/pwa/replay";
import type { OutboxJob } from "@/lib/pwa/outbox-types";
import { Button } from "@/components/ui/button";

type OfflineContextValue = {
  online: boolean;
  pendingCount: number;
  staleAt: string | null;
  failedJobs: OutboxJob[];
  refreshPending: () => Promise<void>;
  userId: string | null;
};

const OfflineContext = React.createContext<OfflineContextValue | null>(null);

export function useOffline() {
  const ctx = React.useContext(OfflineContext);
  if (!ctx) {
    return {
      online: true,
      pendingCount: 0,
      staleAt: null,
      failedJobs: [] as OutboxJob[],
      refreshPending: async () => undefined,
      userId: null as string | null,
    };
  }
  return ctx;
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = React.useState(true);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [staleAt, setStaleAt] = React.useState<string | null>(null);
  const [failedJobs, setFailedJobs] = React.useState<OutboxJob[]>([]);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [dismissedFails, setDismissedFails] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [dismissedConflicts, setDismissedConflicts] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [conflictJobs, setConflictJobs] = React.useState<OutboxJob[]>([]);

  const syncMeta = React.useCallback(async (uid: string) => {
    const count = await countPendingJobs(uid);
    setPendingCount(count);
    const stale = await latestRecordSyncAt(uid);
    setStaleAt(stale);
    const jobs = await listOutboxJobs(uid);
    setFailedJobs(jobs.filter((j) => j.status === "failed"));
    setConflictJobs(jobs.filter((j) => j.status === "conflict"));
  }, []);

  function conflictLines(job: OutboxJob): { draft: string; server: string } {
    const server = job.conflictServer;
    if (job.op === "expense_update") {
      const p = job.payload as { amountMinor: string; entryId?: string };
      const serverAmt =
        server && typeof server.amount_minor === "string"
          ? server.amount_minor
          : server
            ? JSON.stringify(server)
            : "—";
      return {
        draft: `Draft amount: ${p.amountMinor}`,
        server: `Server amount: ${serverAmt}`,
      };
    }
    if (job.op === "move_task") {
      const p = job.payload as { toStatus: string; task: { title?: string; status?: string } };
      const serverStatus =
        server && typeof server.status === "string" ? server.status : "—";
      return {
        draft: `Draft: move to ${p.toStatus}`,
        server: `Server status: ${serverStatus}`,
      };
    }
    return {
      draft: `Draft: ${JSON.stringify(job.payload)}`,
      server: server ? `Server: ${JSON.stringify(server)}` : "Server: —",
    };
  }

  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const onOutbox = () => {
      if (userId) void syncMeta(userId);
    };
    window.addEventListener("dayboard:outbox-changed", onOutbox);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("dayboard:outbox-changed", onOutbox);
    };
  }, [syncMeta, userId]);

  React.useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) await syncMeta(uid);
    })();
  }, [syncMeta]);

  React.useEffect(() => {
    if (!online || !userId) return;
    void (async () => {
      const supabase = createClient();
      await replayOutbox(userId, supabase);
      await syncMeta(userId);
      await queryClient.invalidateQueries();
    })();
  }, [online, userId, queryClient, syncMeta]);

  const visibleFails = failedJobs.filter((j) => !dismissedFails.has(j.id));
  const visibleConflicts = conflictJobs.filter((j) => !dismissedConflicts.has(j.id));

  return (
    <OfflineContext.Provider
      value={{
        online,
        pendingCount,
        staleAt,
        failedJobs,
        refreshPending: async () => {
          if (userId) await syncMeta(userId);
        },
        userId,
      }}
    >
      {!online ? (
        <div
          className="border-b border-primary/20 bg-accent/80 px-4 py-2 text-center text-xs font-medium tracking-wide text-accent-foreground backdrop-blur-sm"
          style={{ animation: "db-fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both" }}
          role="status"
          data-testid="offline-banner"
        >
          Offline — showing saved data.
          {pendingCount > 0
            ? ` ${pendingCount} ${pendingCount === 1 ? "change" : "changes"} waiting to save.`
            : null}
        </div>
      ) : pendingCount > 0 ? (
        <div
          className="border-b border-border/80 bg-muted/50 px-4 py-1.5 text-center text-xs text-muted-foreground backdrop-blur-sm"
          style={{ animation: "db-fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both" }}
          role="status"
        >
          Waiting to save: {pendingCount} {pendingCount === 1 ? "change" : "changes"}.
        </div>
      ) : null}
      {visibleConflicts.map((job) => {
        const lines = conflictLines(job);
        return (
          <div
            key={job.id}
            className="border-b border-primary/30 bg-accent/60 px-4 py-2 text-sm backdrop-blur-sm"
            style={{ animation: "db-fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both" }}
            role="alert"
            data-testid="outbox-conflict"
          >
            <p className="font-medium">{job.failMessage ?? "Save conflict."}</p>
            <p className="mt-1 text-xs text-muted-foreground">{lines.draft}</p>
            <p className="text-xs text-muted-foreground">{lines.server}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() =>
                setDismissedConflicts((s) => new Set(s).add(job.id))
              }
            >
              Dismiss
            </Button>
          </div>
        );
      })}
      {visibleFails.map((job) => (
        <div
          key={job.id}
          className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm backdrop-blur-sm"
          style={{ animation: "db-fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both" }}
          role="alert"
        >
          <span>{job.failMessage ?? "Save failed."}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-3"
            onClick={() =>
              setDismissedFails((s) => new Set(s).add(job.id))
            }
          >
            Dismiss
          </Button>
        </div>
      ))}
      {children}
    </OfflineContext.Provider>
  );
}