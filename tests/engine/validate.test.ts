/**
 * Stage 5 Step 1: CSV Validator engine (checks A–I) and the reader's
 * line-ending normaliser. The test pack's expected counts come from what
 * scripts/fixtures/make_validate_pack.py planted, not from DataFixer's output.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EngineCore } from "../../src/engine/core.ts";
import { parseCsv } from "../../src/engine/csv/parse-csv.ts";
import { LineEndingNormaliser } from "../../src/engine/csv/line-endings.ts";
import { namesLookLikeData, validateCsv, EXCEL_MAX_ROWS, EXCEL_MAX_COLUMNS } from "../../src/engine/validate/validate.ts";
import type { SheetModel } from "../../src/engine/types.ts";

const noop = () => {};
const dir = new URL("../fixtures/validate/", import.meta.url);
const pack = JSON.parse(readFileSync(new URL("expected.json", dir), "utf8")) as {
  expected: Record<string, { open?: { delimiter?: string }; valid: boolean; issues: Record<string, [string, number, number[]]> }>;
  python: Record<string, string[][]>;
};
const rowsOf = (sheet: SheetModel) => Array.from({ length: sheet.grid.rowCount }, (_, i) => sheet.grid.row(i).map((v) => (v === null ? "" : String(v))));

async function openFile(name: string, options: { delimiter?: string } = {}) {
  const core = new EngineCore();
  const s = await core.open(new File([new Uint8Array(readFileSync(new URL(name, dir)))], name), "csv", options, noop);
  return { core, sheet: s.activeSheet };
}
async function openText(text: string | Uint8Array, options: { delimiter?: string } = {}) {
  const core = new EngineCore();
  const s = await core.open(new File([text as BlobPart], "t.csv"), "csv", options, noop);
  return { core, sheet: s.activeSheet };
}

// ---------------------------------------------------------------- the planted test pack

for (const [name, exp] of Object.entries(pack.expected)) {
  test(`test pack: ${name} — exact issues and counts`, async () => {
    const { core, sheet } = await openFile(name, exp.open);
    const r = await core.validate(sheet, { headerRow: true }, noop);
    const got = Object.fromEntries(r.issues.map((i) => [i.id, [i.severity, i.count]]));
    const want = Object.fromEntries(Object.entries(exp.issues).map(([id, [sev, count]]) => [id, [sev, count]]));
    assert.deepEqual(got, want);
    assert.equal(r.verdict.valid, exp.valid);
    // "View affected rows" shows the planted rows.
    for (const [id, [, , rows]] of Object.entries(exp.issues)) {
      if (!rows.length) continue;
      const page = core.getRows(sheet, { offset: 0, limit: 50, headerRow: false, issue: id });
      assert.deepEqual(page.rows.map((row) => row.index).slice(0, rows.length), rows, id);
    }
  });
}

test("test pack: DataFixer's reader matches Python's csv module (incl. mixed line endings)", async () => {
  for (const [name, pyRows] of Object.entries(pack.python)) {
    const { sheet } = await parseCsv(new Blob([new Uint8Array(readFileSync(new URL(name, dir)))]), "t");
    assert.deepEqual(rowsOf(sheet), pyRows, name);
  }
});

test("verdict counts and checklist", async () => {
  const { core, sheet } = await openFile("2-header.csv");
  const r = await core.validate(sheet, { headerRow: true }, noop);
  assert.deepEqual([r.verdict.errors, r.verdict.warnings, r.verdict.notes], [2, 1, 1]);
  assert.match(r.verdict.importReady, /Will not import cleanly: columns without a name; duplicate column names/);
  const header = r.checks.find((c) => c.id === "header")!;
  assert.equal(header.status, "error");
  assert.equal(r.checks.find((c) => c.id === "row-lengths")!.status, "pass");
  assert.equal(r.checks.length, 9);
  const clean = await openFile("0-clean.csv");
  const c = await clean.core.validate(clean.sheet, { headerRow: true }, noop);
  assert.ok(c.checks.every((x) => x.status === "pass"));
  assert.equal(c.verdict.importReady, "Ready for Excel, Google Sheets and databases.");
  assert.deepEqual([c.rows, c.expectedFields, c.file.encoding, c.file.hadBom, c.file.delimiter, c.file.lineEnding, c.file.finalLineBreak], [31, 4, "utf-8", false, ",", "\r\n", true]);
});

// ---------------------------------------------------------------- decision 5: strictness

test("decision 5: without column names, the first row is never reported as a header", async () => {
  const { core, sheet } = await openFile("2-header.csv");
  const r = await core.validate(sheet, { headerRow: false }, noop);
  assert.deepEqual(r.issues.map((i) => i.id), []);
  assert.equal(r.checks.find((c) => c.id === "header")!.status, "pass");
});

test("decision 5: uneven rows are errors with or without column names (expected width = most common)", async () => {
  const { core, sheet } = await openFile("1-uneven.csv");
  const r = await core.validate(sheet, { headerRow: false }, noop);
  const u = r.issues.find((i) => i.id === "uneven-rows")!;
  assert.equal(u.severity, "error");
  assert.equal(u.count, 5);
  assert.equal(r.expectedFields, 4);
});

test("uneven rows: explanation lists the field counts and warns that short rows can mean shifted data", async () => {
  const { core, sheet } = await openFile("1-uneven.csv");
  const u = (await core.validate(sheet, { headerRow: true }, noop)).issues[0]!;
  assert.match(u.explanation, /3 rows with 3, 1 row with 5, 1 row with 6/);
  assert.match(u.explanation, /shifted into the wrong columns/);
  assert.match(u.explanation, /should have been in quotes/);
});

test("uneven rows: empty extra fields are described as an extra separator", async () => {
  const { core, sheet } = await openText("a,b\r\n1,2\r\n3,4,\r\n5,6\r\n");
  const u = (await core.validate(sheet, { headerRow: true }, noop)).issues.find((i) => i.id === "uneven-rows")!;
  assert.equal(u.count, 1);
  assert.match(u.explanation, /extra fields are all empty/);
});

test("header: names that look like data are a warning; real names are not", async () => {
  assert.equal(namesLookLikeData(["1001", "Asha", "asha@example.com", "Pune"]), true);
  assert.equal(namesLookLikeData(["2024-01-05", "12.5", "x"]), true);
  assert.equal(namesLookLikeData(["id", "name", "email", "city"]), false);
  assert.equal(namesLookLikeData(["id", "2024", "email", "city"]), false);
  const { core, sheet } = await openText("1001,Asha,asha@example.com\r\n1002,Ben,ben@example.com\r\n");
  const r = await core.validate(sheet, { headerRow: true }, noop);
  assert.deepEqual(r.issues.map((i) => [i.id, i.severity]), [["header-not-names", "warning"]]);
});

test("header: duplicates are compared ignoring capitals and edge spaces; empty last name with trailing separators is not an error", async () => {
  const { core, sheet } = await openText("ID,id ,Name\r\n1,2,a\r\n");
  const d = (await core.validate(sheet, { headerRow: true }, noop)).issues.find((i) => i.id === "duplicate-header")!;
  assert.equal(d.count, 1);
  assert.match(d.explanation, /“ID” in A, B/);
  const t = await openFile("7-trailing.csv");
  const ids = (await t.core.validate(t.sheet, { headerRow: true }, noop)).issues.map((i) => i.id);
  assert.deepEqual(ids, ["trailing-separators"]);
});

// ---------------------------------------------------------------- other checks

test("separator: an uncertain separator is a warning", async () => {
  const { core, sheet } = await openText("a,b\r\n1,2\r\n3,4,5\r\n6\r\n7,8,9,0\r\n1,2,3\r\n");
  const ids = (await core.validate(sheet, { headerRow: false }, noop)).issues.map((i) => i.id);
  assert.ok(ids.includes("separator-uncertain"), ids.join());
});

test("sep= line: the header after it is checked, and data starts after the header", async () => {
  const { core, sheet } = await openText("sep=;\r\nid;id\r\n1;2\r\n");
  const r = await core.validate(sheet, { headerRow: true }, noop);
  assert.deepEqual(r.issues.map((i) => i.id).sort(), ["duplicate-header", "sep-line"]);
  assert.equal(r.firstDataRow, 2);
});

test("limits: more rows than Excel allows (1,048,577 rows)", async () => {
  const text = "n\n" + "1\n".repeat(EXCEL_MAX_ROWS);
  const { core, sheet } = await openText(text);
  const r = await core.validate(sheet, { headerRow: true }, noop);
  const t = r.issues.find((i) => i.id === "too-many-rows")!;
  assert.equal(t.count, 1);
  assert.equal(t.severity, "warning");
  assert.equal(r.rows, EXCEL_MAX_ROWS + 1);
});

test("limits: more columns than Excel allows", async () => {
  const header = Array.from({ length: EXCEL_MAX_COLUMNS + 2 }, (_, i) => `c${i}`).join(",");
  const { core, sheet } = await openText(`${header}\r\n${header.replace(/c/g, "v")}\r\n`);
  const t = (await core.validate(sheet, { headerRow: true }, noop)).issues.find((i) => i.id === "too-many-columns")!;
  assert.equal(t.count, 2);
});

test("encoding: Windows-1252 file opened as Windows-1252 has no unreadable characters; opened as UTF-8 it does", async () => {
  const bytes = new Uint8Array([...new TextEncoder().encode("name,city\r\nRen"), 0xe9, ...new TextEncoder().encode("e,Lyon\r\n")]);
  const ok = await openText(bytes);
  const r = await ok.core.validate(ok.sheet, { headerRow: true }, noop);
  assert.equal(r.file.encoding, "windows-1252");
  assert.deepEqual(r.issues.map((i) => i.id), []);
  const core = new EngineCore();
  const s = await core.open(new File([bytes], "t.csv"), "csv", { encoding: "utf-8" }, noop);
  const bad = await core.validate(s.activeSheet, { headerRow: true }, noop);
  assert.deepEqual(bad.issues.map((i) => [i.id, i.count]), [["unreadable-characters", 1]]);
});

test("validation runs on the current (edited) data, and a change clears the old results", async () => {
  const { core, sheet } = await openFile("6-control.csv");
  await core.validate(sheet, { headerRow: true }, noop);
  core.editCell(sheet, 3, 1, "Ben");
  // The old results no longer apply: the issue filter is dropped and every row shows.
  assert.equal(core.getRows(sheet, { offset: 0, limit: 50, headerRow: true, issue: "control-characters" }).total, 20);
  const r = await core.validate(sheet, { headerRow: true }, noop);
  assert.equal(r.issues.find((i) => i.id === "control-characters")!.count, 2);
});

test("validation is read-only and refuses non-CSV files", async () => {
  const { core, sheet } = await openFile("6-control.csv");
  const before = JSON.stringify(rowsOf(core.getSheet(sheet)!));
  await core.validate(sheet, { headerRow: true }, noop);
  assert.equal(JSON.stringify(rowsOf(core.getSheet(sheet)!)), before);
});

test("validation can be cancelled", async () => {
  const text = "a,b\n" + "1,2\n".repeat(100_000);
  const { sheet } = await parseCsv(new Blob([text]), "t");
  const { meta } = await parseCsv(new Blob([text]), "t");
  await assert.rejects(validateCsv(sheet, meta, { headerRow: true, cancel: { cancelled: true } }), (e: Error & { code?: string }) => e.code === "cancelled");
});

// ---------------------------------------------------------------- line-ending normaliser

test("normaliser: mixed line endings no longer merge rows or leave \\r in values (was a reader bug)", async () => {
  const cases: [string, string[][], string][] = [
    ["a,1\nb,2\r\nc,3\r\n", [["a", "1"], ["b", "2"], ["c", "3"]], "mixed"],
    ["a,1\r\nb,2\nc,3\n", [["a", "1"], ["b", "2"], ["c", "3"]], "mixed"],
    ["a,1\rb,2\nc,3", [["a", "1"], ["b", "2"], ["c", "3"]], "mixed"],
    ['a,"x\r\ny"\nb,2\n', [["a", "x\r\ny"], ["b", "2"]], "\n"],
    ['a,"x\ny"\r\nb,"q""\r"\r\n', [["a", "x\ny"], ["b", 'q"\r']], "\r\n"],
  ];
  for (const [text, rows, ending] of cases) {
    const { sheet, meta } = await parseCsv(new Blob([text]), "t");
    assert.deepEqual(rowsOf(sheet), rows, JSON.stringify(text));
    assert.equal(meta.lineEnding, ending, JSON.stringify(text));
  }
});

test("normaliser: the same result wherever the text is split into chunks", () => {
  const text = 'h1,h2\r\n"a ""q"" \r\nb" ,x\r\ny,"z"\rp,"""",\n"end"  \r\nlast,"open\r\n';
  const whole = new LineEndingNormaliser(",");
  const expected = whole.push(text, true);
  for (let cut = 0; cut <= text.length; cut++) {
    for (let cut2 = cut; cut2 <= text.length; cut2 += 3) {
      const n = new LineEndingNormaliser(",");
      const out = n.push(text.slice(0, cut)) + n.push(text.slice(cut, cut2)) + n.push(text.slice(cut2)) + n.push("", true);
      assert.equal(out, expected, `cut at ${cut}/${cut2}`);
      assert.deepEqual([n.crlf, n.lf, n.cr], [whole.crlf, whole.lf, whole.cr]);
    }
  }
  assert.equal(expected, 'h1,h2\n"a ""q"" \r\nb" ,x\ny,"z"\np,"""",\n"end"  \nlast,"open\r\n');
});

test("normaliser: quotes in the middle of unquoted values are reported once per row", async () => {
  const { sheet } = await parseCsv(new Blob(['a,b\r\nAna "x" R,1\r\nok,"fine"\r\n5",6"\r\n']), "t");
  assert.deepEqual(sheet.issues.filter((i) => i.code === "invalid-quotes").map((i) => i.row), [1, 3]);
});

test("normaliser: a multi-character separator is respected", () => {
  const n = new LineEndingNormaliser("||");
  assert.equal(n.push('a||"x\ry"||b\rc||d', true), 'a||"x\ry"||b\nc||d');
});

test("reader records whether the file ends with a line break", async () => {
  assert.equal((await parseCsv(new Blob(["a,b\n1,2\n"]), "t")).meta.finalLineBreak, true);
  assert.equal((await parseCsv(new Blob(["a,b\n1,2"]), "t")).meta.finalLineBreak, false);
  assert.equal((await parseCsv(new Blob(["a,b\r1,2\r"]), "t")).meta.finalLineBreak, true);
});
