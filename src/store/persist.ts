import type { AuditRun } from "../types.js";
import { setPagesExpected, withCrawlStore, writeCrawlSections } from "./crawl-db.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function storeAnalyticsRun(
  argv: readonly string[],
  run: AuditRun,
): Promise<boolean> {
  return withCrawlStore(argv, async (sql, runId) => {
    await setPagesExpected(sql, runId, 0);
    await writeCrawlSections(sql, runId, [
      { section: "analytics", payload: asRecord(run.analytics) },
      { section: "score", payload: asRecord(run.score) },
      { section: "timing", payload: asRecord(run.timing ?? {}) },
      {
        section: "closure",
        payload: { version: run.version, tool: run.tool, pageCount: 0 },
      },
    ]);
  });
}
