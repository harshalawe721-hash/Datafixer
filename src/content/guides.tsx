import type { Guide } from "@/components/tools/ToolGuide";

/**
 * Help content for the tool pages (Stage 7, decision 1A). Every statement here
 * describes behaviour built and tested in Stages 2–6 (see docs/stage-*-test-report.md).
 */

const privacyFaq = {
  q: "Is my file uploaded?",
  a: "No. Your browser opens the file on your device and every check, fix and download happens there. The contents of your file are not sent to MyDataFixer's servers or to anyone else, and your original file is never changed.",
};

export const detectorGuide: Guide = {
  how: {
    title: "How the Spreadsheet Error Detector works",
    steps: [
      "Open an Excel workbook (.xlsx or .xls) or a CSV file. It is read on your device, and a preview of the sheet appears.",
      "MyDataFixer checks every row and column for eleven kinds of problem: duplicate rows, empty rows and columns, missing cells, extra spaces, inconsistent capitalization, numbers stored as text, inconsistent, impossible or ambiguous dates, invalid email addresses, invalid phone numbers, unusual values and formula errors such as #DIV/0! or #N/A. It also notes name and city columns written entirely in capitals or small letters, which “Change case” can tidy.",
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
    "Files up to 150 MB are accepted. Very large files need a computer or a recent phone with enough memory; if a file is too large for the device, MyDataFixer stops safely and says so.",
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
      "The cleaning tools list shows what each tool would fix in your sheet: extra spaces, duplicate rows, empty rows, empty columns, numbers stored as text, capitalization, date formats and phone number layouts. “Change case” writes the columns you choose in Proper Case, UPPER CASE or lower case.",
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
    "Changes are kept only in the open browser tab until you download them. MyDataFixer asks before you leave the page with changes that haven't been downloaded.",
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
      a: "Yes. Tap a cell in the table (or move to it with the arrow keys and press Enter) to open the editor. Column names can be renamed with the pencil next to each name. If a cell holds a formula, MyDataFixer warns you first, because saving a value replaces the formula.",
    },
    {
      q: "Which spelling is kept when capitalization differs?",
      a: "The most common one in that column. When two spellings are equally common, MyDataFixer asks which to use.",
    },
    {
      q: "Can I write names in Proper Case, like Ravi Kumar?",
      a: "Yes. “Change case” writes the columns you choose in Proper Case, UPPER CASE or lower case, with a preview first. Proper Case handles names such as O'Brien and McDonald; email addresses, web addresses and values with numbers are never changed.",
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
      "Open a CSV, TSV or TXT file. MyDataFixer detects the text encoding and the column separator; both can be changed if the file was read wrongly.",
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

export const splitGuide: Guide = {
  how: {
    title: "How Split a Column works",
    steps: [
      "Open a CSV file or an Excel workbook (.xlsx). It is read on your device.",
      "Choose the column to split and where to split it: at a space, comma, semicolon, dash, tab or any other text you type.",
      "Choose whether to split only at the first separator (two parts, such as first name and the rest) or at every separator, and how many parts to keep.",
      "The preview shows the first rows with their new columns. Nothing changes until you tap Apply.",
      "The new columns are added at the right of the sheet, named after the column: “name (1)”, “name (2)”. Undo takes them away again. Download the result as CSV or, for .xlsx files, as Excel.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        A column “name” holds “Asha Patil” and “Ben Rome”. Split at the first space, it gives “name (1)” with Asha and Ben, and “name (2)” with Patil
        and Rome. A value without a space, such as “Cher”, goes into “name (1)” and leaves “name (2)” empty. Split at every comma, “Pune,
        Maharashtra, India” gives three columns.
      </p>
    ),
  },
  never: [
    "Upload your file or change the original. The split is made on a copy in your browser; the download is a new file.",
    "Split a formula cell. Formula cells are left as they are and counted in the preview.",
    "Lose data: the original column is kept unless you tick “Remove the original column”, and values without the separator are kept in the first new column.",
    "Remove a column from an Excel workbook when a filter, name or formula refers to it. The original column is kept and the preview says why.",
  ],
  limits: [
    "Works with CSV and .xlsx files. Old .xls files can't have columns added safely: save them as .xlsx in Excel first.",
    "A separator that also appears inside a value (such as “Lee, Jr, Ahmed”) splits that value too. Check the preview, or tick “Don't split inside double quotes” when such values are quoted.",
    "An Excel sheet holds at most 16,384 columns; a split that would need more is refused with the reason.",
    "Very large files need a computer or a recent phone with enough memory.",
  ],
  faqs: [
    privacyFaq,
    {
      q: "How do I split first and last names?",
      a: "Choose the name column, “Space” and “At the first separator only”. The first word goes into one column and the rest of the name into the next, so “Mary Ann Lopez” becomes “Mary” and “Ann Lopez”.",
    },
    {
      q: "Where do the new columns go?",
      a: "At the right of the sheet, after the last column, named after the column you split: “name (1)”, “name (2)” and so on. Your other columns don't move.",
    },
    {
      q: "Is the original column removed?",
      a: "Not unless you tick “Remove the original column”. Either way, Undo brings everything back as it was.",
    },
    {
      q: "Will my Excel formatting be kept?",
      a: "Yes, when you download an .xlsx file as Excel: the new cells are written into your original workbook, and formatting, formulas and other sheets stay as they were.",
    },
    {
      q: "Is this the same as Text to Columns in Excel?",
      a: "It does the same job, with a preview first and Undo afterwards, and it works in any browser, also on a phone. Excel's Text to Columns replaces the columns to the right; this tool adds new columns instead.",
    },
  ],
};

export const combineGuide: Guide = {
  how: {
    title: "How Combine Columns works",
    steps: [
      "Open a CSV file or an Excel workbook (.xlsx). It is read on your device.",
      "Tick two or more columns. They are joined in the order you tick them; move a column up or down to change the order.",
      "Choose what goes between the values: a space, a comma and space, a dash, nothing, or any text you type. Name the new column.",
      "The preview shows the first rows with the combined value. Nothing changes until you tap Apply.",
      "The new column is added at the right of the sheet, and the original columns are kept unless you tick “Remove the original columns”. Undo takes it away again. Download the result as CSV or, for .xlsx files, as Excel.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        Columns “first” and “last” hold “Asha” and “Patil”. Combined with a space, the new column “full name” holds “Asha Patil”. If a row has no last
        name, it holds just “Asha”, without a space at the end, because empty values are skipped. Combining “city” and “state” with a comma and space
        gives “Pune, Maharashtra”.
      </p>
    ),
  },
  never: [
    "Upload your file or change the original. Columns are combined on a copy in your browser; the download is a new file.",
    "Change a formula cell. A formula's current value is used in the combined text, and the formula itself stays where it is.",
    "Remove the original columns unless you ask, or from an Excel workbook when a filter, name or formula refers to them. Then they are kept and the preview says why.",
    "Cut a value short: a combined value longer than an Excel cell holds (32,767 characters) is left empty and counted in the preview.",
  ],
  limits: [
    "Works with CSV and .xlsx files. Old .xls files can't have columns added safely: save them as .xlsx in Excel first.",
    "Numbers and dates are joined as they appear in the sheet (for example 2024-03-15 or 12.50). The combined column holds text, so it can't be used in sums or date filters.",
    "Very large files need a computer or a recent phone with enough memory.",
  ],
  faqs: [
    privacyFaq,
    {
      q: "How do I combine first and last names?",
      a: "Tick the first-name column, then the last-name column, choose “Space”, and name the new column, for example “full name”. Asha + Patil becomes “Asha Patil”.",
    },
    {
      q: "Can I change the order of the columns?",
      a: "Yes. They are joined in the order you tick them, and the Order list has buttons to move each column up or down.",
    },
    {
      q: "What happens with empty cells?",
      a: "With “Skip empty values” ticked (the default), empty values are left out without adding an extra separator. Untick it to keep a separator for every column, even when a value is empty.",
    },
    {
      q: "Are the original columns removed?",
      a: "Not unless you tick “Remove the original columns”. Either way, Undo brings everything back as it was.",
    },
    {
      q: "Is this the same as CONCAT or the & operator in Excel?",
      a: "It gives the same result as =A2&\" \"&B2 or TEXTJOIN, with a preview first and Undo afterwards. The new column holds plain values, not formulas, so it stays the same if you later delete the original columns.",
    },
  ],
};

export const duplicatesGuide: Guide = {
  how: {
    title: "How Remove Duplicates works",
    steps: [
      "Open an Excel workbook (.xlsx or .xls) or a CSV file. It is read on your device, and the preview of duplicate rows appears straight away.",
      "Choose how rows are compared: all columns (the whole row is the same) or only the columns you choose, such as an email column.",
      "Choose whether to ignore capital letters (Paris = PARIS) and extra spaces. These only affect the comparison; the rows you keep are not changed.",
      "Choose which copy to keep, the first or the last, and whether to remove the other copies or mark them in a new “Duplicate” column.",
      "Check the groups of matching rows in the preview, tap Apply, and download the result as CSV or Excel. Undo brings every row back.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        A sign-up list has the rows “Asha, asha@example.com, Pune” twice and a third row “Asha P, asha@example.com, Mumbai”. Comparing all columns,
        only the exact copy is a duplicate, so one row is removed. Comparing only the email column, all three rows match: the first is kept and the other
        two are removed, or marked “Duplicate of row 2” if you choose to mark them.
      </p>
    ),
  },
  never: [
    "Upload your file or change the original. Rows are removed from a copy in your browser; the download is a new file.",
    "Remove a row that isn't an exact match under the rules you chose. Every match is checked cell by cell.",
    "Remove rows with formulas automatically. They are listed in the preview instead.",
    "Remove rows from an Excel workbook when a formula, chart, filter or name refers to them, or from an old .xls file at all. You can mark the duplicates or clear those rows instead.",
  ],
  limits: [
    "Only rows that match under the chosen rules are found. Near-duplicates such as “Asha Patil” and “A. Patil” are not.",
    "When you compare chosen columns, the row you keep keeps its own values in the other columns; nothing is merged into it from the removed rows.",
    "A number and the same digits stored as text (12 and “12”) count as different values.",
    "Very large files need a computer or a recent phone with enough memory.",
  ],
  faqs: [
    privacyFaq,
    {
      q: "How do I remove duplicates based on one column?",
      a: "Choose “Only the columns I choose” and tick that column, for example email. Rows with the same email count as duplicates even if the other columns differ; the first (or last) one is kept.",
    },
    {
      q: "Which row is kept?",
      a: "The first copy, unless you choose “The last”. Keeping the last is useful when new entries are added at the bottom, so the newest row stays.",
    },
    {
      q: "Can I see the duplicates without deleting them?",
      a: "Yes. Choose “Mark them in a new column”. A “Duplicate” column is added that says which row each copy matches, and nothing is removed. In Excel you can then filter on that column.",
    },
    {
      q: "Are “Paris” and “paris” duplicates?",
      a: "Only if you tick “Ignore capital letters”. By default, rows must match exactly. The same goes for extra spaces, with “Ignore extra spaces”.",
    },
    {
      q: "Will my Excel formatting be kept?",
      a: "Yes, when you download an .xlsx file as Excel: only the removed rows (or the new column) change inside your original workbook, and formatting, formulas and other sheets stay as they were.",
    },
  ],
};

export const jsonToCsvGuide: Guide = {
  how: {
    title: "How the JSON to CSV converter works",
    steps: [
      "Open a .json or .jsonl file, or paste JSON into the box. It is read on your device.",
      "Each record becomes a row and each key a column, in the order the keys first appear. Nested objects get their own columns, such as address.city.",
      "If the file holds the records inside another object (for example under “results”), the largest list is shown, and you can choose another one.",
      "Check the table, then download it as CSV or as an Excel workbook. Each file is checked before it is downloaded.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        A file holds <code>[{"{"}&quot;id&quot;: &quot;00123&quot;, &quot;name&quot;: &quot;Asha&quot;, &quot;address&quot;: {"{"}&quot;city&quot;: &quot;Pune&quot;{"}"}, &quot;phones&quot;: [&quot;+91 1&quot;, &quot;+91 2&quot;]{"}"}]</code>.
        The table gets the columns id, name, address.city and phones. The id keeps its leading zeros, and the two phone numbers stay together in one
        cell as JSON text, so nothing is lost.
      </p>
    ),
  },
  never: [
    "Upload your file or what you paste. Everything is read and converted in your browser.",
    "Round long numbers: numbers longer than 15 digits (IDs, card numbers) are kept exactly as written.",
    "Guess when the JSON has a mistake. It shows what is wrong and the line and column, so you can fix it.",
    "Turn a value into a formula in the Excel file: =1+1 stays the text “=1+1”.",
  ],
  limits: [
    ".json files can be up to 50 MB, because they have to be read as a whole; .jsonl files (one record per line) can be up to 150 MB.",
    "Lists inside a record stay as JSON text in one cell, and very deeply nested data gives many columns.",
    "Only UTF-8 text can be read (the usual encoding for JSON).",
    "Very large files need a computer or a recent phone with enough memory.",
  ],
  faqs: [
    {
      q: "Is my file uploaded?",
      a: "No. Your browser reads the file (or the pasted text) on your device, and the CSV or Excel file is created there too. Nothing is sent to MyDataFixer's servers or to anyone else.",
    },
    {
      q: "What happens to nested JSON?",
      a: "Nested objects become columns with dotted names, such as address.city and address.zip. Lists inside a record, such as several phone numbers, stay as JSON text in one cell.",
    },
    {
      q: "My JSON has the data under “data” or “results”. Can I convert it?",
      a: "Yes. The converter finds lists inside the file and shows the largest one. If there are several, choose the one you want from the list above the table.",
    },
    {
      q: "Why do some numbers stay as text?",
      a: "Excel keeps only 15 digits of a number, so longer IDs and card numbers would be changed. They stay exactly as written. Codes with leading zeros, such as 00123, also stay text.",
    },
    {
      q: "What is JSON Lines?",
      a: "A file with one JSON record on each line, often saved as .jsonl or .ndjson. Save it as .jsonl to open it here, or tick “One record per line” when you paste it.",
    },
  ],
};

export const csvToJsonGuide: Guide = {
  how: {
    title: "How the CSV to JSON converter works",
    steps: [
      "Open a CSV, TSV or TXT file, or an Excel workbook (.xlsx or .xls). It is read on your device; the separator and text encoding of CSV files are detected and can be changed.",
      "Each row becomes a record. With “First row contains column names” ticked, the names become the keys; empty names become column_2 and repeated names name_2.",
      "Choose the values: as text, exactly as shown (the default), or with numbers, true/false and empty values detected.",
      "Choose the layout: pretty (indented), compact (smallest) or JSON Lines (one record per line), check the preview of the first records, and download. Every record is checked before the file is offered.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        A CSV file has the columns id, name and age, and a row 00123, Asha, 30. As text, the record is{" "}
        <code>{"{"}&quot;id&quot;: &quot;00123&quot;, &quot;name&quot;: &quot;Asha&quot;, &quot;age&quot;: &quot;30&quot;{"}"}</code>. With values
        detected, age becomes the number 30, while the id stays the text &quot;00123&quot; because of its leading zeros.
      </p>
    ),
  },
  never: [
    "Upload your file. The JSON is created in your browser.",
    "Change a value unless you ask: by default every value is written as text, exactly as shown in the table.",
    "Turn codes with leading zeros, numbers longer than 15 digits or dates into numbers, even with detection on.",
    "Offer a file that doesn't match the table: every record is read back and compared before the download.",
  ],
  limits: [
    "Each row is one flat record; nested JSON (for example address.city as an object) is not built from column names.",
    "Excel dates are written as shown in the sheet, as text.",
    "Very large files need a computer or a recent phone with enough memory.",
  ],
  faqs: [
    {
      q: "Is my file uploaded?",
      a: "No. Your browser reads the file on your device and creates the JSON there. Nothing is sent to MyDataFixer's servers or to anyone else, and your original file is never changed.",
    },
    {
      q: "Why are my numbers in quotes?",
      a: "By default every value is written as text, exactly as shown, so nothing changes. Choose “Detect numbers, true/false and empty values” to write plain numbers without quotes.",
    },
    {
      q: "Why does 00123 stay in quotes even with detection on?",
      a: "Because as a number it would become 123. Codes with leading zeros, numbers longer than 15 digits and dates always stay text.",
    },
    {
      q: "What is the difference between pretty, compact and JSON Lines?",
      a: "Pretty is indented and easy to read. Compact has no extra spaces, so the file is smallest. JSON Lines puts one record on each line, which many data tools read one line at a time.",
    },
    {
      q: "Can I convert an Excel file to JSON?",
      a: "Yes. Open the .xlsx or .xls file and choose the sheet; the values are written as shown in the sheet.",
    },
  ],
};

export const tsvToCsvGuide: Guide = {
  how: {
    title: "How the TSV to CSV converter works",
    steps: [
      "Open a .tsv, .txt or .tab file (or a .csv that really uses tabs). It is read on your device; the separator and text encoding are found automatically and can be changed.",
      "A quick structure check shows whether every row has the same number of values. If not, “Check and repair in the CSV Validator” opens the same file there.",
      "Choose the separator for the new file: comma (the usual CSV), semicolon (for Excel in countries that write decimals with a comma) or tab (to make a TSV from a CSV). Line endings and the BOM are under “More options”.",
      "Download the CSV, or an Excel workbook. Each file is read back and checked before it is downloaded.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        A file exported from a database has the line <code>00123⇥Patil, Asha⇥Pune</code> (⇥ is a tab). As CSV it becomes{" "}
        <code>00123,&quot;Patil, Asha&quot;,Pune</code>: the name is put in quotes because it contains a comma, so it stays in one cell, and the code keeps
        its leading zeros.
      </p>
    ),
  },
  never: [
    "Upload your file or change the original. The new file is created in your browser.",
    "Change a value: codes keep their leading zeros, long numbers keep all their digits, and dates stay as written in the CSV.",
    "Split a value that contains the new separator: it is put in quotes, as CSV requires.",
    "Offer a file that doesn't match the table: every download is checked first.",
  ],
  limits: [
    "A value with a tab inside it can't be told apart from two values unless it is in quotes; the structure check points out rows that don't line up.",
    "Files up to 150 MB; very large files need a computer or a recent phone with enough memory.",
  ],
  faqs: [
    {
      q: "Is my file uploaded?",
      a: "No. Your browser reads the file on your device and creates the CSV there. Nothing is sent to MyDataFixer's servers or to anyone else.",
    },
    {
      q: "What is a TSV file?",
      a: "A text file where the values on each line are separated by tabs instead of commas. Databases, Google Sheets and many research tools export it, sometimes with a .txt name.",
    },
    {
      q: "Can I convert CSV to TSV here?",
      a: "Yes. Open the CSV file and choose “Tab” as the separator for the new file.",
    },
    {
      q: "Comma or semicolon?",
      a: "Comma is the usual CSV. Choose semicolon if the file is for Excel on a computer set up for a country that writes decimals with a comma (3,5), such as Germany, France or Brazil.",
    },
    {
      q: "Why does my TSV open in one column in Excel?",
      a: "Excel sometimes doesn't recognise tabs when you double-click a file. Converting it to CSV (or to an Excel workbook) here opens correctly every time.",
    },
  ],
};

export const xmlToCsvGuide: Guide = {
  how: {
    title: "How the XML to CSV converter works",
    steps: [
      "Open an .xml file. It is read on your device, in pieces, so large files work too; the text encoding named in the file is used.",
      "The element that repeats as a list of records (for example every <product> or <VOUCHER>) is found for you. If the file has several lists, choose another one above the table.",
      "Each record becomes a row. Its child elements and attributes become columns, nested elements get dotted names such as address.city, and repeated elements inside one record (several <phone>) are joined in one cell with “; ”.",
      "Download the table as CSV or as an Excel workbook. Each file is checked before it is downloaded.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        A product feed has <code>&lt;item&gt;&lt;g:id&gt;00123&lt;/g:id&gt;&lt;title&gt;Kurta&lt;/title&gt;&lt;g:price&gt;499.00 INR&lt;/g:price&gt;&lt;/item&gt;</code>{" "}
        for every product. The table gets the columns g:id, title and g:price, one row per product. The id keeps its leading zeros, and the feed&apos;s own
        title, which isn&apos;t a product, is left out (the page says so).
      </p>
    ),
  },
  never: [
    "Upload your file. Everything is read and converted in your browser.",
    "Change a value: codes keep their leading zeros, long numbers all their digits, and text is kept exactly as written (entities such as &amp; become &).",
    "Load other files or expand entities a document defines for itself: such documents are refused for safety.",
    "Guess when the XML has a mistake. It shows what is wrong and the line and column.",
  ],
  limits: [
    "Files up to 150 MB. Very large files need a computer or a recent phone with enough memory; if a file is too large for the device, it stops safely and says so.",
    "Repeated elements inside one record are joined in one cell; text mixed with child elements is joined into one cell too.",
    "XML that isn't a list of similar records (for example a settings file) gives a table that may not be useful.",
  ],
  faqs: [
    {
      q: "Is my file uploaded?",
      a: "No. Your browser reads the file on your device and creates the CSV or Excel file there. Nothing is sent to MyDataFixer's servers or to anyone else.",
    },
    {
      q: "Can I convert XML to Excel?",
      a: "Yes. Choose “Download Excel (.xlsx)”. Plain numbers become numbers and year-month-day dates become dates, while codes with leading zeros stay text.",
    },
    {
      q: "Which part of the XML becomes the rows?",
      a: "The element that repeats as a list, such as every <product> in a feed or every <VOUCHER> in an accounting export. If the file has more than one list, choose the one you want above the table.",
    },
    {
      q: "What happens to attributes like id=\"7\"?",
      a: "They become columns too, named after the attribute. If a child element has the same name, the attribute column gets an @ in front, such as @id.",
    },
    {
      q: "Why was my file refused?",
      a: "Either the XML has a mistake (the message shows the line and column), or it defines its own entities in a <!DOCTYPE>, which is refused for safety. Files from normal exports, feeds and sitemaps don't do that.",
    },
  ],
};

export const mergeGuide: Guide = {
  how: {
    title: "How Merge Files works",
    steps: [
      "Choose or drop two or more files: CSV, TSV, TXT or Excel (.xlsx, .xls), even mixed. You can add more, change the order and remove files before merging.",
      "Each file is read on your device, one at a time. Each CSV file's separator and text encoding are found separately, and Excel files use their first visible sheet.",
      "Columns are matched by name, ignoring capital letters and spaces around the names, so files with the same columns in a different order line up. Columns found in only some files are added at the end.",
      "Optionally add a “Source file” column and remove rows that appear more than once. Check the merged table, then download it as CSV or Excel, or open it in Remove Duplicates for more options.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        jan.csv has the columns id, name and city; feb.xlsx has name, id and phone. Merged, the table has the columns Source file, id, name, city and phone.
        January&apos;s rows have no phone and February&apos;s rows have no city, so those cells are empty, and the page says which columns are only in some files.
      </p>
    ),
  },
  never: [
    "Upload your files or change them. The merged file is a new file created in your browser.",
    "Change a value: codes keep their leading zeros and values from Excel are taken as they are shown.",
    "Mix up columns: they are matched by name, and a column that exists in only some files stays empty for the others instead of being filled from another column.",
    "Offer a file that doesn't match the merged table: every download is checked first.",
  ],
  limits: [
    "Up to 50 files and 150 MB together. Very large merges need a computer or a recent phone with enough memory; if the merged table is too large for the device, MyDataFixer stops safely and says so.",
    "Only the first visible sheet of each Excel workbook is used.",
    "Differently named columns that mean the same thing (Email and E-mail) stay separate; rename them in one file first.",
  ],
  faqs: [
    {
      q: "Are my files uploaded?",
      a: "No. Your browser reads the files on your device and creates the merged file there. Nothing is sent to MyDataFixer's servers or to anyone else.",
    },
    {
      q: "Do the columns have to be in the same order?",
      a: "No. Columns are matched by their names, so “id, name” and “name, id” line up. Files without column names are matched by position.",
    },
    {
      q: "Can I merge CSV and Excel files together?",
      a: "Yes. CSV, TSV, TXT, .xlsx and .xls files can be merged in one go. For Excel files, the first visible sheet is used.",
    },
    {
      q: "How do I know which file a row came from?",
      a: "Keep “Add a Source file column” ticked: the first column then holds the file name for every row.",
    },
    {
      q: "Can I remove duplicates after merging?",
      a: "Yes. Tick “Remove rows that appear more than once” to leave out exact copies, or use “Open in Remove Duplicates” to compare only some columns or keep the last copy.",
    },
  ],
};

export const splitFileGuide: Guide = {
  how: {
    title: "How Split File works",
    steps: [
      "Open a CSV, TSV, TXT or Excel file (.xlsx, .xls). For a workbook, choose the sheet to split.",
      "Choose how to split it: a number of rows in each part (for example 100,000), a number of equal parts, or one part for each value in a column, such as one file per city or per month.",
      "See the list of parts with their names and rows. With column names, they are repeated at the top of every part, and rows stay in their original order.",
      "Download all the parts together as one .zip file, or each part on its own. Every part is read back and checked against your file before it is offered.",
    ],
  },
  example: {
    title: "Example",
    body: (
      <p>
        customers.csv has 250,000 rows, but your mailing tool imports at most 100,000 at a time. With 100,000 rows per part you get customers-part-01.csv and
        customers-part-02.csv with 100,000 rows each, and customers-part-03.csv with the last 50,000, each starting with the column names.
      </p>
    ),
  },
  never: [
    "Upload your file or change it. The parts are new files created in your browser.",
    "Change a value: codes keep their leading zeros, CSV parts keep your file's separator, and values from Excel are taken as they are shown.",
    "Lose or repeat a row: every row of your file is in exactly one part.",
    "Offer a part that doesn't match your file: every part is checked first, and the .zip file is checked again after it is made.",
  ],
  limits: [
    "Files up to 150 MB and 2–1,000 parts. Very large files need a computer or a recent phone with enough memory; if a file is too large for the device, MyDataFixer stops safely and says so.",
    "By column value: up to 200 different values, compared exactly as written, so “Pune” and “pune” become two parts.",
    "One sheet of an Excel workbook is split at a time. Excel parts keep the values as shown, not formulas or formatting.",
  ],
  faqs: [
    {
      q: "Are my files uploaded?",
      a: "No. Your browser reads the file on your device and creates the parts there. Nothing is sent to MyDataFixer's servers or to anyone else.",
    },
    {
      q: "Does every part get the column names?",
      a: "Yes, when “First row contains column names” is ticked: the names are repeated at the top of every part, so each part works on its own.",
    },
    {
      q: "How do I split a file that is too big for Excel?",
      a: "Excel shows at most 1,048,576 rows per sheet. Split the file into parts of up to 1,000,000 rows, then open each part in Excel.",
    },
    {
      q: "Can I make one file per customer, city or month?",
      a: "Yes. Choose “One part for each value in a column” and the column. Rows with no value in that column go in a part called “(empty)”.",
    },
    {
      q: "How do I join the parts back together?",
      a: "Use Merge Files: choose all the parts, and they become one table again.",
    },
  ],
};
