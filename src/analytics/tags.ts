import { createHash } from "node:crypto";
import type {
  GoogleSetupBundle,
  GoogleSetupCollision,
  GoogleSetupDestination,
  GoogleSetupEventsBundle,
  GoogleSetupGtmContainer,
  GoogleSetupSnippet,
  GoogleTagLocation,
  GoogleTagSnippetKind,
} from "../types.js";
import { USER_AGENT } from "../version.js";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 1_500_000;
const SNIPPET_MAX_LINES = 20;
const SNIPPET_MAX_CHARS = 1_200;

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_RE = /\bsrc\s*=\s*["']([^"']+)["']/i;
const HREF_RE = /\bhref\s*=\s*["']([^"']+)["']/i;
const LINK_RE = /<link\b([^>]*)>/gi;
const NOSCRIPT_GTM_RE =
  /<noscript\b[^>]*>[\s\S]*?googletagmanager\.com\/ns\.html\?id=(GTM-[A-Z0-9]+)/gi;

const ID_PATTERNS: Array<{
  family: GoogleSetupDestination["family"];
  re: RegExp;
}> = [
  { family: "gtm", re: /\bGTM-[A-Z0-9]+\b/g },
  { family: "ga4", re: /\bG-[A-Z0-9]{6,}\b/g },
  { family: "ga4", re: /\bGT-[A-Z0-9]+\b/g },
  { family: "ua", re: /\bUA-\d+-\d+\b/g },
  { family: "ads", re: /\bAW-\d+\b/g },
  { family: "floodlight", re: /\bDC-[A-Z0-9]+\b/g },
];

