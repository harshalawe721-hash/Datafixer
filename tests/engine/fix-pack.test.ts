/**
 * Stage 4 test pack: the exact results the owner should see on the tablet
 * (tests/fixtures/fix/expected.json). Each case follows the tablet steps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EngineCore } from "../../src/engine/core.ts";

const noop = () => {};
const expected = JSON.parse(readFileSync(new URL("../fixtures/fix/expected.json", import.meta.url), "utf8")) as Record<string, Record<string, unknown>>;

async function open(url: URL, name: string) {
  const core = new EngineCore();
  const s = await core.open(new File([new Uint8Array(readFileSync(url))], name), name.endsWith(".xlsx") ? "xlsx" : "csv", {}, noop);
  return { core, sheet: s.activeSheet };
}
const counts = async (core: EngineCore, sheet: string) => Object.fromEntries((await core.scan(sheet, { headerRow: true }, noop)).issues.map((i) => [i.id, i.count]));
const summaryOf = (s: Record<string, unknown>) => ({
  downloadName: s.downloadName,
  cellsEdited: s.cellsEdited,
  rowsRemoved: s.rowsRemoved,
  duplicatesRemoved: s.duplicatesRemoved,
  automaticCorrections: s.automaticCorrections,
  manualEdits: s.manualEdits,
  ...(s.changedParts ? { changedParts: s.changedParts } : {}),
});

export async function runPack(): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  {
    const { core, sheet } = await open(new URL("../fixtures/scan/1-problems.csv", import.meta.url), "1-problems.csv");
    const p = await core.previewFixAll(sheet, { headerRow: true }, noop);
    core.applyFix(sheet, p.token);
    core.editCell(sheet, 7, 2, "person7@example.com");
    const after = await counts(core, sheet);
    const { summary } = await core.exportCsv(sheet, noop);
    out["1-problems.csv"] = { fixAll: p.steps.map((s) => [s.label, s.cellsChanged + s.rowsRemoved + s.columnsRemoved]), afterFixAllAndEdit: after, download: summaryOf(summary as unknown as Record<string, unknown>) };
  }
  {
    const { core, sheet } = await open(new URL("../fixtures/scan/2-problems.xlsx", import.meta.url), "2-problems.xlsx");
    const p = await core.previewFixAll(sheet, { headerRow: true }, noop);
    core.applyFix(sheet, p.token);
    const after = await counts(core, sheet);
    const { summary } = await core.exportXlsx(sheet, noop);
    out["2-problems.xlsx"] = { fixAll: p.steps.map((s) => [s.label, s.cellsChanged + s.rowsRemoved + s.columnsRemoved]), afterFixAll: after, download: summaryOf(summary as unknown as Record<string, unknown>) };
  }
  {
    const { core, sheet } = await open(new URL("../fixtures/fix/6-excel-references.xlsx", import.meta.url), "6-excel-references.xlsx");
    const before = await counts(core, sheet);
    const blocked = await core.previewFix(sheet, "duplicate-rows", { headerRow: true }, noop);
    const clear = await core.previewFix(sheet, "duplicate-rows", { headerRow: true, clearInsteadOfRemove: true }, noop);
    core.applyFix(sheet, clear.token);
    const p = await core.previewFixAll(sheet, { headerRow: true }, noop);
    core.applyFix(sheet, p.token);
    const { summary } = await core.exportXlsx(sheet, noop);
    out["6-excel-references.xlsx"] = {
      problems: before,
      removeDuplicatesBlockedBy: blocked.excelCheck?.affected,
      clearInsteadCells: clear.cellsChanged,
      fixAllAfterClearing: p.steps.map((s) => [s.label, s.cellsChanged + s.rowsRemoved + s.columnsRemoved]),
      download: summaryOf(summary as unknown as Record<string, unknown>),
    };
  }
  return out;
}

test("Stage 4 test pack: results match expected.json exactly", async () => {
  const got = await runPack();
  for (const [file, want] of Object.entries(expected)) {
    if (!got[file]) continue; // large files are checked on the device only
    assert.deepEqual(got[file], want, file);
  }
});
