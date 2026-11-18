import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  refreshAnalyticsInsights,
  refreshCruxOrigin,
  refreshGa4Bundle,
  refreshGa4EventCounts,
  refreshGoogleSetup,
  refreshGscBundle,
  refreshNamedRivals,
  refreshObservedEvents,
  refreshPsiPage,
  refreshPsiPages,
} from "../../src/store/analytics-refresh.js";
import { insertAnalyticsRows } from "../../src/store/analytics-rows.js";
import type {
  AnalyticsError,
  AuditRun,
  Ga4AnalyticsBundle,
  GscAnalyticsBundle,
} from "../../src/types.js";
import { memorySql } from "./memory-sql.js";

const SITE = "https://pendulumdev.co.uk";
const RIVAL = "https://rival.example";

const FROZEN = [
  "generated_at",
  "tool",
  "standard",
  "total_ms",
  "browser_launch_ms",
  "crawl_ms",
  "analyze_ms",
  "post_process_ms",
  "url_count",
  "navigation_count",
  "page_concurrency",
  "range_start",
] as const;

function run(analytics: AuditRun["analytics"]): AuditRun {
  return {
    version: 1,
    tool: "@pendulumdev/analytics",
    generatedAt: "2026-01-28T00:00:00.000Z",
    project: "Pendulum",
    standard: "Pendulum_Analytics_v1",
    baseUrl: SITE,
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
      totalMs: 11,
      browserLaunchMs: 2,
      crawlMs: 3,
      analyzeMs: 4,
      postProcessMs: 1,
      urlCount: 5,
      navigationCount: 6,
      pageConcurrency: 1,
      pages: [],
    },
    analytics,
  };
}

function ga4(path = "/old", sessions = 2): Ga4AnalyticsBundle {
  return {
    propertyId: "530055925",
    daily: [{ date: "2026-01-01", sessions, totalUsers: sessions, engagedSessions: 1 }],
    landingPages: [
      {
        path,
        sessions,
        engagementRate: 0.5,
        activeUsers: 2,
        newUsers: 1,
        engagedSessions: 1,
        userEngagementDuration: 10,
        averageSessionDuration: 8,
        screenPageViews: 3,
        keyEvents: 0,
        sessionKeyEventRate: 0,
      },
    ],
    organicDaily: [{ date: "2026-01-01", sessions: 1 }],
    channels: [{ name: "Organic Search", sessions }],
    devices: [{ name: "mobile", sessions }],
    newReturningDaily: [{ date: "2026-01-01", newUsers: 1, returningUsers: 4 }],
    totals: { sessions, totalUsers: sessions, engagedSessions: 1 },
    previousTotals: { sessions: 1, totalUsers: 1, engagedSessions: 0 },
    landingSourceRows: 12,
    previousNewUsers: 1,
    previousReturningUsers: 0,
  };
}

function gsc(query = "old-query", clicks = 1): GscAnalyticsBundle {
  return {
    siteUrl: "sc-domain:pendulumdev.co.uk",
    daily: [{ date: "2026-01-01", clicks, impressions: 2, ctr: 0.5, position: 3 }],
    topPages: [{ page: `${SITE}/`, clicks, impressions: 2, ctr: 0.5, position: 3 }],
    topQueries: [{ query, clicks, impressions: 2, ctr: 0.5, position: 4 }],
    totals: { clicks, impressions: 2, ctr: 0.5, position: 3 },
    previousTotals: { clicks: 1, impressions: 1, ctr: 1, position: 8 },
  };
}

function errors(): AnalyticsError[] {
  return [
    { source: "gsc", message: "gsc-old" },
    { source: "ga4", message: "ga4-old" },
    { source: "tags", message: "tags-old" },
    { source: "observe", message: "observe-old" },
    { source: "crux", message: "crux-old" },
    { source: "psi", message: "psi-old" },
    { source: "rival", message: "rival-old" },
  ];
}

