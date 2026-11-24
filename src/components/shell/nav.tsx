"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PRIMARY_LINKS = [
  { href: "/today", label: "Today" },
  { href: "/board", label: "Board" },
  { href: "/goals", label: "Goals" },
  { href: "/money", label: "Money" },
  { href: "/review", label: "Review" },
] as const;

const MORE_LINKS = [
  { href: "/export", label: "Export" },
  { href: "/settings", label: "Settings" },
] as const;

function NavLink({
  href,
  label,
  className,
  onNavigate,
}: {
  href: string;
  label: string;
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "db-nav-active-pill" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

export function DesktopSidebar() {
  return (
    <aside
      className="hidden w-60 shrink-0 border-r border-border/80 bg-card/40 backdrop-blur-md md:flex md:flex-col md:gap-0.5 md:p-5"
      aria-label="Primary"
    >
      <p className="font-display mb-6 px-3 text-lg font-semibold tracking-tight text-foreground">
        Dayboard
      </p>
      <p className="mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Workspace
      </p>
      {PRIMARY_LINKS.map((l) => (
        <NavLink key={l.href} {...l} />
      ))}
      <p className="mb-2 mt-6 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        More
      </p>
      {MORE_LINKS.map((l) => (
        <NavLink key={l.href} {...l} />
      ))}
    </aside>
  );
}

function TabDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "mb-0.5 block h-1.5 w-1.5 rounded-full transition-all duration-300",
        active
          ? "scale-125 bg-primary shadow-[0_0_8px_hsl(var(--glow)/0.5)]"
          : "bg-muted-foreground/35",
      )}
      aria-hidden
    />
  );
}

export function MobileTabBar() {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const pathname = usePathname();

  const moreActive = MORE_LINKS.some(
    (l) => pathname === l.href || pathname.startsWith(`${l.href}/`),
  );

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border/80 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
        aria-label="Primary"
      >
        {PRIMARY_LINKS.map((l) => {
          const active =
            pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[0.65rem] font-medium tracking-wide transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <TabDot active={active} />
              {l.label}
            </Link>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          className="flex h-auto flex-1 flex-col items-center justify-center gap-0.5 rounded-none py-2.5 text-[0.65rem] font-medium tracking-wide"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          onClick={() => setMoreOpen((o) => !o)}
        >
          <TabDot active={moreActive || moreOpen} />
          More
        </Button>
      </nav>
      {moreOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-foreground/15 backdrop-blur-[2px] md:hidden"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="mobile-more-sheet"
            role="dialog"
            aria-label="More destinations"
            className="fixed inset-x-0 bottom-14 z-50 rounded-t-2xl border border-border/80 bg-card/95 p-5 shadow-premium backdrop-blur-xl md:hidden"
            style={{ animation: "db-sheet-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" aria-hidden />
            <div className="flex flex-col gap-1">
              {MORE_LINKS.map((l) => (
                <NavLink
                  key={l.href}
                  {...l}
                  onNavigate={() => setMoreOpen(false)}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setMoreOpen(false)}
            >
              Close
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}