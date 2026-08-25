import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  formatYmd,
  parseYmd,
  resolveAnalyticsRange,
} from "../../src/analytics/dates.js";
import type { AnalyticsConfig } from "../../src/types.js";

function base(partial: Partial<AnalyticsConfig> = {}): AnalyticsConfig {
  return {
    enabled: true,
    rangeDays: 28,
    comparePrevious: true,
    ...partial,
  };
}

describe("parseYmd", () => {
  it("reads a date as UTC midnight", () => {
    assert.equal(parseYmd("2026-08-04").toISOString(), "2026-08-04T00:00:00.000Z");
  });

  it("rejects malformed input rather than returning an Invalid Date", () => {
    // A bad range in config used to reach the Google APIs as NaN-NaN-NaN.
    for (const bad of ["", "2026-08", "2026/08/04", "yyyy-mm-dd", "2026-08-04-01"]) {
      assert.throws(() => parseYmd(bad), /expected YYYY-MM-DD/, `accepted "${bad}"`);
    }
  });
});

describe("resolveAnalyticsRange", () => {
  it("defaults to 28 days ending 3 days before today (UTC)", () => {
    const now = new Date(Date.UTC(2026, 7, 7)); // 2026-08-07
    const range = resolveAnalyticsRange(base(), now);
    assert.equal(range.end, "2026-08-04");
    assert.equal(range.start, "2026-07-08");
    assert.equal(range.previousEnd, "2026-07-07");
    assert.equal(range.previousStart, "2026-06-10");
  });

  it("honours explicit start/end and previous window", () => {
    const range = resolveAnalyticsRange(
      base({ startDate: "2026-01-01", endDate: "2026-01-07", comparePrevious: true }),
    );
    assert.equal(range.start, "2026-01-01");
    assert.equal(range.end, "2026-01-07");
    assert.equal(range.previousEnd, "2025-12-31");
    assert.equal(range.previousStart, "2025-12-25");
  });

  it("omits previous window when comparePrevious is false", () => {
    const range = resolveAnalyticsRange(
      base({ startDate: "2026-01-01", endDate: "2026-01-07", comparePrevious: false }),
    );
    assert.equal(range.previousStart, undefined);
    assert.equal(range.previousEnd, undefined);
  });
});

describe("date helpers", () => {
  it("formatYmd / addDays", () => {
    assert.equal(formatYmd(new Date(Date.UTC(2026, 0, 5))), "2026-01-05");
    assert.equal(addDays("2026-01-05", -2), "2026-01-03");
  });
});
