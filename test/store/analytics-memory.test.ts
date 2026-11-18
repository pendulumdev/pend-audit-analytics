import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EVENT_LIMIT, LANDING_CAP } from "../../src/analytics/ga4.js";
import { GSC_TOP_LIMIT } from "../../src/analytics/gsc.js";
import { MAX_OBSERVE_URLS } from "../../src/analytics/observe.js";
import { PSI_MAX_INSIGHTS } from "../../src/analytics/psi.js";
import { MAX_LANDING_TAG_PAGES, SNIPPET_MAX_CHARS } from "../../src/analytics/tags.js";
import { insertAnalyticsRows } from "../../src/store/analytics-rows.js";
import type { AuditRun, PsiPageRow } from "../../src/types.js";
import { memorySql } from "./memory-sql.js";

/** Ceiling for a bundle filled to the 10,000-row caps. Measured delta was about 19MB. */
const HEAP_CEILING_BYTES = 32 * 1024 * 1024;
const DESCRIPTION_CAP = 800;

function page(url: string, strategy: "mobile" | "desktop"): PsiPageRow {
  return {
    url,
    strategy,
    score: 70,
    metrics: [
      { id: "fcp", value: 1 },
      { id: "lcp", value: 2 },
      { id: "tbt", value: 3 },
      { id: "cls", value: 0.1 },
      { id: "si", value: 4 },
    ],
    insights: Array.from({ length: PSI_MAX_INSIGHTS }, (_, index) => ({
      id: `${strategy}-${index}`,
      title: `insight ${index}`,
      kind: "opportunity" as const,
      savingsMs: index,
      savingsBytes: index,
      description: "d".repeat(DESCRIPTION_CAP),
    })),
  };
}

function maxRun(): AuditRun {
  const snippet = "s".repeat(SNIPPET_MAX_CHARS);
  const urls = [
    "https://pendulumdev.co.uk/",
    ...Array.from({ length: MAX_LANDING_TAG_PAGES }, (_, index) => {
      return `https://pendulumdev.co.uk/p${index}`;
    }),
  ];
  return {
    version: 1,
    tool: "@pendulumdev/analytics",
    generatedAt: "2026-01-28T00:00:00.000Z",
    project: "Pendulum",
    standard: "Pendulum_Analytics_v1",
    baseUrl: "https://pendulumdev.co.uk",
    score: {
      automatedReadiness: 0,
      worstPageScore: 0,
      band: "Good",
      burden: { critical: 0, serious: 0, moderate: 0, minor: 0, uniqueRules: 0 },
      manual: { total: 0, completed: 0, percent: 0 },
    },
    pages: [],
    findings: [],
    timing: {
      totalMs: 1,
      browserLaunchMs: 0,
      crawlMs: 0,
      analyzeMs: 0,
      postProcessMs: 1,
      urlCount: 0,
      navigationCount: 0,
      pageConcurrency: 1,
      pages: [],
    },
    analytics: {
      range: { start: "2026-01-01", end: "2026-01-28" },
      ga4: {
        propertyId: "1",
        daily: [{ date: "2026-01-01", sessions: 1, totalUsers: 1, engagedSessions: 1 }],
        organicDaily: [{ date: "2026-01-01", sessions: 1 }],
        newReturningDaily: [{ date: "2026-01-01", newUsers: 1, returningUsers: 1 }],
        channels: Array.from({ length: 8 }, (_, index) => ({
          name: `c${index}`,
          sessions: 1,
        })),
        devices: Array.from({ length: 10 }, (_, index) => ({
          name: `d${index}`,
          sessions: 1,
        })),
        landingPages: Array.from({ length: LANDING_CAP }, (_, index) => ({
          path: `/p${index}`,
          sessions: 1,
          engagementRate: 0.5,
          activeUsers: 1,
          newUsers: 1,
          engagedSessions: 1,
          userEngagementDuration: 1,
          averageSessionDuration: 1,
          screenPageViews: 1,
          keyEvents: 0,
          sessionKeyEventRate: 0,
        })),
        totals: { sessions: LANDING_CAP, totalUsers: LANDING_CAP, engagedSessions: 1 },
        landingSourceRows: 10_000,
      },
      gsc: {
        siteUrl: "sc-domain:pendulumdev.co.uk",
        daily: [{ date: "2026-01-01", clicks: 1, impressions: 2, ctr: 0.5, position: 3 }],
        topQueries: Array.from({ length: GSC_TOP_LIMIT }, (_, index) => ({
          query: `q${index}`,
          clicks: 1,
          impressions: 2,
          ctr: 0.5,
          position: 4,
        })),
        topPages: Array.from({ length: GSC_TOP_LIMIT }, (_, index) => ({
          page: `https://pendulumdev.co.uk/p${index}`,
          clicks: 1,
          impressions: 2,
          ctr: 0.5,
          position: 3,
        })),
        totals: { clicks: GSC_TOP_LIMIT, impressions: 2, ctr: 0.5, position: 3 },
      },
      googleSetup: {
        urls,
        snippets: urls.map((url, index) => ({
          kind: "gtag" as const,
          location: "head" as const,
          text: snippet,
          fingerprint: `fp${index}`,
          destinations: [{ family: "ga4" as const, id: "G-TEST" }],
          pages: [url],
        })),
        collisions: [],
      },
      events: {
        configured: [],
        received: Array.from({ length: EVENT_LIMIT }, (_, index) => ({
          name: `event_${index}`,
          count: index + 1,
        })),
        observed: Array.from({ length: MAX_OBSERVE_URLS }, (_, index) => ({
          name: `observed_${index}`,
          count: 1,
        })),
      },
      crux: { origin: "https://pendulumdev.co.uk", reason: "not-found" },
      psi: {
        pages: [
          page("https://pendulumdev.co.uk/", "mobile"),
          page("https://pendulumdev.co.uk/", "desktop"),
        ],
      },
      rivals: [
        {
          host: "https://example.com",
          crux: { origin: "https://example.com", lcpMs: 1000 },
          psi: {
            pages: [
              page("https://example.com/", "mobile"),
              page("https://example.com/", "desktop"),
            ],
          },
        },
      ],
      insights: [
        {
          id: "one",
          response: "action",
          title: "t",
          detail: "d",
          remediation: { engineer: "e", client: "c" },
        },
      ],
    },
  };
}

