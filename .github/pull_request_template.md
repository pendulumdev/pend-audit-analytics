## What and why

<!-- One or two sentences. What changes, and what problem it solves. -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass
- [ ] Meaningful tests for new rules and boundaries
- [ ] Docs updated in this change (`docs/`, `README.md`, `ROADMAP.md`) if behaviour moved
- [ ] ASCII hyphens only - no en or em dashes
- [ ] Commit messages are tag-line only (`[ADD] ...`)

## Correctness

- [ ] A missing series is omitted, not invented as zero
- [ ] Provider and auth errors soft-fail into `run.analytics.errors[]`
- [ ] The score stays zeros - this engine does not rate traffic

## Config and examples

- [ ] New or changed config keys are documented in `docs/input.md`
- [ ] `examples/analytics.toml` demonstrates them, and `test/examples.test.ts` passes

## Breaking changes

<!-- The --out JSON shape, audit-config-analytics.toml key names, and the package root
     exports are all public API. See ROADMAP.md. -->

- [ ] No public API change, or the break is described above and the version bump
      reflects it
