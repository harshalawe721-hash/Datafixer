import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { tools } from "@/config/tools";
import { companyLinks, legalLinks } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { Logo } from "./Logo";

function FooterColumn({ title, links }: { title: string; links: readonly { label: string; href: string }[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-muted transition-colors hover:text-foreground">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{siteConfig.tagline}</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Free spreadsheet tools. No account needed.
            </p>
          </div>
          <FooterColumn title="All Tools" links={tools.map((t) => ({ label: t.name, href: t.href }))} />
          <FooterColumn title="Company" links={companyLinks} />
          <FooterColumn title="Legal" links={legalLinks} />
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {siteConfig.name}. All rights reserved.
          </p>
          <p>Microsoft Excel is a trademark of Microsoft Corporation. DataFixer is not affiliated with Microsoft.</p>
        </div>
      </Container>
    </footer>
  );
}
