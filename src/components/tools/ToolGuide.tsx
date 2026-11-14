import { ChevronDown } from "lucide-react";
import { JsonLd } from "@/components/seo/JsonLd";

/** Help content shown below a tool (Stage 7, decision 1): plain HTML, readable without opening anything. */
export interface Guide {
  how: { title: string; steps: React.ReactNode[] };
  example: { title: string; body: React.ReactNode };
  never: React.ReactNode[];
  limits: React.ReactNode[];
  faqs: { q: string; a: string }[];
}

export function ToolGuide({ toolName, guide }: { toolName: string; guide: Guide }) {
  return (
    <div className="mx-auto max-w-3xl space-y-10 border-t border-line pt-10 text-[0.95rem] leading-relaxed">
      <section aria-labelledby="guide-how">
        <h2 id="guide-how" className="text-2xl font-bold">
          {guide.how.title}
        </h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted marker:font-semibold marker:text-foreground">
          {guide.how.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="guide-example">
        <h2 id="guide-example" className="text-2xl font-bold">
          {guide.example.title}
        </h2>
        <div className="mt-4 space-y-3 text-muted">{guide.example.body}</div>
      </section>

      <section aria-labelledby="guide-never">
        <h2 id="guide-never" className="text-2xl font-bold">
          What {toolName} never does
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
          {guide.never.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="guide-limits">
        <h2 id="guide-limits" className="text-2xl font-bold">
          Good to know
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
          {guide.limits.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="guide-faq">
        <h2 id="guide-faq" className="text-2xl font-bold">
          Questions and answers
        </h2>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {guide.faqs.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                <h3>{q}</h3>
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: guide.faqs.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
        }}
      />
    </div>
  );
}
