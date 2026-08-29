# Contributing

Thanks for looking. Small, single-purpose changes get merged fastest.

## Setup

```bash
npm install
npm test
```

The suite runs offline. Nothing in it reaches the network or launches a
browser, so it finishes in a couple of seconds.

## Before you open a PR

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same set on Node 22, plus a full-history secret scan and an
ASCII punctuation check.

## The rules that matter here

This tool reports on other people's traffic, so being confidently wrong is the
expensive failure. Four conventions exist to prevent it:

1. **Never invent a value you did not read.** A missing series is omitted, not
   zeroed. Provider failures land in `errors[]` rather than looking like an
   empty but healthy property.

2. **The score stays zeros.** This engine does not rate traffic. Do not add a
   readiness number, a band derived from clicks, or a catalog of scored
   checks.

3. **Soft-fail Google APIs.** Auth and provider errors must not fail the
   process. Exit non-zero only when the config itself is invalid.

4. **ASCII hyphens only.** Use `-` in prose, code, UI copy and commits. No
   `U+2014` em dash, no `U+2013` en dash. CI enforces this.

## Tests

```bash
npm test              # every test/**/*.test.ts, discovered
npm test analytics    # only paths containing "analytics"
```

Test files are found by `scripts/run-tests.mjs`, so a new `*.test.ts` anywhere
under `test/` runs with no registration step. There is nothing to add to
`package.json`.

Test deterministic logic, boundaries and user-visible behaviour. Please do
not add tests for trivial accessors, or tests that only assert a mock was
called - they cost maintenance and prove nothing.

`test/examples.test.ts` loads everything in `examples/` through the real
config loader. That is what stops a shipped example from drifting away from
the parser it claims to describe, so if you change a config key, expect the
example to fail until you update it too. It also holds the examples to
reserved hosts, so running one unchanged cannot pull somebody's real
property.

## Commits

Tag-line only, no body:

```
[ADD] Surface organic daily rows in the GA4 bundle
[FIX] Redact the PageSpeed key from error strings
[DOC] Split the observe walkthrough out of the README
```

Tags in use: `[ADD]` `[FIX]` `[CHG]` `[UPD]` `[DOC]` `[TST]` `[CFG]` `[RM]`.

## Reporting bugs

Include the relevant slice of `run.json` and what you expected instead. Strip
property ids and credential paths before you paste. For security issues do
not open an issue - see [SECURITY.md](SECURITY.md).
