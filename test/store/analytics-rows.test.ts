import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { insertAnalyticsRows } from "../../src/store/analytics-rows.js";
import type { CrawlSql } from "../../src/store/crawl-db.js";
import type { AuditRun } from "../../src/types.js";

function fakeSql() {
  const texts: string[] = [];
  const values: unknown[][] = [];
  const sql: CrawlSql = {
    async query(text, params) {
      texts.push(text);
      values.push(params ?? []);
      return { rows: [], rowCount: 0 };
    },
  };
  return { sql, texts, values };
}

describe("insertAnalyticsRows", () => {
  it("replaces the run and does not write a section payload", async () => {
    const { sql, texts, values } = fakeSql();
    const run = {
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
        range: { start: "2026-01-01", end: "2026-01-28", previousStart: "2025-12-04", previousEnd: "2025-12-31" },
        ga4: {
          propertyId: "530055925",
          daily: [{ date: "2026-01-01", sessions: 2, totalUsers: 2, engagedSessions: 1 }],
          landingPages: [{ path: "/", sessions: 2, engagementRate: 0.5, activeUsers: 2, newUsers: 1, engagedSessions: 1, userEngagementDuration: 10, averageSessionDuration: 8, screenPageViews: 3, keyEvents: 0, sessionKeyEventRate: 0 }],
          organicDaily: [],
          channels: [{ name: "Organic Search", sessions: 2 }],
          devices: [],
          newReturningDaily: [{ date: "2026-01-01", newUsers: 1, returningUsers: 1 }],
          totals: { sessions: 2, totalUsers: 2, engagedSessions: 1 },
          previousTotals: { sessions: 1, totalUsers: 1, engagedSessions: 0 },
          landingSourceRows: 12,
          previousNewUsers: 1,
          previousReturningUsers: 0,
        },
        gsc: {
          siteUrl: "sc-domain:pendulumdev.co.uk",
          daily: [],
          topPages: [{ page: "https://pendulumdev.co.uk/", clicks: 1, impressions: 2, ctr: 0.5, position: 3 }],
          topQueries: [{ query: "pendulum", clicks: 1, impressions: 2, ctr: 0.5, position: 4 }],
          totals: { clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
        },
        insights: [],
      },
    } as AuditRun;
    await insertAnalyticsRows(sql, "run-1", run);
    assert.match(texts[0] ?? "", /BEGIN/);
    assert.match(texts[1] ?? "", /DELETE FROM analytics_runs/);
    assert.match(texts.join("\n"), /INSERT INTO analytics_ga4_landing_pages/);
    assert.match(texts.join("\n"), /INSERT INTO analytics_gsc_queries/);
    assert.equal(texts.some((text) => text.includes("audit_run_sections")), false);
    assert.match(texts.at(-1) ?? "", /COMMIT/);
    const header = values[texts.findIndex((text) => text.includes("INSERT INTO analytics_runs"))];
    assert.equal(header?.[29], 1);
    const landing = values[texts.findIndex((text) => text.includes("INSERT INTO analytics_ga4_landing_pages"))];
    assert.ok(Array.isArray(landing));
    assert.equal(
      landing.some((column) => Array.isArray(column) && column.includes(10)),
      true,
    );
    assert.equal(
      landing.some((column) => Array.isArray(column) && column.includes(8)),
      true,
    );
  });
});
