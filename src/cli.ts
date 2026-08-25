#!/usr/bin/env node
import { resolve } from "node:path";
import { Command } from "commander";
import { runAnalyticsPull } from "./analytics/runner.js";
import { loadConfig, writeInitConfig } from "./config.js";
import { parseMcpArgs, startMcp } from "./mcp/server.js";
import { writeReports } from "./report/write.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("pend-analytics")
  .description("Pendulum Search Console and GA4 analytics CLI")
  .version(VERSION);

program
  .command("init")
  .description("Write analytics.toml in the current directory")
  .option("-f, --force", "Overwrite existing analytics.toml", false)
  .option("-c, --config <path>", "Config path", "analytics.toml")
  .option("-p, --project <name>", "Project name")
  .action((opts: { force: boolean; config: string; project?: string }) => {
    try {
      writeInitConfig(opts.config, opts.force, opts.project);
      console.error(`wrote ${resolve(opts.config)}`);
    } catch (err) {
      fail(err);
    }
  });

program
  .command("audit")
  .description("Pull Search Console / GA4 into run.json (unscored analytics bundle)")
  .option("-c, --config <path>", "Config path", "analytics.toml")
  .option("-o, --out <dir>", "Override outDir from config")
  .action(async (opts: { config: string; out?: string }) => {
    try {
      const config = loadConfig(opts.config);
      if (opts.out) config.outDir = opts.out;
      console.error(`analytics pull ${config.project}...`);
      const run = await runAnalyticsPull(config);
      const written = writeReports(run, config.outDir);
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
