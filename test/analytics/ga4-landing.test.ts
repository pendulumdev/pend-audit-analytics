import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPagedRows,
  LANDING_CAP,
  LANDING_PAGE_SIZE,
} from "../../src/analytics/ga4.js";
import { GSC_TOP_LIMIT } from "../../src/analytics/gsc.js";

describe("landing page fetch", () => {
  it("stops when a page is shorter than the page size and keeps the first rowCount", async () => {
    const calls: number[] = [];
    const result = await collectPagedRows({
      pageSize: LANDING_PAGE_SIZE,
      cap: LANDING_CAP,
      fetchPage: async (offset, limit) => {
        calls.push(offset);
        assert.equal(limit, LANDING_PAGE_SIZE);
        return {
          rows: offset === 0 ? Array.from({ length: 40 }, (_, i) => i) : [],
          rowCount: 40,
        };
      },
    });
    assert.deepEqual(calls, [0]);
    assert.equal(result.rows.length, 40);
    assert.equal(result.sourceRows, 40);
  });

  it("stops at the landing cap and does not request another page", async () => {
    let calls = 0;
    const result = await collectPagedRows({
      pageSize: LANDING_PAGE_SIZE,
      cap: LANDING_CAP,
      fetchPage: async (offset) => {
        calls += 1;
        assert.ok(offset < LANDING_CAP);
        return {
          rows: Array.from({ length: LANDING_PAGE_SIZE }, (_, i) => offset + i),
          rowCount: 5000,
        };
      },
    });
    assert.equal(calls, LANDING_CAP / LANDING_PAGE_SIZE);
    assert.equal(result.rows.length, LANDING_CAP);
    assert.equal(result.sourceRows, 5000);
  });
});

describe("search console caps", () => {
  it("fetches 10,000 query rows and 10,000 page rows", () => {
    assert.equal(GSC_TOP_LIMIT, 10_000);
  });
});