export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export function fingerprintSnippet(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

export function truncateSnippet(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  let cut = lines.slice(0, SNIPPET_MAX_LINES).join("\n");
  if (lines.length > SNIPPET_MAX_LINES) cut += "\n…";
  if (cut.length > SNIPPET_MAX_CHARS) {
    cut = `${cut.slice(0, SNIPPET_MAX_CHARS).trimEnd()}…`;
  }
  return cut;
}

function locationForIndex(html: string, index: number): GoogleTagLocation {
  const headEnd = html.toLowerCase().indexOf("</head>");
  if (headEnd === -1) return "unknown";
  return index < headEnd ? "head" : "body";
}

function kindFromScript(src: string, body: string): GoogleTagSnippetKind {
  const hay = `${src} ${body}`.toLowerCase();
  if (
    hay.includes("/gtm.js") ||
    (/gtm-[a-z0-9]+/i.test(hay) && hay.includes("datalayer"))
  ) {
    if (hay.includes("/gtag/js")) return "gtag";
    return "gtm";
  }
  if (hay.includes("/gtag/js") || /\bgtag\s*\(/.test(body)) return "gtag";
  if (
    hay.includes("google-analytics.com/analytics.js") ||
    hay.includes("google-analytics.com/ga.js") ||
    /\bua-\d+-\d+\b/i.test(hay) ||
    /\bga\s*\(\s*['"]create['"]/.test(body)
  ) {
    return "ua";
  }
  return "other";
}

function collectIds(text: string): GoogleSetupDestination[] {
  const out: GoogleSetupDestination[] = [];
  const seen = new Set<string>();
  for (const { family, re } of ID_PATTERNS) {
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) {
      const id = match[0];
      const key = `${family}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ family, id });
    }
  }
  if (/\bgtag\s*\(\s*['"]consent['"]/i.test(text)) {
    const key = "consent:consent";
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ family: "consent", id: "consent" });
    }
  }
  return out;
}

function isGoogleLoader(kind: GoogleTagSnippetKind, src: string, body: string): boolean {
  if (kind !== "other") return true;
  const hay = `${src} ${body}`.toLowerCase();
  return (
    hay.includes("googletagmanager.com") ||
    hay.includes("google-analytics.com") ||
    hay.includes("googleadservices.com") ||
    collectIds(`${src}\n${body}`).length > 0
  );
}

/** One fetched page before snippets are folded across URLs. */
export type ParsedGooglePage = {
  url: string;
  snippets: Array<Omit<GoogleSetupSnippet, "pages">>;
};

function makeSnippet(
  kind: GoogleTagSnippetKind,
  location: GoogleTagLocation,
  raw: string,
): Omit<GoogleSetupSnippet, "pages"> {
  const text = truncateSnippet(raw);
  return {
    kind,
    location,
    text,
    fingerprint: fingerprintSnippet(text),
    destinations: collectIds(raw),
  };
}

/** Parse one HTML document into snippets with their destinations (no network). */
export function parseGoogleHtml(html: string, pageUrl: string): ParsedGooglePage {
  const snippets: Array<Omit<GoogleSetupSnippet, "pages">> = [];

  SCRIPT_RE.lastIndex = 0;
  for (const match of html.matchAll(SCRIPT_RE)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const src = attrs.match(SRC_RE)?.[1] ?? "";
    const kind = kindFromScript(src, body);
    if (!isGoogleLoader(kind, src, body)) continue;
    const raw = src ? `${src}\n${body}`.trim() : body.trim();
    snippets.push(makeSnippet(kind, locationForIndex(html, match.index ?? 0), raw));
  }

  LINK_RE.lastIndex = 0;
  for (const match of html.matchAll(LINK_RE)) {
    const attrs = match[1] ?? "";
    const href = attrs.match(HREF_RE)?.[1] ?? "";
    if (!href) continue;
    const kind = kindFromScript(href, "");
    if (!isGoogleLoader(kind, href, "")) continue;
    snippets.push(
      makeSnippet(
        kind === "other" ? "gtag" : kind,
        locationForIndex(html, match.index ?? 0),
        href,
      ),
    );
  }

  NOSCRIPT_GTM_RE.lastIndex = 0;
  for (const match of html.matchAll(NOSCRIPT_GTM_RE)) {
    const id = match[1];
    if (!id) continue;
    const raw = match[0] ?? `https://www.googletagmanager.com/ns.html?id=${id}`;
    snippets.push(makeSnippet("gtm", locationForIndex(html, match.index ?? 0), raw));
  }

  return { url: pageUrl, snippets };
}

export function collisionsForPage(
  page: ParsedGooglePage,
  opts: { ga4Bound: boolean },
): GoogleSetupCollision[] {
  const collisions: GoogleSetupCollision[] = [];
  const ga4Ids = uniqueIds(page, "ga4");
  const gtmIds = uniqueIds(page, "gtm");
  const uaIds = uniqueIds(page, "ua");
  const hasGtmSnippet = page.snippets.some((s) => s.kind === "gtm");
  const hasGtagSnippet = page.snippets.some((s) => s.kind === "gtag");

  if (ga4Ids.length > 1) {
    collisions.push({
      code: "multiple-ga4-ids",
      severity: "action",
      detail: `More than one GA4 ID on the page (${ga4Ids.join(", ")})`,
      urls: [page.url],
    });
  }
  if (hasGtmSnippet && hasGtagSnippet) {
    collisions.push({
      code: "gtm-plus-standalone-gtag",
      severity: "action",
      detail: "GTM and a standalone gtag.js both load on the page",
      urls: [page.url],
    });
  }
  if (gtmIds.length > 1) {
    collisions.push({
      code: "multiple-gtm",
      severity: "action",
      detail: `More than one GTM container (${gtmIds.join(", ")})`,
      urls: [page.url],
    });
  }
  if (uaIds.length && ga4Ids.length) {
    collisions.push({
      code: "ua-leftover",
      severity: "watch",
      detail: `Universal Analytics leftover (${uaIds.join(", ")}) next to GA4`,
      urls: [page.url],
    });
  }
  if (opts.ga4Bound && ga4Ids.length === 0 && gtmIds.length === 0) {
    collisions.push({
      code: "bound-property-missing",
      severity: "watch",
      detail:
        "No Google tag IDs in the HTML we fetched. Tags may load after JavaScript (Next.js, consent banner, or GTM).",
      urls: [page.url],
    });
  }
  return collisions;
}

function uniqueIds(
  page: ParsedGooglePage,
  family: GoogleSetupDestination["family"],
): string[] {
  return [
    ...new Set(
      page.snippets
        .flatMap((s) => s.destinations)
        .filter((d) => d.family === family)
        .map((d) => d.id),
    ),
  ];
}

/** Best-effort parse of published gtm.js (undocumented resource object). */
export function parseGtmJs(containerId: string, source: string): GoogleSetupGtmContainer {
  const tagTypeCounts: Record<string, number> = {};
  for (const match of source.matchAll(/"function"\s*:\s*"(__[a-z0-9]+)"/gi)) {
    const fn = match[1];
    if (!fn) continue;
    tagTypeCounts[fn] = (tagTypeCounts[fn] ?? 0) + 1;
  }
  const destinations = [
    ...new Set(
      collectIds(source)
        .filter((d) => d.family !== "gtm")
        .map((d) => d.id),
    ),
  ];
  const parsed = Object.keys(tagTypeCounts).length > 0 || destinations.length > 0;
  return {
    containerId,
    ...(Object.keys(tagTypeCounts).length ? { tagTypeCounts } : {}),
    ...(destinations.length ? { destinations } : {}),
    ...(parsed ? {} : { parseError: "Could not read container tags" }),
  };
}

const SKIP_EVENT_NAMES = new Set([
  "js",
  "config",
  "consent",
  "set",
  "gtm.js",
  "gtm.dom",
  "gtm.load",
]);

function keepEventName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length > 80) return false;
  if (SKIP_EVENT_NAMES.has(n) || n.startsWith("gtm.")) return false;
  return true;
}

const GTM_EVENT_TRIGGER_KIND: Record<string, string> = {
  "gtm.js": "page view",
  "gtm.dom": "page view",
  "gtm.load": "page view",
  "gtm.init": "page view",
  "gtm.init_consent": "page view",
  "gtm.click": "click",
  "gtm.linkClick": "click",
  "gtm.formSubmit": "form",
  "gtm.historyChange": "history",
  "gtm.historyChange-v2": "history",
  "gtm.timer": "timer",
  "gtm.scrollDepth": "scroll",
  "gtm.video": "video",
  "gtm.elementVisibility": "visibility",
};

const TRIGGER_KIND_RANK = [
  "click",
  "form",
  "scroll",
  "video",
  "visibility",
  "history",
  "timer",
  "custom event",
  "page view",
];

type GtmResourceTag = {
  function?: string;
  vtp_eventName?: unknown;
  tag_id?: number;
};

type GtmResourcePredicate = {
  function?: string;
  arg0?: unknown;
  arg1?: unknown;
};

type GtmResource = {
  tags?: GtmResourceTag[];
  predicates?: GtmResourcePredicate[];
  rules?: unknown[];
};

function sliceBalancedObject(source: string, openIdx: number): string | null {
  if (source[openIdx] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openIdx, i + 1);
    }
  }
  return null;
}

