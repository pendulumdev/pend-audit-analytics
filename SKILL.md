---
name: pend-analytics
description: >-
  Pull Pendulum Search Console and GA4 analytics via pend-analytics MCP or CLI.
  Use when the agent should inspect GSC/GA4 traffic, public tags, or a stored
  analytics JSON. This is not a readiness score.
---

# Pendulum analytics - LLM agent guide

This engine pulls **Google setup and traffic evidence**. Score fields are
zeros on purpose. It does not predict rankings or invent keywords.

## How to talk to it

1. Prefer MCP tools on this server. Fall back to `npx pend-analytics ...` in
   a shell.
2. Read JSON from the tool result or CLI stdout.
3. Never dump a full analytics JSON into context. Call `run_summarize` first.

**Stdio (Cursor / Claude Desktop):**

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

**Local HTTP (loopback):** `npx pend-analytics mcp --http --port 3000` then
point the client at `http://127.0.0.1:3000/mcp`. Do not bind `0.0.0.0`
unless you intend to expose a Google-API client on that machine.

## Workflow

1. `docs_get` with `input` / `output` / `analytics` / `security`.
2. `config_validate` on an `audit-config-analytics.toml` - no Google call.
3. `analytics_audit_run` - writes `--out` (default `out/analytics.json`),
   returns a projection (`sources`, `insightCount`, `errorCount`,
   `insightIds`, `runPath`).
4. `run_summarize` on the stored run before discussing numbers.

There is no catalog and no checklist.

## Config semantics

- At least one of `[analytics.searchConsole]` or `[analytics.ga4]` is
  required.
- `audit` force-enables configured sources.
- Provider errors soft-fail into `run.analytics.errors[]`.

## CLI equivalents

| Task | Command |
|------|---------|
| Init | `pend-analytics init` |
| Pull | `pend-analytics audit -c audit-config-analytics.toml` |
| Validate via MCP | `config_validate` |

Requires Node 22.12+. A Google service account with read access. PageSpeed /
CrUX need `PAGESPEED_API_KEY` or `analytics.pagespeedApiKey`. Playwright only
if you opt into observe.
