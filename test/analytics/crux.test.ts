import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchCruxOrigin,
  originFromBaseUrl,
  pagespeedApiKey,
  parseCruxRecord,
} from "../../src/analytics/crux.js";

describe("originFromBaseUrl", () => {
  it("strips path and trailing slash", () => {
    assert.equal(
      originFromBaseUrl("https://www.example.com/work/"),
      "https://www.example.com",
    );
  });

  it("rejects non-http URLs", () => {
    assert.equal(originFromBaseUrl("ftp://example.com"), undefined);
    assert.equal(originFromBaseUrl(""), undefined);
  });
});

describe("pagespeedApiKey", () => {
  it("reads PAGESPEED_API_KEY, then config, and prefers the environment", () => {
    const prev = process.env.PAGESPEED_API_KEY;
    try {
      delete process.env.PAGESPEED_API_KEY;
      assert.equal(pagespeedApiKey(), undefined);
      assert.equal(pagespeedApiKey("  from-toml  "), "from-toml");
      process.env.PAGESPEED_API_KEY = "  abc123  ";
      assert.equal(pagespeedApiKey(), "abc123");
      assert.equal(pagespeedApiKey("from-toml"), "abc123");
    } finally {
      if (prev === undefined) delete process.env.PAGESPEED_API_KEY;
      else process.env.PAGESPEED_API_KEY = prev;
    }
  });
});

describe("parseCruxRecord", () => {
  it("reads origin p75 LCP INP CLS and collection dates", () => {
    const parsed = parseCruxRecord({
      record: {
        key: { origin: "https://www.example.com" },
        metrics: {
          largest_contentful_paint: { percentiles: { p75: 2410 } },
          interaction_to_next_paint: { percentiles: { p75: "180" } },
          cumulative_layout_shift: { percentiles: { p75: 0.08 } },
        },
        collectionPeriod: {
          firstDate: { year: 2026, month: 7, day: 12 },
          lastDate: { year: 2026, month: 8, day: 8 },
        },
      },
    });
    assert.deepEqual(parsed, {
      origin: "https://www.example.com",
      collectionStart: "2026-07-12",
      collectionEnd: "2026-08-08",
      lcpMs: 2410,
      inpMs: 180,
      cls: 0.08,
    });
  });

  it("returns origin-only when Chrome has no metrics", () => {
    const parsed = parseCruxRecord({
      record: { key: { origin: "https://thin.example" } },
    });
    assert.deepEqual(parsed, { origin: "https://thin.example", reason: "empty" });
  });

  it("returns null for empty payloads", () => {
    assert.equal(parseCruxRecord(null), null);
    assert.equal(parseCruxRecord({ error: { code: 404 } }), null);
  });
});

describe("fetchCruxOrigin", () => {
  it("marks a 404 as not-found and keeps the Google message", async () => {
    const result = await fetchCruxOrigin({
      origin: "https://quiet.example",
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        async text() {
          return JSON.stringify({
            error: { message: "chrome ux report data not found" },
          });
        },
      }),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.crux, {
      origin: "https://quiet.example",
      reason: "not-found",
      detail: "chrome ux report data not found",
    });
  });

  it("marks a 403 as error and still returns a crux object", async () => {
    const result = await fetchCruxOrigin({
      origin: "https://example.com",
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        async text() {
          return JSON.stringify({
            error: { message: "Chrome UX Report API has not been used" },
          });
        },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected error");
    assert.equal(result.error, "Chrome UX Report API has not been used");
    assert.deepEqual(result.crux, {
      origin: "https://example.com",
      reason: "error",
      detail: "Chrome UX Report API has not been used",
    });
  });
});
