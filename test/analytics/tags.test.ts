import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectGoogleSetup,
  collisionsForPage,
  parseConfiguredEvents,
  parseGoogleHtml,
  parseGtmJs,
  selectLandingUrls,
  urlDriftCollision,
} from "../../src/analytics/tags.js";

const GTM_HTML = `<!doctype html><html><head>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXX');</script>
</head><body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXX"></iframe></noscript>
</body></html>`;

const GTAG_HTML = `<!doctype html><html><head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-BBBBBB"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-BBBBBB');
gtag('consent', 'default', { ad_storage: 'denied' });
</script>
</head><body></body></html>`;

const UA_HTML = `<!doctype html><html><head>
<script async src="https://www.google-analytics.com/analytics.js"></script>
<script>ga('create', 'UA-123-1', 'auto');</script>
</head><body></body></html>`;

const DUAL_GA4 = `<!doctype html><html><head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAA"></script>
<script>
function gtag(){dataLayer.push(arguments);}
gtag('config', 'G-AAAAAA');
gtag('config', 'G-BBBBBB');
</script>
</head></html>`;

describe("parseGoogleHtml", () => {
  it("extracts a GTM container from the install snippet", () => {
    const page = parseGoogleHtml(GTM_HTML, "https://example.com/");
    assert.equal(
      page.snippets.some((s) => s.kind === "gtm"),
      true,
    );
    assert.equal(page.snippets[0]?.location, "head");
    assert.ok(page.destinations.some((d) => d.id === "GTM-XXXX"));
  });

  it("extracts gtag measurement IDs and consent", () => {
    const page = parseGoogleHtml(GTAG_HTML, "https://example.com/");
    assert.equal(
      page.snippets.some((s) => s.kind === "gtag"),
      true,
    );
    assert.ok(page.destinations.some((d) => d.family === "ga4" && d.id === "G-BBBBBB"));
    assert.ok(page.destinations.some((d) => d.family === "consent"));
  });

  it("extracts leftover Universal Analytics", () => {
    const page = parseGoogleHtml(UA_HTML, "https://example.com/");
    assert.equal(
      page.snippets.some((s) => s.kind === "ua"),
      true,
    );
    assert.ok(page.destinations.some((d) => d.id === "UA-123-1"));
  });

  it("finds two GA4 IDs on one page", () => {
    const page = parseGoogleHtml(DUAL_GA4, "https://example.com/");
    const ga4 = page.destinations.filter((d) => d.family === "ga4").map((d) => d.id);
    assert.deepEqual(ga4.sort(), ["G-AAAAAA", "G-BBBBBB"]);
  });

  it("extracts Next.js gtag preload (no script src)", () => {
    const html = `<!doctype html><html><head>
<link rel="preload" href="https://www.googletagmanager.com/gtag/js?id=G-CDEC0MPC01" as="script"/>
</head><body></body></html>`;
    const page = parseGoogleHtml(html, "https://pendulumdev.co.uk/");
    assert.equal(
      page.snippets.some((s) => s.kind === "gtag"),
      true,
    );
    assert.ok(
      page.destinations.some((d) => d.family === "ga4" && d.id === "G-CDEC0MPC01"),
    );
    assert.ok(page.snippets[0]?.text.includes("G-CDEC0MPC01"));
  });
});

