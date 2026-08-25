import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAnalyticsConfig, runAnalyticsPull } from "../../src/analytics/runner.js";
import type {
  AnalyticsBundle,
  AnalyticsConfig,
  AnalyticsEngineConfig,
} from "../../src/types.js";

function baseConfig(analytics: AnalyticsConfig): AnalyticsEngineConfig {
  return {
    project: "t",
    standard: "Pendulum_Analytics_v1",
    baseUrl: "https://example.com",
    outDir: "analytics-out",
    analytics,
  };
}

describe("resolveAnalyticsConfig", () => {
  it("force-enables analytics when a source is present", () => {
    const resolved = resolveAnalyticsConfig(
      baseConfig({
        enabled: false,
        rangeDays: 28,
        comparePrevious: true,
        searchConsole: { siteUrl: "sc-domain:example.com" },
      }),
    );
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.searchConsole?.siteUrl, "sc-domain:example.com");
  });

  it("rejects when no provider sources are configured", () => {
    assert.throws(
      () =>
        resolveAnalyticsConfig(
          baseConfig({
            enabled: false,
            rangeDays: 28,
            comparePrevious: true,
          }),
        ),
      /analytics\.searchConsole/,
    );
  });
});

describe("runAnalyticsPull", () => {
  it("builds an unscored run with analytics and empty pages/findings", async () => {
    const bundle: AnalyticsBundle = {
      range: { start: "2026-01-01", end: "2026-01-28" },
      insights: [],
      errors: [{ source: "auth", message: "credentials missing" }],
    };

    const run = await runAnalyticsPull(
      baseConfig({
        enabled: false,
        rangeDays: 28,
        comparePrevious: true,
        searchConsole: { siteUrl: "sc-domain:example.com" },
      }),
      {
        fetchBundle: async (opts) => {
          assert.equal(opts.config.enabled, true);
          assert.equal(opts.baseUrl, "https://example.com");
          return bundle;
        },
      },
    );

    assert.equal(run.tool, "@pendulumdev/analytics");
    assert.equal(run.standard, "Pendulum_Analytics_v1");
    assert.equal(run.catalogVersion, 0);
    assert.equal(run.pages.length, 0);
    assert.equal(run.findings.length, 0);
    assert.equal(run.score.automatedReadiness, 0);
    assert.equal(run.score.band, "Critical gaps");
    assert.deepEqual(run.analytics, bundle);
    assert.equal(run.timing?.browserLaunchMs, 0);
    assert.equal(run.timing?.crawlMs, 0);
  });

  it("soft-fails when fetch returns auth errors (still returns a run)", async () => {
    const run = await runAnalyticsPull(
      baseConfig({
        enabled: true,
        rangeDays: 28,
        comparePrevious: true,
        ga4: { propertyId: "123456789" },
      }),
      {
        fetchBundle: async () => ({
          range: { start: "2026-01-01", end: "2026-01-28" },
          insights: [],
          errors: [{ source: "auth", message: "no credentials" }],
        }),
      },
    );
    assert.equal(run.analytics?.errors?.[0]?.source, "auth");
  });
});
