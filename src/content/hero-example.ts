/**
 * Before/after example on the homepage (owner, 23 November 2026). Every change shown must be one
 * MyDataFixer really makes: tests/engine/hero-example.test.ts runs these "before" rows through the
 * real fixes (remove duplicate rows, remove extra spaces, fix capitalization, dates as dd/mm/yyyy)
 * and checks the result equals the "after" rows.
 *
 * The owner's first draft also changed "ravi k" → "Ravi K" and "DELHI" → "Delhi". The tool doesn't
 * do that (capitalization only moves a value to the most common spelling already in its column), so
 * the example was adjusted to show only real fixes.
 */
export const HERO_COLUMNS = ["Name", "City", "Joined"] as const;

/** A cell, and why it is highlighted (shown to screen readers). */
export type ExampleCell = { text: string; note?: string };

export const HERO_BEFORE: { cells: ExampleCell[] }[] = [
  { cells: [{ text: "Asha Rao" }, { text: "Pune" }, { text: "12/03/2026" }] },
  {
    cells: [{ text: "Asha Rao", note: "duplicate row" }, { text: "Pune", note: "duplicate row" }, { text: "12/03/2026", note: "duplicate row" }],
  },
  { cells: [{ text: "  Ravi Kumar ", note: "extra spaces" }, { text: "Delhi" }, { text: "March 4 2026", note: "different date format" }] },
  { cells: [{ text: "Meera Shah" }, { text: "PUNE", note: "different capitals" }, { text: "2026-03-05", note: "different date format" }] },
  { cells: [{ text: "Kiran Das" }, { text: "Pune" }, { text: "15/03/2026" }] },
];

export const HERO_AFTER: { cells: ExampleCell[] }[] = [
  { cells: [{ text: "Asha Rao" }, { text: "Pune" }, { text: "12/03/2026" }] },
  { cells: [{ text: "Ravi Kumar", note: "spaces trimmed" }, { text: "Delhi" }, { text: "04/03/2026", note: "date format fixed" }] },
  { cells: [{ text: "Meera Shah" }, { text: "Pune", note: "capitals fixed" }, { text: "05/03/2026", note: "date format fixed" }] },
  { cells: [{ text: "Kiran Das" }, { text: "Pune" }, { text: "15/03/2026" }] },
];
