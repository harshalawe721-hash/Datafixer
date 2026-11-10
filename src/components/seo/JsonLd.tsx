/**
 * Renders JSON-LD structured data. "<" is escaped so content can never close the
 * script tag early (prevents HTML injection through data values).
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