/**
 * Narrow arbitrary parsed JSON to the slice of a GTM container we read.
 *
 * Every field of GtmResource is optional and every reader re-checks its own
 * field, so the only thing worth asserting here is that we were handed an
 * object at all - a container that publishes a number or a string is not one.
 */
function asGtmResource(value: unknown): GtmResource | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as GtmResource;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function gtmResourceFromSource(source: string): GtmResource | null {
  // Compiled gtm.js wraps the resource in `var data={...}`, so a whole-file
  // parse only succeeds for a raw container export.
  const parsed = parseJson(source);
  if (typeof parsed === "object" && parsed !== null) {
    const nested = asGtmResource((parsed as { resource?: unknown }).resource);
    if (nested) return nested;
    if (Array.isArray((parsed as { tags?: unknown }).tags)) return asGtmResource(parsed);
  }

  const marker = source.indexOf('"resource"');
  if (marker < 0) return null;
  const brace = source.indexOf("{", marker);
  if (brace < 0) return null;
  const json = sliceBalancedObject(source, brace);
  if (!json) return null;
  return asGtmResource(parseJson(json));
}

function triggerKindFromEventName(eventName: string): string | undefined {
  const mapped = GTM_EVENT_TRIGGER_KIND[eventName];
  if (mapped) return mapped;
  if (!keepEventName(eventName)) return undefined;
  return "custom event";
}

