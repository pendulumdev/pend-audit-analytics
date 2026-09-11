import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writeReports } from "../../src/report/write.js";
import { unscoredSummary } from "../../src/score.js";
import type { AuditRun } from "../../src/types.js";

function run(over: Partial<AuditRun> = {}): AuditRun {
  return {
    version: 1,
    tool: "@pendulumdev/analytics",
    generatedAt: "2026-01-01T00:00:00.000Z",
    project: "Example",
    standard: "Pendulum_Analytics_v1",
    score: unscoredSummary(),
    pages: [],
    findings: [],
    analytics: {
      range: { start: "2026-01-01", end: "2026-01-28" },
      insights: [],
    },
    ...over,
  };
}

describe("writeReports", () => {
  it("writes the run object to a file path and does not invent extra keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "pend-analytics-write-"));
    writeReports(run(), join(dir, "out", "analytics.json"));
    const written = JSON.parse(
      readFileSync(join(dir, "out", "analytics.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal("catalogVersion" in written, false);
    assert.equal("checkLinks" in written, false);
    assert.equal("disclaimer" in written, false);
    assert.equal("outDir" in written, false);
    assert.equal(written.project, "Example");
    assert.equal(written.version, 1);
  });
});
