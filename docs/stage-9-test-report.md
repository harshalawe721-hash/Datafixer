# Stage 9 completion report: Change case (Proper Case) tool

**Date:** 23 November 2026

**Status:** ⏳ **Built and tested; awaiting the owner's approval.** Stage 9 is not complete until the owner approves it.

The owner approved the plan (`docs/stage-9-plan.md`) on 23 November 2026 with decisions **A for all**: the tool in the Spreadsheet Cleaner (1A); Proper Case, UPPER CASE and lower case (2A); an Error Detector hint (3A); smart name rules (4A); homepage and guides updated afterwards (5A).

## Changes

| Part | Change |
|---|---|
| Case engine | `src/engine/fix/change-case.ts`. Proper Case: capitals after spaces, hyphens, full stops, slashes and brackets; after an apostrophe only when one letter comes before it (O'Brien, D'Souza, Don't); Mc names (McDonald); linking words small in the middle (van, von, der, den, de, da, del, di, du, la, bin, al, of, and, the); Roman numerals II–XXXIX in capitals (Henry VIII); short all-capital words kept next to a normally written word (“HDFC Bank”). Never changed: email addresses, web addresses, values with numbers; values without capitals (Hindi, Tamil…) unchanged; spaces kept exactly. |
| Cleaner tool | “Change case” in the Spreadsheet Cleaner (“Choose columns · Preview”): pick a style and the columns, preview every change, Apply, Undo/Redo, download as CSV or Excel. Formula cells and column names protected; skipped values listed with the reason; a note to check special spellings. Not part of “Fix all safe problems”. |
| Detector note | “Names written in capitals or small letters” (a note, not a warning) for columns named like names or places (name, customer, city, state, country…) where at least half of the plain text values are all capitals or all small letters. Its button opens Change case with Proper Case and those columns already chosen. |
| Homepage | The before/after example shows the owner's original table again (“ravi k → Ravi K”, “DELHI → Delhi”, “MEERA s → Meera S”), verified by a test that runs the real fixes. |
| Guides | Capitalization guide (publishes 2 December), Spreadsheet Cleaner guide and Error Detector guide mention the new tool and note. |

No new dependencies. Files are still processed only in the browser.

**Refinement of decision 4A (reported to the owner in Step 1):** a short all-capital word is kept only when the same value also has a normally written word. So “HDFC Bank” stays, “MEERA s” becomes “Meera S”, and “HDFC BANK” (all capitals) becomes “Hdfc Bank”; the preview shows such cases.

## Tests (final run)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 403 / 403. Stage 9 adds 17: about 55 hand-picked case examples (names, places, apostrophes, hyphens, Mc, linking words, Roman numerals, short forms, emails, web addresses, codes, accented letters, Hindi, Tamil), 1,600 generated name spellings in all three styles, stability (a style applied twice changes nothing more; only capital/small letters change), the fix (choices first, chosen columns only, skip reasons, undo, formula cells and header protected, an Excel workbook passing the download check), the detector note (name/place columns only; not below half; not without column names), and the homepage example. |
| Change case in the browser (`test:case`, new) | ✅ 27 / 27: tool offered, dialog, no Apply before choosing, axe-core on the dialog light and dark (0 findings), preview, the table changes, emails unchanged, Undo/Redo, downloaded CSV, keyboard (arrows, Space, Escape), phone 375 px, the detector note opening the tool pre-filled, the note gone after applying, no browser errors |
| Earlier suites | ✅ smoke 117, engine 62, detector 33, fix 126, validator 106, converter 45, a11y 71, seo 32 (43 with all guides shown), large 64 |
| Homepage | ✅ 375 px and 1280 px, light and dark: no sideways scrolling, axe-core 0 findings |
| Speed of the new detector check | ✅ worst case measured (500,000 rows, every name different, two name columns all in capitals): about 0.5 s more per million name cells; other columns cost nothing |
| Large files, fixing (`test:export-perf`) | ✅ all ok, originals unchanged, downloads verified. 50 MB: check 4.4 s, Fix all 14.2 s; 100 MB: 8.4 s, 28.4 s; 150 MB: check 13.5 s, Fix all 40.6 s, download 8.3 s, peak extra memory 993 MB. Stage 4 measured 9.9 s and 37.2 s at 150 MB (Stage 7: Fix all 31.5 s). An A/B on the same data shape (1.2M rows, three runs each) gave 6.0/5.9/6.1 s with the new check and 5.7/6.5/5.2 s without it, so the difference comes mainly from run-to-run speed of this machine; “Fix all” doesn't run the new check. |

**Failed:** one intermittent failure in the final run: `test:case` timed out once at the Error Detector step (the check results didn't appear within 30 s after the file was chosen). Reproduced once more in 3 runs right after `test:seo`, then not in 17 further runs, including 3 full a11y → seo → case rounds. The cause is not proven; the likely explanation is the test choosing the file a moment before the page finished starting up. The test now saves a screenshot and the page text if it ever happens again.

**Found during Stage 9 and fixed (each re-tested):**
- The owner's homepage example claimed fixes the tool didn't make; it was replaced first, and restored once Change case existed.
- Short-form rule as first written would have left “MEERA s” as “MEERA S” (refined, see above).
- “State Bank Of India” and “Louis Xiv” (small linking words and Roman numerals added).
- The first version of the detector check added about 2 s per million cells; optimised to about 0.5 s.
- Its list of affected cells wasn't capped like other checks'; now capped per column.
- A dialog message would have read “1 — Choose a style…” under “Left for you to check”; moved to the description.

## Remaining limitations

- Proper Case can't know every special spelling: brand names (iPhone, eBay), all-capital short forms in all-capital values (“HDFC BANK” → “Hdfc Bank”) and unusual family names (MacDonald vs Macdonald) may need fixing by hand; the preview shows every change.
- The name rules are written for Latin letters; scripts without capitals are left unchanged.
- The detector note only checks columns whose names suggest names or places, and only when there is a header row.
- The rare `test:case` timeout described above.

## Approval

Stage 9 will be marked complete only after the owner approves it.
