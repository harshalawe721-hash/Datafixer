/** Stage 3, Step 6: checks K–L (unusual values, formula errors). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runScan, type Finding, type ColumnProfile } from "../../src/engine/scan/scan.ts";
import { ALL_CHECKS } from "../../src/engine/scan/checks/index.ts";
import { formulaErrors, outlierSkipReason, quantile, unusualValues } from "../../src/engine/scan/checks/values.ts";
import { parseCsv } from "../../src/engine/csv/parse-csv.ts";
import { EngineCore } from "../../src/engine/core.ts";
import { cellKey } from "../../src/engine/types.ts";

const csv = async (text: string) => (await parseCsv(new Blob([text]), "S")).sheet;
const find = (f: Finding[], id: string) => f.find((x) => x.issue.id === id);

function plantedOutliers(): string {
  const lines = ["id,year,amount,qty,flat"];
  for (let i = 0; i < 40; i++) {
    const amount = i === 38 ? 5000 : i === 39 ? -3000 : 100 + ((i * 7) % 100);
    const qty = i < 15 ? (i === 14 ? 9999 : i + 1) : "";
    const flat = i === 39 ? 1000 : 10;
    lines.push(`${i + 1},${1990 + i},${amount},${qty},${flat}`);
  }
  return lines.join("\n");
}

test("planted file: exactly the two far-out amounts are flagged; other columns are skipped", async () => {
  const { findings } = await runScan(await csv(plantedOutliers()), { headerRow: true, checks: [unusualValues] });
  const uv = find(findings, "unusual-values")!;
  assert.equal(uv.issue.severity, "note");
  assert.equal(uv.issue.count, 2);
  assert.deepEqual(Array.from(uv.cells!), [cellKey(39, 2), cellKey(40, 2)]);
  assert.deepEqual(uv.issue.columns!.map((c) => c.name), ["amount"], "year, id (sequence), qty (<20 values) and flat (no spread) skipped");
  assert.match(uv.issue.examples![0]!.note!, /^Far above the usual range in amount: the middle half of the values is/);
  assert.match(uv.issue.examples![1]!.note!, /^Far below/);
});

test("cautious: values only moderately outside the range are not flagged", async () => {
  // 1.5×IQR outliers that a sensitive mode would flag, but within 3×IQR.
  const lines = ["v"];
  for (let i = 0; i < 40; i++) lines.push(String(100 + i));
  lines.push("170", "50"); // Q1≈110, Q3≈131, IQR≈21 → 3×IQR fences ≈ 47 … 194
  const { findings } = await runScan(await csv(lines.join("\n")), { headerRow: true, checks: [unusualValues] });
  assert.equal(find(findings, "unusual-values"), undefined);
});

test("leading-zero values (even with spaces around them) are not treated as quantities", async () => {
  const lines = ["v"];
  for (let i = 0; i < 40; i++) lines.push(String(100 + i));
  lines.push(" 0099999 ", "-0099999"); // as numbers these would be far out; as codes they are ignored
  const { findings } = await runScan(await csv(lines.join("\n")), { headerRow: true, checks: [unusualValues] });
  assert.equal(find(findings, "unusual-values"), undefined);
});

test("skip reasons", () => {
  const p = (name: string | null) => ({ name, counts: { numericText: 0 }, leadingZero: 0 }) as unknown as ColumnProfile;
  const arr = (xs: number[]) => {
    const sorted = Float64Array.from(xs).sort();
    return { count: xs.length, min: sorted[0]!, max: sorted[sorted.length - 1]!, allInt: xs.every(Number.isInteger), sorted };
  };
  assert.equal(outlierSkipReason(p("v"), arr([1, 2, 3])), "too few values");
  assert.equal(outlierSkipReason(p("Customer ID"), arr(Array.from({ length: 30 }, (_, i) => i * 3.5))), "identifier column");
  assert.equal(outlierSkipReason(p("built"), arr(Array.from({ length: 30 }, (_, i) => 1950 + i * 2))), "year column");
  assert.equal(outlierSkipReason(p("n"), arr(Array.from({ length: 30 }, (_, i) => 1000 + i))), "sequential IDs");
  assert.equal(outlierSkipReason(p("price"), arr(Array.from({ length: 30 }, (_, i) => i * 1.25))), null);
});

test("quantile interpolation", () => {
  const s = Float64Array.from([1, 2, 3, 4]);
  assert.equal(quantile(s, 0.25), 1.75);
  assert.equal(quantile(s, 0.75), 3.25);
  assert.equal(quantile(s, 0.5), 2.5);
});

test("formula errors in a CSV: counted by type, with a note that formulas aren't available", async () => {
  const { findings } = await runScan(await csv("#N/A,v\nAnn,#N/A\nBob,#DIV/0!\nCat,5\nDan,#N/A\n"), { headerRow: true, checks: [formulaErrors] });
  const fe = find(findings, "formula-errors")!;
  assert.equal(fe.issue.severity, "error");
  assert.equal(fe.issue.count, 3, "the '#N/A' header is not data");
  assert.match(fe.issue.explanation, /#N\/A ×2 \(a lookup didn't find a match\); #DIV\/0! ×1/);
  assert.match(fe.issue.explanation, /This is a CSV file/);
  assert.match(fe.issue.howToFix, /#DIV\/0!: check the divisor/);
});

test("formula errors in Excel: the formula behind each error is shown", async () => {
  const core = new EngineCore();
  await core.open(new File([readFileSync(new URL("../fixtures/excel/lo-features.xlsx", import.meta.url))], "f.xlsx"), "xlsx", {}, () => {});
  const r = await core.scan("Data", { headerRow: true }, () => {});
  const fe = r.issues.find((i) => i.id === "formula-errors")!;
  assert.equal(fe.count, 2);
  assert.deepEqual(fe.examples!.map((e) => [e.value, e.note]), [["#DIV/0!", "Formula: =1/0"], ["#N/A", "Formula: =NA()"]]);
  assert.doesNotMatch(fe.explanation, /CSV/);
  assert.equal(r.issues[0]!.id, "formula-errors", "errors are listed first");
  assert.ok(!r.issues.some((i) => i.id === "unusual-values"), "only 4 rows: too few values to judge");
});

test("all 12 check families are registered", () => {
  assert.equal(ALL_CHECKS.length, 12);
});

test("large columns: sampled statistics, but every outlier is found (even unsampled ones)", async () => {
  const lines = ["v,seq"];
  const n = 120_000; // stride 3 → only every 3rd value is sampled
  for (let i = 0; i < n; i++) {
    const v = i === 1 || i === 50_002 || i === 119_998 ? 9_999_999 : 100 + ((i * 37) % 900); // positions not ≡ 0 mod 3
    lines.push(`${v},${i + 1}`);
  }
  const { findings } = await runScan(await csv(lines.join("\n")), { headerRow: true, checks: [unusualValues] });
  const uv = find(findings, "unusual-values")!;
  assert.equal(uv.issue.count, 3);
  assert.deepEqual(Array.from(uv.cells!), [cellKey(2, 0), cellKey(50_003, 0), cellKey(119_999, 0)]);
  assert.deepEqual(uv.issue.columns!.map((c) => c.name), ["v"], "the 1…120000 sequence is still recognised as IDs");
});
