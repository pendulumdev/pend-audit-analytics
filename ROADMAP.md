# Roadmap

Status: **production**. The Search Console / GA4 pull is the supported product.
The gaps below are still real and are listed here rather than left for someone
to discover from a surprising report.

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
npm install github:pendulumdev/pend-audit-analytics#v0.2.0
```

Distribution is git tags and GitHub Releases. Consumers should pin an
annotated tag rather than track a branch. Publishing to npm under the
`@pendulumdev` scope is not scheduled.

## Stability

Treat these as public API. Changing any of them is a breaking change:

- The `--out` JSON shape, exported as `AuditRun` from
  `@pendulumdev/analytics/types`
- `audit-config-analytics.toml` key names
- The PageSpeed screenshot path scheme under `dirname(--out)/psi-shots/`
- Everything re-exported from `src/index.ts`

Anything not re-exported from `src/index.ts` is internal and may change in a
patch release.

## Shipped: MCP

`pend-analytics mcp` (stdio) and `pend-analytics mcp --http` (loopback
Streamable HTTP) expose docs, config validate, projected
`analytics_audit_run`, and `run_summarize`. See [`SKILL.md`](SKILL.md). Public
hosted HTTP is out of scope for this CLI.

## Not planned

- **A readiness score.** Traffic evidence is not a rating. The zeros in
  `run.score` are intentional.
- **Ranking prediction.** Nothing in a GSC/GA4 pull predicts search position.
- **A report UI.** `out/analytics.json` is the interface. Presentation belongs
  to whatever consumes it.
- **Paid SERP, backlink, or keyword APIs.** Off-page data products stay out
  of this engine.
