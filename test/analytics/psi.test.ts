import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  fetchPsiPage,
  parsePsiPage,
  parsePsiScreenshot,
  psiScreenshotRelPath,
  redactApiKey,
  selectPsiJobs,
  writePsiScreenshot,
} from "../../src/analytics/psi.js";

describe("selectPsiJobs", () => {
  it("homepage only, mobile then desktop", () => {
    assert.deepEqual(selectPsiJobs("https://example.com/"), [
      { url: "https://example.com/", strategy: "mobile" },
      { url: "https://example.com/", strategy: "desktop" },
    ]);
  });

  it("skips a blank homepage", () => {
    assert.deepEqual(selectPsiJobs("  "), []);
  });
});

describe("redactApiKey", () => {
  const KEY = "AIzaSyTOTALLYNOTREAL_0123456789";

  it("removes the key when an error quotes the request URL", () => {
    const message = `request to https://www.googleapis.com/x?url=https%3A%2F%2Fe.com&key=${KEY}&strategy=MOBILE failed`;
    const clean = redactApiKey(message, KEY);
    assert.ok(!clean.includes(KEY), clean);
    assert.ok(clean.includes("key=REDACTED"), clean);
    // Everything else survives, or the message stops being diagnosable.
    assert.ok(clean.includes("strategy=MOBILE"), clean);
  });

  it("removes a bare key even with no query string around it", () => {
    assert.equal(redactApiKey(`bad key: ${KEY}`, KEY), "bad key: REDACTED");
  });

  it("still strips a key= parameter when the configured key is unknown", () => {
    assert.equal(
      redactApiKey("GET /v5?key=leaked123&x=1", ""),
      "GET /v5?key=REDACTED&x=1",
    );
  });

  it("leaves an ordinary message alone", () => {
    assert.equal(redactApiKey("API key not valid", KEY), "API key not valid");
  });
});

