import { CHROMIUM_LAUNCH_ARGS } from "../chromium-args.js";
import { USER_AGENT } from "../version.js";

const COLLECT_PATHS = ["/g/collect", "/collect", "/j/collect"];
const GOTO_TIMEOUT_MS = 12_000;
const SETTLE_MS = 2_000;
const MAX_OBSERVE_URLS = 6;

const SKIP_DATALAYER_EVENTS = new Set([
  "js",
  "config",
  "consent",
  "set",
  "gtm.js",
  "gtm.dom",
  "gtm.load",
]);

type ObserveBrowser = {
  newContext: (opts: { userAgent: string }) => Promise<ObserveContext>;
  close: () => Promise<void>;
};

type ObserveContext = {
  route: (
    pattern: string,
    handler: (route: {
      request: () => { url: () => string; postData: () => string | null };
      abort: () => Promise<unknown>;
      continue: () => Promise<unknown>;
    }) => Promise<unknown>,
  ) => Promise<void>;
  newPage: () => Promise<ObservePage>;
  close: () => Promise<void>;
};

type ObservePage = {
  goto: (
    url: string,
    opts: { waitUntil: "domcontentloaded"; timeout: number },
  ) => Promise<unknown>;
  evaluate: <T>(fn: () => T) => Promise<T>;
};

function isGaCollectHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "www.google-analytics.com" ||
    host === "google-analytics.com" ||
    host === "analytics.google.com" ||
    host === "www.googletagmanager.com" ||
    host.endsWith(".google-analytics.com")
  );
}

/** True for GA4 / gtag collect beacons (Measurement Protocol v2). */
export function isGaCollectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!isGaCollectHost(parsed.hostname)) return false;
    const path = parsed.pathname;
    return COLLECT_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  } catch {
    return false;
  }
}

function namesFromSearchParams(params: URLSearchParams): string[] {
  return params
    .getAll("en")
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Event names (`en=`) on a collect URL. Empty when the URL is not a GA hit. */
export function eventNamesFromCollectUrl(url: string): string[] {
  if (!isGaCollectUrl(url)) return [];
  try {
    return namesFromSearchParams(new URL(url).searchParams);
  } catch {
    return [];
  }
}

/** Event names on a collect request, including Measurement Protocol POST bodies. */
export function eventNamesFromCollectHit(
  url: string,
  postData?: string | null,
): string[] {
  const names = eventNamesFromCollectUrl(url);
  if (!postData?.trim() || !isGaCollectUrl(url)) return names;
  try {
    names.push(...namesFromSearchParams(new URLSearchParams(postData)));
  } catch {
    // Ignore malformed bodies.
  }
  return names;
}

export function eventNamesFromDataLayer(layer: unknown): string[] {
  if (!Array.isArray(layer)) return [];
  const names: string[] = [];
  for (const item of layer) {
    if (!item || typeof item !== "object" || !("event" in item)) continue;
    const event = (item as { event: unknown }).event;
    if (typeof event !== "string") continue;
    const name = event.trim();
    if (!name || name.length > 80) continue;
    if (SKIP_DATALAYER_EVENTS.has(name) || name.startsWith("gtm.")) continue;
    names.push(name);
  }
  return names;
}

export function tallyObserved(names: string[]): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count }));
}

/** Opt-in Chromium observe probe. Off unless toml or env says so. */
export function shouldObserveEvents(config: { observeEvents?: boolean }): boolean {
  if (config.observeEvents === true) return true;
  const primary = process.env.ANALYTICS_OBSERVE?.trim().toLowerCase();
  if (primary === "1" || primary === "true" || primary === "yes") return true;
  const compat = process.env.SEO_ANALYTICS_OBSERVE?.trim().toLowerCase();
  return compat === "1" || compat === "true" || compat === "yes";
}

async function observeOnePage(
  browser: ObserveBrowser,
  url: string,
  settleMs: number,
): Promise<string[]> {
  const names: string[] = [];
  const context = await browser.newContext({ userAgent: USER_AGENT });
  await context.route("**/*", async (route) => {
    const req = route.request();
    const hitUrl = req.url();
    if (isGaCollectUrl(hitUrl)) {
      names.push(...eventNamesFromCollectHit(hitUrl, req.postData()));
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_TIMEOUT_MS,
    });
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    const layer = await page.evaluate(() => {
      const w = window as unknown as { dataLayer?: unknown };
      return Array.isArray(w.dataLayer) ? w.dataLayer : [];
    });
    names.push(...eventNamesFromDataLayer(layer));
  } finally {
    await context.close();
  }
  return [...new Set(names)];
}

/**
 * Cold-load homepage + landings, intercept GA collect, abort so client GA4
 * is not inflated. Caller must gate with `shouldObserveEvents`.
 * Playwright is an optional runtime dependency, loaded only when this runs.
 */
function playwrightUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Cannot find (?:package|module) ['"]playwright['"]/i.test(message);
}

export async function observeEventsOnUrls(
  urls: string[],
  opts?: { settleMs?: number },
): Promise<{
  observed: Array<{ name: string; count: number }>;
  error?: string;
  skipped?: boolean;
}> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(
    0,
    MAX_OBSERVE_URLS,
  );
  if (!unique.length) return { observed: [] };

  const names: string[] = [];
  const errors: string[] = [];
  let browser: ObserveBrowser | undefined;
  try {
    const spec = "playwright";
    const mod = (await import(spec)) as {
      chromium: {
        launch: (opts: { headless: boolean; args: string[] }) => Promise<ObserveBrowser>;
      };
    };
    browser = await mod.chromium.launch({
      headless: true,
      args: [...CHROMIUM_LAUNCH_ARGS],
    });
    const settleMs = opts?.settleMs ?? SETTLE_MS;
    for (const url of unique) {
      try {
        names.push(...(await observeOnePage(browser, url, settleMs)));
      } catch (err) {
        errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    if (playwrightUnavailable(err)) {
      return { observed: [], skipped: true };
    }
    return {
      observed: tallyObserved(names),
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }

  return {
    observed: tallyObserved(names),
    ...(errors.length ? { error: errors.join("; ") } : {}),
  };
}
