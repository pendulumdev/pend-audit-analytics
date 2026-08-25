import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AuditRun } from "../types.js";

export interface WrittenReports {
  outDir: string;
  runJson: string;
}

/** Write the canonical `run.json` artifact. */
export function writeReports(run: AuditRun, outDir: string): WrittenReports {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const runJson = join(root, "run.json");
  writeFileSync(runJson, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return { outDir: root, runJson };
}

export function readRunJson(path: string): AuditRun {
  const abs = resolve(path);
  const raw: unknown = JSON.parse(readFileSync(abs, "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`not a run.json object: ${abs}`);
  }
  const run = raw as Partial<AuditRun>;
  if (!run.score || !run.analytics || !Array.isArray(run.pages)) {
    throw new Error(`run.json is missing score/analytics/pages: ${abs}`);
  }
  return raw as AuditRun;
}
