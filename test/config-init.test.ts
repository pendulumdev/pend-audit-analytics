import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { InitAnswers } from "../src/config.js";
import { defaultInitToml, loadConfig, writeInitConfig } from "../src/config.js";

const answers: InitAnswers = {
  project: "Studio site",
  baseUrl: "https://studio.example",
  searchConsoleSiteUrl: "sc-domain:studio.example",
  ga4PropertyId: "123456789",
};

describe("writeInitConfig", () => {
  it("writes a file the loader accepts", () => {
    const dir = mkdtempSync(join(tmpdir(), "pend-analytics-init-"));
    const path = writeInitConfig(join(dir, "analytics.toml"), false, answers);
    assert.equal(path, join(dir, "analytics.toml"));

    const cfg = loadConfig(path);
    assert.equal(cfg.project, "Studio site");
    assert.equal(cfg.baseUrl, "https://studio.example");
    assert.equal(cfg.analytics.searchConsole?.siteUrl, "sc-domain:studio.example");
    assert.equal(cfg.analytics.ga4?.propertyId, "123456789");
  });

  it("refuses to overwrite without --force", () => {
    const dir = mkdtempSync(join(tmpdir(), "pend-analytics-init-"));
    writeFileSync(join(dir, "analytics.toml"), 'project = "x"\n', "utf8");
    assert.throws(
      () => writeInitConfig(join(dir, "analytics.toml"), false, answers),
      /already exists/,
    );
  });
});

describe("loadConfig", () => {
  it("rejects leftover outDir keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "pend-analytics-outdir-"));
    const path = join(dir, "analytics.toml");
    writeFileSync(
      path,
      [
        'project = "T"',
        'standard = "Pendulum_Analytics_v1"',
        'baseUrl = "https://example.com"',
        'outDir = "analytics-out"',
        "",
        "[analytics.searchConsole]",
        'siteUrl = "sc-domain:example.com"',
        "",
      ].join("\n"),
    );
    assert.throws(() => loadConfig(path), /outDir is no longer a config key/);
  });
});

describe("init templates", () => {
  it("omits outDir and writes both sources", () => {
    const text = defaultInitToml(answers);
    assert.doesNotMatch(text, /outDir/);
    assert.match(text, /siteUrl = "sc-domain:studio.example"/);
    assert.match(text, /propertyId = "123456789"/);
  });

  it("comments the unused source when init skipped it", () => {
    const text = defaultInitToml({
      project: "Analytics audit",
      baseUrl: "https://example.com",
      searchConsoleSiteUrl: "sc-domain:example.com",
    });
    assert.match(text, /siteUrl = "sc-domain:example.com"/);
    assert.match(text, /# \[analytics.ga4\]/);
    assert.doesNotMatch(text, /^\[analytics.ga4\]/m);
  });

  it("parses through the real config loader", () => {
    const dir = mkdtempSync(join(tmpdir(), "pend-analytics-tpl-"));
    writeFileSync(join(dir, "ok.toml"), defaultInitToml(answers), "utf8");
    const cfg = loadConfig(join(dir, "ok.toml"));
    assert.equal(cfg.analytics.searchConsole?.siteUrl, "sc-domain:studio.example");
    assert.equal(cfg.analytics.ga4?.propertyId, "123456789");
    assert.equal(cfg.analytics.credentialsPath, undefined);
  });

  it("writes credentialsPath when init supplied one", () => {
    const text = defaultInitToml({
      ...answers,
      credentialsPath: "/Users/you/Secrets/analytics-sa.json",
    });
    assert.match(text, /credentialsPath = "\/Users\/you\/Secrets\/analytics-sa.json"/);
    const dir = mkdtempSync(join(tmpdir(), "pend-analytics-cred-"));
    writeFileSync(join(dir, "ok.toml"), text, "utf8");
    assert.equal(
      loadConfig(join(dir, "ok.toml")).analytics.credentialsPath,
      "/Users/you/Secrets/analytics-sa.json",
    );
  });

  it("writes pagespeedApiKey when init supplied one", () => {
    const text = defaultInitToml({
      ...answers,
      pagespeedApiKey: "AIzaSyExampleKey",
    });
    assert.match(text, /pagespeedApiKey = "AIzaSyExampleKey"/);
    const dir = mkdtempSync(join(tmpdir(), "pend-analytics-psi-"));
    writeFileSync(join(dir, "ok.toml"), text, "utf8");
    assert.equal(
      loadConfig(join(dir, "ok.toml")).analytics.pagespeedApiKey,
      "AIzaSyExampleKey",
    );
  });
});
