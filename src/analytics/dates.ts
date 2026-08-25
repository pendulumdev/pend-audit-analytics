import type { AnalyticsConfig, AnalyticsRange } from "../types.js";

/** Format a Date as YYYY-MM-DD in UTC. */
export function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse YYYY-MM-DD as UTC midnight.
 *
 * Throws on anything else. The previous version destructured blindly, so a
 * malformed range from config became `Invalid Date` and travelled on to the
 * Google APIs as `NaN-NaN-NaN`.
 */
export function parseYmd(ymd: string): Date {
  const parts = ymd.split("-");
  if (parts.length !== 3) throw new Error(`expected YYYY-MM-DD, got "${ymd}"`);
  const [y, m, d] = parts.map(Number);
  if (
    y === undefined ||
    m === undefined ||
    d === undefined ||
    !Number.isFinite(y + m + d)
  ) {
    throw new Error(`expected YYYY-MM-DD, got "${ymd}"`);
  }
  return new Date(Date.UTC(y, m - 1, d));
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return formatYmd(d);
}

/**
 * Resolve the primary (and optional previous) reporting window.
 * Default end is 3 days before today so GSC finalized data is more likely.
 */
export function resolveAnalyticsRange(
  config: AnalyticsConfig,
  now = new Date(),
): AnalyticsRange {
  let end: string;
  let start: string;

  if (config.startDate && config.endDate) {
    start = config.startDate;
    end = config.endDate;
  } else {
    end = formatYmd(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3)),
    );
    start = addDays(end, -(config.rangeDays - 1));
  }

  const range: AnalyticsRange = { start, end };

  if (config.comparePrevious) {
    const dayCount =
      Math.round((parseYmd(end).getTime() - parseYmd(start).getTime()) / 86_400_000) + 1;
    range.previousEnd = addDays(start, -1);
    range.previousStart = addDays(range.previousEnd, -(dayCount - 1));
  }

  return range;
}
