import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/layout/ProsePage";
import { ContactForm } from "@/components/layout/ContactForm";
import { pageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/config/site";
import { formatLimit } from "@/lib/file-validation";

export const metadata: Metadata = pageMetadata({
  title: "Contact DataFixer",
  description: "Get in touch with the DataFixer team to report a problem, request a feature or ask a question.",
  path: "/contact",
});

export default function ContactPage() {
  const email = siteConfig.contactEmail;
  return (
    <ProsePage
      title="Contact"
      path="/contact"
      intro="Questions, bug reports and feature ideas are all welcome."
    >
      {email ? (
        <>
          <p>
            Email us at <a href={`mailto:${email}`}>{email}</a>, or use the form below to start an email in your own
            mail app.
          </p>
          <ContactForm email={email} />
        </>
      ) : (
        <p>
          A public contact address has not been published yet. Please check back soon.
        </p>
      )}
      <h2>Before you write</h2>
      <ul>
        <li>Please do not send confidential spreadsheets or personal data by email.</li>
        <li>
          If a file will not open, check that it is an XLSX, XLS or CSV file of{" "}
          {formatLimit(siteConfig.maxFileSizeBytes)} or less.
        </li>
        <li>
          For privacy questions, our <Link href="/privacy-policy">Privacy Policy</Link> explains how DataFixer handles
          data.
        </li>
      </ul>
    </ProsePage>
  );
}
