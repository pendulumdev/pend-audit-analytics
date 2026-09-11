import { dirname, resolve } from "node:path";
import { unscoredSummary } from "../score.js";
import type { AnalyticsConfig, AnalyticsEngineConfig, AuditRun } from "../types.js";
import { fetchAnalyticsBundle } from "./fetch.js";

export type FetchAnalyticsBundleFn = typeof fetchAnalyticsBundle;

export interface RunAnalyticsPullOptions {
  /** Override for tests. */
  fetchBundle?: FetchAnalyticsBundleFn;
  /** JSON --out path; PSI shots land in dirname(--out)/psi-shots/. */
  outPath?: string;
}

/**
 * Analytics-only pull: GSC/GA4 into `run.analytics` with no Playwright crawl.
 * Soft-fails provider/auth errors into `analytics.errors[]` (caller exits 0).
 */
export async function runAnalyticsPull(
  config: AnalyticsEngineConfig,
  opts: RunAnalyticsPullOptions = {},
): Promise<AuditRun> {
  const totalStarted = Date.now();
  const analyticsConfig = resolveAnalyticsConfig(config);
  const fetchBundle = opts.fetchBundle ?? fetchAnalyticsBundle;
  const shotDir = opts.outPath ? dirname(resolve(opts.outPath)) : undefined;

  console.error("fetching Search Console / GA4 analytics...");
  const postStarted = Date.now();
  const analytics = await fetchBundle({
    config: analyticsConfig,
    ...(config.baseUrl !== undefined && { baseUrl: config.baseUrl }),
    ...(shotDir !== undefined && { outDir: shotDir }),
  });
  const postProcessMs = Date.now() - postStarted;

  if (analytics?.errors?.length) {
    for (const e of analytics.errors) {
      console.error(`analytics ${e.source}: ${e.message}`);
    }
  }

  if (!analytics) {
    throw new Error(
      "analytics pull produced no bundle - check [analytics.searchConsole] and/or [analytics.ga4]",
    );
  }

  const totalMs = Date.now() - totalStarted;
  console.error(
    `[timing] total=${(totalMs / 1000).toFixed(1)}s analytics=${(postProcessMs / 1000).toFixed(1)}s`,
  );

  return {
    version: 1,
    tool: "@pendulumdev/analytics",
    generatedAt: new Date().toISOString(),
    project: config.project,
    standard: config.standard,
    ...(config.baseUrl !== undefined && { baseUrl: config.baseUrl }),
    score: unscoredSummary(),
    pages: [],
    findings: [],
    analytics,
    timing: {
      totalMs,
      browserLaunchMs: 0,
      crawlMs: 0,
      analyzeMs: 0,
      postProcessMs,
      urlCount: 0,
      navigationCount: 0,
      pageConcurrency: 1,
      pages: [],
    },
  };
}

/** Force-enable analytics; require at least one provider source. */
export function resolveAnalyticsConfig(config: AnalyticsEngineConfig): AnalyticsConfig {
  const base = config.analytics;
  if (!base?.searchConsole && !base?.ga4) {
    throw new Error(
      "analytics requires [analytics.searchConsole] and/or [analytics.ga4]",
    );
  }
  return { ...base, enabled: true };
}
