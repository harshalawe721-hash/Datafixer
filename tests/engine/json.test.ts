/** Stage 12, Step 1: JSON reader, JSON → table, table → JSON. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { JsonSyntaxError, LongNumber, parseJson, parseJsonLines } from "../../src/engine/json/parse.ts";
import { atPath, findLists, jsonText, jsonToTable } from "../../src/engine/json/table.ts";
import { jsonValue, keyNames, recordsToJson } from "../../src/engine/json/write.ts";

const syntax = (text: string, re: RegExp, line?: number, column?: number) =>
  assert.throws(
    () => parseJson(text),
    (e: unknown) => e instanceof JsonSyntaxError && re.test(e.message) && (line === undefined || e.line === line) && (column === undefined || e.column === column),
  );

// ---------------------------------------------------------------- reader

test("reads the same values as JSON.parse for ordinary JSON", () => {
  const samples = [
    '{"a":1,"b":[true,false,null],"c":{"d":"x"}}',
    "[]",
    "{}",
    '"text"',
    "-0.5e3",
    '[1, 2.5, -3, 1e2, 0, "a\\"b\\\\c\\/d\\n\\t\\u00e9\\ud83d\\ude00"]',
    ' \n\t{ "key" : [ ] } \r\n',
    '{"नाम":"अशा","città":"Città","emoji":"😀"}',
  ];
  for (const s of samples) assert.deepEqual(parseJson(s), JSON.parse(s), s);
});

test("a byte order mark at the start is allowed", () => {
  assert.deepEqual(parseJson('﻿{"a":1}'), { a: 1 });
});

test("numbers longer than 15 digits are kept exactly as written", () => {
  const v = parseJson('{"id":12345678901234567890,"card":4111111111111111,"ok":123456789012345,"small":0.000000000000000001}') as Record<string, unknown>;
  assert.ok(v.id instanceof LongNumber && v.id.text === "12345678901234567890");
  assert.ok(v.card instanceof LongNumber && v.card.text === "4111111111111111");
  assert.equal(v.ok, 123456789012345);
  assert.equal(v.small, 1e-18);
});

test("duplicate keys keep the last value, and __proto__ is an ordinary key", () => {
  const v = parseJson('{"a":1,"a":2,"__proto__":{"x":1}}') as Record<string, unknown>;
  assert.equal(v.a, 2);
  assert.deepEqual(Object.keys(v), ["a", "__proto__"]);
  assert.equal(Object.getPrototypeOf(v), Object.prototype);
});

test("mistakes are reported with the line and column, in plain language", () => {
  syntax('{"a": 1,}', /comma before “}”/, 1, 9);
  syntax('{\n  "a": 1\n  "b": 2\n}', /Expected “,” or “}”, found “"”/, 3, 3);
  syntax("[1, 2,]", /comma before “\]”/, 1, 7);
  syntax("{'a': 1}", /double quotes/, 1, 2);
  syntax('{"a": tru}', /Expected a value, found “t”.*double quotes/, 1, 7);
  syntax('{"a": "x}', /not closed/, 1, 7);
  syntax('{"a": 01}', /not written correctly/, 1, 7);
  syntax('{"a": 1.}', /not written correctly/);
  syntax('{"a": "line\nbreak"}', /can't contain a line break/);
  syntax('{"a": "\\x"}', /can't follow a backslash/);
  syntax("", /empty/);
  syntax("   ", /empty/);
  syntax('{"a":1} {"b":2}', /after the end of the data.*\.jsonl/, 1, 9);
  syntax('{"a":1', /Expected “,” or “}”, found the end of the file/);
});

test("very deep nesting is refused instead of crashing", () => {
  syntax("[".repeat(600) + "]".repeat(600), /nested more than 500 levels/);
  assert.doesNotThrow(() => parseJson("[".repeat(400) + "]".repeat(400)));
});

test("JSON Lines: one value per line, blank lines skipped, errors name the file line", () => {
  assert.deepEqual(parseJsonLines('{"a":1}\r\n\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
  assert.throws(
    () => parseJsonLines('{"a":1}\n{"a":2}\n{"a":}\n'),
    (e: unknown) => e instanceof JsonSyntaxError && e.line === 3 && e.column === 6,
  );
});

// ---------------------------------------------------------------- JSON → table

test("a list of objects: columns in order of first appearance, missing keys empty", () => {
  const t = jsonToTable(parseJson('[{"name":"Asha","city":"Pune"},{"name":"Ben","age":30},{"city":"Rome"}]'));
  assert.equal(t.headerRow, true);
  assert.deepEqual(t.rows, [
    ["name", "city", "age"],
    ["Asha", "Pune", null],
    ["Ben", null, 30],
    [null, "Rome", null],
  ]);
});

test("nested objects become dotted columns; lists inside a record stay JSON text", () => {
  const t = jsonToTable(parseJson('[{"id":1,"address":{"city":"Pune","geo":{"lat":18.5}},"phones":["+91 1","+91 2"],"tags":[],"meta":{}}]'));
  assert.deepEqual(t.rows[0], ["id", "address.city", "address.geo.lat", "phones", "tags", "meta"]);
  assert.deepEqual(t.rows[1], [1, "Pune", 18.5, '["+91 1","+91 2"]', "[]", null]);
  assert.equal(t.listsAsText, 2);
});

test("long numbers and booleans in cells", () => {
  const t = jsonToTable(parseJson('[{"id":12345678901234567890,"ok":true}]'));
  assert.deepEqual(t.rows[1], ["12345678901234567890", true]);
  assert.equal(t.longNumbers, 1);
});

test("a list of lists becomes rows without a made-up header; plain values get a “value” column", () => {
  assert.deepEqual(jsonToTable(parseJson('[["a","b"],[1,2]]')), { rows: [["a", "b"], [1, 2]], headerRow: false, listsAsText: 0, longNumbers: 0 });
  assert.deepEqual(jsonToTable(parseJson('["x",2,null]')).rows, [["value"], ["x"], [2], [null]]);
  assert.deepEqual(jsonToTable(parseJson("[]")).rows, []);
});

test("a single object is one row", () => {
  assert.deepEqual(jsonToTable(parseJson('{"name":"Asha","n":1}')).rows, [["name", "n"], ["Asha", 1]]);
});

test("lists inside an object are found and can be chosen", () => {
  const root = parseJson('{"meta":{"page":1},"results":[{"a":1},{"a":2}],"data":{"items":[{"b":1}]}}');
  assert.deepEqual(findLists(root), [
    { path: "results", length: 2 },
    { path: "data.items", length: 1 },
  ]);
  assert.deepEqual(jsonToTable(atPath(root, "data.items")).rows, [["b"], [1]]);
  assert.deepEqual(findLists(parseJson("[1,2]")), [{ path: "", length: 2 }]);
  const dotted = parseJson('{"a.b":{"c":[1]},"a":{"b":{"c":[2,3]}}}');
  assert.deepEqual(atPath(dotted, "a.b.c"), [1]);
});

test("jsonText keeps long numbers exact inside lists", () => {
  assert.equal(jsonText(parseJson('[12345678901234567890,{"k":"v"}]')), '[12345678901234567890,{"k":"v"}]');
});

// ---------------------------------------------------------------- table → JSON

test("key names: empty become column_N, repeats get _2, _3", () => {
  assert.deepEqual(keyNames(["name", "", "name", " name ", "name_2"], 6), ["name", "column_2", "name_2", "name_3", "name_2_2", "column_6"]);
});

test("values are text by default, exactly as shown", () => {
  assert.equal(jsonValue({ value: 12, text: "12.00" }, false), "12.00");
  assert.equal(jsonValue({ value: null, text: "" }, false), "");
  assert.equal(jsonValue({ value: "00123", text: "00123" }, false), "00123");
});

test("with detection: numbers, true/false and empty values; codes, long numbers, dates and spaced values stay text", () => {
  const d = (value: unknown, text: string, date = false) => jsonValue({ value: value as never, text, date }, true);
  assert.equal(d("12.5", "12.5"), 12.5);
  assert.equal(d("-3", "-3"), -3);
  assert.equal(d(7, "7.00"), 7);
  assert.equal(d("true", "true"), true);
  assert.equal(d("FALSE", "FALSE"), false);
  assert.equal(d(true, "TRUE"), true);
  assert.equal(d(null, ""), null);
  assert.equal(d("00123", "00123"), "00123");
  assert.equal(d("1234567890123456", "1234567890123456"), "1234567890123456");
  assert.equal(d("1,250", "1,250"), "1,250");
  assert.equal(d("1e5", "1e5"), "1e5");
  assert.equal(d(45366, "2024-03-15", true), "2024-03-15");
  assert.equal(d(" 5", " 5"), " 5");
  assert.equal(d("Yes", "Yes"), "Yes");
});

test("pretty, compact and JSON Lines layouts read back to the same records", () => {
  const keys = ["name", "n", "ok", "note"];
  const records = [
    ["Asha", 1, true, null],
    ['Ben "B"', 2.5, false, "line\nbreak"],
  ];
  const pretty = recordsToJson(keys, records, "pretty");
  assert.equal(pretty.split("\n")[1], "  {");
  assert.equal(pretty.split("\n")[2], '    "name": "Asha",');
  const expected = records.map((r) => Object.fromEntries(keys.map((k, c) => [k, r[c]])));
  assert.deepEqual(parseJson(pretty), expected);
  assert.deepEqual(parseJson(recordsToJson(keys, records, "compact")), expected);
  const lines = recordsToJson(keys, records, "lines");
  assert.equal(lines.split("\n").length, 3);
  assert.deepEqual(parseJsonLines(lines), expected);
  assert.equal(recordsToJson(keys, [], "pretty"), "[]\n");
  assert.equal(recordsToJson(keys, [], "lines"), "");
});
