import { cn } from "@/lib/cn";

export function SectionHeading({
  eyebrow,
  title,
  description,
  id,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  id?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <p className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>}
      <h2 id={id} className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {description && <p className="mt-4 text-lg text-pretty text-muted">{description}</p>}
    </div>
  );
}
