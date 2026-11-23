/**
 * Before/after example on the homepage (owner, 23 November 2026). Every change shown must be one
 * MyDataFixer really makes: tests/engine/hero-example.test.ts runs these "before" rows through the
 * real fixes (Remove duplicate rows, Remove extra spaces, Change case → Proper Case on Name and
 * City, dates as dd/mm/yyyy with day-first chosen) and checks the result equals the "after" rows.
 *
 * History: the owner's first draft changed "ravi k" → "Ravi K" and "DELHI" → "Delhi", which the
 * tool couldn't do then, so a different example was shown. Stage 9 added Change case (Proper Case),
 * and the owner's original example is shown again (decision 5A).
 */
export const HERO_COLUMNS = ["Name", "City", "Joined"] as const;

/** A cell, and why it is highlighted (shown to screen readers). */
export type ExampleCell = { text: string; note?: string };

export const HERO_BEFORE: { cells: ExampleCell[] }[] = [
  { cells: [{ text: "Asha Rao" }, { text: "Pune" }, { text: "12/03/2026" }] },
  {
    cells: [{ text: "Asha Rao", note: "duplicate row" }, { text: "Pune", note: "duplicate row" }, { text: "12/03/2026", note: "duplicate row" }],
  },
  { cells: [{ text: "  ravi k", note: "extra spaces, small letters" }, { text: "DELHI", note: "all capitals" }, { text: "March 4 2026", note: "different date format" }] },
  { cells: [{ text: "MEERA s", note: "mixed capitals" }, { text: " mumbai", note: "extra space, small letters" }, { text: "2026-03-05", note: "different date format" }] },
];

export const HERO_AFTER: { cells: ExampleCell[] }[] = [
  { cells: [{ text: "Asha Rao" }, { text: "Pune" }, { text: "12/03/2026" }] },
  { cells: [{ text: "Ravi K", note: "spaces trimmed, capitals fixed" }, { text: "Delhi", note: "capitals fixed" }, { text: "04/03/2026", note: "date format fixed" }] },
  { cells: [{ text: "Meera S", note: "capitals fixed" }, { text: "Mumbai", note: "space trimmed, capitals fixed" }, { text: "05/03/2026", note: "date format fixed" }] },
];
