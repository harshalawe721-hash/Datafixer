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

/** Stage 5: CSV Validator repairs (CSV files only). */
export const REPAIR_IDS = ["pad-short-rows", "trim-extra-fields", "fix-header-names", "trim-header-spaces", "remove-control-chars", "remove-blank-lines"] as const;
export type RepairId = (typeof REPAIR_IDS)[number];
export type AnyFixId = FixId | RepairId;

export const REPAIR_LABELS: Record<RepairId, string> = {
  "pad-short-rows": "Add empty cells",
  "trim-extra-fields": "Remove empty extra fields",
  "fix-header-names": "Fix column names",
  "trim-header-spaces": "Remove spaces around names",
  "remove-control-chars": "Remove hidden characters",
  "remove-blank-lines": "Remove blank lines",
};

/** “Fix all safe problems” on the CSV Validator: only repairs that lose no data and need no decision (never short rows). */
export const VALIDATOR_FIX_ALL: readonly RepairId[] = ["trim-extra-fields", "trim-header-spaces", "remove-blank-lines"];

export function isRepairId(id: string): id is RepairId {
  return (REPAIR_IDS as readonly string[]).includes(id);
}
