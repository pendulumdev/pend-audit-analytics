import type { AnalyticsError, PsiPageRow } from "../types.js";
import { originFromBaseUrl } from "./crux.js";

/** Origin for `errors[].host` so primary and rival page-experience rows stay distinct. */
export function errorHost(urlOrHost: string): string {
  const trimmed = urlOrHost.trim();
  return originFromBaseUrl(trimmed) ?? trimmed;
}

export function softError(
  source: AnalyticsError["source"],
  message: string,
  urlOrHost?: string,
): AnalyticsError {
  const host = urlOrHost?.trim() ? errorHost(urlOrHost) : undefined;
  return {
    source,
    message,
    ...(host ? { host } : {}),
  };
}

export function psiSoftErrors(pages: readonly PsiPageRow[]): AnalyticsError[] {
  const out: AnalyticsError[] = [];
  for (const page of pages) {
    if (!page.error) continue;
    out.push(softError("psi", `${page.url} (${page.strategy}): ${page.error}`, page.url));
  }
  return out;
}
