/** The homepage before/after example shows only fixes MyDataFixer really makes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { EngineCore } from "../../src/engine/core.ts";
import type { FixId } from "../../src/engine/fix/fix-ids.ts";
import type { FixOptions } from "../../src/engine/fix/fixes.ts";
import { HERO_AFTER, HERO_BEFORE, HERO_COLUMNS } from "../../src/content/hero-example.ts";

const noop = () => {};

test("homepage example: the real fixes turn the “before” table into exactly the “after” table", async () => {
  const csv = Papa.unparse([[...HERO_COLUMNS], ...HERO_BEFORE.map((r) => r.cells.map((c) => c.text))]);
  const core = new EngineCore();
  const sheet = (await core.open(new File([csv], "example.csv"), "csv", {}, noop)).activeSheet;
  const scan = await core.scan(sheet, { headerRow: true }, noop);
  const found = Object.fromEntries(scan.issues.map((i) => [i.id, i.count]));
  assert.equal(found["duplicate-rows"], 1);
  assert.equal(found["extra-spaces"], 2);
  assert.equal(found["inconsistent-dates"], 2);

  const steps: [FixId, Omit<FixOptions, "headerRow">][] = [
    ["duplicate-rows", {}],
    ["extra-spaces", {}],
    ["change-case", { caseStyle: "proper", caseColumns: [0, 1] }],
    // 12/03/2026 could be day-first or month-first, so the tool asks; the example chooses day-first.
    ["inconsistent-dates", { dateChoices: { 2: { target: "dmy-slash", order: "dmy" } } }],
  ];
  for (const [id, options] of steps) {
    const p = await core.previewFix(sheet, id, { headerRow: true, ...options }, noop);
    assert.ok(p.cellsChanged + p.rowsRemoved > 0, `${id} changes something`);
    core.applyFix(sheet, p.token);
  }

  const out = (await core.exportCsv(sheet, noop)).blob;
  const rows = Papa.parse<string[]>((await out.text()).replace(/^﻿/, "").trim()).data;
  assert.deepEqual(rows, [[...HERO_COLUMNS], ...HERO_AFTER.map((r) => r.cells.map((c) => c.text))]);
});
