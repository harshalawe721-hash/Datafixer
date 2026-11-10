import { cn } from "@/lib/cn";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-6 shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

export function IconBadge({
  children,
  tone = "primary",
  className,
}: {
  children: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    primary: "bg-secondary text-secondary-foreground",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  } as const;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-xl", tones[tone], className)}
    >
      {children}
    </span>
  );
}
