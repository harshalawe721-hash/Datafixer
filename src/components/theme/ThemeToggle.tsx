"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "./theme-script";
import { cn } from "@/lib/cn";

/**
 * Switches between light and dark mode. The visible icon is chosen with CSS
 * (dark: variant), so server and client markup always match.
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* storage unavailable: theme still applies for this page view */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
        className,
      )}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
    >
      <Moon className="size-5 dark:hidden" aria-hidden="true" />
      <Sun className="hidden size-5 dark:block" aria-hidden="true" />
    </button>
  );
}
