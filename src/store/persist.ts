import type { AuditRun } from "../types.js";
import { insertAnalyticsRows } from "./analytics-rows.js";
import { setPagesExpected, withCrawlStore } from "./crawl-db.js";

export async function storeAnalyticsRun(
  argv: readonly string[],
  run: AuditRun,
): Promise<void> {
  await withCrawlStore(argv, async (sql, runId) => {
    await setPagesExpected(sql, runId, 0);
    await insertAnalyticsRows(sql, runId, run);
  });
}
