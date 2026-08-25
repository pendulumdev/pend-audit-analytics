import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAnalyticsInsights } from "../../src/analytics/insights.js";
import type { GscAnalyticsBundle } from "../../src/types.js";

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
    assert.ok(insights.some((i) => i.id === "gsc-clicks-drop-action"));
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
});
