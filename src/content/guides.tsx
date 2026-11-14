import type { Guide } from "@/components/tools/ToolGuide";

/**
 * Help content for the tool pages (Stage 7, decision 1A). Every statement here
 * describes behaviour built and tested in Stages 2–6 (see docs/stage-*-test-report.md).
 */

const privacyFaq = {
  q: "Is my file uploaded?",
  a: "No. Your browser opens the file on your device and every check, fix and download happens there. The contents of your file are not sent to DataFixer's servers or to anyone else, and your original file is never changed.",
};

export const detectorGuide: Guide = {
  how: {
    title: "How the Spreadsheet Error Detector works",
    steps: [
      "Open an Excel workbook (.xlsx or .xls) or a CSV file. It is read on your device, and a preview of the sheet appears.",
      "DataFixer checks every row and column for eleven kinds of problem: duplicate rows, empty rows and columns, missing cells, extra spaces, inconsistent capitalization, numbers stored as text, inconsistent, impossible or ambiguous dates, invalid email addresses, invalid phone numbers, unusual values and formula errors such as #DIV/0! or #N/A.",
      "Each problem gets a card with a count, a plain explanation, examples and advice on how to fix it. “View affected data” filters the table to exactly the rows involved.",
      "Many problems have a Fix button. You always see a preview of every change first; nothing changes until you tap Apply. “Fix all safe problems” applies only fixes that need no decision.",
      "Undo, Redo and the change history work for every fix. Download the corrected file as CSV or, for Excel workbooks, as Excel. The file is checked cell by cell before it is offered.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <>
        <p>
          A customer list has 2,000 rows. The detector finds 14 duplicate rows, 37 names with a space at the end, “Paris”, “paris” and “PARIS” in the
          city column, and a date column where most dates are written 2024-03-15 but some are 15/03/2024.
        </p>
        <p>
          “Fix all safe problems” removes the duplicates (keeping the first copy), trims the spaces and uses the most common spelling of each city. The
          dates need your choice of format, so they get their own Fix button, which also asks whether 03/04/2024 means 3 April or March 4 when the
          column itself can&apos;t tell.
        </p>
      </>
    ),
  },
  never: [
    "Upload your file or change the original. Fixes apply to a copy in your browser; the download is a new file.",
    "Change a formula cell automatically, or run formulas. Formulas are read as text and never executed.",
    "Guess when a value is ambiguous. Ties in capitalization, unclear date orders and phone layouts are asked, not guessed.",
    "Remove rows or columns that anything else in an Excel workbook refers to (formulas on other sheets, charts, named ranges). It offers to clear the cells instead.",
  ],
  limits: [
    "Files up to 150 MB are accepted. Very large files need a computer or a recent phone with enough memory; if a file is too large for the device, DataFixer stops safely and says so.",
    "Excel workbooks are checked one sheet at a time. Old .xls files are downloaded in the newer .xlsx format, and the page lists what that format change can't keep.",
    "Automated checks can miss problems or flag values that are correct for your data. Review the results before relying on them.",
  ],
  faqs: [
    privacyFaq,
    {
      q: "Which files can I check?",
      a: "Excel workbooks (.xlsx and the older .xls format) and CSV files, up to 150 MB. Password-protected workbooks can't be opened.",
    },
    {
      q: "Will my Excel formatting be kept when I download?",
      a: "Yes, when you download an .xlsx file as Excel: only the cells you changed are rewritten inside your original workbook, and formatting, formulas, charts and other sheets stay as they were. A CSV download holds values only.",
    },
    {
      q: "Why doesn't every problem have a Fix button?",
      a: "Some problems can't be fixed without knowing the right value, such as an invalid email address or an unusual number. For those, the card explains what is wrong, and you can tap the cell in the table to edit it yourself.",
    },
    {
      q: "Can I undo a fix?",
      a: "Yes. Every fix and every edited cell can be undone and redone, and the change history lists each change with the old and new value.",
    },
    {
      q: "Does it check formulas?",
      a: "It finds cells that show formula errors such as #DIV/0!, #N/A or #REF!, so you can trace them back to their source. It does not rewrite formulas.",
    },
  ],
};

