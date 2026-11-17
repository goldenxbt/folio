"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyTheme,
  emptyThemeSnapshot,
  readThemeSnapshot,
  subscribeTheme,
  writeTheme,
} from "@/lib/theme";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readThemeSnapshot, emptyThemeSnapshot);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const dark = theme === "dark";

  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => writeTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun /> : <Moon />}
      {dark ? "Light" : "Dark"}
    </Button>
  );
}
