import type {
  AnalyticsBundle,
  AnalyticsInsight,
  AnalyticsInsightResponse,
  Ga4AnalyticsBundle,
  GscAnalyticsBundle,
  RemediationCopy,
} from "../types.js";

const DROP_WATCH = 0.1;
const DROP_ACTION = 0.25;
const LOW_CTR = 0.02;
const MIN_IMPRESSIONS = 100;
const MAX_POSITION_FOR_CTR = 10;
const POSITION_WORSE = 1.5;

export const ANALYTICS_INSIGHT_CATALOG = [
  {
    id: "gsc-clicks-drop-action",
    response: "action",
    title: "Organic clicks dropped sharply",
  },
  {
    id: "gsc-clicks-drop-watch",
    response: "watch",
    title: "Organic clicks trended down",
  },
  {
    id: "gsc-impressions-drop-action",
    response: "action",
    title: "Search impressions dropped sharply",
  },
  {
    id: "gsc-impressions-drop-watch",
    response: "watch",
    title: "Search impressions trended down",
  },
  {
    id: "gsc-low-ctr-queries",
    response: "action",
    title: "High-impression queries with low CTR",
  },
  {
    id: "gsc-position-worse",
    response: "watch",
    title: "Average position worsened",
  },
  {
    id: "ga4-sessions-drop-action",
    response: "action",
    title: "Sessions dropped sharply",
  },
  {
    id: "ga4-sessions-drop-watch",
    response: "watch",
    title: "Sessions trended down",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  response: AnalyticsInsightResponse;
  title: string;
}>;

export type AnalyticsInsightId = (typeof ANALYTICS_INSIGHT_CATALOG)[number]["id"];

const INSIGHT_BY_ID = new Map(ANALYTICS_INSIGHT_CATALOG.map((row) => [row.id, row]));

function insight(
  id: AnalyticsInsightId,
  detail: string,
  remediation: RemediationCopy,
): AnalyticsInsight {
  const row = INSIGHT_BY_ID.get(id);
  if (!row) throw new Error(`unknown insight id: ${id}`);
  return {
    id: row.id,
    response: row.response,
    title: row.title,
    detail,
    remediation,
  };
}

export function buildAnalyticsInsights(opts: {
  gsc?: GscAnalyticsBundle;
  ga4?: Ga4AnalyticsBundle;
}): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  if (opts.gsc) insights.push(...gscPeriodInsights(opts.gsc));
  if (opts.gsc) insights.push(...gscCtrOpportunities(opts.gsc));
  if (opts.gsc) insights.push(...gscPositionWatch(opts.gsc));
  if (opts.ga4) insights.push(...ga4PeriodInsights(opts.ga4));
  return insights;
}

function gscPeriodInsights(gsc: GscAnalyticsBundle): AnalyticsInsight[] {
  if (!gsc.previousTotals) return [];
  const out: AnalyticsInsight[] = [];
  const clicksDelta = relativeDelta(gsc.totals.clicks, gsc.previousTotals.clicks);
  const impresDelta = relativeDelta(
    gsc.totals.impressions,
    gsc.previousTotals.impressions,
  );

  if (clicksDelta <= -DROP_ACTION) {
    out.push(
      insight(
        "gsc-clicks-drop-action",
        `Clicks fell ${pct(clicksDelta)} vs the previous period (${fmt(gsc.previousTotals.clicks)} → ${fmt(gsc.totals.clicks)}).`,
        {
          engineer:
            "Review Search Console query/page tables for losses, then check recent deploys, canonicals, and indexability on affected URLs.",
          client:
            "Organic clicks are down vs the prior period. We should review which pages and queries lost traffic and prioritise fixes.",
        },
      ),
    );
  } else if (clicksDelta <= -DROP_WATCH) {
    out.push(
      insight(
        "gsc-clicks-drop-watch",
        `Clicks fell ${pct(clicksDelta)} vs the previous period (${fmt(gsc.previousTotals.clicks)} → ${fmt(gsc.totals.clicks)}).`,
        {
          engineer:
            "Compare top pages/queries period-over-period and watch for continued decline.",
          client:
            "Organic clicks dipped vs the prior period - worth monitoring alongside content and technical fixes.",
        },
      ),
    );
  }

  if (impresDelta <= -DROP_ACTION) {
    out.push(
      insight(
        "gsc-impressions-drop-action",
        `Impressions fell ${pct(impresDelta)} vs the previous period (${fmt(gsc.previousTotals.impressions)} → ${fmt(gsc.totals.impressions)}).`,
        {
          engineer:
            "Check coverage/indexability, robots, and major content removals. Correlate with sitemap and noindex findings from a technical SEO audit.",
          client:
            "Fewer pages are appearing in search results than before. Indexing and content visibility should be reviewed.",
        },
      ),
    );
  } else if (impresDelta <= -DROP_WATCH) {
    out.push(
      insight(
        "gsc-impressions-drop-watch",
        `Impressions fell ${pct(impresDelta)} vs the previous period (${fmt(gsc.previousTotals.impressions)} → ${fmt(gsc.totals.impressions)}).`,
        {
          engineer: "Watch query coverage and ensure important URLs remain indexable.",
          client:
            "Search visibility dipped slightly - keep an eye on it in the next reporting window.",
        },
      ),
    );
  }

  return out;
}

