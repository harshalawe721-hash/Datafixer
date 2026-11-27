/** Stage 14, Step 1: XML reader and XML → table. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { XmlReader, XmlSyntaxError, readXml, type XmlHandlers } from "../../src/engine/xml/parse.ts";
import { RecordFinder, XmlTableBuilder } from "../../src/engine/xml/table.ts";

/** Events as a list, for comparing. */
function events(text: string, pieces?: number): string[] {
  const out: string[] = [];
  const h: XmlHandlers = {
    open: (n, a) => out.push(`<${n}${a.map(([k, v]) => ` ${k}=${JSON.stringify(v)}`).join("")}>`),
    close: (n) => out.push(`</${n}>`),
    text: (t) => {
      if (out.length && out[out.length - 1]!.startsWith("#")) out[out.length - 1] += t;
      else out.push(`#${t}`);
    },
  };
  if (pieces === undefined) readXml(text, h);
  else {
    const r = new XmlReader(h);
    for (let i = 0; i < text.length; i += pieces) r.feed(text.slice(i, i + pieces));
    r.end();
  }
  return out;
}
const syntax = (text: string, re: RegExp, line?: number, column?: number) =>
  assert.throws(
    () => events(text),
    (e: unknown) => e instanceof XmlSyntaxError && re.test(e.message) && (line === undefined || e.line === line) && (column === undefined || e.column === column),
  );

function table(xml: string, path?: string) {
  const f = new RecordFinder();
  readXml(xml, f);
  const choices = f.choices();
  const b = new XmlTableBuilder(path ?? choices[0]!.path);
  readXml(xml, b);
  return { choices, ...b.finish() };
}

// ---------------------------------------------------------------- reader

test("elements, attributes, text, entities, CDATA, comments and declarations", () => {
  assert.deepEqual(
    events('﻿<?xml version="1.0" encoding="UTF-8"?>\n<!-- a comment -->\n<a x="1" y=\'2 &amp; 3\'><b>Caf&#233; &lt;&#x41;&gt; &quot;q&quot; &apos;</b><c/><![CDATA[<raw> & stuff]]></a>\n'),
    ['<a x="1" y="2 & 3">', "<b>", '#Café <A> "q" \'', "</b>", "<c>", "</c>", "#<raw> & stuff", "</a>"],
  );
});

test("text fed in pieces gives the same events as the whole text", () => {
  const xml = '<?xml version="1.0"?><root><item id="1" note="a > b">Asha &amp; Co</item><!-- x --><item id="2"><![CDATA[x]]></item></root>';
  const whole = events(xml);
  for (const size of [1, 2, 3, 7, 13]) assert.deepEqual(events(xml, size), whole, `pieces of ${size}`);
});

test("a ‘>’ inside a quoted attribute is allowed; a DOCTYPE without entities is ignored", () => {
  assert.deepEqual(events('<!DOCTYPE note SYSTEM "note.dtd"><a t="x>y"/>'), ['<a t="x>y">', "</a>"]);
});

test("documents that declare their own entities are refused for safety", () => {
  syntax('<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><lolz>&lol2;</lolz>', /defines its own entities.*refuses for safety/);
  syntax('<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><x>&xxe;</x>', /defines its own entities/);
});

