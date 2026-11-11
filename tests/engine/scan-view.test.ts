/** Stage 3, Step 7 (engine): "view affected data" filtering and highlighting; scan cancellation. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";

const noop = () => {};
// rows: 0 header | 1 Ann | 2 Bob | 3 empty | 4 Ann (dup) | 5 Cat (no email) | 6 Dan (short) | 7 empty | 8 Bob (dup) | 9 Ann (dup)
const PLANTED =
  "id,name,email,amount,notes,\n1,Ann,a@x.com,10,,\n2,Bob,b@x.com,20,,\n,,,,,\n1,Ann,a@x.com,10,,\n3,Cat,,30,,\n4,Dan,d@x.com\n,,,,,\n2,Bob,b@x.com,20,,\n1,Ann,a@x.com,10,,\n";

async function scanned() {
  const core = new EngineCore();
  await core.open(new File([PLANTED], "p.csv"), "csv", {}, noop);
  const result = await core.scan("Sheet1", { headerRow: true }, noop);
  return { core, result };
}
const q = (issue?: string, extra: object = {}) => ({ offset: 0, limit: 100, headerRow: true, issue, ...extra });

test("row issue: only affected rows are shown, whole rows flagged", async () => {
  const { core } = await scanned();
  const page = core.getRows("Sheet1", q("duplicate-rows"));
  assert.equal(page.total, 5);
  assert.deepEqual(page.rows.map((r) => r.index), [1, 2, 4, 8, 9]);
  assert.deepEqual(page.rows[0]!.flaggedColumns, [0, 1, 2, 3, 4, 5]);
});

test("cell issue: affected rows shown, only the problem cells flagged", async () => {
  const { core } = await scanned();
  const page = core.getRows("Sheet1", q("missing-cells"));
  assert.deepEqual(page.rows.map((r) => [r.index, r.flaggedColumns]), [[5, [2]], [6, [3]]]);
});

test("column issue: all rows shown, the empty columns flagged", async () => {
  const { core } = await scanned();
  const page = core.getRows("Sheet1", q("empty-columns"));
  assert.equal(page.total, 9);
  assert.ok(page.rows.every((r) => JSON.stringify(r.flaggedColumns) === "[4,5]"));
});

test("filter combines with search and sort; no issue means no filter", async () => {
  const { core } = await scanned();
  assert.equal(core.getRows("Sheet1", q("duplicate-rows", { search: "bob" })).total, 2);
  const sorted = core.getRows("Sheet1", q("duplicate-rows", { sort: { column: 1, direction: "desc" } }));
  assert.deepEqual(sorted.rows.map((r) => r.cells[1]), ["Bob", "Bob", "Ann", "Ann", "Ann"]);
  const all = core.getRows("Sheet1", q());
  assert.equal(all.total, 9);
  assert.equal(all.rows[0]!.flaggedColumns, undefined);
});

test("a fresh scan replaces the cached filter", async () => {
  const { core } = await scanned();
  core.getRows("Sheet1", q("duplicate-rows"));
  await core.scan("Sheet1", { headerRow: false }, noop); // header row now counts as data
  const page = core.getRows("Sheet1", q("empty-rows", { headerRow: false }));
  assert.deepEqual(page.rows.map((r) => r.index), [3, 7]);
});

test("unknown issue id gives a clear error", async () => {
  const { core } = await scanned();
  assert.throws(() => core.getRows("Sheet1", q("nope")), (e: unknown) => e instanceof EngineError && /no longer in the results/.test(e.message));
});

test("cancelling a scan keeps the file open and usable", async () => {
  const core = new EngineCore();
  await core.open(new File(["a,b\n" + "1,x\n".repeat(60000)], "big.csv"), "csv", {}, noop);
  const token = { cancelled: false };
  await assert.rejects(core.scan("Sheet1", { headerRow: true }, () => (token.cancelled = true), token), (e: unknown) => e instanceof EngineError && e.code === "cancelled");
  assert.equal(core.getRows("Sheet1", q()).total, 60000, "file still loaded");
  const again = await core.scan("Sheet1", { headerRow: true }, noop);
  assert.equal(again.rows, 60000);
});
