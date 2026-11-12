/**
 * Stage 5 Step 5: CSV download options (decision 3) — separator, line endings,
 * UTF-8 with or without BOM. Every combination is checked byte by byte and read
 * back independently with Python's csv module.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EngineCore, type CsvDownloadOptions } from "../../src/engine/core.ts";

const noop = () => {};

/** Values that are hard to write correctly: every separator, quotes, line breaks, accents, emoji, edge spaces. */
const TRICKY: string[][] = [
  ["id", "name", "note", "amount"],
  ["1", "Smith, John", 'He said "hi"', "1,5"],
  ["2", "Müller; Anna", "tab\there", "3;4"],
  ["3", "Line\nbreak", "Windows\r\nbreak", ""],
  ["4", "  edge spaces  ", "=1+1", "€5 😀"],
  ["5", '"quoted"', "", "-7"],
  ["6", "short"],
  ["7", "a", "b", "c", ""],
];
const csvOf = (rows: string[][]) =>
  rows.map((r) => r.map((v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\r\n") + "\r\n";

async function openRows(rows: string[][], name = "tricky.csv") {
  const core = new EngineCore();
  const s = await core.open(new File([csvOf(rows)], name), "csv", {}, noop);
  return { core, sheet: s.activeSheet };
}

function pythonRead(file: string, delimiter: string, bom: boolean): string[][] {
  const py = spawnSync(
    "python3",
    ["-I", "-c", "import csv,sys,json\nwith open(sys.argv[1],newline='',encoding=sys.argv[3]) as f: print(json.dumps(list(csv.reader(f, delimiter=sys.argv[2], strict=True))))", file, delimiter, bom ? "utf-8-sig" : "utf-8"],
    { encoding: "utf8" },
  );
  assert.equal(py.status, 0, py.stderr);
  return JSON.parse(py.stdout) as string[][];
}

const COMBOS: Required<CsvDownloadOptions>[] = [];
for (const delimiter of [",", ";", "\t"] as const) for (const lineEnding of ["\r\n", "\n"] as const) for (const bom of [true, false]) COMBOS.push({ delimiter, lineEnding, bom });

test("decision 3: all 12 combinations keep every value exactly (DataFixer's check and Python's csv module)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dl-options-"));
  try {
    for (const o of COMBOS) {
      const label = `${JSON.stringify(o.delimiter)} ${JSON.stringify(o.lineEnding)} bom=${o.bom}`;
      const { core, sheet } = await openRows(TRICKY);
      const { blob, summary } = await core.exportCsv(sheet, noop, undefined, o);
      assert.deepEqual(summary.csv, o, label);
      assert.equal(summary.downloadName, o.delimiter === "\t" ? "tricky-copy.tsv" : "tricky-copy.csv", label);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
      assert.equal(hasBom, o.bom, `${label}: BOM`);
      const text = new TextDecoder().decode(o.bom ? bytes.subarray(3) : bytes);
      // Row ends: the chosen line ending after each row (line breaks inside quoted values are kept as they are).
      assert.ok(text.endsWith(o.lineEnding), `${label}: ends with the chosen line ending`);
      if (o.lineEnding === "\n") assert.ok(!text.replace(/"[^"]*"/g, "").includes("\r"), `${label}: no CR outside quoted values`);
      else assert.equal(text.replace(/"[^"]*"/g, "").split("\r\n").length - 1, TRICKY.length, `${label}: one CRLF per row`);
      const file = path.join(dir, `f${COMBOS.indexOf(o)}.csv`);
      writeFileSync(file, bytes);
      assert.deepEqual(pythonRead(file, o.delimiter, o.bom), TRICKY, `${label}: Python reads exactly the same values`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a value containing the new separator is quoted; other values are not", async () => {
  const { core, sheet } = await openRows([["a", "b"], ["x;y", "z"]]);
  const { blob, summary } = await core.exportCsv(sheet, noop, undefined, { delimiter: ";", lineEnding: "\n", bom: false });
  assert.equal(await blob.text(), 'a;b\n"x;y";z\n');
  assert.ok(summary.warnings.some((w) => /separator was changed/.test(w)));
  assert.ok(summary.warnings.some((w) => /without a byte-order mark/.test(w)));
});

test("defaults are unchanged from Stage 4: original separator and line endings, UTF-8 with BOM", async () => {
  const core = new EngineCore();
  const s = await core.open(new File(["a;b\n1;2\n"], "semi.csv"), "csv", {}, noop);
  core.editCell(s.activeSheet, 1, 0, "9");
  const { blob, summary } = await core.exportCsv(s.activeSheet, noop);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(new TextDecoder().decode(bytes.subarray(3)), "a;b\n9;2\n");
  assert.deepEqual(summary.csv, { delimiter: ";", lineEnding: "\n", bom: true });
  assert.equal(summary.downloadName, "semi-cleaned.csv");
});

test("without BOM: a first value that starts with an invisible U+FEFF is refused, not silently changed", async () => {
  const core = new EngineCore();
  // A BOM-less file whose first value starts with U+FEFF needs the encoding chosen so the character is kept as data.
  const s = await core.open(new File(["a,b\n1,2\n"], "t.csv"), "csv", {}, noop);
  core.editCell(s.activeSheet, 0, 0, "﻿a");
  await assert.rejects(core.exportCsv(s.activeSheet, noop, undefined, { bom: false }), /didn't pass DataFixer's check/);
  const ok = await core.exportCsv(s.activeSheet, noop, undefined, { bom: true });
  assert.equal(ok.summary.verification.rows, 2);
});

test("unknown options are refused", async () => {
  const { core, sheet } = await openRows([["a"], ["1"]]);
  await assert.rejects(core.exportCsv(sheet, noop, undefined, { delimiter: "|" as ";" }), /Unknown separator/);
  await assert.rejects(core.exportCsv(sheet, noop, undefined, { lineEnding: "\r" as "\n" }), /Unknown line ending/);
});
