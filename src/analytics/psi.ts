import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  PsiInsight,
  PsiInsightKind,
  PsiLabBundle,
  PsiLabMetric,
  PsiLabMetricId,
  PsiPageRow,
  PsiStrategy,
} from "../types.js";
import { USER_AGENT } from "../version.js";

const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const FETCH_TIMEOUT_MS = 45_000;
/** Default lab set: homepage only, both form factors (2 API calls). */
export const PSI_STRATEGIES: readonly PsiStrategy[] = ["mobile", "desktop"];
const PSI_MAX_OPPORTUNITIES = 3;
/** Cap Diagnose rows so run.json stays a summary, not a Lighthouse dump. */
export const PSI_MAX_INSIGHTS = 20;
/** Cleaned Lighthouse sentence; UI collapses long copy behind Read more. */
const PSI_MAX_DESCRIPTION = 800;
export const PSI_SHOTS_DIR = "psi-shots";
/** Skip filmstrip / full-page; cap the final JPEG we persist. */
export const PSI_SCREENSHOT_MAX_BYTES = 400_000;

const LAB_METRIC_AUDITS: ReadonlyArray<{ id: PsiLabMetricId; auditId: string }> = [
  { id: "fcp", auditId: "first-contentful-paint" },
  { id: "lcp", auditId: "largest-contentful-paint" },
  { id: "tbt", auditId: "total-blocking-time" },
  { id: "cls", auditId: "cumulative-layout-shift" },
  { id: "si", auditId: "speed-index" },
];

const SKIP_SCORE_MODES = new Set(["notApplicable", "manual", "error"]);

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function apiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

/**
 * Strip the PageSpeed key out of anything bound for `run.json`.
 *
 * The request URL carries `key=<PAGESPEED_API_KEY>`, and error strings are built
 * from transport messages and API bodies that we do not control. Nothing is
 * known to echo the key back today - this keeps that true if something starts
 * to, since `run.json` is a report people attach to tickets and email.
 */
export function redactApiKey(message: string, apiKey: string): string {
  const withoutQueryParam = message.replace(/([?&]key=)[^&\s"'<>]+/gi, "$1REDACTED");
  const secret = apiKey.trim();
  if (!secret) return withoutQueryParam;
  return withoutQueryParam.split(secret).join("REDACTED");
}

/** Homepage only, mobile then desktop. Extra URLs are a Later add-on. */
export function selectPsiJobs(
  homeUrl: string,
): Array<{ url: string; strategy: PsiStrategy }> {
  const url = homeUrl.trim();
  if (!url) return [];
  return PSI_STRATEGIES.map((strategy) => ({ url, strategy }));
}

type AuditRef = { id?: unknown; group?: unknown };
type Audit = {
  title?: unknown;
  description?: unknown;
  score?: unknown;
  scoreDisplayMode?: unknown;
  displayValue?: unknown;
  numericValue?: unknown;
  metricSavings?: unknown;
  details?: {
    type?: unknown;
    overallSavingsMs?: unknown;
    overallSavingsBytes?: unknown;
  };
};

function auditTitle(audit: Audit | undefined): string | undefined {
  if (typeof audit?.title === "string" && audit.title.trim()) {
    return audit.title.trim();
  }
  return undefined;
}

function opportunitiesFromResult(result: {
  categories?: { performance?: { auditRefs?: AuditRef[] } };
  audits?: Record<string, Audit>;
}): NonNullable<PsiPageRow["opportunities"]> {
  const audits = result.audits ?? {};
  const byId = new Map<string, { id: string; title: string; savingsMs?: number }>();

  function add(id: string, audit: Audit | undefined, requireSavings: boolean) {
    const title = auditTitle(audit);
    if (!title) return;
    const savingsMs = asFiniteNumber(audit?.details?.overallSavingsMs);
    if (requireSavings && (savingsMs == null || savingsMs <= 0)) return;
    const prev = byId.get(id);
    if (prev && (prev.savingsMs ?? 0) >= (savingsMs ?? 0)) return;
    byId.set(id, {
      id,
      title,
      ...(savingsMs != null && savingsMs > 0 ? { savingsMs } : {}),
    });
  }

  for (const [id, audit] of Object.entries(audits)) {
    if (audit.details?.type === "opportunity") {
      add(id, audit, true);
    }
  }

  const refs = result.categories?.performance?.auditRefs ?? [];
  for (const ref of refs) {
    if (typeof ref.id !== "string") continue;
    const id = ref.id;
    const audit = audits[id];
    if (ref.group === "load-opportunities") {
      add(id, audit, true);
    }
  }

  if (!byId.size) {
    for (const ref of refs) {
      if (ref.group !== "insights" || typeof ref.id !== "string") continue;
      const audit = audits[ref.id];
      const score = asFiniteNumber(audit?.score);
      if (score !== 0) continue;
      add(ref.id, audit, false);
    }
  }

  return [...byId.values()]
    .sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0))
    .slice(0, PSI_MAX_OPPORTUNITIES);
}

function shortDescription(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const text = raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  if (text.length <= PSI_MAX_DESCRIPTION) return text;
  return text.slice(0, PSI_MAX_DESCRIPTION).trimEnd();
}

