import type { AnalyticsBundle, AnalyticsConfig, AnalyticsError } from "../types.js";
import { getGoogleAccessToken } from "./auth.js";
import { fetchCruxOrigin, originFromBaseUrl, pagespeedApiKey } from "./crux.js";
import { resolveAnalyticsRange } from "./dates.js";
import { psiSoftErrors, softError } from "./errors.js";
import { fetchGa4Bundle, fetchGa4EventCounts } from "./ga4.js";
import { fetchGscBundle } from "./gsc.js";
import { withInsights } from "./insights.js";
import { observeEventsOnUrls, shouldObserveEvents } from "./observe.js";
import { fetchPsiPages, selectPsiJobs } from "./psi.js";
import { observeNamedRivals } from "./rivals.js";
import { collectGoogleSetup, selectLandingUrls } from "./tags.js";

export interface FetchAnalyticsOptions {
  config: AnalyticsConfig;
  /** Site origin used for the public HTML tag scan. */
  baseUrl?: string;
  /** Directory next to --out; PSI final screenshots land under `psi-shots/`. */
  outDir?: string;
}

/**
 * Pull GSC/GA4 data when enabled. Soft-fails into `errors[]` so a missing
 * credential or API outage still produces a run.json.
 */
export async function fetchAnalyticsBundle(
  opts: FetchAnalyticsOptions,
): Promise<AnalyticsBundle | undefined> {
  const { config } = opts;
  if (!config.enabled) return undefined;
  if (!config.searchConsole && !config.ga4) return undefined;

  const range = resolveAnalyticsRange(config);
  const errors: AnalyticsError[] = [];
  const configured: NonNullable<AnalyticsBundle["events"]>["configured"] = [];

  let googleSetup: AnalyticsBundle["googleSetup"];
  const pageUrl = opts.baseUrl?.trim().replace(/\/$/, "")
    ? `${opts.baseUrl.trim().replace(/\/$/, "")}/`
    : "";
  if (pageUrl) {
    try {
      const tags = await collectGoogleSetup({
        pageUrl,
        ga4Bound: Boolean(config.ga4?.propertyId?.trim()),
      });
      googleSetup = tags.setup;
      configured.push(...tags.configured);
      if (tags.error) {
        errors.push({ source: "tags", message: tags.error });
      }
    } catch (err) {
      errors.push({
        source: "tags",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let token: string;
  try {
    const auth = await getGoogleAccessToken(config.credentialsPath);
    token = auth.token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const observed = await maybeObserve(config, pageUrl ? [pageUrl] : [], errors);
    const crux = await maybeCrux(opts.baseUrl, config.pagespeedApiKey, errors);
    const psi = await maybePsi(pageUrl, config.pagespeedApiKey, errors, opts.outDir);
    const rivals = await maybeRivals(config.rivals, config.pagespeedApiKey, errors);
    const events = eventsOrUndefined(configured, [], observed);
    return {
      range,
      insights: [],
      ...(googleSetup !== undefined && { googleSetup }),
      ...(events !== undefined && { events }),
      ...(crux !== undefined && { crux }),
      ...(psi !== undefined && { psi }),
      ...(rivals !== undefined && { rivals }),
      errors: [...errors, { source: "auth", message }],
    };
  }

  let gsc: AnalyticsBundle["gsc"];
  let ga4: AnalyticsBundle["ga4"];

  if (config.searchConsole) {
    try {
      gsc = await fetchGscBundle({
        token,
        siteUrl: config.searchConsole.siteUrl,
        range,
      });
    } catch (err) {
      errors.push({
        source: "gsc",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (config.ga4) {
    try {
      ga4 = await fetchGa4Bundle({
        token,
        propertyId: config.ga4.propertyId,
        range,
      });
    } catch (err) {
      errors.push({
        source: "ga4",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let extraUrls: string[] = [];
  if (pageUrl) {
    extraUrls = selectLandingUrls({
      homeUrl: pageUrl,
      ...(gsc !== undefined && { gscPages: gsc.topPages }),
      ...(ga4 !== undefined && { ga4Landings: ga4.landingPages }),
    });
    if (extraUrls.length) {
      try {
        const tags = await collectGoogleSetup({
          pageUrl,
          extraUrls,
          ...(googleSetup !== undefined && { existing: googleSetup }),
          ga4Bound: Boolean(config.ga4?.propertyId?.trim()),
        });
        googleSetup = tags.setup;
        configured.push(...tags.configured);
        if (tags.error) {
          errors.push({ source: "tags", message: tags.error });
        }
      } catch (err) {
        errors.push({
          source: "tags",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  let received: NonNullable<AnalyticsBundle["events"]>["received"] = [];
  if (ga4) {
    try {
      received = await fetchGa4EventCounts({
        token,
        propertyId: ga4.propertyId,
        range,
      });
    } catch (err) {
      errors.push({
        source: "ga4",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const observeUrls = pageUrl ? [pageUrl, ...extraUrls] : [];
  const observed = await maybeObserve(config, observeUrls, errors);
  const crux = await maybeCrux(opts.baseUrl, config.pagespeedApiKey, errors);
  const psi = await maybePsi(pageUrl, config.pagespeedApiKey, errors, opts.outDir);
  const rivals = await maybeRivals(config.rivals, config.pagespeedApiKey, errors);

  const events = eventsOrUndefined(configured, received, observed);
  return withInsights({
    range,
    ...(gsc !== undefined && { gsc }),
    ...(ga4 !== undefined && { ga4 }),
    ...(googleSetup !== undefined && { googleSetup }),
    ...(events !== undefined && { events }),
    ...(crux !== undefined && { crux }),
    ...(psi !== undefined && { psi }),
    ...(rivals !== undefined && { rivals }),
    ...(errors.length > 0 && { errors }),
  });
}

async function maybeRivals(
  hosts: readonly string[] | undefined,
  pagespeedKey: string | undefined,
  errors: AnalyticsError[],
): Promise<AnalyticsBundle["rivals"] | undefined> {
  if (!hosts?.length) return undefined;
  const rivals = await observeNamedRivals({
    hosts,
    ...(pagespeedKey !== undefined && { apiKey: pagespeedKey }),
  });
  for (const row of rivals) {
    if (row.error) {
      errors.push(softError("rival", `${row.host}: ${row.error}`, row.host));
    }
    if (row.crux?.reason === "error" && row.crux.detail) {
      errors.push(softError("crux", row.crux.detail, row.host));
    }
    errors.push(...psiSoftErrors(row.psi?.pages ?? []));
  }
  return rivals;
}

async function maybeObserve(
  config: AnalyticsConfig,
  urls: string[],
  errors: AnalyticsError[],
): Promise<NonNullable<AnalyticsBundle["events"]>["observed"] | undefined> {
  if (!shouldObserveEvents(config) || !urls.length) return undefined;
  try {
    const result = await observeEventsOnUrls(urls);
    if (result.skipped) return undefined;
    if (result.error) {
      errors.push({ source: "observe", message: result.error });
    }
    return result.observed;
  } catch (err) {
    errors.push({
      source: "observe",
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function maybePsi(
  homeUrl: string,
  pagespeedKey: string | undefined,
  errors: AnalyticsError[],
  outDir?: string,
): Promise<AnalyticsBundle["psi"] | undefined> {
  const apiKey = pagespeedApiKey(pagespeedKey);
  const jobs = selectPsiJobs(homeUrl);
  if (!apiKey || !jobs.length) return undefined;
  try {
    const psi = await fetchPsiPages({
      jobs,
      apiKey,
      ...(outDir !== undefined && { outDir }),
    });
    errors.push(...psiSoftErrors(psi.pages));
    return psi;
  } catch (err) {
    errors.push(
      softError("psi", err instanceof Error ? err.message : String(err), homeUrl),
    );
    return undefined;
  }
}

async function maybeCrux(
  baseUrl: string | undefined,
  pagespeedKey: string | undefined,
  errors: AnalyticsError[],
): Promise<AnalyticsBundle["crux"] | undefined> {
  const apiKey = pagespeedApiKey(pagespeedKey);
  const origin = originFromBaseUrl(baseUrl ?? "");
  if (!apiKey || !origin) return undefined;
  try {
    const result = await fetchCruxOrigin({ origin, apiKey });
    if (!result.ok) {
      errors.push(softError("crux", result.error, origin));
    }
    return result.crux;
  } catch (err) {
    errors.push(
      softError("crux", err instanceof Error ? err.message : String(err), origin),
    );
    return undefined;
  }
}

function eventsOrUndefined(
  configured: NonNullable<AnalyticsBundle["events"]>["configured"],
  received: NonNullable<AnalyticsBundle["events"]>["received"],
  observed?: NonNullable<AnalyticsBundle["events"]>["observed"],
): AnalyticsBundle["events"] | undefined {
  if (!configured.length && !received.length && observed === undefined) {
    return undefined;
  }
  return {
    configured,
    received,
    ...(observed !== undefined ? { observed } : {}),
  };
}
