# Security policy

## Reporting a vulnerability

Please do not open a public issue.

Report privately through
[GitHub Security Advisories](https://github.com/pendulumdev/pend-analytics-audit/security/advisories/new),
or email **security@pendulumdev.co.uk**.

Include what you did, what happened, and what you expected. A proof of concept
helps. We will acknowledge within 5 working days and aim to have a fix or a
clear plan within 30 days for anything we can reproduce.

Please do not test against systems you do not own.

## Supported versions

Alpha: only the latest tagged release is supported. Fixes land on `main` and
go out in the next tag.

## Known and accepted characteristics

These are documented properties of the tool, not vulnerabilities. Full detail
in [`docs/security.md`](docs/security.md).

- **The config is trusted input.** `baseUrl` drives `fetch` with no
  private-address filter. If you accept configs from untrusted users, you
  must allow-list hosts yourself.
- **The optional browser is not sandboxed.** `--no-sandbox` is passed so
  Chromium can run in an unprivileged container. Observe is off by default.
  Containment is the operator's responsibility.
- **This engine holds a Google service account.** A key file is read from
  disk and exchanged for read-only tokens. See `docs/security.md` for what
  is and is not written to the report.
- **`outDir` is not sanitised** beyond path resolution.

Reports that consist only of one of the above, without a concrete escalation
beyond what is documented, will be closed with a pointer here.