function savingsMsFrom(audit: Audit | undefined): number | undefined {
  const fromDetails = asFiniteNumber(audit?.details?.overallSavingsMs);
  if (fromDetails != null && fromDetails > 0) return fromDetails;
  const savings = audit?.metricSavings;
  if (!savings || typeof savings !== "object") return undefined;
  let max = 0;
  for (const value of Object.values(savings as Record<string, unknown>)) {
    const n = asFiniteNumber(value);
    if (n != null && n > max) max = n;
  }
  return max > 0 ? max : undefined;
}

function insightRank(item: PsiInsight): number {
  if (item.score === 0) return 0;
  if (item.score != null && item.score < 1) return 1;
  if ((item.savingsMs ?? 0) > 0 || (item.savingsBytes ?? 0) > 0) return 2;
  return 3;
}

type LighthouseSlice = {
  categories?: { performance?: { score?: unknown; auditRefs?: AuditRef[] } };
  audits?: Record<string, Audit>;
  lighthouseVersion?: unknown;
  fetchTime?: unknown;
};

function metricsFromResult(audits: Record<string, Audit>): PsiLabMetric[] {
  const out: PsiLabMetric[] = [];
  for (const def of LAB_METRIC_AUDITS) {
    const audit = audits[def.auditId];
    const value = asFiniteNumber(audit?.numericValue);
    if (value == null) continue;
    const display =
      typeof audit?.displayValue === "string" && audit.displayValue.trim()
        ? audit.displayValue.trim()
        : undefined;
    const score = asFiniteNumber(audit?.score);
    out.push({
      id: def.id,
      value,
      ...(display !== undefined ? { displayValue: display } : {}),
      ...(score != null ? { score } : {}),
    });
  }
  return out;
}

function insightsFromResult(result: LighthouseSlice): PsiInsight[] {
  const audits = result.audits ?? {};
  const byId = new Map<string, PsiInsight>();

  function add(id: string, audit: Audit | undefined, kind: PsiInsightKind) {
    if (SKIP_SCORE_MODES.has(String(audit?.scoreDisplayMode ?? ""))) return;
    const title = auditTitle(audit);
    if (!title) return;
    const savingsMs = savingsMsFrom(audit);
    const savingsBytes = asFiniteNumber(audit?.details?.overallSavingsBytes);
    const score = asFiniteNumber(audit?.score);
    const displayValue =
      typeof audit?.displayValue === "string" && audit.displayValue.trim()
        ? audit.displayValue.trim()
        : undefined;
    const description = shortDescription(audit?.description);
    const next: PsiInsight = {
      id,
      title,
      kind,
      ...(savingsMs != null ? { savingsMs } : {}),
      ...(savingsBytes != null && savingsBytes > 0 ? { savingsBytes } : {}),
      ...(score != null ? { score } : {}),
      ...(displayValue !== undefined ? { displayValue } : {}),
      ...(description !== undefined ? { description } : {}),
    };
    const prev = byId.get(id);
    if (prev && insightRank(prev) <= insightRank(next)) return;
    byId.set(id, next);
  }

  for (const [id, audit] of Object.entries(audits)) {
    if (audit.details?.type === "opportunity") {
      const savingsMs = savingsMsFrom(audit);
      const score = asFiniteNumber(audit.score);
      if ((savingsMs != null && savingsMs > 0) || score === 0) {
        add(id, audit, "opportunity");
      }
    }
  }

  const refs = result.categories?.performance?.auditRefs ?? [];
  for (const ref of refs) {
    if (typeof ref.id !== "string") continue;
    const id = ref.id;
    const audit = audits[id];
    if (ref.group === "metrics") continue;
    if (ref.group === "insights") {
      add(id, audit, "insight");
      continue;
    }
    if (ref.group === "load-opportunities") {
      add(id, audit, "opportunity");
      continue;
    }
    if (ref.group === "diagnostics") {
      const score = asFiniteNumber(audit?.score);
      if (score != null && score < 1) add(id, audit, "diagnostic");
    }
  }

  return [...byId.values()]
    .sort((a, b) => {
      const rank = insightRank(a) - insightRank(b);
      if (rank !== 0) return rank;
      return (b.savingsMs ?? 0) - (a.savingsMs ?? 0);
    })
    .slice(0, PSI_MAX_INSIGHTS);
}

