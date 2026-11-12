/**
 * Stage 4, Step 6: CSV download.
 * Every export is verified by DataFixer's reader (as the website does) AND,
 * independently, by Python's csv module (owner-approved Option A, V3).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import { buildCsv, expectedRow, quoteField, verifyCsv } from "../../src/engine/export/csv-export.ts";
import type { SheetModel } from "../../src/engine/types.ts";

const SCAN = new URL("../fixtures/scan/", import.meta.url);
const noop = () => {};

async function openFile(name: string, bytes: Uint8Array<ArrayBuffer> | string, format: "csv" | "xlsx" = "csv") {
  const core = new EngineCore();
  const s = await core.open(new File([bytes], name), format, {}, noop);
  return { core, sheet: s.activeSheet };
}
const openPack = (name: string) => openFile(name, new Uint8Array(readFileSync(new URL(name, SCAN))), name.endsWith(".xlsx") ? "xlsx" : "csv");

/** Independent check (V3): Python's csv module reads the exported bytes; every row must match. */
async function pythonRows(blob: Blob, delimiter: string): Promise<string[][]> {
  const dir = mkdtempSync(path.join(tmpdir(), "df-csv-"));
  try {
    const file = path.join(dir, "out.csv");
    writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    const script = [
      "import csv, json, sys",
      "raw = open(sys.argv[1], 'rb').read()",
      "assert raw[:3] == b'\\xef\\xbb\\xbf', 'missing BOM'",
      "with open(sys.argv[1], newline='', encoding='utf-8-sig') as f:",
      "    rows = list(csv.reader(f, delimiter=sys.argv[2], strict=True))",
      "print(json.dumps(rows))",
    ].join("\n");
    const r = spawnSync("python3", ["-I", "-c", script, file, delimiter], { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout) as string[][];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertPythonMatches(rows: string[][], sheet: SheetModel, useDisplay: boolean) {
  assert.equal(rows.length, sheet.grid.rowCount, "Python reads the same number of rows");
  for (let r = 0; r < rows.length; r++) {
    const want = expectedRow(sheet, r, useDisplay);
    // Python reads an empty line as [] (DataFixer as [""]): both mean "no cells".
    assert.deepEqual(rows[r]!.length === 0 ? [] : rows[r], want.length === 1 && want[0] === "" ? (rows[r]!.length === 0 ? [] : [""]) : want, `row ${r + 1}`);
  }
}

test("quoting: separators, quotes and line breaks are quoted; everything else is written as is", () => {
  assert.equal(quoteField("plain", ","), "plain");
  assert.equal(quoteField("a,b", ","), '"a,b"');
  assert.equal(quoteField("a;b", ","), "a;b");
  assert.equal(quoteField('say "hi"', ","), '"say ""hi"""');
  assert.equal(quoteField("two\nlines", ","), '"two\nlines"');
  assert.equal(quoteField(" spaced ", ","), " spaced ");
});

test("1-problems.csv after all fixes and a manual edit: verified by DataFixer and by Python; summary counts are exact", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  core.applyFix(sheet, (await core.previewFixAll(sheet, { headerRow: true }, noop)).token);
  core.editCell(sheet, 7, 2, "person7@example.com");
  const phases = new Set<string>();
  const { blob, summary } = await core.exportCsv(sheet, (p) => phases.add(p.phase));
  assert.ok(phases.has("verifying"), "the file was read back before being returned");
  const view = core.getSheet(sheet)!;
  assert.deepEqual(
    { ...summary, bytes: 0, verification: { ...summary.verification } },
    {
      originalName: "1-problems.csv",
      downloadName: "1-problems-cleaned.csv",
      format: "csv",
      bytes: 0,
      rows: 25,
      columns: 8,
      cellsEdited: 5,
      rowsRemoved: 3,
      columnsRemoved: 0,
      duplicatesRemoved: 2,
      automaticCorrections: 7,
      manualEdits: 1,
      notPreserved: [],
      warnings: summary.warnings,
      verification: { reader: "DataFixer's CSV reader", rows: 25, cells: summary.verification.cells },
      version: core.editStats(sheet).version,
    },
  );
  assert.ok(summary.verification.cells > 150);
  assert.ok(summary.warnings.some((w) => /start with =, \+, - or @/.test(w)), "formula-like cells (+1 555…) mentioned");
  assertPythonMatches(await pythonRows(blob, ","), view, false);
  // The fixes are in the file.
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer());
  assert.ok(text.includes("Person 3,") && !text.includes(" Person 3"), "spaces removed");
  assert.ok(text.includes("person7@example.com"), "manual edit included");
  assert.ok(!text.includes("1,250"), "number converted");
});

test("the original uploaded file is never changed", async () => {
  const bytes = readFileSync(new URL("1-problems.csv", SCAN));
  const file = new File([bytes], "1-problems.csv");
  const hash = async () => createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  const before = await hash();
  const core = new EngineCore();
  const s = await core.open(file, "csv", {}, noop);
  core.applyFix(s.activeSheet, (await core.previewFixAll(s.activeSheet, { headerRow: true }, noop)).token);
  await core.exportCsv(s.activeSheet, noop);
  assert.equal(await hash(), before);
  assert.equal(before, createHash("sha256").update(bytes).digest("hex"));
});

test("tricky content survives the round trip: quotes, separators, line breaks, accents, emoji, spaces, ragged rows", async () => {
  const csv = 'name,note,extra\r\n"Zoë, the ""best""","line one\nline two",x\r\nJosé, keep  spaces ,\r\n😀 emoji,=SUM(A1),+1 555\r\nshort\r\n\r\nlast,"a\r\nb",c\r\n';
  const { core, sheet } = await openFile("tricky.csv", csv);
  core.editCell(sheet, 4, 0, "edited, with comma");
  const { blob, summary } = await core.exportCsv(sheet, noop);
  const view = core.getSheet(sheet)!;
  assert.equal(summary.verification.rows, view.grid.rowCount);
  assertPythonMatches(await pythonRows(blob, ","), view, false);
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer());
  assert.ok(text.includes("\r\n"), "Windows line endings kept");
  assert.ok(text.includes('"edited, with comma"'));
});

