import { test } from "node:test";
import assert from "node:assert/strict";
import { isProbablyMobile } from "../../src/engine/memory-budget.ts";

const nav = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints }) as unknown as Navigator;

test("mobile detection for conservative memory defaults", () => {
  assert.equal(isProbablyMobile(nav("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")), true);
  assert.equal(isProbablyMobile(nav("Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140 Mobile Safari/537.36")), true);
  // iPadOS reports a Mac user agent but has touch points
  assert.equal(isProbablyMobile(nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5)), true);
  assert.equal(isProbablyMobile(nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0)), false);
  assert.equal(isProbablyMobile(nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36")), false);
});
