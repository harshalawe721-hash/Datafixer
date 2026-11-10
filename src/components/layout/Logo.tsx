import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M8 10h16M8 16h7M8 22h7M14 10v12" stroke="white" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m17.5 19 2.5 2.5 5-5.5" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 rounded-lg", className)} aria-label="DataFixer home">
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">
        Data<span className="text-primary">Fixer</span>
      </span>
    </Link>
  );
}
