import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EdgeChallengeError } from "../../src/analytics/edge-challenge.js";
import { fetchAnalyticsBundle } from "../../src/analytics/fetch.js";
import { fetchPsiPages } from "../../src/analytics/psi.js";
import { collectGoogleSetup } from "../../src/analytics/tags.js";

const WALL = "<html><title>Vercel Security Checkpoint</title></html>";

describe("analytics edge wall", () => {
  it("fails the tag scan instead of recording a GET error", async () => {
    await assert.rejects(
      () =>
        collectGoogleSetup({
          pageUrl: "https://pendulumdev.co.uk/",
          ga4Bound: false,
          fetchImpl: async () => ({
            ok: false,
            status: 403,
            headers: {
              get: (name: string) => (name === "x-vercel-mitigated" ? "challenge" : null),
            },
            async text() {
              return WALL;
            },
          }),
        }),
      (err: unknown) => err instanceof EdgeChallengeError,
    );
  });

  it("fails the analytics run when the homepage GET is an edge wall", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(WALL, {
        status: 403,
        headers: { "content-type": "text/html", "x-vercel-mitigated": "challenge" },
      })) as typeof globalThis.fetch;
    try {
      await assert.rejects(
        () =>
          fetchAnalyticsBundle({
            baseUrl: "https://pendulumdev.co.uk",
            config: {
              enabled: true,
              rangeDays: 28,
              comparePrevious: false,
              ga4: { propertyId: "123" },
            },
          }),
        (err: unknown) => err instanceof EdgeChallengeError,
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("drops a PSI row whose document is the wall and keeps a real site", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const title = url.includes("strategy=DESKTOP")
        ? "Pendulum"
        : "Vercel Security Checkpoint";
      return new Response(
        JSON.stringify({
          lighthouseResult: {
            categories: { performance: { score: 0.8, auditRefs: [] } },
            audits: { "document-title": { details: { items: [{ text: title }] } } },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof globalThis.fetch;
    try {
      const bundle = await fetchPsiPages({
        apiKey: "test-key",
        jobs: [
          { url: "https://pendulumdev.co.uk/", strategy: "mobile" },
          { url: "https://pendulumdev.co.uk/", strategy: "desktop" },
        ],
      });
      assert.equal(bundle.pages.length, 1);
      assert.equal(bundle.pages[0]?.strategy, "desktop");
      assert.equal(bundle.pages[0]?.score, 80);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
