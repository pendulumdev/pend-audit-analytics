# Output

Project output written to `--out`. Default is `out/analytics.json` for `pend-analytics audit`. Shape is `AuditRun` in [`src/types.ts`](../src/types.ts).

When a PageSpeed key is set, Lighthouse screenshots go under `dirname(--out)/psi-shots/` and each lab row records the relative path as `analytics.psi.pages[].screenshot`. Paths only - image bytes never go into the JSON.

[Input](input.md) · [Output](output.md) (this page) · [Analytics](analytics.md) · [Security](security.md)

---

## Unscored on purpose

This engine does not rate traffic. The `score` object is kept so consumers that already read a Pendulum envelope still parse. Do not treat the band as a readiness claim.

`pages` and `findings` are always empty arrays. There is no check catalog.

<table>
<thead>
<tr><th>name</th><th>value example</th><th>description / info</th></tr>
</thead>
<tbody>
<tr><td>Automated readiness</td><td><code>0</code></td><td>Always zero.</td></tr>
<tr><td>Worst page score</td><td><code>0</code></td><td>Always zero.</td></tr>
<tr><td>Band</td><td><code>"Good"</code></td><td>Always this label so the envelope does not look like a failed audit. Not a traffic rating.</td></tr>
<tr><td>Issue burden</td><td>all zeros</td><td>Always zeros.</td></tr>
<tr><td>Manual completion</td><td><code>0 / 0</code></td><td>Always empty.</td></tr>
</tbody>
</table>

---

## Analytics pull

Fields written to `--out` (default `out/analytics.json`) for `pend-analytics audit`. Missing values are omitted, never invented defaults.

The payload is `run.analytics`. Provider failures stay in `errors[]` and the process still exits 0. Setup and troubleshooting: [`analytics.md`](analytics.md).

<table>
<thead>
<tr><th>name</th><th>value example</th><th>description / info</th></tr>
</thead>
<tbody>
<tr><td><code>version</code></td><td><code>1</code></td><td>AuditRun envelope. Not the package version.</td></tr>
<tr><td><code>tool</code></td><td><code>"@pendulumdev/analytics"</code></td><td>Producer id.</td></tr>
<tr><td><code>generatedAt</code></td><td><code>"2026-09-11T10:00:00.000Z"</code></td><td>ISO timestamp when the pull finished.</td></tr>
<tr><td><code>project</code></td><td><code>"Example Project"</code></td><td>From config <code>project</code>.</td></tr>
<tr><td><code>standard</code></td><td><code>"Pendulum_Analytics_v1"</code></td><td>From config <code>standard</code>.</td></tr>
<tr><td><code>baseUrl</code></td><td><code>"https://example.com"</code></td><td>From config when set.</td></tr>
<tr><td><code>score</code></td><td></td><td>Unscored zeros. See above.</td></tr>
<tr><td><code>pages</code></td><td><code>[]</code></td><td>Always empty.</td></tr>
<tr><td><code>findings</code></td><td><code>[]</code></td><td>Always empty.</td></tr>
<tr><td><code>analytics.range</code></td><td></td><td>Resolved primary window, plus previous window when compare is on.</td></tr>
<tr><td><code>start</code> / <code>end</code></td><td><code>"2026-01-01"</code></td><td>Inclusive <code>YYYY-MM-DD</code>.</td></tr>
<tr><td><code>previousStart</code> / <code>previousEnd</code></td><td><code>"2025-12-04"</code></td><td>Present when <code>comparePrevious</code> is on.</td></tr>
<tr><td><code>analytics.gsc</code></td><td></td><td>Search Console daily rows, top pages, top queries, totals.</td></tr>
<tr><td><code>analytics.ga4</code></td><td></td><td>Sessions, landing pages, channels, devices, new vs returning.</td></tr>
<tr><td><code>analytics.googleSetup</code></td><td></td><td>Public tags. Unique snippets (each with destinations and the pages they appear on), optional GTM containers, collisions.</td></tr>
<tr><td><code>googleSetup.urls</code></td><td><code>["https://example.com/"]</code></td><td>Pages fetched for the tag scan, homepage first.</td></tr>
<tr><td><code>googleSetup.snippets</code></td><td></td><td>Deduped by fingerprint. Destinations are the IDs read from that snippet.</td></tr>
<tr><td><code>kind</code></td><td><code>"gtag"</code></td><td><code>gtm</code>, <code>gtag</code>, <code>ua</code>, or <code>other</code>.</td></tr>
<tr><td><code>location</code></td><td><code>"head"</code></td><td><code>head</code>, <code>body</code>, or <code>unknown</code>.</td></tr>
<tr><td><code>text</code></td><td><code>"https://www.googletagmanager.com/gtag/js?id=G-…"</code></td><td>Truncated snippet or loader URL.</td></tr>
<tr><td><code>fingerprint</code></td><td><code>"8b417677"</code></td><td>Stable hash of <code>text</code>.</td></tr>
<tr><td><code>destinations</code></td><td><code>[{ "family": "ga4", "id": "G-CDEC0MPC01" }]</code></td><td>IDs found in this snippet.</td></tr>
<tr><td><code>pages</code></td><td><code>["https://example.com/", "https://example.com/about"]</code></td><td>Scanned URLs this snippet was found on.</td></tr>
<tr><td><code>analytics.events</code></td><td></td><td>Declared vs received (and optional observed) event names.</td></tr>
<tr><td><code>analytics.crux</code></td><td></td><td>Origin Chrome UX Report field vitals, when a PageSpeed key is set.</td></tr>
<tr><td><code>analytics.psi</code></td><td></td><td>Homepage lab rows (mobile and desktop), when a PageSpeed key is set.</td></tr>
<tr><td><code>analytics.rivals</code></td><td></td><td>Named rival origins: public HTML plus CrUX.</td></tr>
<tr><td><code>analytics.insights</code></td><td></td><td>Period drops, low-CTR queries, position watch.</td></tr>
<tr><td><code>analytics.errors</code></td><td></td><td>Provider, auth, tags, observe, CrUX, or PSI soft-failures.</td></tr>
<tr><td><code>timing</code></td><td></td><td>Wall time for the pull. Browser and crawl times stay zero.</td></tr>
</tbody>
</table>

---

## Reading a stored run

`readRunJson()` requires `score`, `analytics`, and `pages`, then hands back a typed `AuditRun`. Re-reading a run written by an older version is the common failure, and it is better to fail with a clear message than to render half a report.
