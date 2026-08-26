import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  eventNamesFromCollectHit,
  eventNamesFromCollectUrl,
  eventNamesFromDataLayer,
  isGaCollectUrl,
  observeEventsOnUrls,
  shouldObserveEvents,
  tallyObserved,
} from "../../src/analytics/observe.js";

describe("isGaCollectUrl", () => {
  it("matches GA4 collect hosts and paths", () => {
    assert.equal(
      isGaCollectUrl(
        "https://www.google-analytics.com/g/collect?v=2&tid=G-AAAA&en=page_view",
      ),
      true,
    );
    assert.equal(
      isGaCollectUrl("https://analytics.google.com/g/collect?v=2&en=cta_click"),
      true,
    );
    assert.equal(
      isGaCollectUrl("https://www.googletagmanager.com/g/collect?v=2&en=generate_lead"),
      true,
    );
  });

  it("rejects gtm.js and unrelated pixels", () => {
    assert.equal(
      isGaCollectUrl("https://www.googletagmanager.com/gtm.js?id=GTM-XXXX"),
      false,
    );
    assert.equal(isGaCollectUrl("https://connect.facebook.net/en_US/fbevents.js"), false);
  });
});

describe("eventNamesFromCollectUrl", () => {
  it("reads en from a collect query", () => {
    assert.deepEqual(
      eventNamesFromCollectUrl(
        "https://www.google-analytics.com/g/collect?v=2&tid=G-AAAA&en=page_view",
      ),
      ["page_view"],
    );
  });

  it("reads repeated en params", () => {
    assert.deepEqual(
      eventNamesFromCollectUrl(
        "https://www.google-analytics.com/g/collect?v=2&en=page_view&en=scroll",
      ),
      ["page_view", "scroll"],
    );
  });

  it("returns empty for non-collect URLs", () => {
    assert.deepEqual(
      eventNamesFromCollectUrl("https://www.googletagmanager.com/gtag/js?id=G-AAAA"),
      [],
    );
  });
});

describe("eventNamesFromCollectHit", () => {
  it("reads en from a Measurement Protocol POST body", () => {
    assert.deepEqual(
      eventNamesFromCollectHit(
        "https://www.google-analytics.com/g/collect?v=2&tid=G-AAAA",
        "en=generate_lead&en=scroll",
      ),
      ["generate_lead", "scroll"],
    );
  });
});

describe("eventNamesFromDataLayer", () => {
  it("keeps custom events and skips gtm internals", () => {
    assert.deepEqual(
      eventNamesFromDataLayer([
        { event: "gtm.js" },
        { event: "gtm.click" },
        { event: "page_view" },
        { event: "phone_click" },
        { "gtm.start": 1 },
      ]),
      ["page_view", "phone_click"],
    );
  });
});

describe("tallyObserved", () => {
  it("counts names across pages", () => {
    assert.deepEqual(tallyObserved(["page_view", "page_view", "scroll"]), [
      { name: "page_view", count: 2 },
      { name: "scroll", count: 1 },
    ]);
  });
});

describe("shouldObserveEvents", () => {
  it("is off unless toml or env opts in", () => {
    const prevPrimary = process.env.ANALYTICS_OBSERVE;
    const prevCompat = process.env.SEO_ANALYTICS_OBSERVE;
    delete process.env.ANALYTICS_OBSERVE;
    delete process.env.SEO_ANALYTICS_OBSERVE;
    try {
      assert.equal(shouldObserveEvents({}), false);
      assert.equal(shouldObserveEvents({ observeEvents: false }), false);
      assert.equal(shouldObserveEvents({ observeEvents: true }), true);
      process.env.ANALYTICS_OBSERVE = "1";
      assert.equal(shouldObserveEvents({}), true);
      delete process.env.ANALYTICS_OBSERVE;
      process.env.SEO_ANALYTICS_OBSERVE = "1";
      assert.equal(shouldObserveEvents({}), true);
    } finally {
      if (prevPrimary === undefined) delete process.env.ANALYTICS_OBSERVE;
      else process.env.ANALYTICS_OBSERVE = prevPrimary;
      if (prevCompat === undefined) delete process.env.SEO_ANALYTICS_OBSERVE;
      else process.env.SEO_ANALYTICS_OBSERVE = prevCompat;
    }
  });
});

describe("observeEventsOnUrls", () => {
  it("skips when playwright is not installed", async () => {
    const result = await observeEventsOnUrls(["https://example.com/"]);
    assert.equal(result.skipped, true);
    assert.equal(result.error, undefined);
    assert.deepEqual(result.observed, []);
  });
});
