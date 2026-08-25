import type {
  AnalyticsRange,
  Ga4AnalyticsBundle,
  Ga4DailyRow,
  Ga4LandingPageRow,
  Ga4NamedCount,
  Ga4NewReturningDailyRow,
  Ga4OrganicDailyRow,
} from "../types.js";

interface Ga4Value {
  value?: string;
}

interface Ga4Row {
  dimensionValues?: Ga4Value[];
  metricValues?: Ga4Value[];
}

interface Ga4ReportResponse {
  rows?: Ga4Row[];
}

interface Ga4DimensionFilter {
  filter: {
    fieldName: string;
    stringFilter: {
      matchType: "EXACT";
      value: string;
    };
  };
}

const TOP_LIMIT = 25;
const CHANNEL_LIMIT = 8;

export async function fetchGa4Bundle(opts: {
  token: string;
  propertyId: string;
  range: AnalyticsRange;
}): Promise<Ga4AnalyticsBundle> {
  const { token, propertyId, range } = opts;
  const [daily, landing, previousDaily, organic, channels, devices, newReturning] =
    await Promise.all([
      runReport(token, propertyId, {
        startDate: range.start,
        endDate: range.end,
        dimensions: ["date"],
        metrics: ["sessions", "totalUsers", "engagedSessions"],
        limit: 500,
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      runReport(token, propertyId, {
        startDate: range.start,
        endDate: range.end,
        dimensions: ["landingPagePlusQueryString"],
        metrics: ["sessions", "engagementRate"],
        limit: TOP_LIMIT,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      range.previousStart && range.previousEnd
        ? runReport(token, propertyId, {
            startDate: range.previousStart,
            endDate: range.previousEnd,
            dimensions: ["date"],
            metrics: ["sessions", "totalUsers", "engagedSessions"],
            limit: 500,
          })
        : Promise.resolve([] as Ga4Row[]),
      runReport(token, propertyId, {
        startDate: range.start,
        endDate: range.end,
        dimensions: ["date"],
        metrics: ["sessions"],
        limit: 500,
        orderBys: [{ dimension: { dimensionName: "date" } }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { matchType: "EXACT", value: "Organic Search" },
          },
        },
      }),
      runReport(token, propertyId, {
        startDate: range.start,
        endDate: range.end,
        dimensions: ["sessionDefaultChannelGroup"],
        metrics: ["sessions"],
        limit: CHANNEL_LIMIT,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      runReport(token, propertyId, {
        startDate: range.start,
        endDate: range.end,
        dimensions: ["deviceCategory"],
        metrics: ["sessions"],
        limit: 10,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      runReport(token, propertyId, {
        startDate: range.start,
        endDate: range.end,
        dimensions: ["date", "newVsReturning"],
        metrics: ["totalUsers"],
        limit: 1000,
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
    ]);

  const dailyRows: Ga4DailyRow[] = daily.map((r) => ({
    date: formatGa4Date(r.dimensionValues?.[0]?.value ?? ""),
    sessions: metricNum(r, 0),
    totalUsers: metricNum(r, 1),
    engagedSessions: metricNum(r, 2),
  }));

  const landingPages: Ga4LandingPageRow[] = landing.map((r) => ({
    path: r.dimensionValues?.[0]?.value || "(not set)",
    sessions: metricNum(r, 0),
    engagementRate: metricNum(r, 1),
  }));

  const organicDaily: Ga4OrganicDailyRow[] = organic
    .map((r) => ({
      date: formatGa4Date(r.dimensionValues?.[0]?.value ?? ""),
      sessions: metricNum(r, 0),
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const channelRows: Ga4NamedCount[] = channels.map((r) => ({
    name: r.dimensionValues?.[0]?.value || "(not set)",
    sessions: metricNum(r, 0),
  }));

  const deviceRows: Ga4NamedCount[] = devices.map((r) => ({
    name: titleCase(r.dimensionValues?.[0]?.value || "(not set)"),
    sessions: metricNum(r, 0),
  }));

  const newReturningDaily = pivotNewReturning(newReturning);

  const totals = sumDaily(dailyRows);
  const previousTotals =
    range.previousStart && range.previousEnd
      ? sumDaily(
          previousDaily.map((r) => ({
            date: "",
            sessions: metricNum(r, 0),
            totalUsers: metricNum(r, 1),
            engagedSessions: metricNum(r, 2),
          })),
        )
      : undefined;

  return {
    propertyId,
    daily: dailyRows,
    landingPages,
    organicDaily,
    channels: channelRows,
    devices: deviceRows,
    newReturningDaily,
    totals,
    ...(previousTotals !== undefined && { previousTotals }),
  };
}

const EVENT_LIMIT = 50;

/** eventName + eventCount for the Analytics event-gap table. */
export async function fetchGa4EventCounts(opts: {
  token: string;
  propertyId: string;
  range: AnalyticsRange;
}): Promise<Array<{ name: string; count: number }>> {
  const rows = await runReport(opts.token, opts.propertyId, {
    startDate: opts.range.start,
    endDate: opts.range.end,
    dimensions: ["eventName"],
    metrics: ["eventCount"],
    limit: EVENT_LIMIT,
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
  });
  return rows
    .map((r) => ({
      name: r.dimensionValues?.[0]?.value?.trim() ?? "",
      count: metricNum(r, 0),
    }))
    .filter((r) => r.name);
}

async function runReport(
  token: string,
  propertyId: string,
  opts: {
    startDate: string;
    endDate: string;
    dimensions: string[];
    metrics: string[];
    limit: number;
    orderBys?: Array<
      | { dimension: { dimensionName: string }; desc?: boolean }
      | { metric: { metricName: string }; desc?: boolean }
    >;
    dimensionFilter?: Ga4DimensionFilter;
  },
): Promise<Ga4Row[]> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
      dimensions: opts.dimensions.map((name) => ({ name })),
      metrics: opts.metrics.map((name) => ({ name })),
      limit: opts.limit,
      orderBys: opts.orderBys,
      dimensionFilter: opts.dimensionFilter,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatGa4Error(res.status, text, propertyId));
  }
  const json = (await res.json()) as Ga4ReportResponse;
  return json.rows ?? [];
}

function pivotNewReturning(rows: Ga4Row[]): Ga4NewReturningDailyRow[] {
  const byDate = new Map<string, Ga4NewReturningDailyRow>();
  for (const r of rows) {
    const date = formatGa4Date(r.dimensionValues?.[0]?.value ?? "");
    if (!date) continue;
    const kind = (r.dimensionValues?.[1]?.value ?? "").toLowerCase();
    const users = metricNum(r, 0);
    const cur = byDate.get(date) ?? { date, newUsers: 0, returningUsers: 0 };
    if (kind === "new") cur.newUsers = users;
    else if (kind === "returning") cur.returningUsers = users;
    byDate.set(date, cur);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function metricNum(row: Ga4Row, index: number): number {
  const raw = row.metricValues?.[index]?.value;
  const n = raw == null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** GA4 returns dates as YYYYMMDD. */
function formatGa4Date(raw: string): string {
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

function titleCase(s: string): string {
  if (!s || s.startsWith("(")) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sumDaily(rows: Ga4DailyRow[]): {
  sessions: number;
  totalUsers: number;
  engagedSessions: number;
} {
  return rows.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      totalUsers: acc.totalUsers + r.totalUsers,
      engagedSessions: acc.engagedSessions + r.engagedSessions,
    }),
    { sessions: 0, totalUsers: 0, engagedSessions: 0 },
  );
}

function formatGa4Error(status: number, body: string, propertyId: string): string {
  const hint =
    status === 403
      ? ` - add the service account email as Viewer on GA4 property ${propertyId}`
      : "";
  const snippet = body.slice(0, 280).replace(/\s+/g, " ");
  return `GA4 Data API ${status}${hint}${snippet ? `: ${snippet}` : ""}`;
}
