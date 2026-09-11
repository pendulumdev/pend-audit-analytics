import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { observeNamedRivals } from "../../src/analytics/rivals.js";

describe("observeNamedRivals", () => {
  it("rejects a host that is not an origin", async () => {
    const rows = await observeNamedRivals({ hosts: ["not-a-url"] });
    assert.deepEqual(rows, [
      { host: "not-a-url", error: "Rival host is not a valid origin." },
    ]);
  });

  it("omits CrUX and PSI when there is no PageSpeed key", async () => {
    const prev = process.env.PAGESPEED_API_KEY;
    try {
      delete process.env.PAGESPEED_API_KEY;
      const rows = await observeNamedRivals({ hosts: ["https://rival.test/work"] });
      const row = rows[0];
      assert.ok(row);
      assert.deepEqual(rows, [{ host: "https://rival.test" }]);
      assert.equal("pages" in row, false);
    } finally {
      if (prev === undefined) delete process.env.PAGESPEED_API_KEY;
      else process.env.PAGESPEED_API_KEY = prev;
    }
  });

  it("pulls origin CrUX and homepage PSI, not on-page copy", async () => {
    const prev = process.env.PAGESPEED_API_KEY;
    const realFetch = globalThis.fetch;
    try {
      delete process.env.PAGESPEED_API_KEY;
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("chromeuxreport.googleapis.com")) {
          return new Response(
            JSON.stringify({
              record: {
                key: { origin: "https://rival.test" },
                metrics: {
                  largest_contentful_paint: { percentiles: { p75: 2100 } },
                  interaction_to_next_paint: { percentiles: { p75: 160 } },
                  cumulative_layout_shift: { percentiles: { p75: 0.05 } },
                },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("pagespeedonline")) {
          return new Response(
            JSON.stringify({
              lighthouseResult: {
                categories: { performance: { score: 0.8 } },
                audits: {
                  "first-contentful-paint": { numericValue: 900, displayValue: "0.9 s" },
                  "largest-contentful-paint": {
                    numericValue: 1800,
                    displayValue: "1.8 s",
                  },
                  "total-blocking-time": { numericValue: 40, displayValue: "40 ms" },
                  "cumulative-layout-shift": { numericValue: 0.02, displayValue: "0.02" },
                  "speed-index": { numericValue: 1200, displayValue: "1.2 s" },
                },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }) as typeof globalThis.fetch;

      const rows = await observeNamedRivals({
        hosts: ["https://rival.test"],
        apiKey: "test-key",
      });
      const row = rows[0];
      assert.ok(row);
      assert.equal(row.host, "https://rival.test");
      assert.equal(row.error, undefined);
      assert.equal("pages" in row, false);
      assert.equal(row.crux?.origin, "https://rival.test");
      assert.equal(row.crux?.lcpMs, 2100);
      assert.equal(row.psi?.pages.length, 2);
      assert.deepEqual(
        row.psi?.pages.map((p) => p.strategy),
        ["mobile", "desktop"],
      );
      assert.ok(row.psi?.pages.every((p) => p.url === "https://rival.test/"));
      assert.ok(row.psi?.pages.every((p) => p.score === 80));
    } finally {
      globalThis.fetch = realFetch;
      if (prev === undefined) delete process.env.PAGESPEED_API_KEY;
      else process.env.PAGESPEED_API_KEY = prev;
    }
  });
});
