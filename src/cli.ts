#!/usr/bin/env node
import { Command } from "commander";
import { runAnalyticsPull } from "./analytics/runner.js";
import { DEFAULT_ANALYTICS_CONFIG, loadConfig } from "./config.js";
import { formatInitSummary, runInit } from "./init.js";
import { parseMcpArgs, startMcp } from "./mcp/server.js";
import { releaseStdin } from "./prompt.js";
import { DEFAULT_ANALYTICS_OUT, writeReports } from "./report/write.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("pend-analytics")
  .description("Pendulum Search Console and GA4 analytics CLI")
  .version(VERSION);

program
  .command("init")
  .description("Ask a few questions and write audit-config-analytics.toml")
  .option("-f, --force", "Overwrite an existing config file", false)
  .option(
    "-c, --config <path>",
    "Config path to write (default audit-config-analytics.toml)",
  )
  .action(async (opts: { force: boolean; config?: string }) => {
    try {
      const result = await runInit({
        force: opts.force,
        ...(opts.config !== undefined && { config: opts.config }),
      });
      process.stdout.write(formatInitSummary(result));
      releaseStdin();
      process.exit(0);
    } catch (err) {
      fail(err);
    }
  });

program
  .command("audit")
  .description("Pull Search Console / GA4 and write JSON to --out")
  .option("-c, --config <path>", "Config path", DEFAULT_ANALYTICS_CONFIG)
  .option("-o, --out <path>", "Output file path", DEFAULT_ANALYTICS_OUT)
  .action(async (opts: { config: string; out: string }) => {
    try {
      const config = loadConfig(opts.config);
      console.error(`analytics pull ${config.project}...`);
      const run = await runAnalyticsPull(config, { outPath: opts.out });
      const written = writeReports(run, opts.out);
      const errCount = run.analytics.errors?.length ?? 0;
      const sources = [
        run.analytics.gsc ? "gsc" : null,
        run.analytics.ga4 ? "ga4" : null,
      ].filter(Boolean);
      console.error(
        `analytics ${sources.length ? sources.join("+") : "none"}` +
          (errCount ? ` · ${errCount} provider error(s)` : ""),
      );
      console.error(`wrote ${written.runJson}`);
      // Soft-fail: auth/API errors stay in run.analytics.errors[]; exit 0.
    } catch (err) {
      fail(err);
    }
  });

program
  .command("mcp")
  .description("Start the MCP server (stdio by default; --http for Streamable HTTP)")
  .option("--http", "Serve Streamable HTTP on /mcp instead of stdio", false)
  .option("--port <n>", "HTTP port", "3000")
  .option("--bind <addr>", "HTTP bind address (default 127.0.0.1)", "127.0.0.1")
  .action(async (opts: { http: boolean; port: string; bind: string }) => {
    try {
      const parsed = parseMcpArgs([
        ...(opts.http ? ["--http"] : []),
        "--port",
        opts.port,
        "--bind",
        opts.bind,
      ]);
      await startMcp(parsed);
    } catch (err) {
      fail(err);
    }
  });

program.parseAsync(process.argv).catch(fail);

function fail(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`error: ${message}`);
  process.exit(1);
  throw new Error(message);
}