describe("analytics cap memory", () => {
  it("stores a full cap bundle without a JSON document under the heap ceiling", async () => {
    const before = process.memoryUsage().heapUsed;
    const run = maxRun();
    const mem = memorySql();
    await insertAnalyticsRows(mem.sql, "run-max", run);
    const delta = process.memoryUsage().heapUsed - before;
    const sql = mem.texts.join("\n");
    assert.equal(mem.rows("analytics_ga4_landing_pages").length, LANDING_CAP);
    assert.equal(mem.rows("analytics_gsc_queries").length, GSC_TOP_LIMIT);
    assert.equal(mem.rows("analytics_gsc_pages").length, GSC_TOP_LIMIT);
    assert.equal(
      mem.rows("analytics_events").filter((row) => row.kind === "received").length,
      EVENT_LIMIT,
    );
    assert.equal(
      mem.rows("analytics_events").filter((row) => row.kind === "observed").length,
      MAX_OBSERVE_URLS,
    );
    assert.equal(mem.rows("analytics_tag_snippets").length, MAX_LANDING_TAG_PAGES + 1);
    assert.equal(
      String(mem.rows("analytics_tag_snippets")[0]?.body).length,
      SNIPPET_MAX_CHARS,
    );
    assert.equal(mem.rows("analytics_psi_pages").length, 4);
    assert.equal(mem.rows("analytics_psi_insights").length, PSI_MAX_INSIGHTS * 4);
    assert.equal(mem.rows("analytics_rivals").length, 1);
    assert.equal(sql.includes("audit_run_sections"), false);
    assert.equal(sql.includes("::jsonb"), false);
    assert.ok(
      delta < HEAP_CEILING_BYTES,
      `heap delta ${delta} exceeds ${HEAP_CEILING_BYTES}`,
    );
  });
});
