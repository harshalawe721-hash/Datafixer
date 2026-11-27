/** Stage 14, Step 1: opening XML in the engine, choosing the records, downloads, encodings, limits. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import type { EditSession } from "../../src/engine/edit/session.ts";
import { validateSpreadsheet } from "../../src/lib/file-validation.ts";

const noop = () => {};
async function open(content: string | Uint8Array<ArrayBuffer>, name = "feed.xml", options = {}) {
  const core = new EngineCore();
  const summary = await core.open(new File([content], name), "xml", options, noop);
  return { core, summary, sheet: summary.activeSheet };
}
const rowsOf = (core: EngineCore, sheet: string) => {
  const g = (core as unknown as { session(n: string): EditSession }).session(sheet).grid();
  return Array.from({ length: g.rowCount }, (_, r) => g.row(r));
};

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<catalog><title>Shop</title><products>
<product id="1"><sku>00123</sku><name>Kurta</name><tag>cotton</tag><tag>blue</tag></product>
<product id="2"><sku>00124</sku><name>Saree &amp; blouse</name></product>
</products></catalog>`;

test("an XML file opens as a text table with a header row", async () => {
  const { core, summary, sheet } = await open(FEED);
  assert.equal(summary.format, "xml");
  assert.equal(summary.headerGuess, true);
  assert.deepEqual(summary.xml, {
    choices: [
      { path: "catalog/products/product", count: 2 },
      { path: "catalog/products/product/tag", count: 2 },
    ],
    path: "catalog/products/product",
    records: 2,
    joinedCells: 1,
    outside: true,
    encoding: "utf-8",
  });
  assert.deepEqual(rowsOf(core, sheet), [
    ["id", "sku", "name", "tag"],
    ["1", "00123", "Kurta", "cotton; blue"],
    ["2", "00124", "Saree & blouse", null],
  ]);
});

test("another repeating element can be chosen", async () => {
  const { core, summary, sheet } = await open(FEED, "feed.xml", { xmlPath: "catalog/products/product/tag" });
  assert.equal(summary.xml!.path, "catalog/products/product/tag");
  assert.deepEqual(rowsOf(core, sheet), [["tag"], ["cotton"], ["blue"]]);
});

test("CSV download named after the file; Excel keeps codes as text", async () => {
  const { core, sheet } = await open(FEED, "products.xml");
  const csv = await core.exportCsv(sheet, noop, undefined, { delimiter: ",", lineEnding: "\r\n", bom: false });
  assert.equal(csv.summary.downloadName, "products.csv");
  assert.equal(await csv.blob.text(), "id,sku,name,tag\r\n1,00123,Kurta,cotton; blue\r\n2,00124,Saree & blouse,\r\n");
  const xlsx = await core.convertCsvToXlsx(sheet, { headerRow: true }, noop);
  const back = new EngineCore();
  const s = await back.open(new File([xlsx.blob], "b.xlsx"), "xlsx", {}, noop);
  assert.deepEqual(rowsOf(back, s.activeSheet)[1]!.slice(0, 2), [1, "00123"]);
});

test("the encoding named in the declaration is used (ISO-8859-1)", async () => {
  const head = '<?xml version="1.0" encoding="ISO-8859-1"?><list><item>Caf';
  const bytes = new Uint8Array([...new TextEncoder().encode(head), 0xe9, ...new TextEncoder().encode("</item><item>x</item></list>")]);
  const { core, summary, sheet } = await open(bytes);
  assert.equal(summary.xml!.encoding, "iso-8859-1");
  assert.deepEqual(rowsOf(core, sheet)[1], ["Café"]);
});

test("UTF-16 with a BOM is read", async () => {
  const text = "<list><item>नमस्ते</item><item>x</item></list>";
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    bytes[2 + i * 2] = text.charCodeAt(i) & 0xff;
    bytes[3 + i * 2] = text.charCodeAt(i) >> 8;
  }
  const { core, sheet } = await open(bytes);
  assert.deepEqual(rowsOf(core, sheet)[1], ["नमस्ते"]);
});

test("invalid XML and entity declarations are refused with a reason", async () => {
  await assert.rejects(open("<a>\n<b>x</a>"), (e: unknown) => e instanceof EngineError && e.code === "corrupt-file" && /isn't valid XML: Expected <\/b> but found <\/a>.*\(line 2, column 5\)/.test(e.message));
  await assert.rejects(open('<!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>'), /refuses for safety/);
  await assert.rejects(open('<?xml version="1.0" encoding="x-unknown-thing"?><a/>'), /can't read/);
});

test("a large file read in pieces: records cross piece boundaries", async () => {
  const parts = ["<rows>"];
  for (let i = 0; i < 50_000; i++) parts.push(`<row n="${i}"><name>Name ${i}</name><note>a &amp; b</note></row>`);
  parts.push("</rows>");
  const { core, summary, sheet } = await open(parts.join("\n"));
  assert.equal(summary.xml!.records, 50_000);
  assert.deepEqual(rowsOf(core, sheet)[50_000], ["49999", "Name 49999", "a & b"]);
});

test("a table too large for the device's memory stops safely while reading", async () => {
  const parts = ["<rows>"];
  for (let i = 0; i < 20_000; i++) parts.push(`<row><t>${"x".repeat(60)}</t></row>`);
  parts.push("</rows>");
  const core = new EngineCore();
  await assert.rejects(core.open(new File([parts.join("")], "big.xml"), "xml", { memoryBudgetBytes: 2_000_000 }, noop), (e: unknown) => e instanceof EngineError && e.code === "too-large-for-engine");
});

test("upload check: .xml accepted as text, binary refused", () => {
  const opts = { accept: [".xml"], maxBytes: 150 * 1024 * 1024 };
  assert.deepEqual(validateSpreadsheet({ name: "a.xml", size: 5 }, new TextEncoder().encode("<a/>"), opts), { ok: true, format: "xml" });
  assert.equal(validateSpreadsheet({ name: "a.xml", size: 4 }, new Uint8Array([0x50, 0x4b, 3, 4]), opts).ok, false);
});
