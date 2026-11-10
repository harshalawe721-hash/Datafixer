import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/layout/ProsePage";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "How DataFixer handles your data. Spreadsheets are processed in your browser and are not uploaded to or stored on our servers.",
  path: "/privacy-policy",
});

export default function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy Policy"
      path="/privacy-policy"
      intro="Privacy is central to DataFixer. This policy explains, in plain language, what happens to your files and what little information we handle."
      updated="10 November 2026"
    >
      <h2>Summary</h2>
      <ul>
        <li>Your spreadsheets are opened and processed by your web browser, on your device.</li>
        <li>The contents of your files are not uploaded to DataFixer servers and are not sent to third parties.</li>
        <li>We do not require an account and do not ask for your name or email address to use the tools.</li>
        <li>We do not sell personal information.</li>
      </ul>

      <h2>Files you open with DataFixer</h2>
      <p>
        When you choose a file, your browser reads it into the memory of the open tab. The checks, cleaning
        operations and conversions run as JavaScript on your device. When you download a result, the new file is
        created locally by your browser. Closing or reloading the tab releases the file from memory.
      </p>
      <p>
        Your original file is never modified. Formulas inside spreadsheets are treated as text and are never executed
        as code.
      </p>

      <h2>Information stored in your browser</h2>
      <p>
        If you switch between light and dark mode, your choice is saved in your browser&apos;s local storage so the
        site remembers it. This value never leaves your device. DataFixer does not set advertising or tracking
        cookies.
      </p>

      <h2>Server and hosting logs</h2>
      <p>
        Like any website, the servers that deliver DataFixer&apos;s pages may automatically record standard technical
        information about requests, such as IP address, browser type, the page requested and the time of the request.
        These logs are used to keep the service secure and working, and they never contain the contents of your
        spreadsheets, because those are not sent to the server.
      </p>

      <h2>Analytics</h2>
      <p>
        DataFixer does not currently use analytics. If privacy-friendly usage statistics are added in the future (for
        example, counting how often a tool is opened), they will never include spreadsheet contents or information
        taken from your files, and this policy will be updated before that happens.
      </p>

      <h2>Emails you send us</h2>
      <p>
        If you contact us by email, we receive the message and your email address and use them only to respond.
        Please do not send confidential spreadsheets or personal data.
      </p>

      <h2>Children</h2>
      <p>DataFixer is a general-purpose tool and does not knowingly collect personal information from children.</p>

      <h2>Changes to this policy</h2>
      <p>
        If we change how DataFixer handles data, we will update this page and the date above. Questions can be sent
        through our <Link href="/contact">contact page</Link>.
      </p>
    </ProsePage>
  );
}
