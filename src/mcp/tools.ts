import { runAnalyticsPull } from "../analytics/runner.js";
import { loadConfig } from "../config.js";
import { readRunJson, writeReports } from "../report/write.js";
import { DOC_PAGES, isDocPage, readDocPage } from "./docs.js";
import { summarizeRun } from "./project.js";

export type ToolArgs = Record<string, unknown>;

export async function dispatchAnalyticsTool(
  name: string,
  args: ToolArgs,
): Promise<unknown> {
  switch (name) {
    case "docs_get":
      return docsGet(args);
    case "config_validate":
      return configValidate(args);
    case "analytics_audit_run":
      return analyticsAuditRun(args);
    case "run_summarize":
      return runSummarize(args);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function docsGet(args: ToolArgs) {
  const page = required(args.page, "page");
  if (!isDocPage(page)) {
    throw new Error(`unknown docs page "${page}" (want ${DOC_PAGES.join(", ")})`);
  }
  return readDocPage(page);
}

function configValidate(args: ToolArgs) {
  const config = loadConfig(required(args.config, "config"));
  return {
    project: config.project,
    standard: config.standard,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    outDir: config.outDir,
    sources: {
      gsc: Boolean(config.analytics.searchConsole),
      ga4: Boolean(config.analytics.ga4),
      observeEvents: Boolean(config.analytics.observeEvents),
    },
  };
}

async function analyticsAuditRun(args: ToolArgs) {
  const config = loadConfig(required(args.config, "config"));
  if (typeof args.out === "string" && args.out) config.outDir = args.out;
  const run = await runAnalyticsPull(config);
  const written = writeReports(run, config.outDir);
  return { runPath: written.runJson, ...summarizeRun(run) };
}

function runSummarize(args: ToolArgs) {
  const run = readRunJson(required(args.runPath, "runPath"));
  return summarizeRun(run);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function required(value: unknown, name: string): string {
  const out = str(value);
  if (!out) throw new Error(`${name} is required`);
  return out;
}