test("separator and line endings follow the original file (semicolon, LF)", async () => {
  const { core, sheet } = await openFile("semi.csv", "a;b\n1,5;x\n2;y \n");
  core.editCell(sheet, 2, 1, "y");
  const { blob } = await core.exportCsv(sheet, noop);
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer());
  assert.equal(text, "﻿a;b\n1,5;x\n2;y\n");
  assertPythonMatches(await pythonRows(blob, ";"), core.getSheet(sheet)!, false);
});

test("Windows-1252 input is written as UTF-8, with a note", async () => {
  const bytes = Buffer.from([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x43, 0x61, 0x66, 0xe9, 0x20, 0x0a]); // "name\nCafé \n" in Windows-1252
  const { core, sheet } = await openFile("w.csv", new Uint8Array(bytes));
  core.editCell(sheet, 1, 0, "Café");
  const { blob, summary } = await core.exportCsv(sheet, noop);
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer()), "﻿name\nCafé\n");
  assert.ok(summary.warnings.some((w) => /windows-1252/.test(w)));
});

test("verification catches a damaged file (nothing would be offered)", async () => {
  const { core, sheet } = await openPack("3-clean.csv");
  core.editCell(sheet, 1, 1, "Changed");
  const view = core.getSheet(sheet)!;
  const { blob } = await buildCsv(view, { delimiter: ",", lineEnding: "\n", useDisplay: false });
  await verifyCsv(blob, view, { delimiter: ",", useDisplay: false });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const i = bytes.indexOf(0x43); // "C" of "Changed"
  bytes[i] = 0x58;
  await assert.rejects(verifyCsv(new Blob([bytes]), view, { delimiter: ",", useDisplay: false }), (e: unknown) => e instanceof EngineError && /didn't pass DataFixer's check/.test(e.message));
  await assert.rejects(verifyCsv(new Blob([bytes.slice(3)]), view, { delimiter: ",", useDisplay: false }), /byte-order mark|didn't pass/);
  const truncated = bytes.slice(0, bytes.length - 40);
  await assert.rejects(verifyCsv(new Blob([truncated]), view, { delimiter: ",", useDisplay: false }));
});

test("a cancelled export downloads nothing and keeps the changes", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  core.editCell(sheet, 1, 1, "X");
  await assert.rejects(core.exportCsv(sheet, noop, { cancelled: true }), (e: unknown) => e instanceof EngineError && e.code === "cancelled");
  assert.equal(core.editStats(sheet).cellsEdited, 1);
  const { summary } = await core.exportCsv(sheet, noop);
  assert.equal(summary.cellsEdited, 1, "retry works");
});

test("Excel sheet as CSV: values as shown; the summary lists what a CSV can't keep", async () => {
  const { core, sheet } = await openPack("2-problems.xlsx");
  core.applyFix(sheet, (await core.previewFixAll(sheet, { headerRow: true }, noop)).token);
  const { blob, summary } = await core.exportCsv(sheet, noop);
  assert.equal(summary.downloadName, `2-problems - ${sheet}-cleaned.csv`);
  assert.ok(summary.notPreserved.some((n) => /Formatting/.test(n)));
  assert.ok(summary.notPreserved.some((n) => /^Formulas \(1\)/.test(n)));
  const view = core.getSheet(sheet)!;
  assertPythonMatches(await pythonRows(blob, ","), view, true);
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer());
  assert.ok(text.includes(view.grid.display!(1, 6)), "dates written as shown");
});

test("larger data: 300,000 rows export and verify (DataFixer and Python)", async () => {
  const lines = ["id,name,city,amount"];
  for (let i = 0; i < 300_000; i++) lines.push(`${i},${i % 97 === 0 ? ` Name ${i}` : `Name ${i}`},"City, ${i % 50}",${(i * 7) % 1000}`);
  const { core, sheet } = await openFile("big.csv", lines.join("\n") + "\n");
  core.applyFix(sheet, (await core.previewFix(sheet, "extra-spaces", { headerRow: true }, noop)).token);
  const t0 = performance.now();
  const { blob, summary } = await core.exportCsv(sheet, noop);
  const ms = performance.now() - t0;
  console.log(`  export + verify 300,001 rows (${(blob.size / 1e6).toFixed(1)} MB): ${ms.toFixed(0)} ms`);
  assert.equal(summary.verification.rows, 300_001);
  assert.equal(summary.cellsEdited, Math.ceil(300_000 / 97));
  assertPythonMatches(await pythonRows(blob, ","), core.getSheet(sheet)!, false);
});

test("memory: an export that wouldn't fit the device's budget is refused before it starts; changes are kept", async () => {
  const core = new EngineCore();
  const csv = "a,b\n" + Array.from({ length: 2000 }, (_, i) => ` ${i},x`).join("\n");
  const s = await core.open(new File([csv], "m.csv"), "csv", { memoryBudgetBytes: 60 * 1024 * 1024 }, noop);
  core.editCell(s.activeSheet, 1, 0, "0");
  await assert.rejects(core.exportCsv(s.activeSheet, noop), (e: unknown) => e instanceof EngineError && e.code === "out-of-memory" && /changes are kept/.test(e.message));
  assert.equal(core.editStats(s.activeSheet).cellsEdited, 1);
});
