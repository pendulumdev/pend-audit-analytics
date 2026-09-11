import type { RivalOriginObservation } from "../types.js";
import { fetchCruxOrigin, originFromBaseUrl, pagespeedApiKey } from "./crux.js";
import { fetchPsiPages, selectPsiJobs } from "./psi.js";

/**
 * Named rivals are page-experience only: origin CrUX and homepage PSI.
 * On-page copy (title, headings, word count) belongs in an SEO engine.
 */
export async function observeNamedRivals(opts: {
  hosts: readonly string[];
  apiKey?: string;
}): Promise<RivalOriginObservation[]> {
  const apiKey = pagespeedApiKey(opts.apiKey);
  const out: RivalOriginObservation[] = [];
  for (const raw of opts.hosts) {
    const origin = originFromBaseUrl(raw);
    if (!origin) {
      out.push({ host: raw, error: "Rival host is not a valid origin." });
      continue;
    }
    if (!apiKey) {
      out.push({ host: origin });
      continue;
    }
    const row: RivalOriginObservation = { host: origin };
    const cruxResult = await fetchCruxOrigin({ origin, apiKey });
    row.crux = cruxResult.crux;
    const jobs = selectPsiJobs(`${origin}/`);
    if (jobs.length) {
      row.psi = await fetchPsiPages({ jobs, apiKey });
    }
    out.push(row);
  }
  return out;
}
