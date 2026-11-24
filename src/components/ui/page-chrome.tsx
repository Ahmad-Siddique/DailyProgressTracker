import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "db-page-enter mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        <h1
          id="page-heading"
          className="font-display text-3xl font-semibold tracking-tight text-foreground"
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 animate-fade-up">{action}</div> : null}
    </header>
  );
}

export function PageSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("db-stagger space-y-3", className)}>
      {title ? (
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function SurfaceCard({
  children,
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        interactive ? "db-surface-interactive" : "db-surface",
        "p-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <SurfaceCard
      className={cn(
        "py-10 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {message}
    </SurfaceCard>
  );
}

export function LoadingPulse({ label = "Loading" }: { label?: string }) {
  return (
    <div className="db-page-enter space-y-4" role="status" aria-live="polite">
      <div className="db-shimmer h-8 w-48 rounded-lg" aria-hidden />
      <div className="db-shimmer h-24 w-full rounded-xl" aria-hidden />
      <div className="db-shimmer h-24 w-full rounded-xl" aria-hidden />
      <p
        className="text-sm text-muted-foreground"
        style={{ animation: "db-pulse-soft 1.5s ease infinite" }}
      >
        {label}
      </p>
    </div>
  );
}