test("mistakes are explained with line and column", () => {
  syntax("<a><b></a>", /Expected <\/b> but found <\/a>/, 1, 7);
  syntax("<a>\n  <b>x</b>\n", /ends before <a> is closed/);
  syntax('<a x=1/>', /attribute in <a> isn't written correctly/);
  syntax('<a x="1" x="2"/>', /appears twice/);
  syntax("<a>Tom & Jerry</a>", /An “&” must start an entity/, 1, 8);
  syntax("<a>&nbsp;</a>", /not a standard XML entity/);
  syntax("<a></a><b/>", /after the main element has closed/);
  syntax("hello <a/>", /Text appears before the main element/);
  syntax("<a><1b/></a>", /not a valid tag name/);
  syntax("<a>\n<b\n</a>", /not closed with “>” before the next “<”/, 2, 1);
  syntax("", /no XML elements/);
  syntax("<a><!-- open", /comment.*not closed/);
  syntax("</a>", /never opened/);
});

test("very deep nesting is refused instead of crashing", () => {
  syntax("<a>".repeat(1100) + "</a>".repeat(1100), /nested more than 1000 levels/);
});

// ---------------------------------------------------------------- XML → table

test("a product feed with g: fields: records found, prefixes kept, values exact", () => {
  const xml = `<?xml version="1.0"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>My shop</title>
<item><g:id>00123</g:id><title>Kurta</title><g:price>499.00 INR</g:price></item>
<item><g:id>00124</g:id><title>Saree &amp; blouse</title><g:price>1299.00 INR</g:price></item>
</channel></rss>`;
  const t = table(xml);
  assert.deepEqual(t.choices, [{ path: "rss/channel/item", count: 2 }]);
  assert.deepEqual(t.rows, [
    ["g:id", "title", "g:price"],
    ["00123", "Kurta", "499.00 INR"],
    ["00124", "Saree & blouse", "1299.00 INR"],
  ]);
  assert.equal(t.outside, true); // the feed's own title isn't in the table
});

test("nested elements become dotted columns; attributes become columns; @ only on a clash", () => {
  const xml = `<customers>
  <customer id="7" vip="yes"><id>C-7</id><name>Asha</name><address type="home"><city>Pune</city><zip>411001</zip></address></customer>
  <customer id="8"><id>C-8</id><name>Ben</name><address><city>Rome</city></address></customer>
</customers>`;
  const t = table(xml);
  assert.deepEqual(t.rows[0], ["@id", "vip", "id", "name", "address.type", "address.city", "address.zip"]);
  assert.deepEqual(t.rows[1], ["7", "yes", "C-7", "Asha", "home", "Pune", "411001"]);
  assert.deepEqual(t.rows[2], ["8", null, "C-8", "Ben", null, "Rome", null]);
});

test("repeated children are joined with “; ” and counted", () => {
  const t = table("<people><p><name>Asha</name><phone>+91 1</phone><phone>+91 2</phone><phone/></p><p><name>Ben</name><phone>+39 3</phone></p></people>");
  assert.deepEqual(t.rows, [["name", "phone"], ["Asha", "+91 1; +91 2"], ["Ben", "+39 3"]]);
  assert.equal(t.joinedCells, 1);
});

test("a sitemap, a list of simple values, empty elements and mixed content", () => {
  const sitemap = table('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://a.com/</loc><lastmod>2024-03-15</lastmod></url><url><loc>https://a.com/b</loc></url></urlset>');
  assert.deepEqual(sitemap.rows, [["loc", "lastmod"], ["https://a.com/", "2024-03-15"], ["https://a.com/b", null]]);
  assert.equal(sitemap.outside, false);
  assert.deepEqual(table("<tags><tag>red</tag><tag> blue </tag><tag/></tags>").rows, [["tag"], ["red"], [" blue "], [null]]);
  // Columns are named inside the record (like “name”, not “customer.name”): the bold part is column b.
  assert.deepEqual(table("<notes><n>Call <b>today</b> please</n><n>Fine</n></notes>").rows, [["b", "n"], ["today", "Call  please"], [null, "Fine"]]);
});

test("an accounting-style export: the most repeated element is suggested, others can be chosen", () => {
  const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION></HEADER><BODY>
<VOUCHER><DATE>20240401</DATE><AMOUNT>-1500.00</AMOUNT><LEDGER>Sales</LEDGER><LEDGER>GST</LEDGER></VOUCHER>
<VOUCHER><DATE>20240402</DATE><AMOUNT>200.00</AMOUNT><LEDGER>Cash</LEDGER></VOUCHER>
<VOUCHER><DATE>20240403</DATE><AMOUNT>75.50</AMOUNT><LEDGER>Bank</LEDGER></VOUCHER>
</BODY></ENVELOPE>`;
  const t = table(xml);
  assert.deepEqual(t.choices.map((c) => c.path), ["ENVELOPE/BODY/VOUCHER", "ENVELOPE/BODY/VOUCHER/LEDGER"]);
  assert.deepEqual(t.rows[1], ["20240401", "-1500.00", "Sales; GST"]);
  const ledgers = table(xml, "ENVELOPE/BODY/VOUCHER/LEDGER");
  assert.deepEqual(ledgers.rows, [["LEDGER"], ["Sales"], ["GST"], ["Cash"], ["Bank"]]);
});

test("a file where nothing repeats is one row", () => {
  const t = table("<config><name>Shop</name><currency>INR</currency></config>");
  assert.deepEqual(t.choices, [{ path: "config", count: 1 }]);
  assert.deepEqual(t.rows, [["name", "currency"], ["Shop", "INR"]]);
});
