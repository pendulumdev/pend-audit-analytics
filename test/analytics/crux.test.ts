import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
  it("reads PAGESPEED_API_KEY", () => {
    const prev = process.env.PAGESPEED_API_KEY;
    try {
      delete process.env.PAGESPEED_API_KEY;
      assert.equal(pagespeedApiKey(), undefined);
      process.env.PAGESPEED_API_KEY = "  abc123  ";
      assert.equal(pagespeedApiKey(), "abc123");
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
    assert.deepEqual(parsed, { origin: "https://thin.example" });
  });

  it("returns null for empty payloads", () => {
    assert.equal(parseCruxRecord(null), null);
    assert.equal(parseCruxRecord({ error: { code: 404 } }), null);
  });
});
