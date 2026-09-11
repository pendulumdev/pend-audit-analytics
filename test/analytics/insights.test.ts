import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANALYTICS_INSIGHT_CATALOG,
  buildAnalyticsInsights,
} from "../../src/analytics/insights.js";
import type { GscAnalyticsBundle } from "../../src/types.js";

const OUTPUT_MD = join(dirname(fileURLToPath(import.meta.url)), "../../docs/output.md");

function gsc(partial: Partial<GscAnalyticsBundle>): GscAnalyticsBundle {
  return {
    siteUrl: "sc-domain:example.com",
    daily: [],
    topPages: [],
    topQueries: [],
    totals: { clicks: 100, impressions: 1000, ctr: 0.1, position: 8 },
    ...partial,
  };
}

describe("buildAnalyticsInsights", () => {
  it("flags sharp click drops", () => {
    const insights = buildAnalyticsInsights({
      gsc: gsc({
        totals: { clicks: 50, impressions: 1000, ctr: 0.05, position: 8 },
        previousTotals: { clicks: 100, impressions: 1000, ctr: 0.1, position: 8 },
      }),
    });
    const row = insights.find((i) => i.id === "gsc-clicks-drop-action");
    assert.ok(row);
    assert.equal(row.response, "action");
    assert.equal(row.title, "Organic clicks dropped sharply");
    assert.equal("severity" in row, false);
  });

  it("flags low-CTR high-impression queries", () => {
    const insights = buildAnalyticsInsights({
      gsc: gsc({
        topQueries: [
          {
            query: "web design bristol",
            clicks: 2,
            impressions: 200,
            ctr: 0.01,
            position: 4.2,
          },
        ],
      }),
    });
    assert.ok(insights.some((i) => i.id === "gsc-low-ctr-queries"));
  });

  it("documents every catalog row in docs/output.md", () => {
    const md = readFileSync(OUTPUT_MD, "utf8");
    assert.equal(ANALYTICS_INSIGHT_CATALOG.length, 8);
    for (const row of ANALYTICS_INSIGHT_CATALOG) {
      assert.ok(md.includes(`<code>${row.id}</code>`), `missing id ${row.id}`);
      assert.ok(md.includes(row.title), `missing title ${row.title}`);
    }
  });
});
