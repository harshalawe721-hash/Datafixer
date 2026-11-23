import { ArrowDown, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { HERO_AFTER, HERO_BEFORE, HERO_COLUMNS, type ExampleCell } from "@/content/hero-example";

/** Shows spaces at the start or end of a value as faint dots, so “extra spaces” are visible. */
function CellText({ text }: { text: string }) {
  const lead = text.length - text.trimStart().length;
  const trail = text.length - text.trimEnd().length;
  if (!lead && !trail) return <>{text}</>;
  const dots = (n: number) => (
    <span aria-hidden="true" className="text-muted">
      {"·".repeat(n)}
    </span>
  );
  return (
    <>
      {lead > 0 && dots(lead)}
      {text.trim()}
      {trail > 0 && dots(trail)}
    </>
  );
}

function ExampleTable({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { cells: ExampleCell[] }[];
  tone: "before" | "after";
}) {
  const mark = tone === "before" ? "bg-warning-soft" : "bg-success-soft";
  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className={`size-2.5 rounded-full ${tone === "before" ? "bg-warning" : "bg-success"}`} aria-hidden="true" />
        {title}
      </figcaption>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card" tabIndex={0} role="region" aria-label={`${title} example table`}>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-surface-muted">
              {HERO_COLUMNS.map((c) => (
                <th key={c} scope="col" className="border-b border-line px-3 py-2 font-semibold whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {r.cells.map((c, j) => (
                  <td key={j} className={`px-3 py-2 whitespace-nowrap ${c.note ? mark : ""}`}>
                    <CellText text={c.text} />
                    {c.note && <span className="sr-only"> ({c.note})</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * Before/after example below the hero (owner, 23 November 2026). Built from
 * src/content/hero-example.ts, whose "after" rows are checked against the real fixes by a test.
 */
export function BeforeAfter() {
  return (
    <section aria-labelledby="example-heading" className="border-b border-line py-14 sm:py-16">
      <Container>
        <h2 id="example-heading" className="sr-only">
          Example: a messy table before and after MyDataFixer
        </h2>
        <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start lg:gap-6">
          <ExampleTable title="Before" rows={HERO_BEFORE} tone="before" />
          <div className="flex justify-center text-primary lg:self-center lg:pt-7" aria-hidden="true">
            <ArrowDown className="size-6 lg:hidden" />
            <ArrowRight className="hidden size-7 lg:block" />
          </div>
          <ExampleTable title="After" rows={HERO_AFTER} tone="after" />
        </div>
        <p className="mt-5 text-center text-sm text-muted">Duplicates removed, spaces trimmed, capitals fixed, dates in one format.</p>
      </Container>
    </section>
  );
}
