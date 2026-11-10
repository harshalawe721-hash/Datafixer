import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, isFormulaLike } from "../../src/engine/csv/parse-csv.ts";
import { detectEncoding, isValidUtf8 } from "../../src/engine/csv/encoding.ts";
import { EngineError } from "../../src/engine/errors.ts";
import type { SheetModel } from "../../src/engine/types.ts";

const enc = new TextEncoder();
const blob = (s: string | Uint8Array) => new Blob([s as BlobPart]);
const rowsOf = (sheet: SheetModel) => Array.from({ length: sheet.grid.rowCount }, (_, i) => sheet.grid.row(i));

test("basic CSV with header, keeps values as text", async () => {
  const { sheet, meta } = await parseCsv(blob("id,name,amount\n001,Ann,10.50\n002,Bob,7\n"), "t");
  assert.deepEqual(rowsOf(sheet), [["id", "name", "amount"], ["001", "Ann", "10.50"], ["002", "Bob", "7"]]);
  assert.equal(sheet.columnCount, 3);
  assert.equal(meta.delimiter, ",");
  assert.equal(meta.lineEnding, "\n");
  assert.equal(meta.encoding, "utf-8");
});

test("no trailing newline keeps last row; trailing newline adds no empty row", async () => {
  assert.equal(rowsOf((await parseCsv(blob("a,b\n1,2"), "t")).sheet).length, 2);
  assert.equal(rowsOf((await parseCsv(blob("a,b\n1,2\n"), "t")).sheet).length, 2);
  assert.equal(rowsOf((await parseCsv(blob("a,b\r\n1,2\r\n"), "t")).sheet).length, 2);
});

test("empty rows inside the data are preserved", async () => {
  const { sheet } = await parseCsv(blob("a,b\n\n1,2\n,\n"), "t");
  assert.deepEqual(rowsOf(sheet), [["a", "b"], [""], ["1", "2"], ["", ""]]);
});

test("quoted fields with commas, quotes and newlines", async () => {
  const { sheet } = await parseCsv(blob('name,note\n"Smith, J","He said ""hi""\nsecond line"\n'), "t");
  assert.deepEqual(rowsOf(sheet)[1], ["Smith, J", 'He said "hi"\nsecond line']);
  assert.equal(sheet.issueCount, 0);
});

test("detects semicolon, tab and pipe delimiters", async () => {
  assert.equal((await parseCsv(blob("a;b;c\n1;2;3\n4;5;6\n"), "t")).meta.delimiter, ";");
  assert.equal((await parseCsv(blob("a\tb\tc\n1\t2\t3\n"), "t")).meta.delimiter, "\t");
  assert.equal((await parseCsv(blob("a|b|c\n1|2|3\n"), "t")).meta.delimiter, "|");
});

test("forced delimiter overrides detection", async () => {
  const { sheet } = await parseCsv(blob("a;b,c\n1;2,3\n"), "t", { delimiter: ";" });
  assert.deepEqual(rowsOf(sheet)[0], ["a", "b,c"]);
});

test("multi-byte characters split across chunk boundaries are not corrupted", async () => {
  let text = "name,city\n";
  for (let i = 0; i < 3000; i++) text += `Café ${i},Zürich 東京 😀\n`;
  // 7-byte chunks guarantee many characters straddle a boundary.
  const { sheet, meta } = await parseCsv(blob(text), "t", { chunkBytes: 7 });
  assert.equal(meta.replacementChars, 0);
  assert.equal(rowsOf(sheet).length, 3001);
  for (let i = 1; i < rowsOf(sheet).length; i++) {
    assert.equal(rowsOf(sheet)[i]![0], `Café ${i - 1}`);
    assert.equal(rowsOf(sheet)[i]![1], "Zürich 東京 😀");
  }
});

