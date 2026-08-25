# Roadmap

Status: **MVP**. The Search Console / GA4 pull works and is tested. The gaps
below are real and are listed here rather than left for someone to discover
from a surprising report.

## Known gaps

### URL Inspection is not pulled

Search Console's URL Inspection API would tell you what Google actually indexed
for a page, which is a different and stronger fact than what the page says
about itself. It is not wired up. Its per-URL quota is low enough that it
needs a sampling strategy rather than a naive loop, which is why it has not
landed yet.

### Observe is off on the portal

The Chromium collect intercept (`observeEvents` / `ANALYTICS_OBSERVE`) is
opt-in and off by default. The hosted portal does not turn it on. Installing
Playwright yourself is required if you want the probe locally.

## Distribution

Installation is currently from a git tag:

```bash
npm install github:pendulumdev/pend-analytics-audit#v0.1.0
```

Publishing to npm under the `@pendulumdev` scope is intended. The package
manifest and release workflow are already shaped for it, so it is a small
change rather than a migration. Until then, the annotated tag is the release,
and consumers should pin one rather than track a branch.

## Stability

Treat these as public API. Changing any of them is a breaking change:

- The `run.json` shape, exported as `AuditRun` from
  `@pendulumdev/analytics/types`
- `analytics.toml` key names
- Everything re-exported from `src/index.ts`

Anything not re-exported from `src/index.ts` is internal and may change in a
patch release.

## Shipped: MCP

`pend-analytics mcp` (stdio) and `pend-analytics mcp --http` (loopback
Streamable HTTP) expose docs, config validate, projected
`analytics_audit_run`, and `run_summarize`. See [`SKILL.md`](SKILL.md). Public
hosted HTTP is an Arc Lightsail concern, not this CLI.

## Not planned

- **A readiness score.** Traffic evidence is not a rating. The zeros in
  `run.score` are intentional.
- **Ranking prediction.** Nothing in a GSC/GA4 pull predicts search position.
- **A report UI.** `run.json` is the interface. Presentation belongs to
  whatever consumes it.
- **Paid SERP, backlink, or keyword APIs.** Off-page data products stay out
  of this engine.
