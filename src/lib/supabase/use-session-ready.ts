"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";

export type SessionState = "pending" | "authed" | "guest";

/** Resolves once cookies are read; avoids firing data queries before auth hydrates. */
export function useSessionState(): SessionState {
  const [state, setState] = React.useState<SessionState>("pending");

  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setState(data.session ? "authed" : "guest");
    };

    void sync();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void sync();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** @deprecated use useSessionState */
export function useSessionReady(): boolean {
  const state = useSessionState();
  return state === "authed";
}