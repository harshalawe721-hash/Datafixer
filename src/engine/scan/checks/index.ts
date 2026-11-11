/**
 * Registry of Error Detector checks run in scan pass 2.
 * Each Stage 3 step adds its checks here.
 */
import type { CheckFactory } from "../scan.ts";
import { duplicateRows, emptyColumns, emptyRows, missingCells } from "./structure.ts";
import { extraSpaces, inconsistentCase, numbersAsText } from "./text.ts";

export const ALL_CHECKS: CheckFactory[] = [
  // Step 2: structure (A–D)
  duplicateRows,
  emptyRows,
  emptyColumns,
  missingCells,
  // Step 3: text (E–G)
  extraSpaces,
  inconsistentCase,
  numbersAsText,
];
