import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { chooseAnalyticsOutput } from "../../src/report/output-mode.js";
import { writeReports } from "../../src/report/write.js";
import type { AuditRun } from "../../src/types.js";

describe("analytics output mode", () => {
  it("uses JSON when no database contract is present", () => {
    assert.equal(chooseAnalyticsOutput({ databaseUrl: "" }, ["audit"]), "json");
  });

  it("uses the database when the url and run id are both set", () => {
    assert.equal(
      chooseAnalyticsOutput({ databaseUrl: "postgres://db" }, [
        "audit",
        "--run-id",
        "run-1",
      ]),
      "database",
    );
  });

  it("fails closed when only one half of database mode is set", () => {
    assert.throws(
      () => chooseAnalyticsOutput({ databaseUrl: "postgres://db" }, ["audit"]),
      /--run-id is required/,
    );
    assert.throws(
      () => chooseAnalyticsOutput({ databaseUrl: "" }, ["audit", "--run-id", "run-1"]),
      /AUDIT_DATABASE_URL is required/,
    );
  });

  it("JSON mode throws when the file cannot be written and does not mention the database", () => {
    const dir = mkdtempSync(join(tmpdir(), "analytics-out-"));
    const blocked = join(dir, "not-a-dir");
    writeFileSync(blocked, "x");
    const run = {
      version: 1,
      tool: "test",
      generatedAt: "2026-01-01T00:00:00.000Z",
      project: "p",
      standard: "Pendulum_Analytics_v1",
      score: {
        automatedReadiness: 0,
        worstPageScore: 0,
        band: "Good",
        burden: { critical: 0, serious: 0, moderate: 0, minor: 0, uniqueRules: 0 },
        manual: { total: 0, completed: 0, percent: 0 },
      },
      pages: [],
      findings: [],
      analytics: { range: { start: "2026-01-01", end: "2026-01-28" }, insights: [] },
    } as AuditRun;
    assert.throws(() => writeReports(run, join(blocked, "analytics.json")));
  });
});