function predicateTriggerKind(
  predicate: GtmResourcePredicate | undefined,
): string | undefined {
  if (!predicate || typeof predicate.arg1 !== "string") return undefined;
  return triggerKindFromEventName(predicate.arg1);
}

function pickTriggerKinds(kinds: string[]): string | undefined {
  const unique = [...new Set(kinds)];
  if (!unique.length) return undefined;
  unique.sort(
    (a, b) =>
      (TRIGGER_KIND_RANK.indexOf(a) === -1 ? 99 : TRIGGER_KIND_RANK.indexOf(a)) -
      (TRIGGER_KIND_RANK.indexOf(b) === -1 ? 99 : TRIGGER_KIND_RANK.indexOf(b)),
  );
  return unique.join(", ");
}

function tagIdsAddedByRule(rule: unknown): number[] {
  if (!Array.isArray(rule)) return [];
  const ids: number[] = [];
  for (const step of rule) {
    if (!Array.isArray(step) || step[0] !== "add") continue;
    for (const item of step.slice(1)) {
      if (typeof item === "number") ids.push(item);
    }
  }
  return ids;
}

function predicateIndexesForRule(rule: unknown): number[] {
  if (!Array.isArray(rule)) return [];
  const indexes: number[] = [];
  for (const step of rule) {
    if (!Array.isArray(step) || step[0] !== "if") continue;
    for (const item of step.slice(1)) {
      if (typeof item === "number") indexes.push(item);
    }
  }
  return indexes;
}

function triggerForTagId(
  tagId: number | undefined,
  resource: GtmResource,
): string | undefined {
  if (tagId == null || !Array.isArray(resource.rules)) return undefined;
  const kinds: string[] = [];
  for (const rule of resource.rules) {
    if (!tagIdsAddedByRule(rule).includes(tagId)) continue;
    for (const index of predicateIndexesForRule(rule)) {
      const kind = predicateTriggerKind(resource.predicates?.[index]);
      if (kind) kinds.push(kind);
    }
  }
  return pickTriggerKinds(kinds);
}

/** Event names declared in HTML or a published gtm.js resource. */
export function parseConfiguredEvents(
  source: string,
  origin: "html" | "gtm",
): GoogleSetupEventsBundle["configured"] {
  const found: GoogleSetupEventsBundle["configured"] = [];
  const seen = new Map<string, GoogleSetupEventsBundle["configured"][number]>();
  const add = (raw: string, trigger?: string) => {
    const name = raw.trim();
    if (!keepEventName(name)) return;
    const key = `${origin}:${name}`;
    const existing = seen.get(key);
    if (existing) {
      if (!existing.trigger && trigger) existing.trigger = trigger;
      return;
    }
    const row: GoogleSetupEventsBundle["configured"][number] = {
      name,
      source: origin,
      ...(trigger ? { trigger } : {}),
    };
    seen.set(key, row);
    found.push(row);
  };

  const resource = origin === "gtm" ? gtmResourceFromSource(source) : null;
  if (resource) {
    for (const tag of resource.tags ?? []) {
      if (typeof tag.vtp_eventName !== "string") continue;
      add(tag.vtp_eventName, triggerForTagId(tag.tag_id, resource));
    }
  }

  for (const match of source.matchAll(
    /gtag\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/gi,
  )) {
    if (match[1]) add(match[1]);
  }
  for (const match of source.matchAll(/\bevent\s*:\s*['"]([^'"]+)['"]/gi)) {
    if (match[1]) add(match[1]);
  }
  for (const match of source.matchAll(/"vtp_eventName"\s*:\s*"([^"]+)"/gi)) {
    if (match[1]) add(match[1]);
  }
  return found;
}

