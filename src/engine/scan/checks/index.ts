/**
 * Registry of Error Detector checks run in scan pass 2.
 * Each Stage 3 step adds its checks here.
 */
import type { CheckFactory } from "../scan.ts";
import { duplicateRows, emptyColumns, emptyRows, missingCells } from "./structure.ts";
import { extraSpaces, inconsistentCase, numbersAsText } from "./text.ts";
import { inconsistentDates } from "./dates.ts";
import { invalidEmails, invalidPhones } from "./contacts.ts";
import { formulaErrors, unusualValues } from "./values.ts";

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
  // Step 4: dates (H)
  inconsistentDates,
  // Step 5: contacts (I–J)
  invalidEmails,
  invalidPhones,
  // Step 6: values (K–L)
  unusualValues,
  formulaErrors,
];
