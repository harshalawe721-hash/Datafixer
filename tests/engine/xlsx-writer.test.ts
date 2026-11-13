/**
 * Stage 6 Step 1: the new-workbook writer. Every file is checked three ways:
 * the writer's own streaming check, DataFixer's Stage 2 reader (SheetJS), and
 * Python's openpyxl.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeXlsx, verifyNewXlsx, escapeCellText, unescapeCellText, safeSheetName, type OutCell, type SheetSource } from "../../src/engine/export/xlsx-writer.ts";
import { inspectXlsx } from "../../src/engine/xlsx/inspect.ts";
import { readExcelSheet } from "../../src/engine/xlsx/read-workbook.ts";

const s = (v: string): OutCell => ({ t: "s", v });
const n = (v: number, fmt?: string): OutCell => ({ t: "n", v, ...(fmt ? { fmt } : {}) });

const TEXTS = ["plain", "  edge spaces  ", "line\nbreak", "win\r\nbreak", "tab\there", "<b>&amp;</b>", "=1+1", "_x0041_ literal", "ctrl\u0001\u0007\u001f", "emoji 😀 é ü", "'apostrophe", "007"];
function source(): SheetSource {
  const rows: OutCell[][] = [
    [s("id"), s("text"), s("amount"), s("date"), s("price")],
    ...TEXTS.map((t, i): OutCell[] => [n(i + 1), s(t), n(i === 3 ? -3.5 : i * 1250.25), n(45000 + i, "yyyy-mm-dd"), n(1.5, "0.00")]),
    [n(99), null, n(1e20), null], // ragged, empty cells
    [n(0.30000000000000004), s(""), n(0)], // (Excel has no -0: Step 2 keeps the text “-0” as text)
  ];
  return { name: "Data/2024", rowCount: rows.length, colCount: 5, header: true, row: (r) => rows[r]! };
}

test("escaping: control characters and literal _xHHHH_ survive a round trip; XML is well-formed text", () => {
  for (const t of [...TEXTS, "_x005F_", "a_x00", "&lt;"]) assert.equal(unescapeCellText(escapeCellText(t)), t, JSON.stringify(t));
  assert.equal(escapeCellText("a\u0001b"), "a_x0001_b");
  assert.equal(escapeCellText("_x0041_"), "_x005F_x0041_");
});

test("sheet names: forbidden characters replaced, at most 31 characters, unique", () => {
  const taken = new Set<string>();
  assert.equal(safeSheetName("Data/2024", taken), "Data 2024");
  assert.equal(safeSheetName("data 2024", taken), "data 2024 (2)");
  assert.equal(safeSheetName("x".repeat(40), taken).length, 31);
  assert.equal(safeSheetName("", taken), "Sheet");
});

test("writer: the file passes its own check; counts are exact", async () => {
  const src = source();
  const res = await writeXlsx([src]);
  assert.deepEqual(res.sheetNames, ["Data 2024"]);
  assert.deepEqual(res.counts, { text: 5 + TEXTS.length, numbers: TEXTS.length * 3 + 2 + 2, dates: TEXTS.length, empty: 2 + 1 });
  const v = await verifyNewXlsx(res.blob, [src], res.sheetNames);
  assert.equal(v.rows, src.rowCount);
});

test("writer: DataFixer's Stage 2 reader reads back every value and type (dates are dates)", async () => {
  const src = source();
  const { blob } = await writeXlsx([src]);
  const inspection = await inspectXlsx(blob);
  assert.deepEqual(inspection.sheets.map((x) => x.name), ["Data 2024"]);
  const { sheet } = await readExcelSheet(blob, "xlsx", { sheetIndex: 0, inspection });
  for (let r = 0; r < src.rowCount; r++) {
    src.row(r).forEach((cell, c) => {
      const got = sheet.grid.get(r, c);
      if (!cell || (cell.t === "s" && cell.v === "")) assert.ok(got === null || got === "", `${r},${c} empty`);
      // SheetJS (the Stage 2 reader) turns CR LF inside any cell into LF; the file itself keeps it (own check and openpyxl).
      else if (cell.t === "s") assert.equal(got, cell.v.replace(/\r\n/g, "\n"), `${r},${c}`);
      else assert.equal(got, cell.v, `${r},${c}`);
    });
  }
  assert.equal(sheet.grid.isDate!(1, 3), true);
  assert.equal(sheet.grid.display!(1, 3), "2023-03-15");
  assert.equal(sheet.grid.display!(1, 4), "1.50");
  assert.equal(sheet.formulas.size, 0, "never formulas");
});

test("writer: openpyxl reads the same values, types, formats, frozen header, filter, bold header and widths", async () => {
  const src = source();
  const { blob } = await writeXlsx([src, { ...source(), name: "data 2024", header: false }]);
  const dir = mkdtempSync(path.join(tmpdir(), "xlsx-writer-"));
  const file = path.join(dir, "out.xlsx");
  writeFileSync(file, new Uint8Array(await blob.arrayBuffer()));
  const py = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      [
        "import openpyxl,sys,json,datetime",
        "wb=openpyxl.load_workbook(sys.argv[1])",
        "out={'names':wb.sheetnames,'sheets':[]}",
        "for ws in wb.worksheets:",
        "  rows=[[ (c.value.isoformat() if isinstance(c.value,datetime.datetime) else c.value, c.data_type, c.number_format, bool(c.font.b)) for c in r] for r in ws.iter_rows()]",
        "  out['sheets'].append({'rows':rows,'freeze':ws.freeze_panes,'filter':ws.auto_filter.ref,'width':ws.column_dimensions['B'].width})",
        "print(json.dumps(out))",
      ].join("\n"),
      file,
    ],
    { encoding: "utf8" },
  );
  rmSync(dir, { recursive: true, force: true });
  assert.equal(py.status, 0, py.stderr);
  const out = JSON.parse(py.stdout) as { names: string[]; sheets: { rows: [unknown, string, string, boolean][][]; freeze: string | null; filter: string | null; width: number }[] };
  assert.deepEqual(out.names, ["Data 2024", "data 2024 (2)"]);
  const [a, b] = out.sheets;
  assert.equal(a!.freeze, "A2");
  assert.equal(a!.filter, `A1:E${src.rowCount}`);
  assert.equal(b!.freeze, null);
  assert.equal(b!.filter, null);
  assert.ok(a!.width >= 8 && a!.width <= 60);
  // Header bold (first sheet only), text as text, numbers as numbers, dates as dates with the format.
  assert.deepEqual(a!.rows[0]!.map((c) => [c[0], c[3]]), [["id", true], ["text", true], ["amount", true], ["date", true], ["price", true]]);
  assert.equal(b!.rows[0]![0]![3], false);
  for (let i = 0; i < TEXTS.length; i++) {
    const row = a!.rows[i + 1]!;
    // openpyxl doesn't decode Excel's _xHHHH_ escapes in inline strings (control characters, a literal “_x0041_”);
    // Excel and SheetJS do (checked in the test above), and so does the writer's own check.
    const escaped = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]|_x[0-9A-Fa-f]{4}_/.test(TEXTS[i]!);
    if (!escaped) assert.deepEqual([row[1]![0], row[1]![1]], [TEXTS[i], "s"], `text ${JSON.stringify(TEXTS[i])}`);
    else assert.equal(row[1]![1], "s");
    assert.equal(row[0]![1], "n");
    assert.equal(row[3]![2], "yyyy-mm-dd");
    assert.equal(row[3]![1], "d");
    assert.deepEqual([row[4]![0], row[4]![2]], [1.5, "0.00"]);
  }
  assert.equal(a!.rows[1]![3]![0], "2023-03-15T00:00:00");
  assert.equal(a!.rows[TEXTS.length + 1]![2]![0], 1e20);
});

test("Excel's limits are refused up front, with the reason (nothing is cut off)", async () => {
  const base = { name: "S", colCount: 1, header: false, row: () => [s("x")] };
  await assert.rejects(writeXlsx([{ ...base, rowCount: 1_048_577 }]), /holds at most 1,048,576/);
  await assert.rejects(writeXlsx([{ ...base, rowCount: 1, colCount: 16_385 }]), /at most 16,384 columns/);
  await assert.rejects(writeXlsx([{ ...base, rowCount: 2, row: (r: number) => [s(r ? "y".repeat(32_768) : "h")] }]), /Cell A2 .* 32,768 characters/);
});

test("the check catches a file that doesn't match (one changed value, a missing row, a wrong format)", async () => {
  const src = source();
  const { blob, sheetNames } = await writeXlsx([src]);
  const changed = (r0: number, c0: number, cell: OutCell): SheetSource => ({ ...src, row: (r) => src.row(r).map((x, c) => (r === r0 && c === c0 ? cell : x)) });
  await assert.rejects(verifyNewXlsx(blob, [changed(2, 1, s("other"))], sheetNames), /didn't pass DataFixer's check/);
  await assert.rejects(verifyNewXlsx(blob, [changed(2, 4, n(1.5, "0.000"))], sheetNames), /didn't pass/);
  await assert.rejects(verifyNewXlsx(blob, [changed(2, 2, s("1250.25"))], sheetNames), /didn't pass/);
  await assert.rejects(verifyNewXlsx(blob, [{ ...src, rowCount: src.rowCount + 1, row: (r) => (r < src.rowCount ? src.row(r) : [s("extra")]) }], sheetNames), /didn't pass/);
  await assert.rejects(verifyNewXlsx(blob, [src], ["Other"]), /didn't pass/);
});