test("quoted field spanning chunk boundaries", async () => {
  const text = 'a,b\n"x' + "y".repeat(50) + '\n' + "z".repeat(50) + '",2\n3,4\n';
  const { sheet } = await parseCsv(blob(text), "t", { chunkBytes: 16 });
  assert.equal(rowsOf(sheet).length, 3);
  assert.equal(rowsOf(sheet)[1]![0], "x" + "y".repeat(50) + "\n" + "z".repeat(50));
  assert.deepEqual(rowsOf(sheet)[2], ["3", "4"]);
});

test("same result regardless of chunk size", async () => {
  let text = "id,text\n";
  for (let i = 0; i < 500; i++) text += `${i},"v ""${i}"",\nx"\n`;
  const ref = rowsOf((await parseCsv(blob(text), "t")).sheet);
  for (const size of [1, 3, 64, 1000]) {
    assert.deepEqual(rowsOf((await parseCsv(blob(text), "t", { chunkBytes: size })).sheet), ref, `chunk ${size}`);
  }
});

test("UTF-8 BOM is removed and reported", async () => {
  const { sheet, meta } = await parseCsv(blob(new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode("name\nAnn\n")])), "t");
  assert.equal(rowsOf(sheet)[0]![0], "name");
  assert.equal(meta.hadBom, true);
});

test("UTF-16LE with BOM", async () => {
  const s = "name,city\nAnn,Zürich\n";
  const bytes = new Uint8Array(2 + s.length * 2);
  bytes[0] = 0xff; bytes[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { bytes[2 + i * 2] = s.charCodeAt(i) & 0xff; bytes[3 + i * 2] = s.charCodeAt(i) >> 8; }
  const { sheet, meta } = await parseCsv(blob(bytes), "t", { chunkBytes: 5 });
  assert.equal(meta.encoding, "utf-16le");
  assert.deepEqual(rowsOf(sheet)[1], ["Ann", "Zürich"]);
});

test("Windows-1252 fallback for non-UTF-8 bytes", async () => {
  // "Café" in Windows-1252: é = 0xE9 (invalid as UTF-8 here)
  const bytes = new Uint8Array([...enc.encode("name\nCaf"), 0xe9, 0x0a]);
  const { sheet, meta } = await parseCsv(blob(bytes), "t");
  assert.equal(meta.encoding, "windows-1252");
  assert.equal(rowsOf(sheet)[1]![0], "Café");
  assert.equal(meta.replacementChars, 0);
});

test("invalid UTF-8 after the sample is counted, not hidden", async () => {
  const good = "a\n" + "x\n".repeat(40000); // > 64 KB of valid UTF-8
  const bytes = new Uint8Array([...enc.encode(good), 0xff, 0xfe, 0x0a]);
  const { meta } = await parseCsv(blob(bytes), "t");
  assert.equal(meta.encoding, "utf-8");
  assert.ok(meta.replacementChars >= 1);
});

test("line ending detection", async () => {
  assert.equal((await parseCsv(blob("a\r\nb\r\n"), "t")).meta.lineEnding, "\r\n");
  assert.equal((await parseCsv(blob("a\rb\r"), "t")).meta.lineEnding, "\r");
  assert.equal((await parseCsv(blob("a\nb\r\nc"), "t")).meta.lineEnding, "mixed");
  assert.equal((await parseCsv(blob("abc"), "t")).meta.lineEnding, "none");
  // CRLF split across chunks is still CRLF
  assert.equal((await parseCsv(blob("a\r\nb\r\n"), "t", { chunkBytes: 2 })).meta.lineEnding, "\r\n");
});

test("ragged rows: column count is the widest row", async () => {
  const { sheet } = await parseCsv(blob("a,b\n1,2,3,4\n5\n"), "t");
  assert.equal(sheet.columnCount, 4);
  assert.deepEqual(rowsOf(sheet)[2], ["5"]);
});

test("unclosed quote is reported as an issue", async () => {
  const { sheet } = await parseCsv(blob('a,b\n1,"never closed\n2,3\n'), "t");
  assert.ok(sheet.issues.some((i) => i.code === "unclosed-quote"));
});

test("empty file is rejected with a clear error", async () => {
  await assert.rejects(parseCsv(blob(""), "t"), (e: unknown) => e instanceof EngineError && e.code === "empty-file");
});

test("cancellation stops parsing", async () => {
  const token = { cancelled: false };
  const text = "a,b\n" + "1,2\n".repeat(100000);
  const p = parseCsv(blob(text), "t", {
    chunkBytes: 1024,
    cancel: token,
    onProgress: (n) => { if (n > 10000) token.cancelled = true; },
  });
  await assert.rejects(p, (e: unknown) => e instanceof EngineError && e.code === "cancelled");
});

test("progress reports reach the full size", async () => {
  const seen: number[] = [];
  await parseCsv(blob("a,b\n" + "1,2\n".repeat(1000)), "t", { chunkBytes: 500, onProgress: (n) => seen.push(n) });
  assert.equal(seen[seen.length - 1], 4 + 4000);
  assert.ok(seen.length > 5);
});

test("formula-like cells are counted (CSV injection awareness)", async () => {
  const { meta } = await parseCsv(blob('a\n=SUM(1,2)\n+cmd\n-5\n@x\n-3.2\nplain\n'), "t");
  assert.equal(meta.formulaLikeCells, 3);
  assert.equal(isFormulaLike("-5"), false);
  assert.equal(isFormulaLike("=1+1"), true);
});

test("prototype-polluting header names are harmless", async () => {
  const { sheet } = await parseCsv(blob("__proto__,constructor\n1,2\n"), "t");
  assert.deepEqual(rowsOf(sheet)[0], ["__proto__", "constructor"]);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("encoding helpers", () => {
  assert.equal(detectEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])).bomLength, 3);
  assert.equal(isValidUtf8(new Uint8Array([0xc3]), true), true); // truncated at sample end
  assert.equal(isValidUtf8(new Uint8Array([0xc3]), false), false);
});

