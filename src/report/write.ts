import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AuditRun } from "../types.js";

export const DEFAULT_ANALYTICS_OUT = "out/analytics.json";

export interface WrittenReports {
  runJson: string;
}

/** Write the analytics result to `outPath` (file path, not a directory). */
export function writeReports(run: AuditRun, outPath: string): WrittenReports {
  const runJson = resolve(outPath);
  mkdirSync(dirname(runJson), { recursive: true });
  writeFileSync(runJson, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return { runJson };
}

/**
 * Read an analytics JSON this tool wrote earlier.
 *
 * The file is trusted as our own output, but a truncated or unrelated JSON file
 * is a common mistake when re-reading a stored run, so the fields a consumer
 * cannot work without are checked here. Anything past that is the writer's
 * contract, not this reader's.
 */
export function readRunJson(path: string): AuditRun {
  const abs = resolve(path);
  const raw: unknown = JSON.parse(readFileSync(abs, "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`not an analytics JSON object: ${abs}`);
  }
  const run = raw as Partial<AuditRun>;
  if (!run.score || !run.analytics || !Array.isArray(run.pages)) {
    throw new Error(`analytics JSON is missing score/analytics/pages: ${abs}`);
  }
  return raw as AuditRun;
}
