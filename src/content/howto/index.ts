/**
 * Stage 8 guides and their publishing schedule. Owner, 20 November 2026: 15 guides, one per day
 * at 12:30 pm India time, starting on 20 November 2026 (guide 15 on 4 December 2026).
 *
 * A guide that isn't published yet doesn't exist on the site: its page answers 404 and it is
 * left out of the Guides list, the sitemap, the menus and every "Related guides" list. Pages
 * that show guides are rebuilt every hour (revalidate = 3600), so each guide appears within an
 * hour after its publish time (12:30 pm India time) without anyone posting it.
 */
import type { HowToGuide } from "./types";
import { csvOpensInOneColumn } from "./csv-opens-in-one-column";
import { removeDuplicateRows } from "./remove-duplicate-rows";
import { keepLeadingZerosInCsv } from "./keep-leading-zeros-in-csv";
import { fixDatesInSpreadsheets } from "./fix-dates-in-spreadsheets";
import { removeExtraSpaces } from "./remove-extra-spaces";
import { convertExcelToCsv } from "./convert-excel-to-csv";
import { excelFormulaErrors } from "./excel-formula-errors";
import { numbersStoredAsText } from "./numbers-stored-as-text";
import { csvEncodingStrangeCharacters } from "./csv-encoding-strange-characters";
import { checkCsvBeforeImport } from "./check-csv-before-import";
import { findBlankCells } from "./find-blank-cells";
import { removeEmptyRowsAndColumns } from "./remove-empty-rows-and-columns";
import { fixInconsistentCapitalization } from "./fix-inconsistent-capitalization";
import { checkEmailsAndPhoneNumbers } from "./check-emails-and-phone-numbers";
import { excelRowLimit } from "./excel-row-limit";
import { changeCaseProperCase } from "./change-case-proper-case";
import { splitCellsInExcel } from "./split-cells-in-excel";
import { combineColumnsInExcel } from "./combine-columns-in-excel";
import { csvVsExcel } from "./csv-vs-excel";
import { fixWrongNumberOfColumns } from "./fix-wrong-number-of-columns";
import { fixBrokenQuotesInCsv } from "./fix-broken-quotes-in-csv";
import { changeCsvSeparator } from "./change-csv-separator";
import { utf8BomExplained } from "./utf-8-bom-explained";
import { stopExcelChangingData } from "./stop-excel-changing-data";
import { fixColumnNames } from "./fix-column-names";
import { findUnusualValues } from "./find-unusual-values";
import { standardisePhoneNumbers } from "./standardise-phone-numbers";
import { csvFormulaInjection } from "./csv-formula-injection";
import { indiaDate, isPublished, publishTime } from "./schedule";

export type { HowToGuide } from "./types";

/** Every guide, in publishing order: guide n is published n − 1 days after the start date. */
export const GUIDES: readonly HowToGuide[] = [
  csvOpensInOneColumn,
  removeDuplicateRows,
  keepLeadingZerosInCsv,
  fixDatesInSpreadsheets,
  removeExtraSpaces,
  convertExcelToCsv,
  excelFormulaErrors,
  numbersStoredAsText,
  csvEncodingStrangeCharacters,
  checkCsvBeforeImport,
  findBlankCells,
  removeEmptyRowsAndColumns,
  fixInconsistentCapitalization,
  checkEmailsAndPhoneNumbers,
  excelRowLimit,
  // Guide 16 (owner, 23 November 2026): published 5 December 2026 at 12:30 pm India time.
  changeCaseProperCase,
  // Guides 17–18 (Stage 10, owner decision 5A, 26 November 2026): right after guide 16, on 6 and 7 December 2026.
  splitCellsInExcel,
  combineColumnsInExcel,
  // Guides 19–28 (owner, 24 November 2026; moved two days later by decision 5A): 8–17 December 2026, one a day at 12:30 pm India time.
  csvVsExcel,
  fixWrongNumberOfColumns,
  fixBrokenQuotesInCsv,
  changeCsvSeparator,
  utf8BomExplained,
  stopExcelChangingData,
  fixColumnNames,
  findUnusualValues,
  standardisePhoneNumbers,
  csvFormulaInjection,
];

/**
 * First publishing day (YYYY-MM-DD, India time); null would publish nothing. Set by the owner:
 * guide 1 on 20 November 2026, then one guide a day.
 */
export const GUIDES_START_DATE: string | null = "2026-11-20";

/**
 * Local test switches, ignored on Vercel: GUIDES_CLOCK sets the time the schedule uses
 * (an ISO date), GUIDES_START sets the start date, GUIDES_SHOW_ALL=1 shows every guide.
 */
function testEnv(name: string): string | undefined {
  return process.env.VERCEL ? undefined : process.env[name]?.trim() || undefined;
}

export function guidesNow(): number {
  const clock = testEnv("GUIDES_CLOCK");
  return clock ? Date.parse(clock) : Date.now();
}

function startDate(): string | null {
  return testEnv("GUIDES_START") ?? GUIDES_START_DATE;
}

/** Published guides at time `now`, in publishing order. */
export function publishedGuides(now: number = guidesNow()): HowToGuide[] {
  if (testEnv("GUIDES_SHOW_ALL") === "1") return [...GUIDES];
  const start = startDate();
  return GUIDES.filter((_, i) => isPublished(i, start, now));
}

export function getPublishedGuide(slug: string, now: number = guidesNow()): HowToGuide | undefined {
  return publishedGuides(now).find((g) => g.slug === slug);
}

/** The date shown as "Updated": the later of the publish day and the last content update (YYYY-MM-DD). */
export function displayDate(guide: HowToGuide): string {
  const i = GUIDES.indexOf(guide);
  const t = publishTime(i, startDate());
  if (t === null) return guide.updated;
  const published = indiaDate(t);
  return published > guide.updated ? published : guide.updated;
}

/** Published guides that link to a tool (for the tool page's "Related guides"). */
export function guidesForTool(toolId: HowToGuide["tools"][number], now: number = guidesNow()): HowToGuide[] {
  return publishedGuides(now).filter((g) => g.tools.includes(toolId));
}
