import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXCEL_MAX_CELL_CHARS,
  combineValues,
  countParts,
  splitHeaderNames,
  splitText,
  tooLongForCell,
  type SplitOptions,
} from "../../src/engine/fix/split-combine.ts";

const base: SplitOptions = { separator: " ", mode: "first", maxParts: null, trim: false, respectQuotes: false };

test("split at the first space keeps the rest in the second part", () => {
  assert.deepEqual(splitText("Asha Patil", base), ["Asha", "Patil"]);
  assert.deepEqual(splitText("Asha Mary Patil", base), ["Asha", "Mary Patil"]);
});

test("split at every separator gives one part per separator", () => {
  assert.deepEqual(splitText("Asha Mary Patil", { ...base, mode: "every" }), ["Asha", "Mary", "Patil"]);
});

test("a value without the separator stays as one part", () => {
  assert.deepEqual(splitText("Mumbai", base), ["Mumbai"]);
  assert.equal(countParts("Mumbai", base), 1);
});

test("empty parts are kept so the columns line up", () => {
  assert.deepEqual(splitText("a,,c", { ...base, separator: "," , mode: "every" }), ["a", "", "c"]);
  assert.deepEqual(splitText("a,", { ...base, separator: "," }), ["a", ""]);
  assert.deepEqual(splitText(",b", { ...base, separator: "," }), ["", "b"]);
});

test("a multi-character separator works and is not split inside", () => {
  assert.deepEqual(splitText("Pune; Maharashtra; India", { ...base, separator: "; ", mode: "every" }), ["Pune", "Maharashtra", "India"]);
  assert.deepEqual(splitText("aaaa", { ...base, separator: "aa", mode: "every" }), ["", "", ""]);
});

test("maxParts keeps the rest of the text in the last part", () => {
  assert.deepEqual(splitText("a b c d", { ...base, mode: "every", maxParts: 2 }), ["a", "b c d"]);
  assert.deepEqual(splitText("a b c d", { ...base, mode: "every", maxParts: 3 }), ["a", "b", "c d"]);
});

test("trim removes spaces around each part", () => {
  assert.deepEqual(splitText(" Asha ,  Pune ", { ...base, separator: ",", trim: true }), ["Asha", "Pune"]);
  assert.deepEqual(splitText(" Asha ,  Pune ", { ...base, separator: "," }), [" Asha ", "  Pune "]);
});

test("separators inside double quotes are ignored when asked", () => {
  const csvish = '"Lee, Jr", Ahmed';
  assert.deepEqual(splitText(csvish, { ...base, separator: ",", respectQuotes: true }), ['"Lee, Jr"', " Ahmed"]);
  assert.deepEqual(splitText(csvish, { ...base, separator: ",", mode: "every" }), ['"Lee', ' Jr"', " Ahmed"]);
});

test("an empty separator is refused", () => {
  assert.throws(() => splitText("a b", { ...base, separator: "" }), /must not be empty/);
});

test("split headers are numbered", () => {
  assert.deepEqual(splitHeaderNames("name", 3), ["name (1)", "name (2)", "name (3)"]);
});

test("combine joins with the chosen separator", () => {
  assert.equal(combineValues(["Asha", "Patil"], { separator: " ", skipEmpty: true }), "Asha Patil");
  assert.equal(combineValues(["Pune", "Maharashtra"], { separator: ", ", skipEmpty: true }), "Pune, Maharashtra");
  assert.equal(combineValues(["A", "B"], { separator: "", skipEmpty: true }), "AB");
});

test("combine skips empty values without extra separators", () => {
  assert.equal(combineValues(["Asha", null, "", "Patil"], { separator: " ", skipEmpty: true }), "Asha Patil");
  assert.equal(combineValues(["Asha", null, "", "Patil"], { separator: " ", skipEmpty: false }), "Asha   Patil");
});

test("combine turns numbers and booleans into text", () => {
  assert.equal(combineValues([12, true, false], { separator: "-", skipEmpty: true }), "12-TRUE-FALSE");
});

test("combined values over the Excel cell limit are flagged", () => {
  assert.equal(tooLongForCell("x".repeat(EXCEL_MAX_CELL_CHARS)), false);
  assert.equal(tooLongForCell("x".repeat(EXCEL_MAX_CELL_CHARS + 1)), true);
});
