/** Small example table inside a guide (Stage 8, decision 5A): plain HTML, readable by screen readers, works in dark mode. */
export function ExampleTable({
  caption,
  headers,
  rows,
  mono = false,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
  /** Show cells in a fixed-width font (raw file contents). */
  mono?: boolean;
}) {
  return (
    <figure className="my-5">
      <div className="overflow-x-auto rounded-xl border border-line" tabIndex={0} role="region" aria-label={caption}>
        <table className={`w-full border-collapse text-left text-sm ${mono ? "font-mono" : ""}`}>
          <caption className="border-b border-line bg-surface-muted px-3 py-2 text-left font-sans text-xs font-semibold text-muted">
            {caption}
          </caption>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} scope="col" className="border-b border-line px-3 py-2 font-semibold whitespace-nowrap text-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-2 whitespace-nowrap text-foreground/90">
                    {c}
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

/** Raw file contents (a few lines of a CSV), shown exactly as written. */
export function FileLines({ caption, lines }: { caption: string; lines: string[] }) {
  return (
    <figure className="my-5">
      <figcaption className="mb-1.5 text-xs font-semibold text-muted">{caption}</figcaption>
      <pre className="overflow-x-auto rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm leading-relaxed" tabIndex={0}>
        <code>{lines.join("\n")}</code>
      </pre>
    </figure>
  );
}