export const cleanerGuide: Guide = {
  how: {
    title: "How the Spreadsheet Cleaner works",
    steps: [
      "Open an Excel workbook (.xlsx or .xls) or a CSV file. It is read on your device.",
      "The cleaning tools list shows what each tool would fix in your sheet: extra spaces, duplicate rows, empty rows, empty columns, numbers stored as text, capitalization, date formats and phone number layouts.",
      "Tap a tool to see a preview of every change. Tools that need a decision (a date format, a phone layout, a spelling) ask for it in the preview.",
      "Tap any cell in the table to edit it by hand, for values no tool can fix, such as a wrong email address.",
      "Undo or redo any change, see the full history, and download a clean copy as CSV or Excel. The file is checked before it is offered.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        An exported sales sheet has amounts written as “1,250” and “&apos;45” (numbers stored as text), so totals don&apos;t add up. “Convert numbers
        stored as text” shows each value before and after. Values that could mean two things, such as “1,250” in a column that also uses decimal
        commas, are left for you and listed with the reason. After applying it, the totals work, and the downloaded Excel file keeps the original
        formatting.
      </p>
    ),
  },
  never: [
    "Upload your file or change the original.",
    "Apply a change you haven't seen: every tool shows a preview first.",
    "Change formula cells automatically, or remove rows and columns that formulas, charts or named ranges elsewhere in the workbook refer to.",
    "Convert values that could mean two different things.",
  ],
  limits: [
    "Changes are kept only in the open browser tab until you download them. DataFixer asks before you leave the page with changes that haven't been downloaded.",
    "Excel workbooks are cleaned one sheet at a time.",
    "Very large files need a computer or a recent phone with enough memory.",
  ],
  faqs: [
    privacyFaq,
    {
      q: "What's the difference between the Cleaner and the Error Detector?",
      a: "They use the same checks and fixes. The Error Detector starts from the list of problems found; the Cleaner starts from the cleaning tools, so you can go tool by tool.",
    },
    {
      q: "Can I edit cells myself?",
      a: "Yes. Tap a cell in the table (or move to it with the arrow keys and press Enter) to open the editor. Column names can be renamed with the pencil next to each name. If a cell holds a formula, DataFixer warns you first, because saving a value replaces the formula.",
    },
    {
      q: "Which spelling is kept when capitalization differs?",
      a: "The most common one in that column. When two spellings are equally common, DataFixer asks which to use.",
    },
    {
      q: "Will removing duplicates keep the first row?",
      a: "Yes. The first copy is kept and each removed row is listed as “Exact copy of row N”.",
    },
    {
      q: "Can I download as Excel?",
      a: "Yes, for Excel workbooks: only the changed cells are rewritten inside your original workbook. CSV files are downloaded as CSV.",
    },
  ],
};

