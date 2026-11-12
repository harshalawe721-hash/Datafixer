/**
 * Fix ids and labels, with no other imports, so pages can use them without
 * loading the fix engine (which runs in the worker).
 */
/** Fixes that need no choice (Step 2). */
export const SAFE_FIX_IDS = ["extra-spaces", "duplicate-rows", "empty-rows", "empty-columns", "numbers-as-text"] as const;
/** Fixes that may need the user's choice (Step 3). */
export const CHOICE_FIX_IDS = ["inconsistent-case", "inconsistent-dates", "phone-formats"] as const;
export const FIX_IDS = [...SAFE_FIX_IDS, ...CHOICE_FIX_IDS] as const;
export type FixId = (typeof FIX_IDS)[number];

export const FIX_LABELS: Record<FixId, string> = {
  "extra-spaces": "Remove extra spaces",
  "duplicate-rows": "Remove duplicate rows",
  "empty-rows": "Remove empty rows",
  "empty-columns": "Remove empty columns",
  "numbers-as-text": "Convert numbers stored as text",
  "inconsistent-case": "Fix capitalization",
  "inconsistent-dates": "Make date formats consistent",
  "phone-formats": "Make phone number layouts consistent",
};