describe("fetchPsiPage", () => {
  const KEY = "AIzaSyTOTALLYNOTREAL_0123456789";

  it("keeps the key out of a row error built from an API body", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      // Google does not echo the key, but a proxy or gateway in front of it can.
      const url = String(input instanceof Request ? input.url : input);
      assert.ok(url.includes(`key=${KEY}`), "the key should reach the wire");
      return new Response(
        JSON.stringify({ error: { message: `upstream rejected ${url}` } }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof globalThis.fetch;
    try {
      const row = await fetchPsiPage({
        url: "https://example.com/",
        strategy: "mobile",
        apiKey: KEY,
      });
      assert.ok(row.error, "expected an error row");
      assert.ok(!row.error?.includes(KEY), `key leaked into run.json: ${row.error}`);
      assert.ok(row.error?.includes("key=REDACTED"), `unexpected error: ${row.error}`);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("keeps the key out of a row error built from a transport failure", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      throw new Error(`connect ECONNREFUSED for ${url}`);
    }) as typeof globalThis.fetch;
    try {
      const row = await fetchPsiPage({
        url: "https://example.com/",
        strategy: "desktop",
        apiKey: KEY,
      });
      assert.ok(!row.error?.includes(KEY), `key leaked into run.json: ${row.error}`);
      assert.ok(row.error?.includes("ECONNREFUSED"), `unexpected error: ${row.error}`);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("parsePsiPage", () => {
  it("maps performance score 0-100 and top 3 opportunities by savings", () => {
    const parsed = parsePsiPage("https://example.com/", {
      lighthouseResult: {
        categories: {
          performance: {
            score: 0.72,
            auditRefs: [
              { id: "unused-javascript", group: "load-opportunities" },
              { id: "unused-css-rules", group: "load-opportunities" },
              { id: "render-blocking-resources", group: "load-opportunities" },
              { id: "efficient-animated-content", group: "load-opportunities" },
              { id: "color-contrast", group: "a11y" },
              { id: "first-contentful-paint", group: "metrics" },
            ],
          },
          accessibility: { score: 0.9 },
          seo: { score: 0.8 },
        },
        audits: {
          "unused-javascript": {
            title: "Reduce unused JavaScript",
            details: { overallSavingsMs: 840 },
          },
          "unused-css-rules": {
            title: "Reduce unused CSS",
            details: { overallSavingsMs: 210 },
          },
          "render-blocking-resources": {
            title: "Eliminate render-blocking resources",
            details: { overallSavingsMs: 410 },
          },
          "efficient-animated-content": {
            title: "Use video formats for animated content",
            details: { overallSavingsMs: 40 },
          },
          "color-contrast": { title: "Background and foreground colors" },
        },
      },
    });
    assert.equal(parsed.url, "https://example.com/");
    assert.equal(parsed.score, 72);
    assert.deepEqual(parsed.opportunities, [
      { id: "unused-javascript", title: "Reduce unused JavaScript", savingsMs: 840 },
      {
        id: "render-blocking-resources",
        title: "Eliminate render-blocking resources",
        savingsMs: 410,
      },
      { id: "unused-css-rules", title: "Reduce unused CSS", savingsMs: 210 },
    ]);
    assert.deepEqual(
      parsed.insights?.map((row) => row.id),
      [
        "unused-javascript",
        "render-blocking-resources",
        "unused-css-rules",
        "efficient-animated-content",
      ],
    );
  });

  it("maps lab metrics and the Diagnose insights list", () => {
    const parsed = parsePsiPage("https://example.com/", {
      lighthouseResult: {
        lighthouseVersion: "13.4.1",
        fetchTime: "2026-08-23T16:37:00.000Z",
        categories: {
          performance: {
            score: 0.44,
            auditRefs: [
              { id: "first-contentful-paint", group: "metrics" },
              { id: "largest-contentful-paint", group: "metrics" },
              { id: "total-blocking-time", group: "metrics" },
              { id: "cumulative-layout-shift", group: "metrics" },
              { id: "speed-index", group: "metrics" },
              { id: "render-blocking-insight", group: "insights" },
              { id: "network-dependency-tree-insight", group: "insights" },
              { id: "legacy-javascript-insight", group: "insights" },
              { id: "dom-size-insight", group: "insights" },
              { id: "uses-long-cache-ttl", group: "diagnostics" },
              { id: "unused-javascript", group: "diagnostics" },
            ],
          },
        },
        audits: {
          "first-contentful-paint": {
            title: "First Contentful Paint",
            numericValue: 3300,
            displayValue: "3.3 s",
            score: 0.32,
          },
          "largest-contentful-paint": {
            title: "Largest Contentful Paint",
            numericValue: 5000,
            displayValue: "5.0 s",
            score: 0.18,
          },
          "total-blocking-time": {
            title: "Total Blocking Time",
            numericValue: 1510,
            displayValue: "1,510 ms",
            score: 0.12,
          },
          "cumulative-layout-shift": {
            title: "Cumulative Layout Shift",
            numericValue: 0,
            displayValue: "0",
            score: 1,
          },
          "speed-index": {
            title: "Speed Index",
            numericValue: 6600,
            displayValue: "6.6 s",
            score: 0.22,
          },
          "render-blocking-insight": {
            title: "Render-blocking requests",
            description:
              "Requests are blocking the page's initial render, which may delay LCP. Deferring or inlining can move these network requests out of the critical path. [Learn more](https://web.dev/articles/render-blocking-resources).",
            score: 0,
            displayValue: "Est savings of 150 ms",
            metricSavings: { FCP: 150, LCP: 120 },
          },
          "network-dependency-tree-insight": {
            title: "Network dependency tree",
            score: 0,
          },
          "legacy-javascript-insight": {
            title: "Legacy JavaScript",
            score: 0.5,
            displayValue: "Est savings of 12 KiB",
            details: { overallSavingsBytes: 12288 },
          },
          "dom-size-insight": {
            title: "Optimize DOM size",
            score: 1,
          },
          "unused-javascript": {
            title: "Reduce unused JavaScript",
            score: 0,
            details: { type: "opportunity", overallSavingsMs: 840 },
          },
          "uses-long-cache-ttl": {
            title: "Serve static assets with an efficient cache policy",
            score: 1,
          },
        },
      },
    });
    assert.deepEqual(parsed.metrics, [
      { id: "fcp", value: 3300, displayValue: "3.3 s", score: 0.32 },
      { id: "lcp", value: 5000, displayValue: "5.0 s", score: 0.18 },
      { id: "tbt", value: 1510, displayValue: "1,510 ms", score: 0.12 },
      { id: "cls", value: 0, displayValue: "0", score: 1 },
      { id: "si", value: 6600, displayValue: "6.6 s", score: 0.22 },
    ]);
    assert.equal(parsed.lighthouseVersion, "13.4.1");
    assert.equal(parsed.fetchTime, "2026-08-23T16:37:00.000Z");
    assert.deepEqual(
      parsed.insights?.map((row) => ({
        id: row.id,
        kind: row.kind,
        savingsMs: row.savingsMs,
        savingsBytes: row.savingsBytes,
      })),
      [
        {
          id: "unused-javascript",
          kind: "opportunity",
          savingsMs: 840,
          savingsBytes: undefined,
        },
        {
          id: "render-blocking-insight",
          kind: "insight",
          savingsMs: 150,
          savingsBytes: undefined,
        },
        {
          id: "network-dependency-tree-insight",
          kind: "insight",
          savingsMs: undefined,
          savingsBytes: undefined,
        },
        {
          id: "legacy-javascript-insight",
          kind: "insight",
          savingsMs: undefined,
          savingsBytes: 12288,
        },
        {
          id: "dom-size-insight",
          kind: "insight",
          savingsMs: undefined,
          savingsBytes: undefined,
        },
      ],
    );
    assert.match(parsed.insights?.[1]?.description ?? "", /blocking the page/);
    assert.match(parsed.insights?.[1]?.description ?? "", /critical path/);
    assert.ok(!parsed.insights?.[1]?.description?.includes("http"));
    assert.ok(
      !parsed.insights?.[1]?.description?.endsWith("..."),
      "descriptions stay whole so the report can offer Read more",
    );
    assert.ok(
      !parsed.insights?.some((row) => row.id === "uses-long-cache-ttl"),
      "passed diagnostics stay out of the Diagnose list",
    );
    assert.ok(
      !parsed.insights?.some((row) => row.id === "first-contentful-paint"),
      "metric audits are not insights",
    );
  });

  it("reads Lighthouse 13 opportunity audits when load-opportunities is gone", () => {
    const parsed = parsePsiPage("https://example.com/work/", {
      lighthouseResult: {
        categories: {
          performance: {
            score: 0.7,
            auditRefs: [
              { id: "unused-javascript", group: "diagnostics" },
              { id: "redirects", group: "hidden" },
              { id: "lcp-discovery-insight", group: "insights" },
              { id: "unused-css-rules", group: "diagnostics" },
            ],
          },
        },
        audits: {
          "unused-javascript": {
            title: "Reduce unused JavaScript",
            score: 0,
            details: { type: "opportunity", overallSavingsMs: 450 },
          },
          redirects: {
            title: "Avoid multiple page redirects",
            score: 0,
            details: { type: "opportunity", overallSavingsMs: 755 },
          },
          "unused-css-rules": {
            title: "Reduce unused CSS",
            score: 1,
            details: { type: "opportunity", overallSavingsMs: 0 },
          },
          "lcp-discovery-insight": {
            title: "LCP request discovery",
            score: 0,
          },
        },
      },
    });
    assert.deepEqual(parsed.opportunities, [
      {
        id: "redirects",
        title: "Avoid multiple page redirects",
        savingsMs: 755,
      },
      {
        id: "unused-javascript",
        title: "Reduce unused JavaScript",
        savingsMs: 450,
      },
    ]);
    assert.deepEqual(
      parsed.insights?.map((row) => row.id),
      ["redirects", "unused-javascript", "lcp-discovery-insight"],
    );
  });

  it("records API error bodies without a Lighthouse result", () => {
    const parsed = parsePsiPage("https://thin.example/", {
      error: { code: 429, message: "Quota exceeded" },
    });
    assert.deepEqual(parsed, {
      url: "https://thin.example/",
      error: "Quota exceeded",
    });
  });

  it("returns a row error when the payload is empty", () => {
    const parsed = parsePsiPage("https://example.com/", null);
    assert.equal(parsed.url, "https://example.com/");
    assert.match(parsed.error ?? "", /no lighthouse/i);
  });
});

describe("parsePsiScreenshot", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  it("reads final-screenshot jpeg bytes and ignores filmstrip", () => {
    const parsed = parsePsiScreenshot({
      lighthouseResult: {
        audits: {
          "final-screenshot": {
            details: {
              type: "screenshot",
              data: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
            },
          },
          "screenshot-thumbnails": {
            details: { items: [{ data: "data:image/jpeg;base64,AAAA" }] },
          },
        },
        fullPageScreenshot: { screenshot: { data: "data:image/jpeg;base64,AAAA" } },
      },
    });
    assert.ok(parsed);
    assert.equal(parsed.ext, "jpg");
    assert.deepEqual(parsed.bytes, jpeg);
  });

  it("returns undefined when missing or oversized", () => {
    assert.equal(parsePsiScreenshot(null), undefined);
    const huge = Buffer.alloc(400_001, 1);
    assert.equal(
      parsePsiScreenshot({
        lighthouseResult: {
          audits: {
            "final-screenshot": {
              details: {
                data: `data:image/jpeg;base64,${huge.toString("base64")}`,
              },
            },
          },
        },
      }),
      undefined,
    );
  });
});

describe("writePsiScreenshot", () => {
  it("writes a relative path under psi-shots without embedding bytes in JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "psi-shot-"));
    try {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      const rel = await writePsiScreenshot({
        outDir: dir,
        strategy: "desktop",
        shot: { ext: "jpg", bytes: jpeg },
      });
      assert.equal(rel, psiScreenshotRelPath("desktop", "jpg"));
      const written = await readFile(join(dir, rel));
      assert.deepEqual(written, jpeg);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
