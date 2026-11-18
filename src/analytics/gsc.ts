import type {
  AnalyticsRange,
  GscAnalyticsBundle,
  GscDailyRow,
  GscMetricRow,
} from "../types.js";

interface GscApiRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface GscQueryResponse {
  rows?: GscApiRow[];
}

export const GSC_TOP_LIMIT = 10_000;
const GSC_PAGE_SIZE = 1000;

export async function fetchGscBundle(opts: {
  token: string;
  siteUrl: string;
  range: AnalyticsRange;
}): Promise<GscAnalyticsBundle> {
  const { token, siteUrl, range } = opts;
  const [daily, currentTotals, previousTotals] = await Promise.all([
    queryGsc(token, siteUrl, {
      startDate: range.start,
      endDate: range.end,
      dimensions: ["date"],
      rowLimit: 500,
    }),
    queryGsc(token, siteUrl, {
      startDate: range.start,
      endDate: range.end,
      rowLimit: 1,
    }),
    range.previousStart && range.previousEnd
      ? queryGsc(token, siteUrl, {
          startDate: range.previousStart,
          endDate: range.previousEnd,
          rowLimit: 1,
        })
      : Promise.resolve([] as GscApiRow[]),
  ]);
  const queries = await collectGscRows(token, siteUrl, range, "query", (row) => ({
    query: row.keys?.[0] ?? "",
    ...metricsFromRow(row),
  }));
  const pages = await collectGscRows(token, siteUrl, range, "page", (row) => ({
    page: row.keys?.[0] ?? "",
    ...metricsFromRow(row),
  }));

  const dailyRows: GscDailyRow[] = daily
    .map((r) => ({
      date: r.keys?.[0] ?? "",
      ...metricsFromRow(r),
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    siteUrl,
    daily: dailyRows,
    topPages: pages,
    topQueries: queries,
    totals: sumMetrics(currentTotals.length ? currentTotals : dailyRows),
    ...(range.previousStart &&
      range.previousEnd && { previousTotals: sumMetrics(previousTotals) }),
  };
}

async function collectGscRows<T>(
  token: string,
  siteUrl: string,
  range: AnalyticsRange,
  dimension: "query" | "page",
  mapRow: (row: GscApiRow) => T,
): Promise<T[]> {
  const out: T[] = [];
  let startRow = 0;
  while (out.length < GSC_TOP_LIMIT) {
    const limit = Math.min(GSC_PAGE_SIZE, GSC_TOP_LIMIT - out.length);
    const page = await queryGsc(token, siteUrl, {
      startDate: range.start,
      endDate: range.end,
      dimensions: [dimension],
      rowLimit: limit,
      startRow,
    });
    if (page.length === 0) break;
    const take = Math.min(page.length, GSC_TOP_LIMIT - out.length);
    for (let i = 0; i < take; i += 1) {
      const row = page[i];
      if (!row) continue;
      out.push(mapRow(row));
    }
    if (page.length < limit) break;
    startRow += take;
  }
  return out;
}

async function queryGsc(
  token: string,
  siteUrl: string,
  body: {
    startDate: string;
    endDate: string;
    dimensions?: string[];
    rowLimit?: number;
    startRow?: number;
  },
): Promise<GscApiRow[]> {
  const encoded = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: body.startDate,
      endDate: body.endDate,
      dimensions: body.dimensions,
      rowLimit: body.rowLimit ?? GSC_PAGE_SIZE,
      startRow: body.startRow ?? 0,
      dataState: "final",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatGscError(res.status, text, siteUrl));
  }
  const json = (await res.json()) as GscQueryResponse;
  return json.rows ?? [];
}

function metricsFromRow(r: GscApiRow): GscMetricRow {
  return {
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: num(r.ctr),
    position: num(r.position),
  };
}

function sumMetrics(rows: Array<GscMetricRow | GscApiRow>): GscMetricRow {
  let clicks = 0;
  let impressions = 0;
  let positionWeighted = 0;
  for (const r of rows) {
    const c = num(r.clicks);
    const i = num(r.impressions);
    const p = num(r.position);
    clicks += c;
    impressions += i;
    positionWeighted += p * (i || 1);
  }
  const denom = impressions || rows.length || 1;
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: positionWeighted / denom,
  };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function formatGscError(status: number, body: string, siteUrl: string): string {
  const hint =
    status === 403
      ? ` - add the service account email as a user on Search Console property "${siteUrl}" (Restricted is enough)`
      : status === 404
        ? ` - check siteUrl format (sc-domain:example.com or https://example.com/ with trailing slash)`
        : "";
  const snippet = body.slice(0, 280).replace(/\s+/g, " ");
  return `Search Console API ${status}${hint}${snippet ? `: ${snippet}` : ""}`;
}