describe("collisionsForPage", () => {
  it("flags dual GA4 IDs", () => {
    const page = parseGoogleHtml(DUAL_GA4, "https://example.com/");
    const hits = collisionsForPage(page, { ga4Bound: false });
    assert.ok(hits.some((c) => c.code === "multiple-ga4-ids"));
  });

  it("flags GTM plus standalone gtag", () => {
    const page = parseGoogleHtml(`${GTM_HTML}${GTAG_HTML}`, "https://example.com/");
    const hits = collisionsForPage(page, { ga4Bound: false });
    assert.ok(hits.some((c) => c.code === "gtm-plus-standalone-gtag"));
  });

  it("flags UA leftover next to GA4", () => {
    const page = parseGoogleHtml(`${GTAG_HTML}${UA_HTML}`, "https://example.com/");
    const hits = collisionsForPage(page, { ga4Bound: false });
    assert.ok(hits.some((c) => c.code === "ua-leftover"));
  });

  it("does not flag bound-property-missing when GTM is present without a G- in HTML", () => {
    const page = parseGoogleHtml(GTM_HTML, "https://example.com/");
    const hits = collisionsForPage(page, { ga4Bound: true });
    assert.equal(
      hits.some((c) => c.code === "bound-property-missing"),
      false,
    );
  });

  it("flags bound-property-missing only when no Google destinations exist", () => {
    const page = parseGoogleHtml(
      "<html><head></head><body>hello</body></html>",
      "https://example.com/",
    );
    const hits = collisionsForPage(page, { ga4Bound: true });
    assert.ok(hits.some((c) => c.code === "bound-property-missing"));
    assert.equal(
      hits.find((c) => c.code === "bound-property-missing")?.severity,
      "watch",
    );
  });

  it("does not flag bound-property-missing when a G- is present", () => {
    const page = parseGoogleHtml(GTAG_HTML, "https://example.com/");
    const hits = collisionsForPage(page, { ga4Bound: true });
    assert.equal(
      hits.some((c) => c.code === "bound-property-missing"),
      false,
    );
  });
});

describe("parseGtmJs", () => {
  it("counts tag functions and destination IDs", () => {
    const parsed = parseGtmJs(
      "GTM-XXXX",
      `var data = {"resource":{"tags":[{"function":"__googtag","vtp_measurementIdOverride":"G-AAAAAA"},{"function":"__awct"}]}}`,
    );
    assert.equal(parsed.tagTypeCounts?.__googtag, 1);
    assert.equal(parsed.tagTypeCounts?.__awct, 1);
    assert.ok(parsed.destinations?.includes("G-AAAAAA"));
    assert.equal(parsed.parseError, undefined);
  });
});