export const validatorGuide: Guide = {
  how: {
    title: "How the CSV Validator works",
    steps: [
      "Open a CSV, TSV or TXT file. DataFixer detects the text encoding and the column separator; both can be changed if the file was read wrongly.",
      "Nine checks run: text encoding, column separator, the number of fields in every row, column names, quotes, line endings and blank lines, hidden control characters, Excel and Google Sheets limits, and extra separators at line ends.",
      "The verdict says whether the file is valid and whether it will import cleanly. Each problem card shows the exact line as written in the file, with its line number.",
      "Repairs are offered with a preview: add empty cells to short rows, remove empty extra fields, fix column names, remove spaces around names, remove blank lines, remove hidden characters, and add apostrophes before values that start like formulas.",
      "Download the repaired file with the separator (comma, semicolon or tab), line endings (CRLF or LF) and encoding (UTF-8 with or without BOM) you need. It is checked before it is offered.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <>
        <p>
          A CSV export won&apos;t import into a database. The validator shows “Not a valid CSV file: 2 errors”: row 33 has 6 fields instead of 4,
          and its line reads <code>1031,Ben,Smith, J,x@example.com,Rome</code> — the comma inside “Smith, J” was never put in quotes. It also finds a
          column without a name and two columns both called “email”.
        </p>
        <p>
          “Fix column names” renames them “Column C” and “email (2)”. Row 33 is not changed automatically, because the right fix can&apos;t be known;
          you correct it by tapping the cells, then download the file as UTF-8 without BOM for the database.
        </p>
      </>
    ),
  },
  never: [
    "Upload your file or change the original.",
    "Repair what can't be known for sure: extra fields that contain data, quotes that never close, and characters that couldn't be read are explained, not guessed.",
    "Replace unreadable characters silently. If the chosen text encoding doesn't fit the file, a warning or an error says so.",
    "Include adding empty cells to short rows in “Fix all”: short rows can mean values shifted into the wrong columns, so that repair is always shown on its own.",
  ],
  limits: [
    "The validator checks the structure of the file. To check the values themselves (dates, emails, duplicates), use the Spreadsheet Error Detector.",
    "The text encodings offered are UTF-8, Windows-1252 and ISO-8859-1 (and UTF-16 when the file starts with a byte-order mark).",
    "Without a byte-order mark (BOM), Excel may show accented letters wrongly when the file is double-clicked; databases usually expect no BOM.",
  ],
  faqs: [
    privacyFaq,
    {
      q: "What makes a CSV file invalid?",
      a: "Rows with a different number of fields, quotes that never close, unreadable characters, hidden control characters, and — when the first row holds column names — empty or duplicate column names.",
    },
    {
      q: "My file uses semicolons. Does that work?",
      a: "Yes. The separator is detected automatically (comma, semicolon, tab or pipe), and you can choose it yourself if the file was read wrongly. The download can use comma, semicolon or tab.",
    },
    {
      q: "Why are accented letters shown wrongly?",
      a: "The file was probably saved in a different text encoding. Choose another encoding (for example Windows-1252 for files from older Excel versions); the file is read again and is never changed.",
    },
    {
      q: "What does “UTF-8 without BOM (for databases)” mean?",
      a: "A BOM is an invisible marker at the start of the file. Excel uses it to recognise UTF-8; many databases and scripts expect files without it. Choose whichever the program you import into needs.",
    },
    {
      q: "Can I check a file without a header row?",
      a: "Yes. Untick “First row contains column names”: the first row is then treated as data and column names are not checked.",
    },
  ],
};

export const excelToCsvGuide: Guide = {
  how: {
    title: "How the Excel to CSV converter works",
    steps: [
      "Open an Excel workbook (.xlsx or .xls). It is read on your device, and the first sheet is shown.",
      "Choose a sheet from the list. Hidden sheets are marked; chart sheets have no cells to convert.",
      "Choose how values are written: “As shown in Excel” (dates and numbers formatted as on screen, such as 13/11/2026 or 1,250.00) or “Plain values (for databases)” (dates as 2026-11-13, numbers in full precision without formatting, TRUE/FALSE as words).",
      "Choose the separator (comma, semicolon or tab), line endings (CRLF or LF) and UTF-8 with or without BOM.",
      "Download this sheet as CSV, or every sheet at once as a ZIP file with one CSV per sheet. Every file is checked cell by cell before it is offered.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        A workbook has a “Data” sheet with amounts formatted as 1,234.57 and dates shown as 2024-01-31, plus a hidden “Archive” sheet. For a
        colleague, “As shown in Excel” gives <code>Ann,10.50,2024-01-31</code>. For a database import, “Plain values” with a semicolon and no BOM gives{" "}
        <code>Ann;10.5;2024-01-31;TRUE</code>. “All sheets (ZIP)” creates Data.csv and Archive.csv, with Archive marked as hidden in the summary.
      </p>
    ),
  },
  never: [
    "Upload your workbook or change it.",
    "Leave out rows or columns that are hidden in Excel: a CSV file can't hide them, so they are included and listed in the summary.",
    "Run formulas: the value each formula last showed in Excel is saved.",
  ],
  limits: [
    "A CSV file holds values only: formatting, formulas, charts, images, comments and other sheets can't be kept, and the summary lists what this workbook had. A merged cell's value is written once, in its first cell.",
    "Large workbooks need more memory than CSV files of the same size; on phones, very large workbooks may be refused before work starts, with a message.",
    "Password-protected workbooks can't be opened.",
  ],
  faqs: [
    privacyFaq,
    {
      q: "Can I convert all sheets at once?",
      a: "Yes. “All sheets (ZIP)” creates one CSV file per sheet, in a single ZIP file. Chart sheets have no cells and are listed as left out.",
    },
    {
      q: "What's the difference between “As shown” and “Plain values”?",
      a: "“As shown in Excel” writes what you see in Excel, including number and date formatting. “Plain values” writes dates as year-month-day and numbers without formatting, which databases and scripts read reliably.",
    },
    {
      q: "Are formulas kept?",
      a: "A CSV file can't hold formulas, so the value each formula showed is saved instead. The summary says how many formulas the sheet had.",
    },
    {
      q: "Which separator should I choose?",
      a: "Comma is the usual choice. Excel in many European countries expects semicolons. Tab-separated files are saved with the .tsv extension.",
    },
    {
      q: "Does it work with old .xls files?",
      a: "Yes. Old .xls workbooks can be converted to CSV, one sheet or all sheets.",
    },
  ],
};

