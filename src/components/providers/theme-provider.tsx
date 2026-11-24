"use client";

import * as React from "react";

export type ThemeSetting = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: "class";
  defaultTheme?: ThemeSetting;
  enableSystem?: boolean;
  storageKey?: string;
  /** Profile (DB) theme — wins over localStorage on first paint when set. */
  sourceTheme?: ThemeSetting | null;
};

type ThemeContextValue = {
  theme: ThemeSetting;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeSetting) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function systemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyClass(theme: ThemeSetting) {
  const root = document.documentElement;
  const resolved = theme === "system" ? systemTheme() : theme;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "dayboard-theme",
  sourceTheme,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<ThemeSetting>(() =>
    sourceTheme ?? defaultTheme,
  );
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(
    "light",
  );

  React.useEffect(() => {
    const stored = localStorage.getItem(storageKey) as ThemeSetting | null;
    const initial = sourceTheme ?? stored ?? defaultTheme;
    setThemeState(initial);
    applyClass(initial);
    setResolvedTheme(initial === "system" ? systemTheme() : initial);
  }, [defaultTheme, sourceTheme, storageKey]);

  React.useEffect(() => {
    applyClass(theme);
    setResolvedTheme(theme === "system" ? systemTheme() : theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme === "system") {
        applyClass("system");
        setResolvedTheme(systemTheme());
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = React.useCallback(
    (next: ThemeSetting) => {
      localStorage.setItem(storageKey, next);
      setThemeState(next);
    },
    [storageKey],
  );

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}