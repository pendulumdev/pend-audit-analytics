/**
 * Titles / body markers for edge bot walls that gate HTML before the site.
 * A bare 403 or "Access Denied" is not a wall. In-page Turnstile is not a wall.
 * The same list lives in brand, the crawl host, security, and SEO.
 */

export const EDGE_CHALLENGE_RE =
  /Vercel Security Checkpoint|Just a moment\.\.\.|cf-browser-verification|Attention Required! \| Cloudflare|\/cdn-cgi\/challenge-platform\/|errors\.edgesuite\.net|Incapsula incident ID|_Incapsula_Resource|Sucuri WebSite Firewall|captcha-delivery\.com|px-captcha|awsWafCookieDomainList/i;

export const EDGE_CHALLENGE_ERROR =
  "Homepage blocked by an edge security check. The harvest could not see the real site.";

const HTML_HEAD_CHARS = 8_000;

export class EdgeChallengeError extends Error {
  constructor() {
    super(EDGE_CHALLENGE_ERROR);
    this.name = "EdgeChallengeError";
  }
}

/** True when the document or challenge header is an edge bot wall, not the site. */
export function isEdgeChallengeDocument(
  title: string,
  html: string,
  headers?: Record<string, string>,
): boolean {
  if (challengeHeader(headers)) return true;
  if (EDGE_CHALLENGE_RE.test(title)) return true;
  if (EDGE_CHALLENGE_RE.test(html.slice(0, HTML_HEAD_CHARS))) return true;
  return false;
}

export function isEdgeChallengeError(err: unknown): boolean {
  return (
    err instanceof EdgeChallengeError ||
    (err instanceof Error && err.message === EDGE_CHALLENGE_ERROR)
  );
}

function challengeHeader(headers: Record<string, string> | undefined): boolean {
  if (!headers) return false;
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    const normalized = value.trim().toLowerCase();
    if (name === "x-vercel-mitigated" && normalized === "challenge") return true;
    if (name === "cf-mitigated" && normalized === "challenge") return true;
  }
  return false;
}