export const csvToExcelGuide: Guide = {
  how: {
    title: "How the CSV to Excel converter works",
    steps: [
      "Open a CSV, TSV or TXT file. The separator and text encoding are detected and can be changed.",
      "A quick structure check runs first. If the file has problems, “Check and repair in the CSV Validator” opens the same file there.",
      "Choose whether the first row contains column names. If it does, the new workbook gets a bold header row, frozen at the top, with a filter.",
      "Convert. Clear numbers and year-month-day dates become real Excel values; everything else stays text exactly as written.",
      "The new workbook is checked cell by cell before it is downloaded, and the summary shows how many cells became numbers, dates and text.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        A customer list has ids such as 00002, phone numbers such as 07700900001, ZIP codes such as 00037, joining dates such as 2024-03-15 and
        balances such as 12.50. In the new workbook, the ids, phones and ZIP codes keep their leading zeros as text, the dates are real Excel dates,
        and the balances are numbers that still show two decimals. Dates written 05/05/2024 stay text, because they could be day-first or month-first.
      </p>
    ),
  },
  never: [
    "Upload your file or change it.",
    "Drop leading zeros, round long numbers or guess date orders: those values stay text exactly as written.",
    "Turn a value into a formula: =1+1 stays the text “=1+1”.",
    "Leave rows out: more rows than one Excel sheet holds (1,048,576) continue on another sheet, with the column names repeated.",
  ],
  limits: [
    "Only year-month-day dates (2024-03-15) become dates. Dates with times, other date layouts and formatted numbers such as 1,250 or 12% stay text.",
    "A value longer than 32,767 characters, or a row with more than 16,384 values, can't be stored in Excel; the conversion is refused with the reason instead of cutting data off.",
    "Very large files need a computer or a recent phone with enough memory.",
  ],
  faqs: [
    privacyFaq,
    {
      q: "Why do some numbers stay as text?",
      a: "To keep them exactly as written. Leading zeros (codes, phone numbers, ZIP codes) would be lost, numbers longer than 15 digits would be rounded, and values such as 1,250 or 12% can mean different things. The summary lists how many values were kept as text and why.",
    },
    {
      q: "Which dates become real Excel dates?",
      a: "Dates written year-month-day, such as 2024-03-15. A date such as 03/04/2024 stays text, because it could mean 3 April or March 4.",
    },
    {
      q: "What happens with more than a million rows?",
      a: "An Excel sheet holds at most 1,048,576 rows. Longer files continue on a second sheet (and a third if needed), each starting with the column names, and the summary says so.",
    },
    {
      q: "Can I repair the file first?",
      a: "Yes. If the structure check finds problems, “Check and repair in the CSV Validator” opens the same file there. Download the repaired CSV, then convert it.",
    },
    {
      q: "Will the header row be formatted?",
      a: "Yes, when “First row contains column names” is ticked: the header is bold, frozen at the top and has a filter. Untick it if the first row is data.",
    },
  ],
};