function gscCtrOpportunities(gsc: GscAnalyticsBundle): AnalyticsInsight[] {
  const candidates = gsc.topQueries
    .filter(
      (q) =>
        q.impressions >= MIN_IMPRESSIONS &&
        q.ctr < LOW_CTR &&
        q.position > 0 &&
        q.position <= MAX_POSITION_FOR_CTR,
    )
    .slice(0, 5);
  if (candidates.length === 0) return [];

  const list = candidates
    .map(
      (q) =>
        `"${q.query}" (${fmt(q.impressions)} impres, ${(q.ctr * 100).toFixed(1)}% CTR, pos ${q.position.toFixed(1)})`,
    )
    .join("; ");

  return [
    insight(
      "gsc-low-ctr-queries",
      `Queries ranking in the top ${MAX_POSITION_FOR_CTR} with weak click-through: ${list}.`,
      {
        engineer:
          "Iterate title and meta description copy for these queries (Search Console CTR). Align H1/intro with intent.",
        client:
          "Some searches show your pages often but few people click. Stronger titles and descriptions should help.",
      },
    ),
  ];
}

function gscPositionWatch(gsc: GscAnalyticsBundle): AnalyticsInsight[] {
  if (!gsc.previousTotals) return [];
  const posWorse = gsc.totals.position - gsc.previousTotals.position;
  const impresDelta = relativeDelta(
    gsc.totals.impressions,
    gsc.previousTotals.impressions,
  );
  if (posWorse >= POSITION_WORSE && Math.abs(impresDelta) < DROP_WATCH) {
    return [
      insight(
        "gsc-position-worse",
        `Average position moved from ${gsc.previousTotals.position.toFixed(1)} to ${gsc.totals.position.toFixed(1)} while impressions stayed relatively stable (${pct(impresDelta)}).`,
        {
          engineer:
            "Review content freshness and competing SERP features on top queries; check for thin or duplicate titles.",
          client:
            "Pages are still being shown but a bit further down the results. Content quality and relevance updates may help.",
        },
      ),
    ];
  }
  return [];
}

function ga4PeriodInsights(ga4: Ga4AnalyticsBundle): AnalyticsInsight[] {
  if (!ga4.previousTotals) return [];
  const out: AnalyticsInsight[] = [];
  const sessionsDelta = relativeDelta(ga4.totals.sessions, ga4.previousTotals.sessions);
  if (sessionsDelta <= -DROP_ACTION) {
    out.push(
      insight(
        "ga4-sessions-drop-action",
        `Sessions fell ${pct(sessionsDelta)} vs the previous period (${fmt(ga4.previousTotals.sessions)} → ${fmt(ga4.totals.sessions)}).`,
        {
          engineer:
            "Segment by channel in GA4; if organic is the driver, cross-check Search Console. Review landing-page engagement.",
          client:
            "Overall site sessions are down vs the prior period. We should identify which channels and pages drove the change.",
        },
      ),
    );
  } else if (sessionsDelta <= -DROP_WATCH) {
    out.push(
      insight(
        "ga4-sessions-drop-watch",
        `Sessions fell ${pct(sessionsDelta)} vs the previous period (${fmt(ga4.previousTotals.sessions)} → ${fmt(ga4.totals.sessions)}).`,
        {
          engineer:
            "Monitor channel mix and landing-page performance over the next window.",
          client:
            "Traffic dipped vs the prior period - worth watching alongside SEO fixes.",
        },
      ),
    );
  }
  return out;
}

function relativeDelta(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

function pct(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(1)}%`;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

/** Attach insights onto a partial analytics bundle. */
export function withInsights(bundle: Omit<AnalyticsBundle, "insights">): AnalyticsBundle {
  return {
    ...bundle,
    insights: buildAnalyticsInsights({
      ...(bundle.gsc !== undefined && { gsc: bundle.gsc }),
      ...(bundle.ga4 !== undefined && { ga4: bundle.ga4 }),
    }),
  };
}
