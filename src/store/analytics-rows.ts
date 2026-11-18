import type {
  AnalyticsError,
  AnalyticsInsight,
  AuditRun,
  Ga4AnalyticsBundle,
  GoogleSetupBundle,
  GscAnalyticsBundle,
  RivalOriginObservation,
} from "../types.js";
import type { CrawlSql } from "./crawl-db.js";

const CHUNK = 100;

function n(value: number | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function day(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/** Write `rows` in chunks, then drop them so the next table is not kept as well. */
async function chunks<T>(
  rows: readonly T[],
  write: (slice: readonly T[], offset: number) => Promise<void>,
): Promise<void> {
  const list = rows as T[];
  let offset = 0;
  while (list.length > 0) {
    const slice = list.splice(0, CHUNK);
    await write(slice, offset);
    offset += slice.length;
    slice.length = 0;
  }
}

export async function insertAnalyticsRows(
  sql: CrawlSql,
  runId: string,
  run: AuditRun,
): Promise<void> {
  await sql.query("BEGIN");
  try {
    await sql.query(`DELETE FROM analytics_runs WHERE run_id = $1`, [runId]);
    await insertHeader(sql, runId, run);
    await insertChildren(sql, runId, run);
    await sql.query("COMMIT");
  } catch (err) {
    await sql.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

async function insertHeader(sql: CrawlSql, runId: string, run: AuditRun): Promise<void> {
  const bundle = run.analytics;
  const ga4 = bundle.ga4;
  const gsc = bundle.gsc;
  const timing = run.timing;
  const newUsers = ga4
    ? ga4.newReturningDaily.reduce((sum, row) => sum + (row.newUsers || 0), 0)
    : null;
  const returningUsers = ga4
    ? ga4.newReturningDaily.reduce((sum, row) => sum + (row.returningUsers || 0), 0)
    : null;
  await sql.query(
    `INSERT INTO analytics_runs (
       run_id, range_start, range_end, previous_start, previous_end,
       ga4_property_id, gsc_site_url,
       sessions, total_users, engaged_sessions,
       previous_sessions, previous_total_users, previous_engaged_sessions,
       gsc_clicks, gsc_impressions, gsc_ctr, gsc_position,
       previous_gsc_clicks, previous_gsc_impressions, previous_gsc_ctr, previous_gsc_position,
       new_users, returning_users, previous_new_users, previous_returning_users,
       landing_source_rows, generated_at, tool, standard,
       total_ms, browser_launch_ms, crawl_ms, analyze_ms, post_process_ms,
       url_count, navigation_count, page_concurrency
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
       $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
     )`,
    [
      runId,
      day(bundle.range.start),
      day(bundle.range.end),
      day(bundle.range.previousStart),
      day(bundle.range.previousEnd),
      ga4?.propertyId ?? null,
      gsc?.siteUrl ?? null,
      n(ga4?.totals.sessions),
      n(ga4?.totals.totalUsers),
      n(ga4?.totals.engagedSessions),
      n(ga4?.previousTotals?.sessions),
      n(ga4?.previousTotals?.totalUsers),
      n(ga4?.previousTotals?.engagedSessions),
      n(gsc?.totals.clicks),
      n(gsc?.totals.impressions),
      n(gsc?.totals.ctr),
      n(gsc?.totals.position),
      n(gsc?.previousTotals?.clicks),
      n(gsc?.previousTotals?.impressions),
      n(gsc?.previousTotals?.ctr),
      n(gsc?.previousTotals?.position),
      newUsers,
      returningUsers,
      n(ga4?.previousNewUsers),
      n(ga4?.previousReturningUsers),
      ga4?.landingSourceRows ?? 0,
      run.generatedAt,
      run.tool,
      run.standard,
      timing?.totalMs ?? 0,
      timing?.browserLaunchMs ?? 0,
      timing?.crawlMs ?? 0,
      timing?.analyzeMs ?? 0,
      timing?.postProcessMs ?? 0,
      timing?.urlCount ?? 0,
      timing?.navigationCount ?? 0,
      timing?.pageConcurrency ?? 1,
    ],
  );
}

async function insertChildren(
  sql: CrawlSql,
  runId: string,
  run: AuditRun,
): Promise<void> {
  const bundle = run.analytics;
  const siteHost = originOf(run.baseUrl) ?? originOf(bundle.crux?.origin) ?? "site";

  if (bundle.ga4) await insertGa4Tables(sql, runId, bundle.ga4);
  if (bundle.gsc) await insertGscTables(sql, runId, bundle.gsc);
  if (bundle.googleSetup) await insertGoogleSetup(sql, runId, bundle.googleSetup);
  if (bundle.events) {
    await insertConfiguredEvents(sql, runId, bundle.events.configured);
    await insertReceivedEvents(sql, runId, bundle.events.received);
    await insertObservedEvents(sql, runId, bundle.events.observed ?? []);
  }
  if (bundle.crux) {
    await insertCrux(sql, runId, bundle.crux.origin || siteHost, bundle.crux);
  }
  for (const page of bundle.psi?.pages ?? []) {
    await insertPsi(sql, runId, originOf(page.url) ?? siteHost, page);
  }
  for (const rival of bundle.rivals ?? []) {
    await insertRival(sql, runId, rival);
  }
  await insertInsightRows(sql, runId, bundle.insights);
  await insertAnalyticsErrors(sql, runId, bundle.errors ?? []);
}

export async function insertGa4Tables(
  sql: CrawlSql,
  runId: string,
  ga4: Ga4AnalyticsBundle,
): Promise<void> {
  await chunks(ga4.daily, async (rows) => {
    await sql.query(
      `INSERT INTO analytics_ga4_daily (run_id, day, sessions, total_users, engaged_sessions)
         SELECT $1, u.day::date, u.sessions, u.total_users, u.engaged_sessions
         FROM unnest($2::date[], $3::float8[], $4::float8[], $5::float8[])
           AS u(day, sessions, total_users, engaged_sessions)`,
      [
        runId,
        rows.map((row) => row.date),
        rows.map((row) => row.sessions),
        rows.map((row) => row.totalUsers),
        rows.map((row) => row.engagedSessions),
      ],
    );
  });
  await chunks(ga4.organicDaily, async (rows) => {
    await sql.query(
      `INSERT INTO analytics_ga4_organic_daily (run_id, day, sessions)
         SELECT $1, u.day::date, u.sessions
         FROM unnest($2::date[], $3::float8[]) AS u(day, sessions)`,
      [runId, rows.map((row) => row.date), rows.map((row) => row.sessions)],
    );
  });
  await chunks(ga4.newReturningDaily, async (rows) => {
    await sql.query(
      `INSERT INTO analytics_ga4_new_returning (run_id, day, new_users, returning_users)
         SELECT $1, u.day::date, u.new_users, u.returning_users
         FROM unnest($2::date[], $3::float8[], $4::float8[])
           AS u(day, new_users, returning_users)`,
      [
        runId,
        rows.map((row) => row.date),
        rows.map((row) => row.newUsers),
        rows.map((row) => row.returningUsers),
      ],
    );
  });
  await chunks(ga4.channels, async (rows, offset) => {
    const base = offset;
    await sql.query(
      `INSERT INTO analytics_ga4_channels (run_id, ordinal, name, sessions)
         SELECT $1, u.ordinal, u.name, u.sessions
         FROM unnest($2::int[], $3::text[], $4::float8[]) AS u(ordinal, name, sessions)`,
      [
        runId,
        rows.map((_, index) => base + index),
        rows.map((row) => row.name),
        rows.map((row) => row.sessions),
      ],
    );
  });
  await chunks(ga4.devices, async (rows, offset) => {
    const base = offset;
    await sql.query(
      `INSERT INTO analytics_ga4_devices (run_id, ordinal, name, sessions)
         SELECT $1, u.ordinal, u.name, u.sessions
         FROM unnest($2::int[], $3::text[], $4::float8[]) AS u(ordinal, name, sessions)`,
      [
        runId,
        rows.map((_, index) => base + index),
        rows.map((row) => row.name),
        rows.map((row) => row.sessions),
      ],
    );
  });
  await chunks(ga4.landingPages, async (rows, offset) => {
    const base = offset;
    await sql.query(
      `INSERT INTO analytics_ga4_landing_pages (
           run_id, ordinal, path, sessions, active_users, new_users, engaged_sessions,
           engagement_rate, user_engagement_duration, average_session_duration,
           screen_page_views, key_events, session_key_event_rate
         )
         SELECT $1, u.ordinal, u.path, u.sessions, u.active_users, u.new_users,
           u.engaged_sessions, u.engagement_rate, u.user_engagement_duration,
           u.average_session_duration, u.screen_page_views, u.key_events,
           u.session_key_event_rate
         FROM unnest(
           $2::int[], $3::text[], $4::float8[], $5::float8[], $6::float8[], $7::float8[],
           $8::float8[], $9::float8[], $10::float8[], $11::float8[], $12::float8[], $13::float8[]
         ) AS u(
           ordinal, path, sessions, active_users, new_users, engaged_sessions,
           engagement_rate, user_engagement_duration, average_session_duration,
           screen_page_views, key_events, session_key_event_rate
         )`,
      [
        runId,
        rows.map((_, index) => base + index),
        rows.map((row) => row.path),
        rows.map((row) => row.sessions),
        rows.map((row) => row.activeUsers ?? 0),
        rows.map((row) => row.newUsers ?? 0),
        rows.map((row) => row.engagedSessions ?? 0),
        rows.map((row) => row.engagementRate),
        rows.map((row) => row.userEngagementDuration ?? 0),
        rows.map((row) => row.averageSessionDuration ?? 0),
        rows.map((row) => row.screenPageViews ?? 0),
        rows.map((row) => row.keyEvents ?? 0),
        rows.map((row) => row.sessionKeyEventRate ?? 0),
      ],
    );
  });
}

export async function insertGscTables(
  sql: CrawlSql,
  runId: string,
  gsc: GscAnalyticsBundle,
): Promise<void> {
  await chunks(gsc.daily, async (rows) => {
    await sql.query(
      `INSERT INTO analytics_gsc_daily (run_id, day, clicks, impressions, ctr, position)
         SELECT $1, u.day::date, u.clicks, u.impressions, u.ctr, u.position
         FROM unnest($2::date[], $3::float8[], $4::float8[], $5::float8[], $6::float8[])
           AS u(day, clicks, impressions, ctr, position)`,
      [
        runId,
        rows.map((row) => row.date),
        rows.map((row) => row.clicks),
        rows.map((row) => row.impressions),
        rows.map((row) => row.ctr),
        rows.map((row) => row.position),
      ],
    );
  });
  await chunks(gsc.topQueries, async (rows, offset) => {
    const base = offset;
    await sql.query(
      `INSERT INTO analytics_gsc_queries (run_id, ordinal, query, clicks, impressions, ctr, position)
         SELECT $1, u.ordinal, u.query, u.clicks, u.impressions, u.ctr, u.position
         FROM unnest($2::int[], $3::text[], $4::float8[], $5::float8[], $6::float8[], $7::float8[])
           AS u(ordinal, query, clicks, impressions, ctr, position)`,
      [
        runId,
        rows.map((_, index) => base + index),
        rows.map((row) => row.query),
        rows.map((row) => row.clicks),
        rows.map((row) => row.impressions),
        rows.map((row) => row.ctr),
        rows.map((row) => row.position),
      ],
    );
  });
  await chunks(gsc.topPages, async (rows, offset) => {
    const base = offset;
    await sql.query(
      `INSERT INTO analytics_gsc_pages (run_id, ordinal, page, clicks, impressions, ctr, position)
         SELECT $1, u.ordinal, u.page, u.clicks, u.impressions, u.ctr, u.position
         FROM unnest($2::int[], $3::text[], $4::float8[], $5::float8[], $6::float8[], $7::float8[])
           AS u(ordinal, page, clicks, impressions, ctr, position)`,
      [
        runId,
        rows.map((_, index) => base + index),
        rows.map((row) => row.page),
        rows.map((row) => row.clicks),
        rows.map((row) => row.impressions),
        rows.map((row) => row.ctr),
        rows.map((row) => row.position),
      ],
    );
  });
}

export async function insertGoogleSetup(
  sql: CrawlSql,
  runId: string,
  setup: GoogleSetupBundle,
): Promise<void> {
  await chunks(setup.urls, async (rows, offset) => {
    const base = offset;
    await sql.query(
      `INSERT INTO analytics_tag_fetches (run_id, ordinal, url)
         SELECT $1, u.ordinal, u.url FROM unnest($2::int[], $3::text[]) AS u(ordinal, url)`,
      [runId, rows.map((_, index) => base + index), rows],
    );
  });
  for (const [snippetOrdinal, snippet] of setup.snippets.entries()) {
    await sql.query(
      `INSERT INTO analytics_tag_snippets (run_id, ordinal, kind, location, fingerprint, body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        runId,
        snippetOrdinal,
        snippet.kind,
        snippet.location,
        snippet.fingerprint,
        snippet.text,
      ],
    );
    await chunks(snippet.destinations, async (rows, offset) => {
      const base = offset;
      await sql.query(
        `INSERT INTO analytics_tag_destinations
             (run_id, snippet_ordinal, ordinal, family, destination_id)
           SELECT $1, $2, u.ordinal, u.family, u.destination_id
           FROM unnest($3::int[], $4::text[], $5::text[])
             AS u(ordinal, family, destination_id)`,
        [
          runId,
          snippetOrdinal,
          rows.map((_, index) => base + index),
          rows.map((row) => row.family),
          rows.map((row) => row.id),
        ],
      );
    });
    await chunks(snippet.pages, async (rows) => {
      await sql.query(
        `INSERT INTO analytics_tag_snippet_pages (run_id, snippet_ordinal, page)
           SELECT $1, $2, u.page FROM unnest($3::text[]) AS u(page)`,
        [runId, snippetOrdinal, rows],
      );
    });
  }
  for (const container of setup.gtm ?? []) {
    await sql.query(
      `INSERT INTO analytics_gtm_containers (run_id, container_id, parse_error)
         VALUES ($1, $2, $3)`,
      [runId, container.containerId, container.parseError ?? null],
    );
    const counts = Object.entries(container.tagTypeCounts ?? {});
    await chunks(counts, async (rows) => {
      await sql.query(
        `INSERT INTO analytics_gtm_tag_counts (run_id, container_id, tag_type, count)
           SELECT $1, $2, u.tag_type, u.count
           FROM unnest($3::text[], $4::int[]) AS u(tag_type, count)`,
        [
          runId,
          container.containerId,
          rows.map((row) => row[0]),
          rows.map((row) => row[1]),
        ],
      );
    });
    await chunks(container.destinations ?? [], async (rows) => {
      await sql.query(
        `INSERT INTO analytics_gtm_destinations (run_id, container_id, destination)
           SELECT $1, $2, u.destination FROM unnest($3::text[]) AS u(destination)`,
        [runId, container.containerId, rows],
      );
    });
  }
  for (const [ordinal, collision] of setup.collisions.entries()) {
    await sql.query(
      `INSERT INTO analytics_tag_collisions (run_id, ordinal, code, severity, detail)
         VALUES ($1, $2, $3, $4, $5)`,
      [runId, ordinal, collision.code, collision.severity, collision.detail],
    );
    await chunks(collision.urls ?? [], async (rows) => {
      await sql.query(
        `INSERT INTO analytics_tag_collision_urls (run_id, collision_ordinal, url)
           SELECT $1, $2, u.url FROM unnest($3::text[]) AS u(url)`,
        [runId, ordinal, rows],
      );
    });
  }
}

export async function insertConfiguredEvents(
  sql: CrawlSql,
  runId: string,
  configured: ReadonlyArray<{ name: string; source: "html" | "gtm"; trigger?: string }>,
): Promise<void> {
  await insertEvents(sql, runId, "configured", configured, (row) => ({
    name: row.name,
    count: null,
    source: row.source,
    trigger: row.trigger ?? null,
  }));
}

export async function insertReceivedEvents(
  sql: CrawlSql,
  runId: string,
  received: ReadonlyArray<{ name: string; count: number }>,
): Promise<void> {
  await insertEvents(sql, runId, "received", received, (row) => ({
    name: row.name,
    count: row.count,
    source: null,
    trigger: null,
  }));
}

export async function insertObservedEvents(
  sql: CrawlSql,
  runId: string,
  observed: ReadonlyArray<{ name: string; count: number }>,
): Promise<void> {
  await insertEvents(sql, runId, "observed", observed, (row) => ({
    name: row.name,
    count: row.count,
    source: null,
    trigger: null,
  }));
}

export async function insertRival(
  sql: CrawlSql,
  runId: string,
  rival: RivalOriginObservation,
): Promise<void> {
  await sql.query(
    `INSERT INTO analytics_rivals (run_id, host, error) VALUES ($1, $2, $3)`,
    [runId, rival.host, rival.error ?? null],
  );
  if (rival.crux) await insertCrux(sql, runId, rival.host, rival.crux);
  for (const page of rival.psi?.pages ?? []) {
    await insertPsi(sql, runId, rival.host, page);
  }
}

export async function insertInsightRows(
  sql: CrawlSql,
  runId: string,
  insights: readonly AnalyticsInsight[],
): Promise<void> {
  await chunks(insights, async (rows, offset) => {
    const base = offset;
    await sql.query(
      `INSERT INTO analytics_insights (
         run_id, ordinal, insight_id, response, title, detail, engineer_text, client_text
       )
       SELECT $1, u.ordinal, u.insight_id, u.response, u.title, u.detail, u.engineer_text, u.client_text
       FROM unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
         AS u(ordinal, insight_id, response, title, detail, engineer_text, client_text)`,
      [
        runId,
        rows.map((_, index) => base + index),
        rows.map((row) => row.id),
        rows.map((row) => row.response),
        rows.map((row) => row.title),
        rows.map((row) => row.detail),
        rows.map((row) => row.remediation.engineer),
        rows.map((row) => row.remediation.client),
      ],
    );
  });
}

export async function insertAnalyticsErrors(
  sql: CrawlSql,
  runId: string,
  errors: readonly AnalyticsError[],
  startOrdinal = 0,
): Promise<void> {
  await chunks(errors, async (rows, offset) => {
    const base = startOrdinal + offset;
    await sql.query(
      `INSERT INTO analytics_errors (run_id, ordinal, source, host, message)
       SELECT $1, u.ordinal, u.source, u.host, u.message
       FROM unnest($2::int[], $3::text[], $4::text[], $5::text[])
         AS u(ordinal, source, host, message)`,
      [
        runId,
        rows.map((_, index) => base + index),
        rows.map((row) => row.source),
        rows.map((row) => row.host ?? ""),
        rows.map((row) => row.message),
      ],
    );
  });
}

async function insertEvents<T>(
  sql: CrawlSql,
  runId: string,
  kind: string,
  rows: readonly T[],
  mapRow: (row: T) => {
    name: string;
    count: number | null;
    source: string | null;
    trigger: string | null;
  },
): Promise<void> {
  await chunks(rows, async (slice, offset) => {
    const mapped = slice.map(mapRow);
    await sql.query(
      `INSERT INTO analytics_events (run_id, kind, ordinal, name, count, source, trigger)
       SELECT $1, $2, u.ordinal, u.name, u.count, NULLIF(u.source, ''), NULLIF(u.trigger, '')
       FROM unnest($3::int[], $4::text[], $5::float8[], $6::text[], $7::text[])
         AS u(ordinal, name, count, source, trigger)`,
      [
        runId,
        kind,
        mapped.map((_, index) => offset + index),
        mapped.map((row) => row.name),
        mapped.map((row) => row.count),
        mapped.map((row) => row.source ?? ""),
        mapped.map((row) => row.trigger ?? ""),
      ],
    );
  });
}

export async function insertCrux(
  sql: CrawlSql,
  runId: string,
  host: string,
  crux: NonNullable<AuditRun["analytics"]["crux"]>,
): Promise<void> {
  await sql.query(
    `INSERT INTO analytics_crux (
       run_id, host, reason, detail, collection_start, collection_end, lcp_ms, inp_ms, cls
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (run_id, host) DO NOTHING`,
    [
      runId,
      host,
      crux.reason ?? null,
      crux.detail ?? null,
      day(crux.collectionStart),
      day(crux.collectionEnd),
      n(crux.lcpMs),
      n(crux.inpMs),
      n(crux.cls),
    ],
  );
}

export async function insertPsi(
  sql: CrawlSql,
  runId: string,
  host: string,
  page: NonNullable<AuditRun["analytics"]["psi"]>["pages"][number],
): Promise<void> {
  const strategy = page.strategy ?? "mobile";
  await sql.query(
    `INSERT INTO analytics_psi_pages (
       run_id, host, strategy, url, score, lighthouse_version, fetch_time, error, screenshot
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (run_id, host, strategy) DO NOTHING`,
    [
      runId,
      host,
      strategy,
      page.url,
      n(page.score),
      page.lighthouseVersion ?? null,
      page.fetchTime ?? null,
      page.error ?? null,
      // Sidecar path until the worker replaces it with the screenshot-pool digest.
      page.screenshot ?? null,
    ],
  );
  await chunks(page.metrics ?? [], async (rows) => {
    await sql.query(
      `INSERT INTO analytics_psi_metrics (
         run_id, host, strategy, metric_id, value, display_value, score
       )
       SELECT $1, $2, $3, u.metric_id, u.value, NULLIF(u.display_value, ''), u.score
       FROM unnest($4::text[], $5::float8[], $6::text[], $7::float8[])
         AS u(metric_id, value, display_value, score)
       ON CONFLICT (run_id, host, strategy, metric_id) DO NOTHING`,
      [
        runId,
        host,
        strategy,
        rows.map((row) => row.id),
        rows.map((row) => row.value),
        rows.map((row) => row.displayValue ?? ""),
        rows.map((row) => row.score ?? null),
      ],
    );
  });
  await chunks(page.insights ?? [], async (rows, offset) => {
    const base = offset;
    await sql.query(
      `INSERT INTO analytics_psi_insights (
         run_id, host, strategy, ordinal, insight_id, title, kind,
         savings_ms, savings_bytes, score, display_value, description
       )
       SELECT $1, $2, $3, u.ordinal, u.insight_id, u.title, u.kind,
         u.savings_ms, u.savings_bytes, u.score, NULLIF(u.display_value, ''), NULLIF(u.description, '')
       FROM unnest(
         $4::int[], $5::text[], $6::text[], $7::text[], $8::float8[], $9::float8[],
         $10::float8[], $11::text[], $12::text[]
       ) AS u(
         ordinal, insight_id, title, kind, savings_ms, savings_bytes, score, display_value, description
       )`,
      [
        runId,
        host,
        strategy,
        rows.map((_, index) => base + index),
        rows.map((row) => row.id),
        rows.map((row) => row.title),
        rows.map((row) => row.kind),
        rows.map((row) => row.savingsMs ?? null),
        rows.map((row) => row.savingsBytes ?? null),
        rows.map((row) => row.score ?? null),
        rows.map((row) => row.displayValue ?? ""),
        rows.map((row) => row.description ?? ""),
      ],
    );
  });
}