/** Map a pagespeedonline.v5 JSON body to one lab row. Performance only. */
export function parsePsiPage(url: string, body: unknown): Omit<PsiPageRow, "strategy"> {
  if (!body || typeof body !== "object") {
    return { url, error: "No Lighthouse result" };
  }
  const result = (body as { lighthouseResult?: unknown }).lighthouseResult;
  if (!result || typeof result !== "object") {
    return {
      url,
      error: apiErrorMessage(body, "No Lighthouse result"),
    };
  }
  const lr = result as LighthouseSlice;
  const score01 = asFiniteNumber(lr.categories?.performance?.score);
  const score =
    score01 == null ? undefined : Math.round(Math.min(1, Math.max(0, score01)) * 100);
  const opportunities = opportunitiesFromResult(lr);
  const metrics = metricsFromResult(lr.audits ?? {});
  const insights = insightsFromResult(lr);
  const lighthouseVersion =
    typeof lr.lighthouseVersion === "string" && lr.lighthouseVersion.trim()
      ? lr.lighthouseVersion.trim()
      : undefined;
  const fetchTime =
    typeof lr.fetchTime === "string" && lr.fetchTime.trim()
      ? lr.fetchTime.trim()
      : undefined;
  return {
    url,
    ...(score != null ? { score } : {}),
    ...(opportunities.length ? { opportunities } : {}),
    ...(metrics.length ? { metrics } : {}),
    ...(insights.length ? { insights } : {}),
    ...(lighthouseVersion !== undefined ? { lighthouseVersion } : {}),
    ...(fetchTime !== undefined ? { fetchTime } : {}),
  };
}

export type PsiScreenshotBytes = {
  ext: "jpg" | "png" | "webp";
  bytes: Buffer;
};

function screenshotExt(mime: string): PsiScreenshotBytes["ext"] | undefined {
  const type = mime.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return undefined;
}

/** Final Lighthouse screenshot only - never filmstrip or full-page. */
export function parsePsiScreenshot(body: unknown): PsiScreenshotBytes | undefined {
  if (!body || typeof body !== "object") return undefined;
  const result = (body as { lighthouseResult?: unknown }).lighthouseResult;
  if (!result || typeof result !== "object") return undefined;
  const audit = (result as { audits?: Record<string, { details?: { data?: unknown } }> })
    .audits?.["final-screenshot"];
  const data = audit?.details?.data;
  if (typeof data !== "string" || !data.startsWith("data:")) return undefined;
  const comma = data.indexOf(",");
  if (comma < 0) return undefined;
  const header = data.slice(5, comma);
  const mime = header.split(";")[0]?.trim() ?? "";
  const ext = screenshotExt(mime);
  if (!ext) return undefined;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(data.slice(comma + 1), "base64");
  } catch {
    return undefined;
  }
  if (!bytes.length || bytes.length > PSI_SCREENSHOT_MAX_BYTES) return undefined;
  return { ext, bytes };
}

export function psiScreenshotRelPath(
  strategy: PsiStrategy,
  ext: PsiScreenshotBytes["ext"],
): string {
  return `${PSI_SHOTS_DIR}/psi-${strategy}.${ext}`;
}

export async function writePsiScreenshot(opts: {
  outDir: string;
  strategy: PsiStrategy;
  shot: PsiScreenshotBytes;
}): Promise<string> {
  const rel = psiScreenshotRelPath(opts.strategy, opts.shot.ext);
  const abs = join(opts.outDir, rel);
  await mkdir(join(opts.outDir, PSI_SHOTS_DIR), { recursive: true });
  await writeFile(abs, opts.shot.bytes);
  return rel;
}

export async function fetchPsiPage(opts: {
  url: string;
  strategy: PsiStrategy;
  apiKey: string;
  outDir?: string;
}): Promise<PsiPageRow> {
  const query = new URL(PSI_URL);
  query.searchParams.set("url", opts.url);
  query.searchParams.set("key", opts.apiKey);
  query.searchParams.set("strategy", opts.strategy.toUpperCase());
  query.searchParams.set("category", "PERFORMANCE");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(query, {
      method: "GET",
      signal: ac.signal,
      headers: { "user-agent": USER_AGENT },
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      const parsed = parsePsiPage(opts.url, body);
      if (parsed.error) {
        return {
          ...parsed,
          strategy: opts.strategy,
          error: redactApiKey(parsed.error, opts.apiKey),
        };
      }
      return {
        url: opts.url,
        strategy: opts.strategy,
        error: redactApiKey(apiErrorMessage(body, `HTTP ${res.status}`), opts.apiKey),
      };
    }
    const row = parsePsiPage(opts.url, body);
    const shot = parsePsiScreenshot(body);
    let screenshot: string | undefined;
    if (shot && opts.outDir) {
      screenshot = await writePsiScreenshot({
        outDir: opts.outDir,
        strategy: opts.strategy,
        shot,
      });
    }
    return {
      ...row,
      strategy: opts.strategy,
      ...(screenshot ? { screenshot } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut =
      err instanceof Error && err.name === "AbortError" ? "Timed out" : message;
    return {
      url: opts.url,
      strategy: opts.strategy,
      error: redactApiKey(timedOut, opts.apiKey),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sequential homepage PSI (mobile then desktop). Caller skips when the key is empty.
 */
export async function fetchPsiPages(opts: {
  jobs: Array<{ url: string; strategy: PsiStrategy }>;
  apiKey: string;
  outDir?: string;
}): Promise<PsiLabBundle> {
  const pages: PsiPageRow[] = [];
  for (const job of opts.jobs) {
    pages.push(
      await fetchPsiPage({
        url: job.url,
        strategy: job.strategy,
        apiKey: opts.apiKey,
        ...(opts.outDir !== undefined && { outDir: opts.outDir }),
      }),
    );
  }
  return { pages };
}
