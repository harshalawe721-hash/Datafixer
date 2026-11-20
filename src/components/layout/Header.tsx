import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { mainNav } from "@/config/navigation";
import { publishedGuides } from "@/content/howto";
import { Logo } from "./Logo";
import { ToolsMenu } from "./ToolsMenu";
import { MobileMenu } from "./MobileMenu";

export function Header() {
  const showGuides = publishedGuides().length > 0;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <Container className="relative flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <ToolsMenu />
          {mainNav(showGuides).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.href.startsWith("/guides") ? false : undefined}
              className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <MobileMenu showGuides={showGuides} />
        </div>
      </Container>
    </header>
  );
}
