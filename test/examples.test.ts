/**
 * The shipped example is documentation, and documentation that does not
 * compile is worse than none. This loads it through the real loader so it
 * cannot drift from the parser it claims to describe.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = join(ROOT, "examples");

/** Every host an example names, port stripped, so none can be a real site. */
function hostsIn(file: string): string[] {
  const text = readFileSync(join(EXAMPLES, file), "utf8");
  return [...text.matchAll(/https?:\/\/([^/"\s]+)/g)]
    .map((m) => m[1]?.split(":")[0])
    .filter((h): h is string => h !== undefined);
}

describe("examples/analytics.toml", () => {
  const config = loadConfig(join(EXAMPLES, "analytics.toml"));

  it("parses through the real config loader", () => {
    assert.equal(config.standard, "Pendulum_Analytics_v1");
    assert.match(config.baseUrl ?? "", /^https?:\/\//);
  });

  it("configures analytics without shipping a real property", () => {
    assert.equal(config.analytics.enabled, true);
    assert.equal(config.analytics.searchConsole?.siteUrl, "sc-domain:example.com");
    assert.equal(config.analytics.ga4?.propertyId, "123456789");
    assert.equal(config.analytics.credentialsPath, undefined);
    assert.equal(config.analytics.pagespeedApiKey, undefined);
    assert.equal(config.analytics.rangeDays, 28);
    assert.equal(config.analytics.comparePrevious, true);
    assert.equal(config.analytics.observeEvents, false);
    assert.equal(config.analytics.startDate, undefined);
    assert.equal(config.analytics.endDate, undefined);
    assert.equal(config.analytics.rivals, undefined);
  });

  it("documents every config key, including those left at the off default", () => {
    const text = readFileSync(join(EXAMPLES, "analytics.toml"), "utf8");
    for (const key of [
      "project",
      "standard",
      "baseUrl",
      "enabled",
      "credentialsPath",
      "pagespeedApiKey",
      "rangeDays",
      "startDate",
      "endDate",
      "comparePrevious",
      "observeEvents",
      "rivals",
      "siteUrl",
      "propertyId",
    ]) {
      assert.match(text, new RegExp(`\\b${key}\\b`));
    }
  });
});

describe("every example", () => {
  it("names only reserved or loopback hosts", () => {
    for (const file of ["analytics.toml"]) {
      for (const host of hostsIn(file)) {
        assert.ok(
          host === "example.com" || host === "127.0.0.1" || host === "localhost",
          `${file} names a non-reserved host: ${host}`,
        );
      }
    }
  });
});
