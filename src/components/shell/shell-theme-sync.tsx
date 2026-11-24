"use client";

import * as React from "react";
import { useTheme, type ThemeSetting } from "@/components/providers/theme-provider";

type ShellThemeSyncProps = {
  theme: ThemeSetting | null;
};

export function ShellThemeSync({ theme }: ShellThemeSyncProps) {
  const { setTheme } = useTheme();
  const synced = React.useRef(false);

  React.useLayoutEffect(() => {
    if (!theme || synced.current) return;
    synced.current = true;
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}