"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Menu, X } from "lucide-react";
import { tools } from "@/config/tools";
import { mainNav } from "@/config/navigation";

/** Collapsible navigation for small screens. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const pathname = usePathname();

  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-10 items-center justify-center rounded-xl text-foreground hover:bg-surface-muted"
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-surface shadow-elevated"
      >
        <nav aria-label="Mobile" className="px-4 py-4">
          <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">Tools</p>
          <ul className="space-y-1">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <li key={tool.id}>
                  <Link
                    href={tool.href}
                    aria-current={pathname === tool.href ? "page" : undefined}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-muted aria-[current=page]:bg-surface-muted"
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="size-4.5 text-primary" aria-hidden="true" />
                    {tool.name}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="my-3 border-t border-line" />
          <ul className="space-y-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-muted"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
