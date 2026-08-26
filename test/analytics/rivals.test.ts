import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRivalPage } from "../../src/analytics/rivals.js";

describe("parseRivalPage", () => {
  it("reads observed fields only", () => {
    const html = `<!doctype html>
<html>
<head>
  <title>Rival home</title>
  <meta name="description" content="Public rival page">
  <script type="application/ld+json">{"@type":"Organization"}</script>
</head>
<body>
  <h1>Hello</h1>
  <h2>More</h2>
  <p>Word count sample text here.</p>
</body>
</html>`;
    const page = parseRivalPage(html, "https://rival.test/");
    assert.equal(page.url, "https://rival.test/");
    assert.equal(page.title, "Rival home");
    assert.equal(page.description, "Public rival page");
    assert.equal(page.h1, "Hello");
    assert.deepEqual(page.schemaTypes, ["Organization"]);
    assert.ok((page.wordCount ?? 0) > 0);
    assert.equal(page.headingCount, 2);
  });

  it("omits fields that were not in the HTML", () => {
    const page = parseRivalPage("<html><body>plain</body></html>", "https://rival.test/x");
    assert.equal(page.title, undefined);
    assert.equal(page.description, undefined);
    assert.equal(page.h1, undefined);
    assert.equal(page.schemaTypes, undefined);
  });
});
