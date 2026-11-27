/** Stage 13, Step 1: TSV files opened by the CSV reader and downloaded as CSV (or TSV). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineCore } from "../../src/engine/core.ts";
import type { EditSession } from "../../src/engine/edit/session.ts";

const noop = () => {};
async function open(text: string, name = "data.tsv") {
  const core = new EngineCore();
  const s = await core.open(new File([text], name), "csv", {}, noop);
  return { core, summary: s, sheet: s.activeSheet };
}
const rowsOf = (core: EngineCore, sheet: string) => {
  const g = (core as unknown as { session(n: string): EditSession }).session(sheet).grid();
  return Array.from({ length: g.rowCount }, (_, r) => g.row(r));
};
const csvOf = async (core: EngineCore, sheet: string, options = {}) => {
  const out = await core.exportCsv(sheet, noop, undefined, { delimiter: ",", ...options });
  const bytes = new Uint8Array(await out.blob.arrayBuffer());
  // Blob.text() drops a leading BOM, so check the bytes and decode without it.
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return { name: out.summary.downloadName, bom, text: new TextDecoder().decode(bom ? bytes.subarray(3) : bytes) };
};

test("tabs are detected, and values keep commas, quotes, zeros and empty fields", async () => {
  const { core, summary, sheet } = await open('id\tname\tnote\n00123\tPatil, Asha\tsays "hi"\n00124\t\tend\n');
  assert.equal(summary.csv!.delimiter, "\t");
  assert.deepEqual(rowsOf(core, sheet), [
    ["id", "name", "note"],
    ["00123", "Patil, Asha", 'says "hi"'],
    ["00124", "", "end"],
  ]);
});

test("TSV to CSV: commas and quotes are quoted so they stay in one cell; named after the file", async () => {
  const { core, sheet } = await open('id\tname\tnote\n00123\tPatil, Asha\tsays "hi"\n00124\t\tend\n');
  // The page always passes its settings: Windows line endings and a BOM by default.
  const { name, text, bom } = await csvOf(core, sheet, { lineEnding: "\r\n", bom: true });
  assert.equal(name, "data.csv");
  assert.equal(bom, true);
  assert.equal(text, 'id,name,note\r\n00123,"Patil, Asha","says ""hi"""\r\n00124,,end\r\n');
});

test("line endings and BOM can be chosen; a semicolon separator works", async () => {
  const { core, sheet } = await open("a\tb\n1,5\t2\n");
  const lf = await csvOf(core, sheet, { lineEnding: "\n", bom: false });
  assert.equal(lf.text, 'a,b\n"1,5",2\n');
  const semi = await csvOf(core, sheet, { delimiter: ";", lineEnding: "\n", bom: false });
  assert.equal(semi.text, "a;b\n1,5;2\n");
});

test("a missing final line break and mixed line endings are handled", async () => {
  const { core, sheet } = await open("a\tb\r\n1\t2\n3\t4");
  assert.deepEqual(rowsOf(core, sheet), [["a", "b"], ["1", "2"], ["3", "4"]]);
  assert.equal((await csvOf(core, sheet, { bom: false })).text, "a,b\r\n1,2\r\n3,4\r\n");
});

test("quoted TSV: a tab inside quotes stays in one value", async () => {
  const { core, sheet } = await open('a\tb\n"x\ty"\tz\n');
  assert.deepEqual(rowsOf(core, sheet)[1], ["x\ty", "z"]);
  assert.equal((await csvOf(core, sheet, { lineEnding: "\r\n", bom: false })).text, "a,b\r\nx\ty,z\r\n");
});

test(".txt and .tab files are named .csv; a TSV download keeps the copy name", async () => {
  for (const name of ["export.txt", "export.tab"]) {
    const { core, sheet } = await open("a\tb\n1\t2\n", name);
    assert.equal((await csvOf(core, sheet)).name, "export.csv");
  }
  const { core, sheet } = await open("a\tb\n1\t2\n");
  assert.equal((await csvOf(core, sheet, { delimiter: "\t" })).name, "data-copy.tsv");
  const csvFile = await open("a,b\n1,2\n", "data.csv");
  assert.equal((await csvOf(csvFile.core, csvFile.sheet)).name, "data-copy.csv");
});

test("the structure check finds rows with a different number of fields in a TSV", async () => {
  const { core, sheet } = await open("a\tb\tc\n1\t2\t3\n4\t5\n");
  const v = await core.validate(sheet, { headerRow: true }, noop);
  assert.equal(v.verdict.valid, false);
  assert.ok(v.verdict.errors > 0);
});

test("TSV to Excel: codes keep their zeros, numbers become numbers", async () => {
  const { core, sheet } = await open("id\tamount\n00123\t12.5\n");
  const out = await core.convertCsvToXlsx(sheet, { headerRow: true }, noop);
  const back = new EngineCore();
  const s = await back.open(new File([out.blob], "b.xlsx"), "xlsx", {}, noop);
  assert.deepEqual(rowsOf(back, s.activeSheet)[1], ["00123", 12.5]);
});
