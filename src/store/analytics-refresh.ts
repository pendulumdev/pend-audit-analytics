import type {
  AnalyticsError,
  AnalyticsInsight,
  CruxOriginBundle,
  Ga4AnalyticsBundle,
  GoogleSetupBundle,
  GscAnalyticsBundle,
  PsiPageRow,
  RivalOriginObservation,
} from "../types.js";
import {
  insertAnalyticsErrors,
  insertConfiguredEvents,
  insertCrux,
  insertGa4Tables,
  insertGoogleSetup,
  insertGscTables,
  insertInsightRows,
  insertObservedEvents,
  insertPsi,
  insertReceivedEvents,
  insertRival,
  originOf,
} from "./analytics-rows.js";
import type { CrawlSql } from "./crawl-db.js";

type ErrorSource = AnalyticsError["source"];

async function withTransaction(sql: CrawlSql, write: () => Promise<void>): Promise<void> {
  await sql.query("BEGIN");
  try {
    await write();
    await sql.query("COMMIT");
  } catch (err) {
    await sql.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

function num(value: number | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function replaceErrors(
  sql: CrawlSql,
  runId: string,
  source: ErrorSource,
  errors: readonly AnalyticsError[],
): Promise<void> {
  await sql.query(`DELETE FROM engine_analytics_errors WHERE run_id = $1 AND source = $2`, [
    runId,
    source,
  ]);
  const mine = errors.filter((row) => row.source === source);
  if (mine.length === 0) return;
  const found = await sql.query<{ max_ordinal: number | string }>(
    `SELECT COALESCE(MAX(ordinal), -1) AS max_ordinal FROM engine_analytics_errors WHERE run_id = $1`,
    [runId],
  );
  const max = Number(found.rows[0]?.max_ordinal ?? -1);
  const start = Number.isFinite(max) ? max + 1 : 0;
  await insertAnalyticsErrors(sql, runId, mine, start);
}

async function deleteRunTables(
  sql: CrawlSql,
  runId: string,
  tables: readonly string[],
): Promise<void> {
  for (const table of tables) {
    await sql.query(`DELETE FROM ${table} WHERE run_id = $1`, [runId]);
  }
}

const GA4_TABLES = [
  "engine_analytics_ga4_daily",
  "engine_analytics_ga4_organic_daily",
  "engine_analytics_ga4_new_returning",
  "engine_analytics_ga4_channels",
  "engine_analytics_ga4_devices",
  "engine_analytics_ga4_landing_pages",
] as const;

const GSC_TABLES = [
  "engine_analytics_gsc_daily",
  "engine_analytics_gsc_queries",
  "engine_analytics_gsc_pages",
] as const;

const TAG_TABLES = [
  "engine_analytics_tag_destinations",
  "engine_analytics_tag_snippet_pages",
  "engine_analytics_tag_snippets",
  "engine_analytics_tag_fetches",
  "engine_analytics_gtm_tag_counts",
  "engine_analytics_gtm_destinations",
  "engine_analytics_gtm_containers",
  "engine_analytics_tag_collision_urls",
  "engine_analytics_tag_collisions",
] as const;

/** Replace GA4 rows for this run. Does not delete `engine_analytics_runs`. */
export async function refreshGa4Bundle(
  sql: CrawlSql,
  runId: string,
  ga4: Ga4AnalyticsBundle,
  errors: readonly AnalyticsError[] = [],
): Promise<void> {
  const newUsers = ga4.newReturningDaily.reduce(
    (sum, row) => sum + (row.newUsers || 0),
    0,
  );
  const returningUsers = ga4.newReturningDaily.reduce(
    (sum, row) => sum + (row.returningUsers || 0),
    0,
  );
  await withTransaction(sql, async () => {
    await deleteRunTables(sql, runId, GA4_TABLES);
    await sql.query(
      `UPDATE engine_analytics_runs SET
         ga4_property_id = $2,
         sessions = $3,
         total_users = $4,
         engaged_sessions = $5,
         previous_sessions = $6,
         previous_total_users = $7,
         previous_engaged_sessions = $8,
         new_users = $9,
         returning_users = $10,
         previous_new_users = $11,
         previous_returning_users = $12,
         landing_source_rows = $13
       WHERE run_id = $1`,
      [
        runId,
        ga4.propertyId,
        num(ga4.totals.sessions),
        num(ga4.totals.totalUsers),
        num(ga4.totals.engagedSessions),
        num(ga4.previousTotals?.sessions),
        num(ga4.previousTotals?.totalUsers),
        num(ga4.previousTotals?.engagedSessions),
        newUsers,
        returningUsers,
        num(ga4.previousNewUsers),
        num(ga4.previousReturningUsers),
        ga4.landingSourceRows ?? 0,
      ],
    );
    await insertGa4Tables(sql, runId, ga4);
    await replaceErrors(sql, runId, "ga4", errors);
  });
}

/** Replace received events only. Configured and observed rows stay. */
export async function refreshGa4EventCounts(
  sql: CrawlSql,
  runId: string,
  received: ReadonlyArray<{ name: string; count: number }>,
  errors: readonly AnalyticsError[] = [],
): Promise<void> {
  await withTransaction(sql, async () => {
    await sql.query(`DELETE FROM engine_analytics_events WHERE run_id = $1 AND kind = $2`, [
      runId,
      "received",
    ]);
    await insertReceivedEvents(sql, runId, received);
    await replaceErrors(sql, runId, "ga4", errors);
  });
}

/** Replace Search Console rows for this run. GA4 rows stay. */
export async function refreshGscBundle(
  sql: CrawlSql,
  runId: string,
  gsc: GscAnalyticsBundle,
  errors: readonly AnalyticsError[] = [],
): Promise<void> {
  await withTransaction(sql, async () => {
    await deleteRunTables(sql, runId, GSC_TABLES);
    await sql.query(
      `UPDATE engine_analytics_runs SET
         gsc_site_url = $2,
         gsc_clicks = $3,
         gsc_impressions = $4,
         gsc_ctr = $5,
         gsc_position = $6,
         previous_gsc_clicks = $7,
         previous_gsc_impressions = $8,
         previous_gsc_ctr = $9,
         previous_gsc_position = $10
       WHERE run_id = $1`,
      [
        runId,
        gsc.siteUrl,
        num(gsc.totals.clicks),
        num(gsc.totals.impressions),
        num(gsc.totals.ctr),
        num(gsc.totals.position),
        num(gsc.previousTotals?.clicks),
        num(gsc.previousTotals?.impressions),
        num(gsc.previousTotals?.ctr),
        num(gsc.previousTotals?.position),
      ],
    );
    await insertGscTables(sql, runId, gsc);
    await replaceErrors(sql, runId, "gsc", errors);
  });
}

/**
 * Replace the tag scan and configured events.
 * Snippet destinations and pages, and collision URLs, are deleted with their parents.
 */
export async function refreshGoogleSetup(
  sql: CrawlSql,
  runId: string,
  setup: GoogleSetupBundle,
  configured: ReadonlyArray<{ name: string; source: "html" | "gtm"; trigger?: string }>,
  errors: readonly AnalyticsError[] = [],
): Promise<void> {
  await withTransaction(sql, async () => {
    await deleteRunTables(sql, runId, TAG_TABLES);
    await sql.query(`DELETE FROM engine_analytics_events WHERE run_id = $1 AND kind = $2`, [
      runId,
      "configured",
    ]);
    await insertGoogleSetup(sql, runId, setup);
    await insertConfiguredEvents(sql, runId, configured);
    await replaceErrors(sql, runId, "tags", errors);
  });
}

/** Replace observed events only. */
export async function refreshObservedEvents(
  sql: CrawlSql,
  runId: string,
  observed: ReadonlyArray<{ name: string; count: number }>,
  errors: readonly AnalyticsError[] = [],
): Promise<void> {
  await withTransaction(sql, async () => {
    await sql.query(`DELETE FROM engine_analytics_events WHERE run_id = $1 AND kind = $2`, [
      runId,
      "observed",
    ]);
    await insertObservedEvents(sql, runId, observed);
    await replaceErrors(sql, runId, "observe", errors);
  });
}

/** Replace the site host CrUX row. Rival hosts stay. */
export async function refreshCruxOrigin(
  sql: CrawlSql,
  runId: string,
  crux: CruxOriginBundle,
  errors: readonly AnalyticsError[] = [],
): Promise<void> {
  const host = crux.origin;
  await withTransaction(sql, async () => {
    await sql.query(`DELETE FROM engine_analytics_crux WHERE run_id = $1 AND host = $2`, [
      runId,
      host,
    ]);
    await insertCrux(sql, runId, host, crux);
    await replaceErrors(sql, runId, "crux", errors);
  });
}

/** Replace one site PageSpeed strategy. Other strategies and rival hosts stay. */
export async function refreshPsiPage(
  sql: CrawlSql,
  runId: string,
  page: PsiPageRow,
  errors: readonly AnalyticsError[] = [],
): Promise<void> {
  await refreshPsiPages(sql, runId, [page], errors);
}

/** Replace the site PageSpeed strategies included in `pages`. */
export async function refreshPsiPages(
  sql: CrawlSql,
  runId: string,
  pages: readonly PsiPageRow[],
  errors: readonly AnalyticsError[] = [],
): Promise<void> {
  const groups = new Map<string, Set<string>>();
  for (const page of pages) {
    const host = originOf(page.url) ?? page.url;
    const strategy = page.strategy ?? "mobile";
    const set = groups.get(host) ?? new Set<string>();
    set.add(strategy);
    groups.set(host, set);
  }
  await withTransaction(sql, async () => {
    for (const [host, strategies] of groups) {
      const list = [...strategies];
      await sql.query(
        `DELETE FROM engine_analytics_psi_metrics WHERE run_id = $1 AND host = $2 AND strategy = ANY($3::text[])`,
        [runId, host, list],
      );
      await sql.query(
        `DELETE FROM engine_analytics_psi_insights WHERE run_id = $1 AND host = $2 AND strategy = ANY($3::text[])`,
        [runId, host, list],
      );
      await sql.query(
        `DELETE FROM engine_analytics_psi_pages WHERE run_id = $1 AND host = $2 AND strategy = ANY($3::text[])`,
        [runId, host, list],
      );
    }
    for (const page of pages) {
      await insertPsi(sql, runId, originOf(page.url) ?? page.url, page);
    }
    await replaceErrors(sql, runId, "psi", errors);
  });
}

const RIVAL_HOSTS = `host IN (SELECT host FROM engine_analytics_rivals WHERE run_id = $1)`;

/** Replace named rivals and their CrUX and PageSpeed rows. The site host stays. */
export async function refreshNamedRivals(
  sql: CrawlSql,
  runId: string,
  rivals: readonly RivalOriginObservation[],
  errors: readonly AnalyticsError[] = [],
): Promise<void> {
  await withTransaction(sql, async () => {
    await sql.query(`DELETE FROM engine_analytics_crux WHERE run_id = $1 AND ${RIVAL_HOSTS}`, [
      runId,
    ]);
    await sql.query(
      `DELETE FROM engine_analytics_psi_metrics WHERE run_id = $1 AND ${RIVAL_HOSTS}`,
      [runId],
    );
    await sql.query(
      `DELETE FROM engine_analytics_psi_insights WHERE run_id = $1 AND ${RIVAL_HOSTS}`,
      [runId],
    );
    await sql.query(
      `DELETE FROM engine_analytics_psi_pages WHERE run_id = $1 AND ${RIVAL_HOSTS}`,
      [runId],
    );
    await sql.query(`DELETE FROM engine_analytics_rivals WHERE run_id = $1`, [runId]);
    for (const rival of rivals) await insertRival(sql, runId, rival);
    await replaceErrors(sql, runId, "rival", errors);
  });
}

/** Replace insight cards only. */
export async function refreshAnalyticsInsights(
  sql: CrawlSql,
  runId: string,
  insights: readonly AnalyticsInsight[],
): Promise<void> {
  await withTransaction(sql, async () => {
    await sql.query(`DELETE FROM engine_analytics_insights WHERE run_id = $1`, [runId]);
    await insertInsightRows(sql, runId, insights);
  });
}
