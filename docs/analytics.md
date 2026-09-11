# Search Console and GA4

[Input](input.md) · [Output](output.md) · [Analytics](analytics.md) (this page) · [Security](security.md)

This engine pulls Google time-series into `run.analytics`. The data is
**unscored** - it never becomes a readiness number, because how a property
performed is a different question from whether a site is built correctly.

Provider and auth failures soft-fail into `run.analytics.errors[]` and still
exit 0. The CLI fails hard only when no Search Console or GA4 source is
configured at all.

## Which command to use

```bash
pend-analytics audit -c audit-config-analytics.toml
# -> out/analytics.json  (run.analytics populated; score is unscored zeros)
```

`pend-analytics audit` force-enables the configured sources even when
`enabled = false`, on the grounds that running the command is itself the
request.

Search Console data lags a few days, so the default window ends three days
before today to favour finalised rows over fresh but incomplete ones.

## 1. Create Google Cloud credentials

Once per organisation - one Cloud project can serve many client sites.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or
   create a project.
2. Enable both APIs (**APIs & Services -> Library**):
   - [Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com)
   - [Google Analytics Data API](https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com)
3. Create a service account (**IAM & Admin -> Service Accounts -> Create**).
   Skip the optional project roles - it needs none.
4. Open the service account, then **Keys -> Add key -> Create new key -> JSON**.
5. Save the downloaded file outside git, for example `~/Secrets/analytics-sa.json`.
   Never commit it.
6. Copy the `client_email` from the JSON. It looks like
   `NAME@YOUR_PROJECT.iam.gserviceaccount.com`.

The CLI requests `webmasters.readonly` and `analytics.readonly` and nothing else,
so a leaked key cannot be used to change anything in either product.

## 2. Grant access, per site

**Search Console**

1. Open [Search Console](https://search.google.com/search-console) for the
   property.
2. **Settings -> Users and permissions -> Add user**.
3. Paste the service account `client_email`.
4. Permission: **Restricted**. Read-only is enough.
5. Note the property string, which must match exactly:
   - Domain property: `sc-domain:example.com`
   - URL-prefix property: `https://example.com/` (the trailing slash matters)

**GA4**

1. Open [Google Analytics](https://analytics.google.com/) then **Admin**.
2. Under the property, **Property access management -> Add users**.
3. Paste the same `client_email` with role **Viewer**.
4. Copy the numeric Property ID from **Admin -> Property details**.

## 3. Wire the credentials in

Point the CLI at the JSON key one of two ways.

```bash
# Environment - preferred for local shells and CI secrets
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/Secrets/analytics-sa.json"
```

```toml
# Or a path in audit-config-analytics.toml. The JSON file itself still stays out of git.
[analytics]
credentialsPath = "/Users/you/Secrets/analytics-sa.json"
```

Then enable the sources:

```toml
[analytics]
enabled = true
credentialsPath = ""          # empty -> use GOOGLE_APPLICATION_CREDENTIALS
rangeDays = 28                # max 90, or set startDate + endDate together
comparePrevious = true
# observeEvents = false       # Chromium collect intercept; or ANALYTICS_OBSERVE=1

[analytics.searchConsole]
siteUrl = "sc-domain:example.com"

[analytics.ga4]
propertyId = "123456789"
```

## Google tag setup

`pend-analytics audit` also GETs the `baseUrl` HTML, and the public `gtm.js`
when a GTM container is present, and writes `run.analytics.googleSetup`:
unique snippets (destinations on the snippet they were read from, plus the
pages they appear on) and collisions. No Playwright involved unless you opt
into observe.

Once Search Console and GA4 return, it samples up to five top landing URLs (GSC
pages preferred, else GA4 landings) and flags `url-drift` where tags differ from
the homepage. Declared event names from that HTML and GTM sample, plus GA4
`eventName` counts, land in `run.analytics.events` as counted versus declared.
When the public GTM file exposes it, a trigger type is included - click, page
view, form, or custom event. Tag fetch failures soft-fail as `errors[]` with
source `tags`.

## 4. PageSpeed API key (optional)

CrUX field vitals and the homepage PageSpeed lab check share one Google Cloud
**API key**. This is not the service account. The same Cloud project can hold
both. Skip this section if you only want Search Console and GA4.

1. In [Google Cloud Console](https://console.cloud.google.com/) select the
   project you already use for credentials.
2. Enable both APIs (**APIs & Services -> Library**):
   - [PageSpeed Insights API](https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com)
   - [Chrome UX Report API](https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com)
3. **APIs & Services -> Credentials -> Create credentials -> API key**.
4. Restrict the key to those two APIs, then copy it. Do not commit it.
5. Point the CLI at the key one of two ways.

```bash
# Environment - preferred for local shells and CI secrets
export PAGESPEED_API_KEY="AIza..."
```

```toml
# Or the key in audit-config-analytics.toml. Prefer the environment in git.
[analytics]
pagespeedApiKey = "AIza..."
```

`pend-analytics init` asks for the key after the service account path. Enter
skips and leaves `PAGESPEED_API_KEY` as the source. When both are set, the
environment wins.

With a key and a `baseUrl`, the pull also writes:

- `run.analytics.crux` - origin Chrome UX Report vitals
- `run.analytics.psi` - homepage PageSpeed Insights lab rows, mobile and desktop,
  performance category only. Each row keeps the score, five lab metrics (FCP,
  LCP, TBT, CLS, Speed Index), a capped Diagnose list (insights, opportunities,
  failed diagnostics), and the older top-3 `opportunities` field. Titles,
  scores, and estimated savings only - never filmstrip, details tables, or
  base64 in `run.json`.

Final Lighthouse screenshots write to `dirname(--out)/psi-shots/` as paths,
not base64. Without the key both sections are simply omitted. A CrUX 404 means
the origin has no field record yet, which is not a failed run.

The key is stripped from any error text before it reaches `run.json`, so a
failing request cannot leak it into a stored report. Google's lab fetch is
not aborted the way `observeEvents` aborts collect beacons.

## Observe (optional)

Off by default. Set `observeEvents = true` in the project config, or
`ANALYTICS_OBSERVE=1`. `SEO_ANALYTICS_OBSERVE` is still accepted for
compatibility. The probe launches Chromium, intercepts GA collect on a cold
load, then aborts so client GA4 is not inflated. Playwright is not a required
dependency - install it yourself if you want this probe.

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| `analytics auth: ... credentials file not found` | Fix `credentialsPath` or `GOOGLE_APPLICATION_CREDENTIALS` |
| Search Console `403` | Add the service account email as a user on that property |
| Search Console `404` | Wrong `siteUrl` format: `sc-domain:` versus URL-prefix with trailing `/` |
| GA4 `403` | Add the service account email as **Viewer** on that GA4 property |
| Empty series | No data in the window, or Search Console lag - widen `rangeDays` |
| `analytics observe: ...` | Chromium observe probe failed, soft. Off by default; set `observeEvents` or `ANALYTICS_OBSERVE=1` |
| No page experience data | Set `PAGESPEED_API_KEY` or `analytics.pagespeedApiKey`. Missing key omits the section by design |
| PageSpeed or CrUX `403` | Enable PageSpeed Insights API and Chrome UX Report API, then restrict the key to those two |
| No CrUX origin data | Origin is too new or too quiet for CrUX. Expected, not a failure |
| `analytics psi: ...` | PageSpeed Insights failed for that URL, soft. Quota and timeout still succeed the run |
