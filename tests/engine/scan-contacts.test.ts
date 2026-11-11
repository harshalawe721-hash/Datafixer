/** Stage 3, Step 5: checks I–J (emails, phone numbers) with exact counts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runScan, type Finding } from "../../src/engine/scan/scan.ts";
import { ALL_CHECKS } from "../../src/engine/scan/checks/index.ts";
import { emailProblem, invalidEmails, invalidPhones, phoneProblem, phoneShape } from "../../src/engine/scan/checks/contacts.ts";
import { parseCsv } from "../../src/engine/csv/parse-csv.ts";
import { EngineCore } from "../../src/engine/core.ts";
import { cellKey } from "../../src/engine/types.ts";

const csv = async (text: string) => (await parseCsv(new Blob([text]), "S")).sheet;
const find = (f: Finding[], id: string) => f.find((x) => x.issue.id === id);

test("email rules: valid addresses (incl. international) are accepted", () => {
  for (const e of ["ann@example.com", "o'brien@example.co.uk", "first.last+tag@sub.example.org", "zoë@例え.jp", "user@xn--80ak6aa92e.com", "A.B@EXAMPLE.COM", " ann@example.com "]) {
    assert.equal(emailProblem(e), null, e);
  }
});

test("email rules: invalid addresses with a clear reason", () => {
  const cases: [string, RegExp][] = [
    ["annexample.com", /Missing @/],
    ["ann@@example.com", /More than one @/],
    ["ann@example", /no dot/],
    ["ann @example.com", /space/],
    [".ann@example.com", /dot/],
    ["ann..b@example.com", /dot/],
    ["ann@-example.com", /Invalid domain/],
    ["ann@example.c", /ending/],
    ["ann@example.123", /ending/],
    ["@example.com", /Nothing before/],
    ["ann@", /Nothing after/],
    ["a@x.com, b@y.com", /Several addresses/],
    ["a@x.com;b@y.com", /Several addresses/],
    ["ann<x>@example.com", /Invalid character/],
  ];
  for (const [e, re] of cases) assert.match(emailProblem(e) ?? "VALID", re, e);
  // The fast path must not bypass the 64-character limit before the @.
  assert.match(emailProblem(`${"a".repeat(65)}@example.com`) ?? "VALID", /too long/);
  assert.equal(emailProblem(`${"a".repeat(64)}@example.com`), null);
});

test("phone rules: generic international formats are accepted", () => {
  for (const p of ["+1 555 123 4567", "(020) 7946 0958", "555-123-4567", "+44 20 7946 0958 ext. 12", "5551234567", "0123456", "+91 98765 43210", "555.123.4567", "+33 1 23 45 67 89 x123"]) {
    assert.equal(phoneProblem(p), null, p);
  }
});

test("phone rules: invalid numbers with a clear reason", () => {
  const cases: [string, RegExp][] = [
    ["555-CALL-NOW", /letters/],
    ["N/A", /letters/],
    ["12345", /Too few digits \(5/],
    ["+1 555 123 4567 8901 23", /Too many digits \(17/],
    ["555+1234567", /only allowed at the start/],
    ["(555 123-4567", /Unbalanced/],
    ["555_123_4567", /characters/],
  ];
  for (const [p, re] of cases) assert.match(phoneProblem(p) ?? "VALID", re, p);
  assert.equal(phoneShape("+1 555 123 4567"), "+# # # #");
  assert.equal(phoneShape("(555) 123-4567 ext 9"), "(#) #-#");
});

// rows 1..6: Ann, Bob, Cat, Dan, Eve, Fay; columns: 0 name | 1 email | 2 phone | 3 amount
const PLANTED =
  "name,email,phone,amount\n" +
  "Ann,ann@example.com,+1 555 123 4567,1234567\n" +
  "Bob,bob@example,+1 555 987 6543,2345678\n" +
  "Cat,cat.example.com,+44 20 7946 0958,3456789\n" +
  "Dan,dan@example.org,N/A,4567890\n" +
  "Eve,,(555) 123-4567,5678901\n" +
  "Fay,fay@example.net,12345,6789012\n";

test("planted file: exact counts for emails, phones and phone layouts", async () => {
  const { findings } = await runScan(await csv(PLANTED), { headerRow: true, checks: ALL_CHECKS });
  const em = find(findings, "invalid-emails")!;
  assert.equal(em.issue.count, 2, "bob@example, cat.example.com; Eve's empty cell is not 'invalid'");
  assert.deepEqual(Array.from(em.cells!), [cellKey(2, 1), cellKey(3, 1)]);
  assert.deepEqual(em.issue.examples!.map((e) => e.note), ["Domain has no dot (e.g. example.com)", "Missing @"]);

  const ph = find(findings, "invalid-phones")!;
  assert.equal(ph.issue.count, 2, "N/A and 12345");
  assert.deepEqual(Array.from(ph.cells!), [cellKey(4, 2), cellKey(6, 2)]);

  const fm = find(findings, "phone-formats")!;
  assert.equal(fm.issue.severity, "note");
  assert.equal(fm.issue.count, 1, "(555) 123-4567 among +… numbers");
  assert.deepEqual(Array.from(fm.cells!), [cellKey(5, 2)]);

  assert.ok(!findings.some((f) => f.issue.columns?.some((c) => c.name === "amount") && f.issue.id.includes("phone")), "7-digit amounts are not phone numbers");
});

test("columns are detected by content when the name doesn't say", async () => {
  const text = "who,contact\nann@example.com,+1 555 123 4567\nbob@example.com,+1 555 222 3333\ncat@example.com,+1 555 444 5555\nbad-address,+1 555 666 7777\ndan@example.com,call me\n";
  const { findings } = await runScan(await csv(text), { headerRow: true, checks: [invalidEmails, invalidPhones] });
  assert.equal(find(findings, "invalid-emails")!.issue.count, 1);
  assert.equal(find(findings, "invalid-phones")!.issue.count, 1);
});

test("cautious: occasional @ handles, numeric codes and amounts don't make a column an email/phone column", async () => {
  const text = "notes,ref,total\nsee @ann,1234567,1000000\nok,2345678,2000000\nfine,3456789,3000000\ngood,4567890,4000000\n";
  const { findings } = await runScan(await csv(text), { headerRow: true, checks: [invalidEmails, invalidPhones] });
  assert.deepEqual(findings, []);
});

test("Excel fixture: no contact columns, no contact issues", async () => {
  const core = new EngineCore();
  await core.open(new File([readFileSync(new URL("../fixtures/excel/lo-features.xlsx", import.meta.url))], "f.xlsx"), "xlsx", {}, () => {});
  const r = await core.scan("Data", { headerRow: true }, () => {});
  assert.ok(!r.issues.some((i) => /email|phone/.test(i.id)));
});

test("phone layout note shows a real example of the usual layout", async () => {
  const text = ["name,phone", "A,+44 20 7946 0958", "B,+44 20 7946 0959", "C,+44 20 7946 0960", "D,020-7946-0961"].join("\n");
  const { findings } = await runScan(await csv(text), { headerRow: true, checks: [invalidPhones] });
  const fm = find(findings, "phone-formats")!;
  assert.equal(fm.issue.count, 1);
  assert.equal(fm.issue.examples![0]!.note, "Most numbers here are written like +44 20 7946 0958");
  assert.ok(!fm.issue.examples![0]!.note!.includes("…"));
});
