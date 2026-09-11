# Security

What this tool connects to, writes, and expects you to contain. To report a vulnerability, see [SECURITY.md](../SECURITY.md).

[Input](input.md) · [Output](output.md) · [Analytics](analytics.md) · [Security](security.md) (this page)

---

## The config is trusted input

`baseUrl` drives the public HTML tag scan, the CrUX origin, and the homepage PageSpeed lab check.

There is no private-address filter. If an attacker can write your `audit-config-analytics.toml`, they can make this tool issue requests from wherever it runs, including to `localhost`, link-local metadata endpoints, and hosts inside your network.

That is correct for a tool an operator runs against their own site, and it is a server-side request forgery primitive if you accept configs from users. If you are building a hosted service on top of this:

- Validate and allow-list `baseUrl` before it reaches the engine.
- Resolve the host and reject private, loopback and link-local ranges.
- Run in a network namespace that cannot reach anything you care about.

Do not rely on the engine to do this for you. It does not.

---

## What it reaches out to

<table>
<thead>
<tr><th>name</th><th>value example</th><th>description / info</th></tr>
</thead>
<tbody>
<tr><td><code>baseUrl</code></td><td><code>"https://example.com/"</code></td><td>Public HTML tag scan. One GET of the homepage, plus sampled landing URLs.</td></tr>
<tr><td>Public <code>gtm.js</code></td><td></td><td>GTM container parse. Only when a GTM id is found on the page.</td></tr>
<tr><td><code>www.googleapis.com</code></td><td></td><td>Search Console metrics and PageSpeed. Read-only scopes, only when sources are configured.</td></tr>
<tr><td><code>analyticsdata.googleapis.com</code></td><td></td><td>GA4 metrics. Read-only scope, only when a property is configured.</td></tr>
<tr><td><code>chromeuxreport.googleapis.com</code></td><td></td><td>CrUX field data. Only when a PageSpeed key is configured.</td></tr>
</tbody>
</table>

Requests carry a single identifiable user agent, `pend-analytics/<version> (+https://github.com/pendulumdev/pend-audit-analytics)`, so a site owner reading their logs can identify or block us.

---

## Credentials

This engine is the one that holds the service account.

- A Google **service account key file** is read from `credentialsPath`, or from `GOOGLE_APPLICATION_CREDENTIALS` if that is unset. It is read, never copied, and never written to `--out`.
- Scopes are read-only: `webmasters.readonly` and `analytics.readonly`. The engine cannot change anything in your Search Console or GA4 property.
- `PAGESPEED_API_KEY` (or `analytics.pagespeedApiKey` when the environment is unset) is sent as a query parameter, which is the only form the PageSpeed API accepts. The environment wins when both are set. Error strings that could carry it are redacted before they reach the analytics JSON, because a report is a file people attach to tickets. The key is never written to `--out`.
- The service account email is not written to the report.

Nothing else in the engine reads credentials or `.env`. The only environment variables it consults are `GOOGLE_APPLICATION_CREDENTIALS`, `PAGESPEED_API_KEY`, `ANALYTICS_OBSERVE`, and the compatibility alias `SEO_ANALYTICS_OBSERVE`. The observe flags are switches rather than secrets - they opt in to a Chromium probe that intercepts the GA collect call on a cold load.

If you rotate a key, nothing next to `--out` needs purging. If you want to be sure, `grep` the report for the key: it should never match.

---

## What it writes

The analytics JSON is written to `-o, --out`. That flag is CLI-only (and the matching MCP `out` argument). It is a file path, not a directory. Default is `out/analytics.json`. Parent directories are created.

When a PageSpeed key is set, Lighthouse screenshots go under `dirname(--out)/psi-shots/` as `psi-{mobile,desktop}.{jpeg,png}`. Filenames are fixed, so nothing a remote server says can steer a write.

A leftover `outDir` key in TOML is rejected. Pass `--out` instead.

`--out` itself is not sanitised beyond resolution, so a flag that names a path outside your project will write outside your project. Treat it as you would any other output path in a build script.

---

## The browser is not sandboxed

Observe is off by default. When you opt in, Chromium is launched with `--no-sandbox`, because the usual deployment is an unprivileged container where Chromium's own sandbox cannot initialise. The flag is a constant in `src/chromium-args.ts`, not a setting. The consequence is real: a browser exploit is not contained by Chromium.

Containment is yours to provide. Run it in a container, as a non-root user, with no credentials mounted beyond the service account you intend it to use, and no network path to anything sensitive.

Playwright is not a required dependency. Install it only if you turn observe on.

---

## What runs in the page

Observe uses `page.evaluate`, so the code we run is our own, shipped in this package. We inject no third-party script into the audited page. Page JavaScript runs because a browser runs it, and it can see everything a visitor's browser would - which is why the browser should hold no session you care about.

---

## Supply chain

Production dependencies are listed in [NOTICE](../NOTICE): `google-auth-library`, `commander`, `smol-toml`, `@modelcontextprotocol/sdk` and `zod`. Only `google-auth-library` brings a subtree of any size, and it is Google's own. Playwright is optional and is not shipped with this package.
