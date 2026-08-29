# Analytics Audit

A **Search Console and GA4 analytics CLI**. Point it at a Google property; it
pulls time-series, public tags, and (when configured) Chrome field data plus
a homepage lab check, and writes one machine-readable `run.json`.

This tool creates a `run.json` output containing traffic evidence for you to 
integrate or act upon, it is not a readiness number.

[![Status][Status-shield]][Status-url]
[![Docs][Docs-shield]][Docs-url]
[![License][License-shield]][License-url]

> `autit-analytics` is a small Node tool to generate analytics reports. Install
> create an analytics.toml with your properties, then run

[![Pendulum][Pendulum-shield]][Pendulum-url]
[![Node][Node-shield]][Node-url]
[![GA4][GA4-shield]][GA4-url]
[![Search Console][SearchConsole-shield]][SearchConsole-url]

Mantra: "keep it simple, keep it safe".

---

## What pend-audit-analytics is

**Google setup and traffic evidence, honestly labelled.** Search Console, GA4,
public tags, and optional CrUX / PageSpeed land in `run.analytics`. Insights
flag period drops and low-CTR queries. Nothing is turned into a ranking or
readiness score - keeping this tool free of presentation decisions.

- **Project-local config** - one `analytics.toml` holds the property ids,
  date window, and output path.
- **Read-only Google APIs** - a service account with Restricted / Viewer
  access. A leaked key cannot change Search Console or GA4.
- **Soft-fail providers** - auth and API errors land in
  `run.analytics.errors[]` and the process still exits 0.
- **Observe off by default** - Chromium collect intercept is opt-in.

---

## Documentation

- [`docs/configuration.md`](docs/configuration.md) - every `analytics.toml` key
- [`docs/output.md`](docs/output.md) - the `run.json` contract
- [`docs/analytics.md`](docs/analytics.md) - Search Console and GA4 setup
- [`docs/security.md`](docs/security.md) - what this tool connects to and writes
- [`examples/`](examples/) - a working config

### Repository layout

```
docs/       configuration, output, analytics and security reference
examples/   annotated analytics.toml
src/        CLI, config, Google pull, insights, JSON writer, MCP
test/       tests
```

---

## Getting started

Requires **Node.js 22.12+**. No browser install unless you opt into observeEvents (see docs).

Requests to websites use a `pend-analytics/VERSION` user agent so a site owner reading
their logs can identify or block us.

### Install

As a project dependency, pinned to a release tag:

```bash
npm install github:pendulumdev/pend-audit-analytics#v0.1.1
```

Installing from git compiles `dist/` on install via the `prepare` script, so
both the CLI and the `./types` export resolve. Distribution is git tags and
GitHub Releases; npm under `@pendulumdev` may be released. See
[ROADMAP.md](ROADMAP.md).

### Install from a clone:

```bash
git clone https://github.com/pendulumdev/pend-audit-analytics.git
cd pend-audit-analytics
npm install
npm run build
npm link          # exposes `pend-analytics` on your PATH
```

Or without linking: `npx tsx src/cli.ts --help`, or `node dist/cli.js --help`
after a build.

---

## Use in a project

```bash
pend-analytics init                 # writes analytics.toml
# edit project, baseUrl, Search Console siteUrl, and GA4 propertyId
# set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON
pend-analytics audit                # -> analytics-out/run.json
pend-analytics mcp                  # MCP stdio (Cursor / Claude Desktop)
pend-analytics mcp --http           # Streamable HTTP on 127.0.0.1:3000/mcp
```

### MCP (agents)

Same implementations as the CLI. Tools: docs, config validate, projected
`analytics_audit_run`, `run_summarize`. Agent instructions are in
[`SKILL.md`](SKILL.md).

Cursor `mcp.json`:

```json
{
  "mcpServers": {
    "pend-analytics": {
      "command": "npx",
      "args": ["-y", "github:pendulumdev/pend-audit-analytics", "mcp"]
    }
  }
}
```

Hosted HTTP on the public internet is an Arc Lightsail concern, not this CLI.
`--http` binds loopback by default.

---

## Develop

```bash
npm install
npm test
npm run build
npm run dev -- audit -c examples/analytics.toml
```

The example is covered by tests, so a config key cannot change without the
example that documents it failing.

Keep the dependency surface small: commander, TOML, zod, MCP SDK, and
`google-auth-library`. Playwright is optional and only needed for observe.
See [CONTRIBUTING.md](CONTRIBUTING.md).

### Versioning and tags

