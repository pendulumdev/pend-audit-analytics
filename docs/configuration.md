# Configuration

`analytics.toml` is the whole input contract. The CLI takes a config path, the
pull reads the Google properties it names, and everything it decides is
traceable to a key in this file. A working annotated copy lives in
[`examples/analytics.toml`](../examples/analytics.toml).

`pend-analytics init` writes a starter file. The config is trusted input - see
[`security.md`](security.md) for what that means.

## Top-level keys

| Key | Default | Meaning |
|-----|---------|---------|
| `project` | required | Label carried through to `run.json` |
| `standard` | `Pendulum_Analytics_v1` | This value is stored. Legacy `Pendulum_SEO_v1` is still accepted and normalised to `Pendulum_Analytics_v1` |
| `baseUrl` | none | Site origin for the public HTML tag scan, CrUX origin, and homepage PageSpeed lab check |
| `outDir` | `analytics-out` | Where `run.json` is written |

There are no `targets`, viewports, sitemap, or `failOn` keys. This engine does
not crawl pages and does not score readiness.

Arc may serialise `rangeDays`, `comparePrevious`, `credentialsPath`,
`searchConsole`, and `ga4` at the top level. Those fold into `[analytics]` when
the nested key is unset.

## Analytics

At least one of `[analytics.searchConsole]` or `[analytics.ga4]` is required.
`pend-analytics audit` force-enables the configured sources even when
`enabled = false`.

| Key | Default | Meaning |
|-----|---------|---------|
| `analytics.enabled` | `true` | Ignored by `audit` (force-enabled). Rejected if `true` with no sources |
| `analytics.credentialsPath` | none | Path to a service-account JSON. Empty or omit uses `GOOGLE_APPLICATION_CREDENTIALS` |
| `analytics.rangeDays` | `28` | Inclusive day count for the primary window. Max 90 |
| `analytics.startDate` / `analytics.endDate` | none | `YYYY-MM-DD` overrides. Must be set together; when both set, `rangeDays` is ignored |
| `analytics.comparePrevious` | `true` | Compare against the immediately preceding window of equal length |
| `analytics.observeEvents` | `false` | Optional Chromium collect intercept. Also `ANALYTICS_OBSERVE=1` (`SEO_ANALYTICS_OBSERVE` still accepted) |
| `analytics.searchConsole.siteUrl` | none | Search Console property: `sc-domain:example.com` or a URL-prefix with trailing `/` |
| `analytics.ga4.propertyId` | none | Numeric GA4 property id. A `properties/` prefix is stripped |

Credentials, scopes, per-property access and troubleshooting are their own
subject - see [`analytics.md`](analytics.md).
