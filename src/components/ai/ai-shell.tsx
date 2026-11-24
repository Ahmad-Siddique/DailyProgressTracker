"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { AiPanel } from "./ai-panel";
import { AiProvider, useAi } from "./ai-provider";

function AiHeaderButton() {
  const ai = useAi();
  return (
    <Button
      type="button"
      variant="premium"
      size="sm"
      className="md:static"
      aria-expanded={ai.open}
      onClick={(e) => {
        ai.returnFocusRef.current = e.currentTarget;
        ai.setOpen((o) => !o);
      }}
    >
      AI
    </Button>
  );
}

function ShellBody({ children }: { children: React.ReactNode }) {
  const ai = useAi();
  return (
    <div className="flex min-h-screen min-w-0 flex-1 flex-col md:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/80 bg-background/80 px-4 py-3 backdrop-blur-md">
          <span className="font-display text-base font-semibold tracking-tight text-foreground md:hidden">
            Dayboard
          </span>
          <span className="hidden font-display text-sm font-medium tracking-tight text-muted-foreground md:inline">
            <span className="text-primary">●</span> Dayboard
          </span>
          <AiHeaderButton />
        </header>
        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          <div className="db-page-enter w-full max-w-none px-4 py-6 md:px-8 md:py-8 lg:px-10">
            {children}
          </div>
        </main>
      </div>
      {ai.open ? <AiPanel /> : null}
    </div>
  );
}

export function AiShell({ children }: { children: React.ReactNode }) {
  return (
    <AiProvider>
      <ShellBody>{children}</ShellBody>
    </AiProvider>
  );
}