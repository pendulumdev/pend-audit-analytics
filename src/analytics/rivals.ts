import type { CruxOriginBundle, RivalOriginObservation, RivalPageObservation } from "../types.js";
import { fetchCruxOrigin, originFromBaseUrl, pagespeedApiKey } from "./crux.js";
import { fetchText, type FetchLike } from "./tags.js";

const SAMPLE_LIMIT = 5;

function firstMatch(html: string, re: RegExp): string | undefined {
  const match = html.match(re);
  const value = match?.[1]?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRivalPage(html: string, url: string): RivalPageObservation {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = firstMatch(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  ) ?? firstMatch(
    html,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  );
  const h1 = firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const schemaTypes = [
    ...new Set(
      [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]).filter(
        (t): t is string => Boolean(t),
      ),
    ),
  ];
  const text = stripTags(html);
  const wordCount = text ? text.split(" ").filter(Boolean).length : undefined;
  const headingCount = (html.match(/<h[1-6]\b/gi) ?? []).length || undefined;
  return {
    url,
    ...(title ? { title: stripTags(title) } : {}),
    ...(description ? { description } : {}),
    ...(h1 ? { h1: stripTags(h1) } : {}),
    ...(schemaTypes.length ? { schemaTypes } : {}),
    ...(wordCount != null ? { wordCount } : {}),
    ...(headingCount != null ? { headingCount } : {}),
  };
}

async function sitemapSample(
  origin: string,
  fetchImpl: FetchLike,
): Promise<string[]> {
  try {
    const xml = await fetchText(`${origin}/sitemap.xml`, fetchImpl);
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
      .map((m) => m[1]?.trim())
      .filter((href): href is string => Boolean(href));
    const sameHost: string[] = [];
    for (const href of locs) {
      try {
        const url = new URL(href);
        if (url.origin !== origin) continue;
        if (sameHost.includes(url.href)) continue;
        sameHost.push(url.href);
      } catch {
        /* skip */
      }
      if (sameHost.length >= SAMPLE_LIMIT) break;
    }
    return sameHost;
  } catch {
    return [];
  }
}

export async function observeNamedRivals(opts: {
  hosts: readonly string[];
  fetchImpl?: FetchLike;
}): Promise<RivalOriginObservation[]> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const apiKey = pagespeedApiKey();
  const out: RivalOriginObservation[] = [];
  for (const raw of opts.hosts) {
    const origin = originFromBaseUrl(raw);
    if (!origin) {
      out.push({ host: raw, pages: [], error: "Rival host is not a valid origin." });
      continue;
    }
    try {
      const homeUrl = `${origin}/`;
      const html = await fetchText(homeUrl, fetchImpl);
      const pages = [parseRivalPage(html, homeUrl)];
      const extras = await sitemapSample(origin, fetchImpl);
      for (const href of extras) {
        if (href === homeUrl || pages.some((p) => p.url === href)) continue;
        try {
          const extraHtml = await fetchText(href, fetchImpl);
          pages.push(parseRivalPage(extraHtml, href));
        } catch {
          /* skip one landing */
        }
        if (pages.length >= SAMPLE_LIMIT + 1) break;
      }
      let crux: CruxOriginBundle | undefined;
      if (apiKey) {
        try {
          const result = await fetchCruxOrigin({ origin, apiKey });
          if (result.ok && "crux" in result) crux = result.crux;
        } catch {
          crux = undefined;
        }
      }
      out.push({
        host: origin,
        pages,
        ...(crux ? { crux } : {}),
      });
    } catch (err) {
      out.push({
        host: origin,
        pages: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