- Version source of truth: root `package.json`, which
  `pend-analytics --version` reads
- A release is an annotated git tag `vX.Y.Z` on `main`
- Consumers should pin the tag, not a branch

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin main --tags
```

Pushing the tag runs the release workflow, which refuses to publish if the tag
and `package.json` disagree - otherwise anyone pinning that tag would get a
build that misreports its own version. It then re-runs the full gate against
the tagged commit and publishes a GitHub release.

### Limits (intentional)

- Does not produce a readiness score
- Does not predict rankings or replace keyword research
- API failures soft-fail into the report rather than failing the run
- Observe (Chromium collect intercept) is off by default
- Needs a Google service account with read access to Search Console and/or GA4

---

## Contributing

Issues and pull requests are welcome at
[`pendulumdev/pend-audit-analytics`](https://github.com/pendulumdev/pend-audit-analytics).
Prefer small, single-purpose changes. Start with
[CONTRIBUTING.md](CONTRIBUTING.md); report vulnerabilities per
[SECURITY.md](SECURITY.md).

### Contributors

- **[Pendulum](https://pendulumdev.co.uk)** - lead development and maintenance
- **[Devhalls](https://github.com/devhalls)** - primary author

---

## License

**MIT** - full text in [`LICENSE`](LICENSE). Third-party notices in
[`NOTICE`](NOTICE).

---

<!-- Badge definitions (reference-style; for-the-badge, black) -->
[Pendulum-shield]: https://img.shields.io/badge/pendulum-000000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmlld0JveD0iMCAwIDE2NSAxNjUiPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0ibGluZWFyLWdyYWRpZW50IiB4MT0iMCIgeTE9IjgzLjUiIHgyPSIxNjEuMzkiIHkyPSI4My41IiBncmFkaWVudFRyYW5zZm9ybT0idHJhbnNsYXRlKDAgMTY2KSBzY2FsZSgxIC0xKSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzMyYjdkNiIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2Y0OTYzYyIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxNjUiIGhlaWdodD0iMTY1IiBzdHlsZT0iZmlsbDp1cmwoI2xpbmVhci1ncmFkaWVudCk7Ii8+PHBhdGggZD0iTTU0LjA4LDEzM2gtMjUuOThWMzMuMDNoNDEuMzZjMTEuMjIsMCwxOS44MiwyLjkyLDI1Ljc4LDguNzVzOC45NSwxNC4wNSw4Ljk1LDI0LjY2LTIuOTgsMTguODMtOC45NSwyNC42NmMtNS45Niw1LjgzLTE0LjU2LDguNzUtMjUuNzgsOC43NWgtMTUuMzhzMCwzMy4xNSwwLDMzLjE1Wk01NC4wOCw3OC45aDguNjJjOS41NCwwLDE0LjMyLTQuMTUsMTQuMzItMTIuNDZzLTQuNzctMTIuNDYtMTQuMzItMTIuNDZoLTguNjJ2MjQuOTNoMFpNMTQzLjEsMzNsLTI2LjExLDEwMGgtMjVsMjYuMTEtMTAwaDI1WiIgc3R5bGU9ImZpbGw6I2ZmZjsiLz48L3N2Zz4=
[Pendulum-url]: https://pendulumdev.co.uk/
[Status-shield]: https://img.shields.io/badge/status-stable-000000?style=for-the-badge
[Status-url]: README.md
[Node-shield]: https://img.shields.io/badge/node-22.12+-000000?style=for-the-badge&logo=nodedotjs
[Node-url]: https://nodejs.org/
[GA4-shield]: https://img.shields.io/badge/GA4-000000?style=for-the-badge&logo=googleanalytics
[GA4-url]: https://developers.google.com/analytics
[SearchConsole-shield]: https://img.shields.io/badge/Search%20Console-000000?style=for-the-badge&logo=googlesearchconsole
[SearchConsole-url]: https://search.google.com/search-console
[Docs-shield]: https://img.shields.io/badge/docs-000000?style=for-the-badge&logo=readthedocs
[Docs-url]: docs/
[License-shield]: https://img.shields.io/badge/license-MIT-000000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMzIgMzIiPjxwYXRoIGZpbGw9IndoaXRlIiBkPSJNMTYgMmwyIDQuNXY5YzAgOC4yLTUuMSAxNC4xLTEyIDE2LjhDOS4xIDI5LjYgNCAyMy43IDQgMTUuNXYtOUwxNiAyeiIvPjwvc3ZnPg==
[License-url]: LICENSE
