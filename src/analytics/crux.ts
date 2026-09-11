import type { CruxOriginBundle } from "../types.js";
import { USER_AGENT } from "../version.js";

const CRUX_URL = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const FETCH_TIMEOUT_MS = 12_000;

/** Platform API key shared with PageSpeed Insights. Env wins over config. */
export function pagespeedApiKey(fromConfig?: string): string | undefined {
  const env = process.env.PAGESPEED_API_KEY?.trim();
  if (env) return env;
  const cfg = fromConfig?.trim();
  return cfg || undefined;
}

/** Scheme + host for CrUX origin queries. */
export function originFromBaseUrl(baseUrl: string): string | undefined {
  try {
    const parsed = new URL(baseUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function cruxDate(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as { year?: unknown; month?: unknown; day?: unknown };
  const y = asFiniteNumber(o.year);
  const m = asFiniteNumber(o.month);
  const d = asFiniteNumber(o.day);
  if (y == null || m == null || d == null) return undefined;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function p75(
  metrics: Record<string, unknown> | undefined,
  name: string,
): number | undefined {
  const metric = metrics?.[name];
  if (!metric || typeof metric !== "object") return undefined;
  const percentiles = (metric as { percentiles?: { p75?: unknown } }).percentiles;
  return asFiniteNumber(percentiles?.p75);
}

/** Map a CrUX queryRecord JSON body to origin vitals. */
export function parseCruxRecord(body: unknown): CruxOriginBundle | null {
  if (!body || typeof body !== "object") return null;
  const record = (body as { record?: unknown }).record;
  if (!record || typeof record !== "object") return null;
  const key = (record as { key?: { origin?: unknown } }).key;
  const origin = typeof key?.origin === "string" ? key.origin.trim() : undefined;
  if (!origin) return null;
  const metrics = (record as { metrics?: Record<string, unknown> }).metrics;
  const period = (record as { collectionPeriod?: unknown }).collectionPeriod;
  const periodObj =
    period && typeof period === "object"
      ? (period as { firstDate?: unknown; lastDate?: unknown })
      : undefined;
  const lcpMs = p75(metrics, "largest_contentful_paint");
  const inpMs = p75(metrics, "interaction_to_next_paint");
  const cls = p75(metrics, "cumulative_layout_shift");
  const collectionStart = cruxDate(periodObj?.firstDate);
  const collectionEnd = cruxDate(periodObj?.lastDate);
  return {
    origin,
    ...(collectionStart !== undefined && { collectionStart }),
    ...(collectionEnd !== undefined && { collectionEnd }),
    ...(lcpMs != null ? { lcpMs } : {}),
    ...(inpMs != null ? { inpMs } : {}),
    ...(cls != null ? { cls } : {}),
  };
}

export type FetchCruxResult =
  | { ok: true; crux: CruxOriginBundle }
  | { ok: true; notFound: true; origin: string }
  | { ok: false; error: string };

/**
 * Origin CrUX for a site URL. Caller skips when `pagespeedApiKey()` is empty.
 */
export async function fetchCruxOrigin(opts: {
  origin: string;
  apiKey: string;
}): Promise<FetchCruxResult> {
  const url = `${CRUX_URL}?key=${encodeURIComponent(opts.apiKey)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify({ origin: opts.origin }),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (res.status === 404) {
      return { ok: true, notFound: true, origin: opts.origin };
    }
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "error" in body
          ? String(
              (body as { error?: { message?: string } }).error?.message ?? res.status,
            )
          : `HTTP ${res.status}`;
      return { ok: false, error: message };
    }
    const parsed = parseCruxRecord(body);
    if (!parsed) {
      return { ok: true, notFound: true, origin: opts.origin };
    }
    return { ok: true, crux: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