describe("collectGoogleSetup", () => {
  it("uses provided HTML and fetches public gtm.js", async () => {
    const { setup, error } = await collectGoogleSetup({
      pageUrl: "https://example.com/",
      html: GTM_HTML,
      ga4Bound: false,
      fetchImpl: async (url) => {
        assert.match(url, /gtm\.js\?id=GTM-XXXX/);
        return {
          ok: true,
          status: 200,
          async text() {
            return `{"resource":{"tags":[{"function":"__googtag"}]}}`;
          },
        };
      },
    });
    assert.equal(error, undefined);
    assert.equal(setup.pages[0]?.destinations[0]?.id, "GTM-XXXX");
    assert.equal(setup.gtm?.[0]?.containerId, "GTM-XXXX");
    assert.equal(setup.gtm?.[0]?.tagTypeCounts?.__googtag, 1);
  });

  it("soft-fails page fetch into an error string", async () => {
    const { setup, error } = await collectGoogleSetup({
      pageUrl: "https://example.com/",
      ga4Bound: false,
      fetchImpl: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    assert.equal(setup.pages.length, 0);
    assert.match(error ?? "", /ENOTFOUND/);
  });

  it("scans extra landing URLs and flags fingerprint drift", async () => {
    const { setup, error } = await collectGoogleSetup({
      pageUrl: "https://example.com/",
      extraUrls: ["https://example.com/promo"],
      htmlByUrl: {
        "https://example.com/": GTAG_HTML,
        "https://example.com/promo": DUAL_GA4,
      },
      ga4Bound: false,
      fetchImpl: async () => {
        throw new Error("should use htmlByUrl");
      },
    });
    assert.equal(error, undefined);
    assert.equal(setup.pages.length, 2);
    assert.ok(setup.collisions.some((c) => c.code === "url-drift"));
    assert.ok(
      setup.collisions
        .find((c) => c.code === "url-drift")
        ?.urls?.includes("https://example.com/promo"),
    );
  });

  it("does not flag url-drift when landing tags match the homepage", async () => {
    const { setup } = await collectGoogleSetup({
      pageUrl: "https://example.com/",
      extraUrls: ["https://example.com/about"],
      htmlByUrl: {
        "https://example.com/": GTAG_HTML,
        "https://example.com/about": GTAG_HTML,
      },
      ga4Bound: false,
      fetchImpl: async () => {
        throw new Error("should use htmlByUrl");
      },
    });
    assert.equal(setup.pages.length, 2);
    assert.equal(
      setup.collisions.some((c) => c.code === "url-drift"),
      false,
    );
  });
});

describe("selectLandingUrls", () => {
  it("prefers GSC pages, fills from GA4, skips home and other hosts", () => {
    const urls = selectLandingUrls({
      homeUrl: "https://example.com/",
      gscPages: [
        { page: "https://example.com/" },
        { page: "https://example.com/promo" },
        { page: "https://other.test/x" },
      ],
      ga4Landings: [
        { path: "/promo" },
        { path: "/pricing" },
        { path: "(not set)" },
        { path: "/" },
      ],
    });
    assert.deepEqual(urls, ["https://example.com/promo", "https://example.com/pricing"]);
  });

  it("caps at five unique paths and still works with no GSC/GA4 rows", () => {
    const gscPages = [1, 2, 3, 4, 5, 6].map((n) => ({
      page: `https://example.com/p${n}`,
    }));
    assert.equal(
      selectLandingUrls({ homeUrl: "https://example.com/", gscPages }).length,
      5,
    );
    assert.deepEqual(selectLandingUrls({ homeUrl: "https://example.com/" }), []);
  });
});

describe("urlDriftCollision", () => {
  it("returns undefined for homepage-only", () => {
    const home = parseGoogleHtml(GTAG_HTML, "https://example.com/");
    assert.equal(urlDriftCollision([home]), undefined);
  });
});

describe("parseConfiguredEvents", () => {
  it("reads gtag event and dataLayer push names from HTML", () => {
    const html = `<script>
gtag('event', 'phone_click');
dataLayer.push({ event: 'signup_complete' });
dataLayer.push({ event: 'gtm.js' });
gtag('config', 'G-BBBBBB');
</script>`;
    const rows = parseConfiguredEvents(html, "html");
    assert.deepEqual(rows.map((r) => r.name).sort(), ["phone_click", "signup_complete"]);
    assert.equal(
      rows.every((r) => r.source === "html"),
      true,
    );
  });

  it("reads GTM vtp_eventName from published container source", () => {
    const rows = parseConfiguredEvents(
      `{"resource":{"tags":[{"function":"__gaawe","vtp_eventName":"generate_lead"}]}}`,
      "gtm",
    );
    assert.deepEqual(rows, [{ name: "generate_lead", source: "gtm" }]);
  });

  it("attaches trigger type from GTM predicates and rules", () => {
    const rows = parseConfiguredEvents(
      JSON.stringify({
        resource: {
          tags: [
            {
              function: "__gaawe",
              vtp_eventName: "generate_lead",
              tag_id: 1,
            },
            {
              function: "__gaawe",
              vtp_eventName: "cta_click",
              tag_id: 2,
            },
          ],
          predicates: [
            { function: "_eq", arg0: ["macro", 0], arg1: "gtm.js" },
            { function: "_eq", arg0: ["macro", 0], arg1: "gtm.click" },
          ],
          rules: [
            [
              ["if", 0],
              ["add", 1],
            ],
            [
              ["if", 1],
              ["add", 2],
            ],
          ],
        },
      }),
      "gtm",
    );
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    assert.equal(byName.generate_lead?.trigger, "page view");
    assert.equal(byName.cta_click?.trigger, "click");
  });

  it("maps a custom-event predicate and compiled gtm.js resource wrapper", () => {
    const rows = parseConfiguredEvents(
      `var data={"resource":{"tags":[{"function":"__gaawe","vtp_eventName":"newsletter_signup","tag_id":9}],"predicates":[{"function":"_eq","arg0":["macro",2],"arg1":"form_submit"}],"rules":[[["if",0],["add",9]]]}};`,
      "gtm",
    );
    assert.equal(rows[0]?.name, "newsletter_signup");
    assert.equal(rows[0]?.trigger, "custom event");
  });
});
