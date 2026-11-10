"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { tools } from "@/config/tools";
import { cn } from "@/lib/cn";

/** Accessible "Tools" disclosure menu for the desktop header. */
export function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pathname = usePathname();

  // Close whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function focusItem(delta: number) {
    const items = Array.from(containerRef.current?.querySelectorAll<HTMLAnchorElement>("[data-menu-item]") ?? []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    const next = current === -1 ? (delta > 0 ? 0 : items.length - 1) : (current + delta + items.length) % items.length;
    items[next]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      requestAnimationFrame(() => focusItem(1));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      focusItem(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
          open && "bg-surface-muted text-foreground",
        )}
      >
        Tools
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="animate-fade-up absolute left-1/2 top-full z-50 mt-2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-line bg-surface p-2 shadow-elevated"
      >
        <ul className="grid gap-1 sm:grid-cols-2">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const active = pathname === tool.href;
            return (
              <li key={tool.id}>
                <Link
                  href={tool.href}
                  data-menu-item
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex gap-3 rounded-xl p-3 transition-colors hover:bg-surface-muted",
                    active && "bg-surface-muted",
                  )}
                >
                  <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{tool.name}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{tool.summary}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
