"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { SurfaceCard } from "@/components/ui/page-chrome";

type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"];

async function fetchDueReminders(): Promise<ReminderRow[]> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("enabled", true)
    .lte("fire_at", now)
    .order("fire_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReminderRow[];
}

export function ReminderInbox({ enabled }: { enabled: boolean }) {
  const { data: reminders } = useQuery({
    queryKey: ["reminder-inbox"],
    queryFn: fetchDueReminders,
    enabled,
    refetchInterval: 60_000,
  });

  if (!enabled) return null;

  if (!reminders?.length) return null;

  return (
    <aside
      className="border-b border-border/80 px-4 py-3"
      aria-label="Reminders inbox"
      data-testid="reminder-inbox"
    >
      <div role="status">
      <SurfaceCard className="animate-scale-in border-primary/15 bg-accent/40 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Reminders
        </p>
        <ul className="db-stagger mt-2 space-y-1.5 text-sm">
          {reminders.map((r) => (
            <li
              key={r.id}
              className="flex items-baseline gap-2 text-foreground"
            >
              <span className="text-primary" aria-hidden>
                ●
              </span>
              <span>
                {r.subject_type === "task" ? "Task" : "Savings"} ·{" "}
                {new Date(r.fire_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </SurfaceCard>
      </div>
    </aside>
  );
}