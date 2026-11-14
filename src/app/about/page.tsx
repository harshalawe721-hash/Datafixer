import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/layout/ProsePage";
import { pageMetadata } from "@/lib/metadata";
import { tools } from "@/config/tools";

export const metadata: Metadata = pageMetadata({
  title: "About DataFixer",
  description:
    "DataFixer is a free, privacy-first set of browser-based tools that help anyone find and fix problems in Excel and CSV spreadsheets.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <ProsePage
      title="About DataFixer"
      path="/about"
      intro="DataFixer helps people find spreadsheet problems, fix them and get better data, without complicated software."
    >
      <h2>Why we built DataFixer</h2>
      <p>
        Spreadsheets run a surprising amount of the world: class projects, invoices, customer lists, inventory and
        payroll. Small problems such as a duplicated row, a stray space or a date typed the wrong way can quietly
        produce wrong totals or make an import fail. Finding those problems by hand is slow, and most data-cleaning
        software is built for specialists.
      </p>
      <p>
        DataFixer is designed for everyone else: students, office workers, freelancers, accountants and business
        owners who just want their spreadsheet to be right.
      </p>

      <h2>Our principles</h2>
      <ul>
        <li>
          <strong>Privacy first.</strong> Files are opened and processed in your browser, on your device. We do not
          upload or store the contents of your spreadsheets.
        </li>
        <li>
          <strong>You stay in control.</strong> DataFixer explains what it found and lets you preview changes. Your
          original file is never modified.
        </li>
        <li>
          <strong>Plain language.</strong> Results are written for people, not data engineers.
        </li>
        <li>
          <strong>Free and open to everyone.</strong> No account and no payment are required to use the tools.
        </li>
      </ul>

      <h2>The tools</h2>
      <ul>
        {tools.map((t) => (
          <li key={t.id}>
            <Link href={t.href}>{t.name}</Link>: {t.summary}
          </li>
        ))}
      </ul>

      <h2>Get in touch</h2>
      <p>
        Contact details, once published, are on the <Link href="/contact">contact page</Link>.
      </p>
    </ProsePage>
  );
}