function fullAnalytics(query = "old-query"): AuditRun["analytics"] {
  return {
    range: {
      start: "2026-01-01",
      end: "2026-01-28",
      previousStart: "2025-12-04",
      previousEnd: "2025-12-31",
    },
    ga4: ga4("/old", 2),
    gsc: gsc(query, 1),
    googleSetup: {
      urls: [`${SITE}/`],
      snippets: [
        {
          kind: "gtag",
          location: "head",
          text: "old",
          fingerprint: "old-snip",
          destinations: [{ family: "ga4", id: "G-OLD" }],
          pages: [`${SITE}/`],
        },
      ],
      gtm: [
        {
          containerId: "GTM-OLD",
          tagTypeCounts: { gaawc: 1 },
          destinations: ["G-OLD"],
        },
      ],
      collisions: [
        {
          code: "multiple-ga4-ids",
          severity: "watch",
          detail: "old collision",
          urls: [`${SITE}/old`],
        },
      ],
    },
    events: {
      configured: [{ name: "page_view", source: "html" }],
      received: [{ name: "purchase", count: 3 }],
      observed: [{ name: "scroll", count: 2 }],
    },
    crux: { origin: SITE, lcpMs: 100 },
    psi: {
      pages: [
        {
          url: `${SITE}/`,
          strategy: "mobile",
          score: 40,
          screenshot: "psi-mobile.webp",
          metrics: [{ id: "lcp", value: 100, displayValue: "0.1 s" }],
          insights: [{ id: "old-mobile", title: "Old mobile", kind: "insight" }],
        },
        {
          url: `${SITE}/`,
          strategy: "desktop",
          score: 50,
          screenshot: "psi-desktop.webp",
          metrics: [{ id: "lcp", value: 80 }],
        },
      ],
    },
    rivals: [
      {
        host: RIVAL,
        crux: { origin: RIVAL, lcpMs: 9 },
        psi: {
          pages: [
            {
              url: `${RIVAL}/`,
              strategy: "mobile",
              score: 10,
              screenshot: "rival.webp",
            },
          ],
        },
      },
    ],
    insights: [
      {
        id: "old",
        response: "watch",
        title: "Old insight",
        detail: "keep",
        remediation: { engineer: "e", client: "c" },
      },
    ],
    errors: errors(),
  };
}

function messages(
  rows: ReadonlyArray<Record<string, unknown>>,
  source: string,
): string[] {
  return rows.filter((row) => row.source === source).map((row) => String(row.message));
}

async function seeded() {
  const mem = memorySql();
  await insertAnalyticsRows(mem.sql, "run-1", run(fullAnalytics()));
  await insertAnalyticsRows(mem.sql, "run-2", run(fullAnalytics("keep-me")));
  return mem;
}

function header(mem: ReturnType<typeof memorySql>, runId = "run-1") {
  const row = mem.rows("analytics_runs").find((item) => item.run_id === runId);
  assert.ok(row, `missing header ${runId}`);
  return row;
}

function frozen(row: Record<string, unknown>) {
  return Object.fromEntries(FROZEN.map((key) => [key, row[key]]));
}

function runRows(mem: ReturnType<typeof memorySql>, table: string, runId = "run-1") {
  return mem.rows(table).filter((row) => row.run_id === runId);
}

