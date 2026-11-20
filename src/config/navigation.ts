export type NavLink = { label: string; href: string };

const GUIDES_LINK: NavLink = { label: "Guides", href: "/guides" };

/** Header links. "Guides" is shown only once at least one guide is published (Stage 8). */
export function mainNav(showGuides: boolean): NavLink[] {
  return [{ label: "How It Works", href: "/#how-it-works" }, ...(showGuides ? [GUIDES_LINK] : []), { label: "About", href: "/about" }];
}

/** Footer "Company" links, with "Guides" once a guide is published. */
export function companyNav(showGuides: boolean): NavLink[] {
  return [...(showGuides ? [GUIDES_LINK] : []), ...companyLinks];
}

export const companyLinks = [
  { label: "About Us", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

export const legalLinks = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Service", href: "/terms-of-service" },
] as const;
