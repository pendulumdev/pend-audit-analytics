/**
 * The GitHub Release body is a committed file, not `gh --generate-notes`.
 * If package.json moves and the notes file does not, the tag workflow
 * fails after the fact. This fails at `npm test` instead.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_HEADINGS = [
  "**Min version support:**",
  "**Requires:**",
  "**Runtime support:**",
  "**Support us:**",
];

describe("docs/releases", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  const notesPath = join(ROOT, "docs", "releases", `v${pkg.version}.md`);
  const body = readFileSync(notesPath, "utf8");

  it("has notes for the package.json version", () => {
    assert.ok(body.trim().length > 0, `missing or empty ${notesPath}`);
  });

  it("opens with the product sentence and tag", () => {
    const first = body.split("\n")[0] ?? "";
    assert.match(first, /^Search Console and GA4 analytics CLI\./);
    assert.match(first, new RegExp(`for v${pkg.version.replaceAll(".", "\\.")}\\.$`));
  });

  it("keeps the headed sections the workflow publishes", () => {
    for (const heading of REQUIRED_HEADINGS) {
      assert.ok(body.includes(heading), `missing ${heading} in ${notesPath}`);
    }
  });
});
