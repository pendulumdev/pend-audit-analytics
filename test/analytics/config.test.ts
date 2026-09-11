import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "../../src/config.js";

function writeToml(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pend-analytics-"));
  const path = join(dir, "analytics.toml");
  writeFileSync(
    path,
    `project = "t"
standard = "Pendulum_Analytics_v1"
baseUrl = "https://example.com"
${body}
`,
    "utf8",
  );
  return path;
}

describe("analytics config", () => {
  it("parses a slim nested [analytics] block without SEO targets", () => {
    const path = writeToml(`
[analytics]
enabled = true
rangeDays = 28
comparePrevious = true
[analytics.searchConsole]
siteUrl = "sc-domain:example.com"
[analytics.ga4]
propertyId = "properties/123456789"
`);
    const cfg = loadConfig(path);
    assert.equal(cfg.standard, "Pendulum_Analytics_v1");
    assert.equal(cfg.analytics.enabled, true);
    assert.equal(cfg.analytics.searchConsole?.siteUrl, "sc-domain:example.com");
    assert.equal(cfg.analytics.ga4?.propertyId, "123456789");
    assert.equal(cfg.analytics.observeEvents, false);
    assert.equal(cfg.analytics.rangeDays, 28);
  });

  it("folds top-level rangeDays into a nested table", () => {
    const dir = mkdtempSync(join(tmpdir(), "pend-analytics-cfg-"));
    const path = join(dir, "analytics.toml");
    writeFileSync(
      path,
      `project = "t"
standard = "Pendulum_Analytics_v1"
baseUrl = "https://example.com"
rangeDays = 14
comparePrevious = false

[analytics.searchConsole]
siteUrl = "sc-domain:example.com"
`,
      "utf8",
    );
    const cfg = loadConfig(path);
    assert.equal(cfg.analytics.rangeDays, 14);
    assert.equal(cfg.analytics.comparePrevious, false);
    assert.equal(cfg.analytics.searchConsole?.siteUrl, "sc-domain:example.com");
    assert.equal(cfg.analytics.enabled, true);
  });

  it("parses observeEvents", () => {
    const path = writeToml(`
[analytics]
enabled = true
observeEvents = true
[analytics.ga4]
propertyId = "123456789"
`);
    const cfg = loadConfig(path);
    assert.equal(cfg.analytics.observeEvents, true);
  });

  it("parses named rival hosts on the analytics table", () => {
    const path = writeToml(`
[analytics]
enabled = true
rivals = ["https://rival.test", "https://peer.test"]
[analytics.searchConsole]
siteUrl = "sc-domain:example.com"
`);
    const cfg = loadConfig(path);
    assert.deepEqual(cfg.analytics.rivals, ["https://rival.test", "https://peer.test"]);
  });

  it("rejects enabled analytics without sources", () => {
    const path = writeToml(`
[analytics]
enabled = true
`);
    assert.throws(() => loadConfig(path), /searchConsole and\/or analytics.ga4/);
  });

  it("rejects rangeDays over 90", () => {
    const path = writeToml(`
[analytics]
enabled = true
rangeDays = 120
[analytics.searchConsole]
siteUrl = "sc-domain:example.com"
`);
    assert.throws(() => loadConfig(path), /rangeDays must be <= 90/);
  });
});
