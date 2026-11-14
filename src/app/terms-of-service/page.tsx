import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/layout/ProsePage";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description: "The terms that apply when you use DataFixer's free, browser-based tools for checking, cleaning and converting spreadsheets.",
  path: "/terms-of-service",
});

export default function TermsPage() {
  return (
    <ProsePage
      title="Terms of Service"
      path="/terms-of-service"
      intro="These terms apply when you use DataFixer. By using the site you agree to them."
      updated="10 November 2026"
    >
      <h2>1. The service</h2>
      <p>
        DataFixer provides free, browser-based tools for checking, cleaning and converting spreadsheet files. No
        account is required. We may add, change or remove tools at any time.
      </p>

      <h2>2. Your files and your responsibility</h2>
      <p>
        You keep all rights to the files you open with DataFixer. Files are processed on your device, as described in
        our <Link href="/privacy-policy">Privacy Policy</Link>. Automated checks can miss problems or flag values that
        are actually correct, so please review results and keep a copy of your original file. You are responsible for
        verifying any output before relying on it, especially for financial, legal, medical or other important
        decisions.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Only use files that you have the right to use.</li>
        <li>Do not attempt to disrupt, overload or gain unauthorized access to the service.</li>
        <li>Do not use the service for any unlawful purpose.</li>
      </ul>

      <h2>4. No warranty</h2>
      <p>
        DataFixer is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, express or
        implied, including fitness for a particular purpose and accuracy of results.
      </p>

      <h2>5. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, DataFixer and its operators are not liable for any loss of data,
        profits or business, or for any indirect or consequential damages arising from your use of the service.
      </p>

      <h2>6. Trademarks</h2>
      <p>
        Microsoft Excel is a trademark of Microsoft Corporation. DataFixer is an independent service and is not
        affiliated with or endorsed by Microsoft.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these terms from time to time. The date above shows when they last changed. Continued use of
        the site after a change means you accept the updated terms.
      </p>

      <h2>8. Contact</h2>
      <p>
        Contact details for questions about these terms, once published, are on our <Link href="/contact">contact page</Link>.
      </p>
    </ProsePage>
  );
}
