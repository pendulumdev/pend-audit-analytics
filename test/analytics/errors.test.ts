import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { errorHost, psiSoftErrors, softError } from "../../src/analytics/errors.js";

describe("errorHost", () => {
  it("normalises a page URL to an origin", () => {
    assert.equal(errorHost("https://pendulumdev.co.uk/"), "https://pendulumdev.co.uk");
    assert.equal(errorHost("https://example.com/work"), "https://example.com");
  });

  it("keeps a host that is not a URL", () => {
    assert.equal(errorHost("not-a-url"), "not-a-url");
  });
});

describe("psiSoftErrors", () => {
  it("sets host so a primary timeout and a rival timeout stay distinct", () => {
    assert.deepEqual(
      psiSoftErrors([
        { url: "https://pendulumdev.co.uk/", strategy: "mobile", error: "Timed out" },
        { url: "https://example.com/", strategy: "desktop", error: "Timed out" },
        { url: "https://example.com/", strategy: "mobile", score: 100 },
      ]),
      [
        {
          source: "psi",
          message: "https://pendulumdev.co.uk/ (mobile): Timed out",
          host: "https://pendulumdev.co.uk",
        },
        {
          source: "psi",
          message: "https://example.com/ (desktop): Timed out",
          host: "https://example.com",
        },
      ],
    );
  });
});

describe("softError", () => {
  it("attaches host for crux and rival rows and omits it when none is given", () => {
    assert.deepEqual(softError("crux", "HTTP 403", "https://example.com/"), {
      source: "crux",
      message: "HTTP 403",
      host: "https://example.com",
    });
    assert.deepEqual(softError("auth", "credentials missing"), {
      source: "auth",
      message: "credentials missing",
    });
  });
});