test("small semicolon file is detected (Papa's own guess fails here)", async () => {
  const { sheet, meta } = await parseCsv(blob("a;b\n1;2\n"), "t");
  assert.equal(meta.delimiter, ";");
  assert.deepEqual(rowsOf(sheet), [["a", "b"], ["1", "2"]]);
  assert.equal(sheet.issueCount, 0);
});

test("European decimals with semicolons pick the semicolon", async () => {
  const { meta } = await parseCsv(blob("name;price\nA;1,50\nB;2,75\nC;10,00\n"), "t");
  assert.equal(meta.delimiter, ";");
});

test("single-column file is not flagged", async () => {
  const { sheet, meta } = await parseCsv(blob("email\na@x.com\nb@y.com\n"), "t");
  assert.equal(meta.delimiter, ",");
  assert.equal(sheet.issueCount, 0);
  assert.equal(sheet.columnCount, 1);
});

test("delimiter detection with tiny chunks still sees a full sample", async () => {
  const { meta } = await parseCsv(blob("a;b;c\n1;2;3\n4;5;6\n"), "t", { chunkBytes: 2 });
  assert.equal(meta.delimiter, ";");
});

test("memory budget stops parsing before the limit, with a clear message", async () => {
  const text = "id,name,email\n" + Array.from({ length: 200000 }, (_, i) => `${i},Name ${i},u${i}@example.com`).join("\n");
  const b = blob(text); // ~6 MB
  await assert.rejects(
    parseCsv(b, "t", { memoryBudgetBytes: 6 * 1024 * 1024, chunkBytes: 256 * 1024 }),
    (e: unknown) => e instanceof EngineError && e.code === "too-large-for-engine" && /too large to open safely/.test(e.message),
  );
  // A generous budget parses fully.
  const ok = await parseCsv(b, "t", { memoryBudgetBytes: 200 * 1024 * 1024 });
  assert.equal(ok.sheet.grid.rowCount, 200001);
});

test("clearly impossible files are refused before parsing", async () => {
  const b = blob("a,b\n" + "1,2\n".repeat(100000)); // ~400 KB
  await assert.rejects(parseCsv(b, "t", { memoryBudgetBytes: 100 * 1024 }), (e: unknown) => e instanceof EngineError && e.code === "too-large-for-engine");
});
