import { test } from "node:test";
import assert from "node:assert/strict";
import { indiaDate, isPublished, publishTime } from "../../src/content/howto/schedule.ts";

const at = (iso: string) => Date.parse(iso);

test("not scheduled: no start date (or an invalid one) publishes nothing", () => {
  assert.equal(publishTime(0, null), null);
  assert.equal(publishTime(0, "25-11-2026"), null);
  assert.equal(isPublished(0, null, at("2030-01-01T00:00:00Z")), false);
});

test("guide 1 goes live at 00:00 India time on the start date, not a minute earlier", () => {
  assert.equal(publishTime(0, "2026-11-25"), at("2026-11-24T18:30:00Z"));
  assert.equal(isPublished(0, "2026-11-25", at("2026-11-24T23:59:00+05:30")), false);
  assert.equal(isPublished(0, "2026-11-25", at("2026-11-25T00:00:00+05:30")), true);
});

test("one guide per day: on day n exactly n guides are published (15 guides, across a month end)", () => {
  const start = "2026-11-25";
  for (let day = 0; day < 16; day++) {
    const noon = Date.parse(`2026-11-25T12:00:00+05:30`) + day * 86_400_000;
    const count = Array.from({ length: 15 }, (_, i) => i).filter((i) => isPublished(i, start, noon)).length;
    assert.equal(count, Math.min(day + 1, 15), `day ${day + 1}`);
  }
  assert.equal(indiaDate(publishTime(14, start)!), "2026-12-09");
});

test("indiaDate gives the India calendar date, which is ahead of UTC in the evening", () => {
  assert.equal(indiaDate(at("2026-11-24T18:30:00Z")), "2026-11-25");
  assert.equal(indiaDate(at("2026-11-24T18:29:59Z")), "2026-11-24");
});
