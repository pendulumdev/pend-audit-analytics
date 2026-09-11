# Input

CLI flags and project config that drive a `pend-analytics` run.

[Input](input.md) (this page) · [Output](output.md) · [Analytics](analytics.md) · [Security](security.md)

---

## CLI

Flags and arguments on `pend-analytics`. A flag that also exists in config wins over the TOML key. `--out` is CLI-only; it is not a TOML key.

<table>
<thead>
<tr><th>name</th><th>value example</th><th>description</th><th>usage</th></tr>
</thead>
<tbody>
<tr><td><code>-V, --version</code></td><td></td><td>Print the package version and exit.</td><td>Root only. Same value as <code>pend-analytics --version</code>.</td></tr>
<tr><td><code>-h, --help</code></td><td></td><td>Print help for the program or a command.</td><td>Works on the root and every command.</td></tr>
<tr><td colspan="4"><code>init</code></td></tr>
<tr><td><code>-c, --config</code></td><td><code>audit-config-analytics.toml</code></td><td>Config path to write.</td><td>Optional. Default is <code>audit-config-analytics.toml</code>. See [Init](#init).</td></tr>
<tr><td><code>-f, --force</code></td><td></td><td>Overwrite an existing file at that path.</td><td>Boolean. Refuses to overwrite without this flag.</td></tr>
<tr><td colspan="4"><code>audit</code></td></tr>
<tr><td><code>-c, --config</code></td><td><code>audit-config-analytics.toml</code></td><td>Project config to load.</td><td>Default <code>audit-config-analytics.toml</code>. See [Analytics pull](#analytics-pull).</td></tr>
<tr><td><code>-o, --out</code></td><td><code>out/analytics.json</code></td><td>Path and filename for the analytics JSON.</td><td>CLI only. Default <code>out/analytics.json</code>. Parent directories are created. PageSpeed screenshots, when a key is set, go in <code>dirname(--out)/psi-shots/</code>.</td></tr>
<tr><td colspan="4"><code>mcp</code></td></tr>
<tr><td><code>--http</code></td><td></td><td>Serve Streamable HTTP on <code>/mcp</code> instead of stdio.</td><td>Boolean. Default is stdio for Cursor / Claude Desktop.</td></tr>
<tr><td><code>--port</code></td><td><code>3000</code></td><td>HTTP port.</td><td>Default <code>3000</code>. Only used with <code>--http</code>.</td></tr>
<tr><td><code>--bind</code></td><td><code>127.0.0.1</code></td><td>HTTP bind address.</td><td>Default loopback. Do not bind <code>0.0.0.0</code> unless you intend to expose a Google-API client on that machine.</td></tr>
</tbody>
</table>

---

## Init

Questions `pend-analytics init` asks before writing one config file. Multi-choice uses arrow keys or a number; Enter keeps the highlighted default. Text fields show the default in brackets. When it finishes it prints the written path and the sources it stored.

At least one of Search Console or GA4 is required. Skipping both re-asks.

<table>
<thead>
<tr><th>name</th><th>value example</th><th>description</th><th>usage</th></tr>
</thead>
<tbody>
<tr><td><code>Project name</code></td><td><code>Analytics audit</code></td><td>Label copied onto the config.</td><td>Text. Default <code>Analytics audit</code>.</td></tr>
<tr><td><code>URL</code></td><td><code>https://example.com</code></td><td>Written as <code>baseUrl</code>.</td><td>Required text. Must be <code>http://</code> or <code>https://</code>. No default. Used for the public tag scan, CrUX origin, and homepage PageSpeed lab check.</td></tr>
<tr><td><code>Search Console</code></td><td><code>Yes</code></td><td>Whether to write a Search Console source.</td><td>Multi-choice: Yes, Skip. Default Yes.</td></tr>
<tr><td><code>Search Console property</code></td><td><code>sc-domain:example.com</code></td><td>Written as <code>analytics.searchConsole.siteUrl</code>.</td><td>Required when Search Console is Yes. Hidden when Skip. Domain property (<code>sc-domain:example.com</code>) or URL-prefix with a trailing <code>/</code>.</td></tr>
<tr><td><code>GA4</code></td><td><code>Yes</code></td><td>Whether to write a GA4 source.</td><td>Multi-choice: Yes, Skip. Default Yes.</td></tr>
<tr><td><code>GA4 property id</code></td><td><code>123456789</code></td><td>Written as <code>analytics.ga4.propertyId</code>.</td><td>Required when GA4 is Yes. Hidden when Skip. Numeric. A <code>properties/</code> prefix is stripped.</td></tr>
<tr><td><code>Service account JSON</code></td><td><code>~/Secrets/analytics-sa.json</code></td><td>Written as <code>analytics.credentialsPath</code>.</td><td>Optional text. Enter skips and leaves <code>GOOGLE_APPLICATION_CREDENTIALS</code> as the source. Must be a local <code>.json</code> path, not a URL.</td></tr>
<tr><td><code>PageSpeed API key</code></td><td><code>AIza...</code></td><td>Written as <code>analytics.pagespeedApiKey</code>.</td><td>Optional text. Enter skips and leaves <code>PAGESPEED_API_KEY</code> as the source. Must be the key string, not a URL. Setup: [<code>analytics.md</code>](analytics.md#4-pagespeed-api-key-optional).</td></tr>
</tbody>
</table>

---

## Analytics pull

Keys in [`examples/analytics.toml`](../examples/analytics.toml) for `pend-analytics audit`. `pend-analytics init` writes one starter file (`audit-config-analytics.toml`) from the answers above.

There are no `targets`, viewports, sitemap, or `failOn` keys. This engine does not crawl pages and does not score readiness.

At least one of `[analytics.searchConsole]` or `[analytics.ga4]` is required. `pend-analytics audit` force-enables the configured sources even when `enabled = false`.

Top-level `rangeDays`, `comparePrevious`, `credentialsPath`, `pagespeedApiKey`, `searchConsole`, and `ga4` fold into `[analytics]` when the nested key is unset.

A leftover `outDir` key is rejected. Pass `--out` instead.

Credentials, scopes, per-property access and troubleshooting are their own subject - see [`analytics.md`](analytics.md).

<table>
<thead>
<tr><th>name</th><th>value example</th><th>description</th><th>usage</th></tr>
</thead>
<tbody>
<tr><td><code>project</code></td><td><code>"Example Project"</code></td><td>Label copied onto the analytics JSON.</td><td>Required.</td></tr>
<tr><td><code>standard</code></td><td><code>"Pendulum_Analytics_v1"</code></td><td>Engine id stored on the run.</td><td>Required. Only this value is written. Legacy <code>Pendulum_SEO_v1</code> is still accepted and normalised.</td></tr>
<tr><td><code>baseUrl</code></td><td><code>"https://example.com"</code></td><td>Site origin for the public HTML tag scan, CrUX origin, and homepage PageSpeed lab check.</td><td>Optional. Omit and those public probes are skipped.</td></tr>
<tr><td colspan="4"><code>analytics</code></td></tr>
<tr><td><code>enabled</code></td><td><code>true</code></td><td>Ignored by <code>audit</code> (force-enabled).</td><td>Rejected if <code>true</code> with no sources.</td></tr>
<tr><td><code>credentialsPath</code></td><td><code>""</code></td><td>Path to a service-account JSON.</td><td>Optional. Empty or omit uses <code>GOOGLE_APPLICATION_CREDENTIALS</code>.</td></tr>
<tr><td><code>pagespeedApiKey</code></td><td><code>""</code></td><td>PageSpeed Insights and CrUX API key.</td><td>Optional. Empty or omit uses <code>PAGESPEED_API_KEY</code>. The environment wins when both are set. Do not commit the key.</td></tr>
<tr><td><code>rangeDays</code></td><td><code>28</code></td><td>Inclusive day count for the primary window.</td><td>Default 28. Max 90.</td></tr>
<tr><td><code>startDate</code> / <code>endDate</code></td><td><code>"2026-01-01"</code></td><td><code>YYYY-MM-DD</code> overrides.</td><td>Must be set together. When both set, <code>rangeDays</code> is ignored.</td></tr>
<tr><td><code>comparePrevious</code></td><td><code>true</code></td><td>Compare against the immediately preceding window of equal length.</td><td>Default <code>true</code>.</td></tr>
<tr><td><code>observeEvents</code></td><td><code>false</code></td><td>Optional Chromium collect intercept.</td><td>Default <code>false</code>. Also <code>ANALYTICS_OBSERVE=1</code> (<code>SEO_ANALYTICS_OBSERVE</code> still accepted).</td></tr>
<tr><td><code>rivals</code></td><td><code>["https://rival.example"]</code></td><td>Named rival https origins.</td><td>Optional. Homepage CrUX and PageSpeed lab, same key as the site. Never a Google property of yours.</td></tr>
<tr><td><code>searchConsole.siteUrl</code></td><td><code>"sc-domain:example.com"</code></td><td>Search Console property.</td><td>Domain property or a URL-prefix with a trailing <code>/</code>.</td></tr>
<tr><td><code>ga4.propertyId</code></td><td><code>"123456789"</code></td><td>Numeric GA4 property id.</td><td>A <code>properties/</code> prefix is stripped.</td></tr>
</tbody>
</table>
