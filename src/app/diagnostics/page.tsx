import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Diagnostics } from "@/components/diagnostics/Diagnostics";

export const metadata: Metadata = {
  title: "Browser Diagnostics",
  description: "Check how this browser and device handle large spreadsheet processing, using synthetic test data.",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: "/diagnostics" },
};

/** Test page for real devices. Not linked from navigation and not in the sitemap. */
export default function DiagnosticsPage() {
  return (
    <Container className="max-w-4xl py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Browser diagnostics</h1>
      <p className="mt-3 text-muted">
        Measures how quickly this browser can open large spreadsheets and how much memory it allows, using made-up test
        data generated on this device. Use “Copy results” to share the numbers.
      </p>
      <div className="mt-8">
        <Diagnostics />
      </div>
    </Container>
  );
}
