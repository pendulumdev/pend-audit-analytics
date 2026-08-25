# Output

Every run writes one file: `run.json` in `outDir` (default `analytics-out/`,
which should be gitignored). It is the only interface downstream tools need,
and its TypeScript shape is exported as `AuditRun` from
`@pendulumdev/analytics/types`.

```
analytics-out/
  run.json      unscored envelope plus analytics bundle
  psi-shots/    Lighthouse screenshots, when PageSpeed Insights ran
```

## Unscored on purpose

| Signal | Meaning |
|--------|---------|
| Automated readiness | Always `0` |
| Worst page score | Always `0` |
| Band | Always `Critical gaps` |
| Issue burden | All zeros |
| Manual completion | Empty (`0 / 0`) |

This engine does not rate traffic. The `score` object is kept so consumers that
already read a Pendulum `run.json` still parse. Do not treat the band as a
readiness claim.

`pages` and `findings` are always empty arrays. `catalogVersion` is `0`. There
is no check catalog.

## Analytics

The payload is `run.analytics`:

- `range` - resolved primary window, plus previous window when compare is on
- `gsc` - Search Console daily rows, top pages, top queries, totals
- `ga4` - sessions, landing pages, channels, devices, new vs returning
- `googleSetup` - public tags, GTM containers, collisions
- `events` - declared vs received (and optional observed) event names
- `crux` - origin Chrome UX Report field vitals, when a PageSpeed key is set
- `psi` - homepage lab rows (mobile and desktop), when a PageSpeed key is set
- `insights` - period drops, low-CTR queries, position watch
- `errors` - provider, auth, tags, observe, CrUX, or PSI soft-failures

Provider failures stay in `errors[]` and the process still exits 0. Setup and
troubleshooting: [`analytics.md`](analytics.md).

`writeReports` writes `run.json` as-is. It does not overwrite `disclaimer`.

## Reading a stored run

`readRunJson()` requires `score`, `analytics`, and `pages`, then hands back a
typed `AuditRun`. Re-rendering a run written by an older version is the common
failure, and it is better to fail with a clear message than to render half a
report.
