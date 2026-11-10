/**
 * Unit tests for upload validation. Run with `npm test` (Node's built-in test
 * runner; Node 22.18+ strips TypeScript types natively).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpreadsheet, formatLimit, looksLikeText } from "../src/lib/file-validation.ts";

const MB = 1024 * 1024;
const MAX = 157_286_400;
const opts = { accept: [".xlsx", ".xls", ".csv"], maxBytes: MAX, warnAboveBytes: 50 * MB };
const csvHead = new TextEncoder().encode("name,email,amount\nAnn,ann@example.com,10\n");
const xlsxHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const xlsHead = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

test("limit constant is exactly 150 MB", () => {
  assert.equal(MAX, 150 * MB);
  assert.equal(formatLimit(MAX), "150 MB");
});

const accepted: [string, number][] = [
  ["50 MB", 50 * MB],
  ["100 MB", 100 * MB],
  ["149 MB", 149 * MB],
  ["exactly 150 MB", MAX],
  ["1 byte under 150 MB", MAX - 1],
];
for (const [label, size] of accepted) {
  for (const [ext, head] of [[".csv", csvHead], [".xlsx", xlsxHead], [".xls", xlsHead]] as const) {
    test(`accepts ${label} ${ext}`, () => {
      const r = validateSpreadsheet({ name: `file${ext}`, size }, head, opts);
      assert.equal(r.ok, true, JSON.stringify(r));
    });
  }
}

const rejected: [string, number][] = [
  ["150 MB + 1 byte", MAX + 1],
  ["151 MB", 151 * MB],
  ["500 MB", 500 * MB],
];
for (const [label, size] of rejected) {
  for (const [ext, head] of [[".csv", csvHead], [".xlsx", xlsxHead], [".xls", xlsHead]] as const) {
    test(`rejects ${label} ${ext} with a message naming the 150 MB limit`, () => {
      const r = validateSpreadsheet({ name: `file${ext}`, size }, head, opts);
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.error, /150 MB/);
    });
  }
}

test("message for 1 byte over shows exact byte counts", () => {
  const r = validateSpreadsheet({ name: "big.csv", size: MAX + 1 }, csvHead, opts);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /157,286,401 bytes/);
    assert.match(r.error, /150 MB \(157,286,400 bytes\)/);
  }
});

test("message for clearly oversized file shows MB", () => {
  const r = validateSpreadsheet({ name: "big.csv", size: 200 * MB }, csvHead, opts);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /is 200\.0 MB, which is over the 150 MB maximum/);
});

test("large-file advisory above 50 MB only", () => {
  const small = validateSpreadsheet({ name: "a.csv", size: 50 * MB }, csvHead, opts);
  const large = validateSpreadsheet({ name: "a.csv", size: 50 * MB + 1 }, csvHead, opts);
  assert.ok(small.ok && small.warning === undefined);
  assert.ok(large.ok && /large file/.test(large.warning ?? ""));
});

test("size check runs before content checks are skipped for oversize files", () => {
  // An oversize file is rejected for size, not for an unrelated reason.
  const r = validateSpreadsheet({ name: "x.xlsx", size: MAX + 1 }, xlsxHead, opts);
  assert.ok(!r.ok && /maximum file size/.test(r.error));
});

test("other rules unchanged", () => {
  assert.ok(!validateSpreadsheet({ name: "a.txt", size: 10 }, csvHead, opts).ok);
  assert.ok(!validateSpreadsheet({ name: "a.csv", size: 0 }, csvHead, opts).ok);
  assert.ok(!validateSpreadsheet({ name: "a.xlsx", size: 10 }, csvHead, opts).ok);
  assert.ok(!validateSpreadsheet({ name: "a.csv", size: 10 }, xlsxHead, opts).ok);
  assert.equal(looksLikeText(new Uint8Array([0x41, 0x00])), false);
  assert.equal(looksLikeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00])), true);
});