export async function fetchText(url: string, fetchImpl: FetchLike): Promise<string> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const res = await fetchImpl(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/javascript,*/*" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`GET ${url} returned ${res.status}`);
  }
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) {
    return text.slice(0, MAX_BODY_BYTES);
  }
  return text;
}

export const MAX_LANDING_TAG_PAGES = 5;

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function absoluteFromLanding(raw: string, origin: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("(")) return null;
  try {
    return trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, origin);
  } catch {
    return null;
  }
}

/** GSC pages first, then GA4 landings; homepage and other hosts excluded. */
export function selectLandingUrls(opts: {
  homeUrl: string;
  gscPages?: Array<{ page: string }>;
  ga4Landings?: Array<{ path: string }>;
  limit?: number;
}): string[] {
  const limit = opts.limit ?? MAX_LANDING_TAG_PAGES;
  let home: URL;
  try {
    home = new URL(opts.homeUrl);
  } catch {
    return [];
  }
  const seen = new Set<string>([normalizePath(home.pathname)]);
  const out: string[] = [];

  const consider = (raw: string, origin: string) => {
    if (out.length >= limit) return;
    const u = absoluteFromLanding(raw, origin);
    if (!u || u.hostname !== home.hostname) return;
    const path = normalizePath(u.pathname);
    if (path === "/" || seen.has(path)) return;
    seen.add(path);
    out.push(`${u.origin}${path}`);
  };

  for (const row of opts.gscPages ?? []) consider(row.page, home.origin);
  for (const row of opts.ga4Landings ?? []) consider(row.path, home.origin);
  return out;
}

function pageTagSignature(page: ParsedGooglePage): string {
  const fps = page.snippets
    .map((s) => s.fingerprint)
    .sort()
    .join(",");
  const dest = page.snippets
    .flatMap((s) => s.destinations)
    .map((d) => `${d.family}:${d.id}`)
    .sort()
    .join(",");
  return `${fps}|${dest}`;
}

function pathLabel(url: string): string {
  try {
    const path = normalizePath(new URL(url).pathname);
    return path === "/" ? "/" : path;
  } catch {
    return url;
  }
}

export function urlDriftCollision(
  pages: ParsedGooglePage[],
): GoogleSetupCollision | undefined {
  if (pages.length < 2) return undefined;
  const home = pages[0];
  if (!home) return undefined;
  const homeSig = pageTagSignature(home);
  const drifted = pages.slice(1).filter((p) => pageTagSignature(p) !== homeSig);
  if (!drifted.length) return undefined;
  const paths = drifted.map((p) => pathLabel(p.url));
  return {
    code: "url-drift",
    severity: "watch",
    detail: `Tag setup differs from the homepage on ${paths.join(", ")}`,
    urls: [home.url, ...drifted.map((p) => p.url)],
  };
}

async function enrichPageFromGtm(
  page: ParsedGooglePage,
  fetchImpl: FetchLike,
  cache: Map<string, GoogleSetupGtmContainer>,
): Promise<{
  added: GoogleSetupGtmContainer[];
  configured: GoogleSetupEventsBundle["configured"];
}> {
  const added: GoogleSetupGtmContainer[] = [];
  const configured: GoogleSetupEventsBundle["configured"] = [];
  for (const id of uniqueIds(page, "gtm")) {
    let parsed = cache.get(id);
    if (!parsed) {
      try {
        const src = await fetchText(
          `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`,
          fetchImpl,
        );
        parsed = parseGtmJs(id, src);
        configured.push(...parseConfiguredEvents(src, "gtm"));
      } catch (err) {
        parsed = {
          containerId: id,
          parseError: err instanceof Error ? err.message : String(err),
        };
      }
      cache.set(id, parsed);
      added.push(parsed);
    }
  }
  return { added, configured };
}

function foldPageSnippets(into: GoogleSetupSnippet[], page: ParsedGooglePage): void {
  for (const snippet of page.snippets) {
    const existing = into.find((row) => row.fingerprint === snippet.fingerprint);
    if (!existing) {
      into.push({ ...snippet, pages: [page.url] });
      continue;
    }
    if (!existing.pages.includes(page.url)) existing.pages.push(page.url);
  }
}

function pagesForDrift(
  urls: string[],
  snippets: GoogleSetupSnippet[],
): ParsedGooglePage[] {
  return urls.map((url) => ({
    url,
    snippets: snippets
      .filter((s) => s.pages.includes(url))
      .map(({ pages: _pages, ...rest }) => rest),
  }));
}

function dedupeConfigured(
  rows: GoogleSetupEventsBundle["configured"],
): GoogleSetupEventsBundle["configured"] {
  const seen = new Map<string, GoogleSetupEventsBundle["configured"][number]>();
  const out: GoogleSetupEventsBundle["configured"] = [];
  for (const row of rows) {
    const key = `${row.source}:${row.name}`;
    const existing = seen.get(key);
    if (existing) {
      if (!existing.trigger && row.trigger) existing.trigger = row.trigger;
      continue;
    }
    seen.set(key, row);
    out.push(row);
  }
  return out;
}

export async function collectGoogleSetup(opts: {
  pageUrl: string;
  extraUrls?: string[];
  html?: string;
  htmlByUrl?: Record<string, string>;
  ga4Bound: boolean;
  fetchImpl?: FetchLike;
  existing?: GoogleSetupBundle;
}): Promise<{
  setup: GoogleSetupBundle;
  configured: GoogleSetupEventsBundle["configured"];
  error?: string;
}> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const gtmCache = new Map<string, GoogleSetupGtmContainer>();
  for (const c of opts.existing?.gtm ?? []) gtmCache.set(c.containerId, c);

  const urls: string[] = [...(opts.existing?.urls ?? [])];
  const snippets: GoogleSetupSnippet[] = (opts.existing?.snippets ?? []).map((s) => ({
    ...s,
    destinations: [...s.destinations],
    pages: [...s.pages],
  }));
  const gtm: GoogleSetupGtmContainer[] = [...(opts.existing?.gtm ?? [])];
  const collisions: GoogleSetupCollision[] = [...(opts.existing?.collisions ?? [])];
  const configured: GoogleSetupEventsBundle["configured"] = [];
  const errors: string[] = [];
  const parsed: ParsedGooglePage[] = [];

  const toFetch: string[] = [];
  if (!opts.existing) toFetch.push(opts.pageUrl);
  for (const extra of opts.extraUrls ?? []) {
    if (!toFetch.includes(extra) && extra !== opts.pageUrl && !urls.includes(extra)) {
      toFetch.push(extra);
    }
  }

  for (const [i, url] of toFetch.entries()) {
    const isHome = !opts.existing && i === 0 && url === opts.pageUrl;
    let html: string | undefined =
      (isHome ? opts.html : undefined) ?? opts.htmlByUrl?.[url];
    try {
      if (html == null) html = await fetchText(url, fetchImpl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      continue;
    }
    const page = parseGoogleHtml(html, url);
    configured.push(...parseConfiguredEvents(html, "html"));
    const gtmResult = await enrichPageFromGtm(page, fetchImpl, gtmCache);
    gtm.push(...gtmResult.added);
    configured.push(...gtmResult.configured);
    parsed.push(page);
    if (!urls.includes(url)) urls.push(url);
    foldPageSnippets(snippets, page);
    collisions.push(
      ...collisionsForPage(page, {
        ga4Bound: isHome && opts.ga4Bound,
      }),
    );
  }

  const withoutDrift = collisions.filter((c) => c.code !== "url-drift");
  const drift = urlDriftCollision(pagesForDrift(urls, snippets));
  const setup: GoogleSetupBundle = {
    urls,
    snippets,
    ...(gtm.length ? { gtm } : {}),
    collisions: drift ? [...withoutDrift, drift] : withoutDrift,
  };

  if (!urls.length && errors.length) {
    const [error] = errors;
    return {
      setup: { urls: [], snippets: [], collisions: [] },
      configured: [],
      ...(error !== undefined && { error }),
    };
  }
  return {
    setup,
    configured: dedupeConfigured(configured),
    ...(errors.length > 0 && { error: errors.join("; ") }),
  };
}
