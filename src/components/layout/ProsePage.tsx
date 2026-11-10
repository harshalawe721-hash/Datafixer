import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

/** Layout for text pages (About, Privacy, Terms, Contact). */
export function ProsePage({
  title,
  path,
  intro,
  updated,
  children,
}: {
  title: string;
  path: string;
  intro?: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <Breadcrumbs items={[{ label: title, href: path }]} />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {intro && <p className="mt-4 text-lg text-pretty text-muted">{intro}</p>}
      {updated && <p className="mt-2 text-sm text-muted">Last updated: {updated}</p>}
      <div
        className="mt-10 space-y-4 leading-relaxed text-foreground/90
          [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline
          [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground
          [&_h3]:mt-6 [&_h3]:font-semibold
          [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6"
      >
        {children}
      </div>
    </Container>
  );
}
