"use client";

import * as React from "react";
import type { ResolvedScope, AiTurn } from "@/features/ai/types";

export type AiPanelSeed = {
  goalMode?: ResolvedScope["goalMode"];
  goalIds?: string[];
  monthMode?: ResolvedScope["monthMode"];
  month?: string | null;
  taskSummary?: boolean;
  finance?: boolean;
};

type AiContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  scope: ResolvedScope;
  setScope: React.Dispatch<React.SetStateAction<ResolvedScope>>;
  draft: string;
  setDraft: (v: string) => void;
  messages: AiTurn[];
  setMessages: React.Dispatch<React.SetStateAction<AiTurn[]>>;
  assistantLive: string;
  setAssistantLive: (v: string) => void;
  openWithSeed: (seed: AiPanelSeed) => void;
  resetChat: () => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
};

const defaultScope = (): ResolvedScope => ({
  finance: false,
  goalIds: [],
  goalMode: "none",
  month: null,
  monthMode: "none",
  taskSummary: false,
});

const AiContext = React.createContext<AiContextValue | null>(null);

export function AiProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [scope, setScope] = React.useState<ResolvedScope>(defaultScope);
  const [draft, setDraft] = React.useState("");
  const [messages, setMessages] = React.useState<AiTurn[]>([]);
  const [assistantLive, setAssistantLive] = React.useState("");
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  const openWithSeed = React.useCallback((seed: AiPanelSeed) => {
    setScope((prev) => ({
      finance: seed.finance ?? prev.finance,
      goalIds: seed.goalIds ?? prev.goalIds,
      goalMode: seed.goalMode ?? prev.goalMode,
      month: seed.month !== undefined ? seed.month : prev.month,
      monthMode: seed.monthMode ?? prev.monthMode,
      taskSummary: seed.taskSummary ?? prev.taskSummary,
    }));
    setOpen(true);
  }, []);

  const resetChat = React.useCallback(() => {
    setMessages([]);
    setAssistantLive("");
  }, []);

  const value: AiContextValue = {
    open,
    setOpen,
    scope,
    setScope,
    draft,
    setDraft,
    messages,
    setMessages,
    assistantLive,
    setAssistantLive,
    openWithSeed,
    resetChat,
    returnFocusRef,
  };

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}

export function useAi() {
  const ctx = React.useContext(AiContext);
  if (!ctx) throw new Error("useAi requires AiProvider");
  return ctx;
}