describe("analytics partial refresh", () => {
  it("replaces every table on a full run and leaves the other run", async () => {
    const mem = await seeded();
    const kept = mem
      .rows("analytics_gsc_queries")
      .filter((row) => row.run_id === "run-2");
    const next = fullAnalytics("rewritten-query");
    next.ga4 = ga4("/rewritten", 9);
    const setup = next.googleSetup;
    const snippet = setup?.snippets[0];
    if (!setup || !snippet) throw new Error("seed setup missing");
    next.googleSetup = {
      ...setup,
      snippets: [{ ...snippet, fingerprint: "new-snip" }],
    };
    next.insights = [
      {
        id: "new",
        response: "action",
        title: "New insight",
        detail: "fresh",
        remediation: { engineer: "e2", client: "c2" },
      },
    ];
    const before = mem.texts.length;
    await insertAnalyticsRows(mem.sql, "run-1", run(next));
    assert.match(mem.texts.slice(before).join("\n"), /DELETE FROM analytics_runs/);
    assert.deepEqual(
      runRows(mem, "analytics_ga4_landing_pages").map((row) => row.path),
      ["/rewritten"],
    );
    assert.deepEqual(
      runRows(mem, "analytics_gsc_queries").map((row) => row.query),
      ["rewritten-query"],
    );
    assert.deepEqual(
      runRows(mem, "analytics_insights").map((row) => row.title),
      ["New insight"],
    );
    assert.deepEqual(
      runRows(mem, "analytics_tag_snippets").map((row) => row.fingerprint),
      ["new-snip"],
    );
    assert.deepEqual(
      mem.rows("analytics_gsc_queries").filter((row) => row.run_id === "run-2"),
      kept,
    );
  });

  it("refreshGa4Bundle updates GA4 rows and leaves every other table", async () => {
    const mem = await seeded();
    const beforeHeader = frozen(header(mem));
    const queries = runRows(mem, "analytics_gsc_queries");
    const insights = runRows(mem, "analytics_insights");
    const tags = messages(runRows(mem, "analytics_errors"), "tags");
    const mark = mem.texts.length;
    await refreshGa4Bundle(mem.sql, "run-1", ga4("/new", 9), [
      { source: "ga4", message: "ga4-new" },
    ]);
    assert.equal(
      mem.texts.slice(mark).some((text) => text.includes("DELETE FROM analytics_runs")),
      false,
    );
    assert.deepEqual(
      runRows(mem, "analytics_ga4_landing_pages").map((row) => row.path),
      ["/new"],
    );
    assert.equal(header(mem).sessions, 9);
    assert.equal(header(mem).new_users, 1);
    assert.equal(header(mem).gsc_clicks, 1);
    assert.deepEqual(frozen(header(mem)), beforeHeader);
    assert.deepEqual(runRows(mem, "analytics_gsc_queries"), queries);
    assert.deepEqual(runRows(mem, "analytics_insights"), insights);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "ga4"), ["ga4-new"]);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "tags"), tags);
  });

  it("refreshGa4EventCounts replaces received events only", async () => {
    const mem = await seeded();
    const beforeHeader = frozen(header(mem));
    await refreshGa4EventCounts(
      mem.sql,
      "run-1",
      [{ name: "signup", count: 8 }],
      [{ source: "ga4", message: "events-new" }],
    );
    const events = runRows(mem, "analytics_events");
    assert.deepEqual(
      events.filter((row) => row.kind === "received").map((row) => row.name),
      ["signup"],
    );
    assert.deepEqual(
      events.filter((row) => row.kind === "configured").map((row) => row.name),
      ["page_view"],
    );
    assert.deepEqual(
      events.filter((row) => row.kind === "observed").map((row) => row.name),
      ["scroll"],
    );
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "tags"), ["tags-old"]);
    assert.deepEqual(frozen(header(mem)), beforeHeader);
  });

  it("refreshGscBundle replaces Search Console rows and leaves GA4", async () => {
    const mem = await seeded();
    const beforeHeader = frozen(header(mem));
    const landings = runRows(mem, "analytics_ga4_landing_pages");
    await refreshGscBundle(mem.sql, "run-1", gsc("new-query", 6), [
      { source: "gsc", message: "gsc-new" },
    ]);
    assert.deepEqual(
      runRows(mem, "analytics_gsc_queries").map((row) => row.query),
      ["new-query"],
    );
    assert.equal(header(mem).gsc_clicks, 6);
    assert.equal(header(mem).sessions, 2);
    assert.deepEqual(runRows(mem, "analytics_ga4_landing_pages"), landings);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "gsc"), ["gsc-new"]);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "ga4"), ["ga4-old"]);
    assert.deepEqual(frozen(header(mem)), beforeHeader);
  });

  it("refreshGoogleSetup replaces tag rows and configured events, cascading snippet children", async () => {
    const mem = await seeded();
    const beforeHeader = frozen(header(mem));
    await refreshGoogleSetup(
      mem.sql,
      "run-1",
      {
        urls: [`${SITE}/new`],
        snippets: [
          {
            kind: "gtag",
            location: "head",
            text: "new",
            fingerprint: "new-snip",
            destinations: [{ family: "ga4", id: "G-NEW" }],
            pages: [`${SITE}/new`],
          },
        ],
        collisions: [
          {
            code: "multiple-gtm",
            severity: "action",
            detail: "new collision",
            urls: [`${SITE}/new`],
          },
        ],
      },
      [{ name: "generate_lead", source: "html" }],
      [{ source: "tags", message: "tags-new" }],
    );
    assert.deepEqual(
      runRows(mem, "analytics_tag_snippets").map((row) => row.fingerprint),
      ["new-snip"],
    );
    assert.deepEqual(
      runRows(mem, "analytics_tag_destinations").map((row) => row.destination_id),
      ["G-NEW"],
    );
    assert.deepEqual(
      runRows(mem, "analytics_tag_snippet_pages").map((row) => row.page),
      [`${SITE}/new`],
    );
    assert.equal(
      runRows(mem, "analytics_tag_collision_urls").some(
        (row) => row.url === `${SITE}/old`,
      ),
      false,
    );
    assert.deepEqual(runRows(mem, "analytics_gtm_containers"), []);
    const events = runRows(mem, "analytics_events");
    assert.deepEqual(
      events.filter((row) => row.kind === "configured").map((row) => row.name),
      ["generate_lead"],
    );
    assert.deepEqual(
      events.filter((row) => row.kind === "received").map((row) => row.name),
      ["purchase"],
    );
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "tags"), ["tags-new"]);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "gsc"), ["gsc-old"]);
    assert.deepEqual(frozen(header(mem)), beforeHeader);
  });

  it("refreshObservedEvents replaces observed events only", async () => {
    const mem = await seeded();
    const beforeHeader = frozen(header(mem));
    await refreshObservedEvents(
      mem.sql,
      "run-1",
      [{ name: "click", count: 4 }],
      [{ source: "observe", message: "observe-new" }],
    );
    const events = runRows(mem, "analytics_events");
    assert.deepEqual(
      events.filter((row) => row.kind === "observed").map((row) => row.name),
      ["click"],
    );
    assert.deepEqual(
      events.filter((row) => row.kind === "received").map((row) => row.name),
      ["purchase"],
    );
    assert.deepEqual(
      events.filter((row) => row.kind === "configured").map((row) => row.name),
      ["page_view"],
    );
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "observe"), [
      "observe-new",
    ]);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "tags"), ["tags-old"]);
    assert.deepEqual(frozen(header(mem)), beforeHeader);
  });

  it("refreshCruxOrigin replaces the site host and leaves rivals", async () => {
    const mem = await seeded();
    const beforeHeader = frozen(header(mem));
    await refreshCruxOrigin(mem.sql, "run-1", { origin: SITE, lcpMs: 250 }, [
      { source: "crux", message: "crux-new" },
    ]);
    const crux = runRows(mem, "analytics_crux");
    assert.equal(crux.find((row) => row.host === SITE)?.lcp_ms, 250);
    assert.equal(crux.find((row) => row.host === RIVAL)?.lcp_ms, 9);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "crux"), ["crux-new"]);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "rival"), ["rival-old"]);
    assert.deepEqual(frozen(header(mem)), beforeHeader);
  });

  it("refreshPsiPage replaces one strategy and keeps the WebP name on the other", async () => {
    const mem = await seeded();
    const beforeHeader = frozen(header(mem));
    await refreshPsiPage(
      mem.sql,
      "run-1",
      {
        url: `${SITE}/`,
        strategy: "mobile",
        score: 70,
        screenshot: "psi-shots/psi-mobile.jpg",
        metrics: [{ id: "lcp", value: 200 }],
      },
      [{ source: "psi", message: "psi-new" }],
    );
    const pages = runRows(mem, "analytics_psi_pages");
    const mobile = pages.find((row) => row.host === SITE && row.strategy === "mobile");
    const desktop = pages.find((row) => row.host === SITE && row.strategy === "desktop");
    const rival = pages.find((row) => row.host === RIVAL);
    assert.equal(mobile?.score, 70);
    assert.equal(mobile?.screenshot, "psi-shots/psi-mobile.jpg");
    assert.equal(desktop?.screenshot, "psi-desktop.webp");
    assert.equal(desktop?.score, 50);
    assert.equal(rival?.screenshot, "rival.webp");
    assert.equal(
      runRows(mem, "analytics_psi_metrics").some(
        (row) => row.host === SITE && row.strategy === "desktop" && row.value === 80,
      ),
      true,
    );
    assert.equal(
      runRows(mem, "analytics_psi_metrics").some(
        (row) => row.host === SITE && row.strategy === "mobile" && row.value === 100,
      ),
      false,
    );
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "psi"), ["psi-new"]);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "gsc"), ["gsc-old"]);
    assert.deepEqual(frozen(header(mem)), beforeHeader);
  });

  it("refreshPsiPages replaces the fetched site strategies and leaves rival hosts", async () => {
    const mem = await seeded();
    await refreshPsiPages(mem.sql, "run-1", [
      { url: `${SITE}/`, strategy: "mobile", score: 71, screenshot: "psi-mobile.webp" },
      { url: `${SITE}/`, strategy: "desktop", score: 81, screenshot: "psi-desktop.webp" },
    ]);
    const pages = runRows(mem, "analytics_psi_pages");
    assert.equal(
      pages.find((row) => row.host === SITE && row.strategy === "mobile")?.score,
      71,
    );
    assert.equal(
      pages.find((row) => row.host === SITE && row.strategy === "desktop")?.score,
      81,
    );
    assert.equal(pages.find((row) => row.host === RIVAL)?.screenshot, "rival.webp");
  });

  it("refreshNamedRivals replaces rival hosts and leaves the site", async () => {
    const mem = await seeded();
    const beforeHeader = frozen(header(mem));
    const nextRival = "https://other.example";
    await refreshNamedRivals(
      mem.sql,
      "run-1",
      [
        {
          host: nextRival,
          crux: { origin: nextRival, lcpMs: 30 },
          psi: { pages: [{ url: `${nextRival}/`, strategy: "mobile", score: 15 }] },
        },
      ],
      [{ source: "rival", message: "rival-new" }],
    );
    assert.deepEqual(
      runRows(mem, "analytics_rivals").map((row) => row.host),
      [nextRival],
    );
    const crux = runRows(mem, "analytics_crux");
    assert.equal(crux.find((row) => row.host === SITE)?.lcp_ms, 100);
    assert.equal(
      crux.some((row) => row.host === RIVAL),
      false,
    );
    assert.equal(crux.find((row) => row.host === nextRival)?.lcp_ms, 30);
    const pages = runRows(mem, "analytics_psi_pages");
    assert.equal(
      pages.some((row) => row.host === RIVAL),
      false,
    );
    assert.equal(
      pages.find((row) => row.host === SITE && row.strategy === "mobile")?.screenshot,
      "psi-mobile.webp",
    );
    assert.equal(pages.find((row) => row.host === nextRival)?.score, 15);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "rival"), ["rival-new"]);
    assert.deepEqual(messages(runRows(mem, "analytics_errors"), "crux"), ["crux-old"]);
    assert.deepEqual(frozen(header(mem)), beforeHeader);
  });

  it("refreshAnalyticsInsights replaces insight rows and leaves GA4 and Search Console", async () => {
    const mem = await seeded();
    const beforeHeader = frozen(header(mem));
    const landings = runRows(mem, "analytics_ga4_landing_pages");
    const queries = runRows(mem, "analytics_gsc_queries");
    const errorRows = runRows(mem, "analytics_errors");
    await refreshAnalyticsInsights(mem.sql, "run-1", [
      {
        id: "new",
        response: "action",
        title: "New insight",
        detail: "fresh",
        remediation: { engineer: "e2", client: "c2" },
      },
    ]);
    assert.deepEqual(
      runRows(mem, "analytics_insights").map((row) => row.title),
      ["New insight"],
    );
    assert.deepEqual(runRows(mem, "analytics_ga4_landing_pages"), landings);
    assert.deepEqual(runRows(mem, "analytics_gsc_queries"), queries);
    assert.deepEqual(runRows(mem, "analytics_errors"), errorRows);
    assert.deepEqual(frozen(header(mem)), beforeHeader);
  });
});
