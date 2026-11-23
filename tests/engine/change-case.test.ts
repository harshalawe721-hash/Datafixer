/** Stage 9, Step 1: Change case (Proper Case, UPPER CASE, lower case) with name rules. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeCase, caseSkipReason, type CaseStyle } from "../../src/engine/fix/change-case.ts";

const proper = (v: string) => {
  const r = changeCase(v, "proper");
  return "value" in r ? r.value : `SKIP:${r.skip}`;
};

test("Proper Case: everyday names and places", () => {
  const cases: [string, string][] = [
    ["ravi k", "Ravi K"],
    ["MEERA SHAH", "Meera Shah"],
    ["MEERA s", "Meera S"],
    ["asha rao", "Asha Rao"],
    ["aSHA rAO", "Asha Rao"],
    ["DELHI", "Delhi"],
    ["mumbai", "Mumbai"],
    ["new delhi", "New Delhi"],
    ["Ravi Kumar", "Ravi Kumar"],
    ["a.k. sharma", "A.K. Sharma"],
    ["st. louis", "St. Louis"],
    ["pune/mumbai", "Pune/Mumbai"],
    ["(head office)", "(Head Office)"],
    ["ravi & sons", "Ravi & Sons"],
    ["müller", "Müller"],
    ["ÉLODIE DURAND", "Élodie Durand"],
  ];
  for (const [input, want] of cases) assert.equal(proper(input), want, input);
});

test("Proper Case: apostrophes, hyphens and Mc names", () => {
  const cases: [string, string][] = [
    ["o'brien", "O'Brien"],
    ["O'BRIEN", "O'Brien"],
    ["d'souza", "D'Souza"],
    ["d’souza", "D’Souza"],
    ["don't stop", "Don't Stop"],
    ["anne-marie", "Anne-Marie"],
    ["JEAN-PAUL SARTRE", "Jean-Paul Sartre"],
    ["mcdonald", "McDonald"],
    ["MCDONALD", "McDonald"],
    ["mc", "Mc"],
  ];
  for (const [input, want] of cases) assert.equal(proper(input), want, input);
});

test("Proper Case: linking words stay small in the middle, Roman numerals become capitals", () => {
  const cases: [string, string][] = [
    ["ludwig VAN beethoven", "Ludwig van Beethoven"],
    ["vincent van gogh", "Vincent van Gogh"],
    ["van gogh", "Van Gogh"],
    ["rio de janeiro", "Rio de Janeiro"],
    ["DE SOUZA", "De Souza"],
    ["leonardo da vinci", "Leonardo da Vinci"],
    ["mohammed bin salman", "Mohammed bin Salman"],
    ["henry viii", "Henry VIII"],
    ["louis xiv", "Louis XIV"],
    ["pope john xxiii", "Pope John XXIII"],
    ["state bank of india", "State Bank of India"],
    ["tata sons and co", "Tata Sons and Co"],
    ["ravi v", "Ravi V"],
    ["the oberoi", "The Oberoi"],
  ];
  for (const [input, want] of cases) assert.equal(proper(input), want, input);
});

test("Proper Case: short all-capital words are kept only next to a normally written word", () => {
  assert.equal(proper("HDFC Bank"), "HDFC Bank");
  assert.equal(proper("State Bank of INDIA"), "State Bank of INDIA");
  assert.equal(proper("HDFC BANK"), "Hdfc Bank", "an all-capital value has no normal word, so everything converts");
  assert.equal(proper("ASHA rao"), "Asha Rao");
});

test("never changed: emails, web addresses, values with digits; values without letters are returned as they are", () => {
  for (const style of ["proper", "upper", "lower"] as CaseStyle[]) {
    assert.deepEqual(changeCase("Asha.Rao@Example.com", style), { skip: "email" });
    assert.deepEqual(changeCase("https://MyDataFixer.com/Guides", style), { skip: "url" });
    assert.deepEqual(changeCase("www.Example.com", style), { skip: "url" });
    assert.deepEqual(changeCase("mydatafixer.com", style), { skip: "url" });
    assert.deepEqual(changeCase("MH12AB1234", style), { skip: "digits" });
    assert.deepEqual(changeCase("sku-a12", style), { skip: "digits" });
    assert.deepEqual(changeCase("flat 4, mg road", style), { skip: "digits" });
    assert.deepEqual(changeCase("", style), { value: "" });
    assert.deepEqual(changeCase("—", style), { value: "—" });
  }
  assert.equal(caseSkipReason("Ravi Kumar"), null);
});

test("scripts without capital letters are left unchanged", () => {
  for (const style of ["proper", "upper", "lower"] as CaseStyle[]) {
    assert.deepEqual(changeCase("रवि कुमार", style), { value: "रवि कुमार" });
    assert.deepEqual(changeCase("சென்னை", style), { value: "சென்னை" });
  }
});

test("UPPER CASE and lower case", () => {
  assert.deepEqual(changeCase("Ravi Kumar", "upper"), { value: "RAVI KUMAR" });
  assert.deepEqual(changeCase("o'Brien-Smith", "upper"), { value: "O'BRIEN-SMITH" });
  assert.deepEqual(changeCase("RAVI Kumar", "lower"), { value: "ravi kumar" });
  assert.deepEqual(changeCase("Müller", "upper"), { value: "MÜLLER" });
});

test("spaces are kept exactly (removing extra spaces is a separate tool)", () => {
  assert.equal(proper("  ravi   kumar "), "  Ravi   Kumar ");
  assert.equal(proper("ravi\tkumar"), "Ravi\tKumar");
});

// ---------------------------------------------------------------- generated names

const FIRST = ["asha", "ravi", "meera", "kiran", "priya", "arjun", "neha", "vikram", "sneha", "rahul", "anita", "rohan", "kavya", "sanjay", "fatima", "john", "maria", "chen", "olga", "ahmed"];
const LAST = ["rao", "kumar", "shah", "das", "iyer", "patil", "nair", "singh", "khan", "gupta", "sharma", "reddy", "smith", "garcia", "wang", "ivanova", "hassan", "fernandes", "joshi", "menon"];
const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
const variants = (s: string) => [s, s.toUpperCase(), s.replace(/\b\w/g, (c) => c.toUpperCase()), [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join("")];

test("generated: 1,600 name spellings give the right Proper Case, UPPER and lower results", () => {
  let n = 0;
  for (const f of FIRST)
    for (const l of LAST) {
      const want = `${cap(f)} ${cap(l)}`;
      for (const input of variants(`${f} ${l}`)) {
        assert.equal(proper(input), want, input);
        assert.deepEqual(changeCase(input, "upper"), { value: want.toUpperCase() });
        assert.deepEqual(changeCase(input, "lower"), { value: want.toLowerCase() });
        n++;
      }
    }
  assert.equal(n, 1600);
});

test("generated: running a style twice changes nothing more, and only capital/small letters ever change", () => {
  const samples = [
    ...FIRST.flatMap((f) => LAST.slice(0, 5).map((l) => `${f} ${l}`)),
    "o'brien", "anne-marie", "mcdonald", "ludwig van beethoven", "HDFC Bank", "a.k. sharma", "rio de janeiro", "henry viii", "Élodie Durand",
  ];
  for (const s of samples)
    for (const style of ["proper", "upper", "lower"] as CaseStyle[]) {
      const once = changeCase(s, style);
      assert.ok("value" in once, s);
      const twice = changeCase(once.value, style);
      assert.deepEqual(twice, once, `${style}(${s}) is stable`);
      assert.equal(once.value.toLowerCase(), s.toLowerCase(), `${style}(${s}) only changes case`);
    }
});

// ---------------------------------------------------------------- Step 2: the fix

import { EngineCore } from "../../src/engine/core.ts";
import { planFix } from "../../src/engine/fix/fixes.ts";
import { ArrayGrid } from "../../src/engine/grid.ts";
import { cellKey, createSheet, type CellValue } from "../../src/engine/types.ts";

const noop = () => {};
const CSV = [
  "name,city,email,code",
  "ravi k,DELHI,Ravi.K@Example.com,MH12AB1234",
  "MEERA s, mumbai,meera@example.com,sku-a12",
  "Asha Rao,Pune,asha@example.com,none",
  "o'brien,new delhi,,",
].join("\n");

async function openCsv(text = CSV) {
  const core = new EngineCore();
  const sheet = (await core.open(new File([text], "people.csv"), "csv", {}, noop)).activeSheet;
  return { core, sheet };
}

test("fix: nothing changes until a style and a column are chosen; the choice lists the text columns", async () => {
  const { core, sheet } = await openCsv();
  const p = await core.previewFix(sheet, "change-case", { headerRow: true }, noop);
  assert.equal(p.cellsChanged, 0);
  assert.equal(p.choices.length, 1);
  const ch = p.choices[0]!;
  assert.equal(ch.kind, "case-style");
  if (ch.kind !== "case-style") return;
  assert.deepEqual(ch.columns.map((c) => c.name), ["name", "city", "email", "code"]);
  assert.deepEqual(ch.styles.map((s) => s.id), ["proper", "upper", "lower"]);
  assert.deepEqual(p.skipped, []);
  assert.match(p.description, /Choose a style and at least one column/);
  const onlyStyle = await core.previewFix(sheet, "change-case", { headerRow: true, caseStyle: "proper" }, noop);
  assert.equal(onlyStyle.cellsChanged, 0);
});

test("fix: Proper Case on the chosen columns only; emails and codes are left alone with the reason; undo restores", async () => {
  const { core, sheet } = await openCsv();
  const p = await core.previewFix(sheet, "change-case", { headerRow: true, caseStyle: "proper", caseColumns: [0, 1, 2, 3] }, noop);
  assert.deepEqual(
    p.examples.map((e) => [e.row, e.col, e.before, e.after]),
    [
      [1, 0, "ravi k", "Ravi K"],
      [2, 0, "MEERA s", "Meera S"],
      [4, 0, "o'brien", "O'Brien"],
      [1, 1, "DELHI", "Delhi"],
      [2, 1, " mumbai", " Mumbai"],
      [4, 1, "new delhi", "New Delhi"],
      [3, 3, "none", "None"],
    ],
  );
  assert.deepEqual(p.skipped, [
    { reason: "Email addresses are never changed.", count: 3 },
    { reason: "Values that contain numbers (such as codes) are never changed.", count: 2 },
  ]);
  core.applyFix(sheet, p.token);
  const text = async () => (await (await core.exportCsv(sheet, noop)).blob.text()).replace(/^﻿/, "");
  assert.match(await text(), /Ravi K,Delhi,Ravi\.K@Example\.com,MH12AB1234/);
  core.undo(sheet);
  assert.match(await text(), /ravi k,DELHI,Ravi\.K@Example\.com,MH12AB1234/);
  const onlyCity = await core.previewFix(sheet, "change-case", { headerRow: true, caseStyle: "upper", caseColumns: [1] }, noop);
  assert.deepEqual(onlyCity.examples.map((e) => e.after), [" MUMBAI", "PUNE", "NEW DELHI"]);
});

test("fix: formula cells and the header row are never changed", async () => {
  const rows: CellValue[][] = [["name"], ["ravi k"], ["asha rao"]];
  const s = createSheet("S");
  s.grid = new ArrayGrid(rows);
  s.columnCount = 1;
  s.formulas.set(cellKey(2, 0), 'LOWER("Asha Rao")');
  const p = (await planFix(s, "change-case", { headerRow: true, caseStyle: "upper", caseColumns: [0] })).preview;
  assert.deepEqual(p.examples.map((e) => [e.row, e.after]), [[1, "RAVI K"]]);
  assert.deepEqual(p.skipped, [{ reason: "Formula cells are never changed automatically. Edit them by hand if needed.", count: 1 }]);
});

test("fix: works on Excel workbooks and the corrected workbook passes the download check", async () => {
  const { readFileSync } = await import("node:fs");
  const name = "2-problems.xlsx";
  const core = new EngineCore();
  const sheet = (await core.open(new File([readFileSync(new URL(`../fixtures/scan/${name}`, import.meta.url))], name), "xlsx", {}, noop)).activeSheet;
  const first = await core.previewFix(sheet, "change-case", { headerRow: true }, noop);
  const ch = first.choices[0]!;
  assert.ok(ch.kind === "case-style" && ch.columns.length > 0, "text columns are offered");
  if (ch.kind !== "case-style") return;
  const p = await core.previewFix(sheet, "change-case", { headerRow: true, caseStyle: "upper", caseColumns: ch.columns.map((c) => c.index) }, noop);
  assert.ok(p.cellsChanged > 0, `${p.cellsChanged} cells change`);
  core.applyFix(sheet, p.token);
  const out = await core.exportXlsx(sheet, noop); // reads the new workbook back and compares every cell
  assert.ok(out.blob.size > 0);
  assert.equal(out.summary.verification.cells > 0, true);
});

// ---------------------------------------------------------------- Step 3: detector note

test("detector note: name and place columns mostly in capitals or small letters; not other columns, emails or codes", async () => {
  const csv = [
    "customer name,city,status,email,code",
    "RAVI KUMAR,delhi,ACTIVE,ravi@example.com,AB12",
    "meera shah,PUNE,ACTIVE,meera@example.com,CD34",
    "Asha Rao,mumbai,ACTIVE,asha@example.com,EF56",
    "KIRAN DAS,Chennai,ACTIVE,kiran@example.com,GH78",
  ].join("\n");
  const { core, sheet } = await openCsv(csv);
  const scan = await core.scan(sheet, { headerRow: true }, noop);
  const issue = scan.issues.find((i) => i.id === "change-case");
  assert.ok(issue, "note shown");
  assert.equal(issue.severity, "note");
  assert.deepEqual((issue.columns ?? []).map((c) => [c.name, c.count]), [["customer name", 3], ["city", 3]], "status (not a name column), email and code are ignored");
  assert.equal(issue.count, 6);
  assert.match(issue.examples?.[0]?.note ?? "", /All capital letters; in Proper Case: “Ravi Kumar”/);
});

test("detector note: not shown when names are mostly written normally, or for columns without a name-like header", async () => {
  const fine = ["name,city", "Ravi Kumar,Delhi", "Meera Shah,Pune", "ASHA RAO,Mumbai", "Kiran Das,Chennai"].join("\n");
  const a = await openCsv(fine);
  assert.equal((await a.core.scan(a.sheet, { headerRow: true }, noop)).issues.find((i) => i.id === "change-case"), undefined, "1 of 4 is less than half");
  const noHeader = ["RAVI KUMAR,DELHI", "MEERA SHAH,PUNE", "ASHA RAO,MUMBAI"].join("\n");
  const b = await openCsv(noHeader);
  assert.equal((await b.core.scan(b.sheet, { headerRow: false }, noop)).issues.find((i) => i.id === "change-case"), undefined);
});
