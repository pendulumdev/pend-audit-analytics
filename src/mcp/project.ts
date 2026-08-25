import type { AuditRun } from "../types.js";

export type AnalyticsSources = {
  gsc: boolean;
  ga4: boolean;
  tags: boolean;
  crux: boolean;
  psi: boolean;
};

export type RunSummary = {
  tool: string;
  project: string;
  sources: AnalyticsSources;
  insightCount: number;
  errorCount: number;
  insightIds: string[];
  score: { automatedReadiness: number; band: string };
};

export function summarizeRun(run: AuditRun): RunSummary {
  const analytics = run.analytics;
  return {
    tool: run.tool,
    project: run.project,
    sources: {
      gsc: Boolean(analytics.gsc),
      ga4: Boolean(analytics.ga4),
      tags: Boolean(analytics.googleSetup),
      crux: Boolean(analytics.crux),
      psi: Boolean(analytics.psi),
    },
    insightCount: analytics.insights.length,
    errorCount: analytics.errors?.length ?? 0,
    insightIds: analytics.insights.map((i) => i.id),
    score: {
      automatedReadiness: run.score.automatedReadiness,
      band: run.score.band,
    },
  };
}
