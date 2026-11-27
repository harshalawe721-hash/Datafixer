# Stage 14 plan: XML to CSV

**Status:** plan prepared on 27 November 2026, waiting for the owner's decisions. Nothing is built until the owner approves.

## Why

XML is still how many systems export data: product feeds (Google Merchant Center, shop platforms), accounting and invoicing software (for example Tally exports in India), bank statements, government and e-invoicing portals, RSS feeds and sitemaps. People need these in Excel. “xml to csv” and “xml to excel” are common conversion searches; no search volumes have been checked yet, so the owner can add Ahrefs or Semrush numbers before deciding.

## What will be built

1. **XML to CSV page** (`/xml-to-csv`): open an .xml file and see it as a table; download CSV or Excel.
   - **Records:** the repeated element that holds the records (for example every `<product>` inside `<products>`) is found automatically; when there are several candidates, the user picks one from a list (like the list choice on JSON to CSV).
   - **Columns:** each child element and each attribute of a record becomes a column, in the order they first appear; nested elements become dotted columns (`address.city`); repeated children inside one record (several `<phone>`), as decided below.
   - Namespace prefixes are kept in column names (`g:price` in a Google Merchant feed), so nothing is mixed up.
   - Text is kept exactly as written: codes keep their zeros, long numbers all their digits; entities such as `&amp;` become `&`; CDATA sections are read as text.
   - Invalid XML (a tag not closed, a wrong nesting, a bad character) is refused with what is wrong and the line and column, as on JSON to CSV.
   - Downloads: CSV (the existing verified writer) or Excel (the CSV to Excel rules); every file is checked before it is offered.
   - The usual table preview and help content.
2. **Guide**, as decided below.

No new dependencies. Files stay in the browser.

## Technical notes

- **A reader of our own.** The browser's built-in XML reader can't be used inside the background worker where MyDataFixer processes files (that keeps the page responsive with large files), so a small XML reader is written for this tool, tested like the JSON reader. It reads the file in pieces, so large files don't need several copies in memory.
- **Safety.** XML has features that can be abused: `<!DOCTYPE>` declarations that define their own entities can make a tiny file expand into gigabytes, or try to read other files. The reader never loads external files and refuses documents that declare their own entities, with a plain message; only the standard entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) and character codes (`&#233;`) are understood.
- **Finding the records:** a first quick pass counts which elements repeat under the same parent; the most repeated one is suggested.
- **Encoding:** UTF-8 (the usual) and the encoding named in the XML declaration where the browser supports it (for example ISO-8859-1, Windows-1252); other encodings are refused with the reason.

## Decisions for the owner

1. **Pages**
   - **A (recommended):** one page, `/xml-to-csv`, whose downloads include Excel, so “xml to excel” is covered on the same page (in its text and FAQ).
   - B: two pages, `/xml-to-csv` and `/xml-to-excel`.
2. **Finding the records**
   - **A (recommended):** found automatically (the most repeated element), with a list to choose another.
   - B: the user always chooses.
3. **Repeated children inside one record** (for example two `<phone>` elements)
   - **A (recommended):** joined in one cell with “; ” between them (`+91 1; +91 2`), with a note saying how many cells hold joined values.
   - B: numbered columns (`phone`, `phone_2`, …).
4. **Attributes**
   - **A (recommended):** a column with the attribute's name (`id`); if an element has the same name, the attribute column is named `@id`.
   - B: always `@id`.
5. **Size**
   - **A (recommended):** up to 150 MB like other files, read in pieces, with the usual memory check that stops safely on smaller devices.
   - B: 50 MB, read as a whole.
6. **Guide**
   - **A (recommended):** one guide, “How to convert XML to CSV or Excel”, 1,000–1,500 words, published on the daily schedule after guide 32 (22 December 2026).
   - B: no guide.

## Steps (each tested, committed and reported)

1. **Engine:** the XML reader (elements, attributes, text, CDATA, comments, processing instructions, entities, namespaces, line and column for mistakes, refused entity declarations, encodings), finding the records, XML → table with the decided rules; unit tests with real-world shapes (a product feed with `g:` fields, an RSS feed, a sitemap, an accounting export, deep nesting, empty elements, mixed content).
2. **Page:** `/xml-to-csv` with the record choice, notes, CSV and Excel downloads; browser tests (keyboard, axe-core light and dark, phone).
3. **Guide and related links.**
4. **Testing and report:** all earlier suites, large files (50/100/150 MB XML, including the low-memory run), completion report.

## Known limits (to be stated on the page)

- Text mixed with child elements inside one element (as in HTML-like documents) is joined into one cell.
- Documents that define their own entities in a `<!DOCTYPE>` are refused for safety.
- XML that isn't a list of similar records (for example a configuration file) gives a table that may not be useful.
