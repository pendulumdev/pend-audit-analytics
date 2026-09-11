import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InitPrompt } from "../src/init.js";
import {
  collectInitAnswers,
  DEFAULT_PROJECT_NAME,
  formatInitSummary,
  initOutputPath,
  validateCredentialsPath,
  validateGa4PropertyId,
  validateGscSiteUrl,
  validateHttpUrl,
  validatePagespeedApiKey,
} from "../src/init.js";

function scriptedPrompt(
  selects: unknown[],
  texts: string[],
): InitPrompt & { selectLabels: string[]; textLabels: string[] } {
  const selectLabels: string[] = [];
  const textLabels: string[] = [];
  return {
    selectLabels,
    textLabels,
    async select(label, options, defaultIndex) {
      selectLabels.push(label);
      const next = selects.shift();
      if (next === undefined) {
        const fallback = options[defaultIndex];
        if (!fallback) throw new Error(`no option at ${defaultIndex}`);
        return fallback.value;
      }
      return next as never;
    },
    async text(label) {
      textLabels.push(label);
      const next = texts.shift();
      if (next === undefined) throw new Error(`unexpected text prompt: ${label}`);
      return next;
    },
  };
}

describe("validateHttpUrl", () => {
  it("accepts http(s) and rejects anything else", () => {
    assert.equal(validateHttpUrl("https://example.com"), undefined);
    assert.equal(validateHttpUrl("http://127.0.0.1:3000/"), undefined);
    assert.match(validateHttpUrl("example.com") ?? "", /http/);
  });
});

describe("validateGscSiteUrl", () => {
  it("accepts a domain property or a trailing-slash URL prefix", () => {
    assert.equal(validateGscSiteUrl("sc-domain:example.com"), undefined);
    assert.equal(validateGscSiteUrl("https://example.com/"), undefined);
    assert.match(validateGscSiteUrl("https://example.com") ?? "", /end with/);
    assert.match(validateGscSiteUrl("example.com") ?? "", /sc-domain/);
  });
});

describe("validateGa4PropertyId", () => {
  it("accepts digits and strips a properties/ prefix", () => {
    assert.equal(validateGa4PropertyId("123456789"), undefined);
    assert.equal(validateGa4PropertyId("properties/123456789"), undefined);
    assert.match(validateGa4PropertyId("GA4") ?? "", /numeric/);
  });
});

describe("validateCredentialsPath", () => {
  it("accepts a local .json path and rejects a URL or a non-json file", () => {
    assert.equal(validateCredentialsPath(""), undefined);
    assert.equal(validateCredentialsPath("~/Secrets/analytics-sa.json"), undefined);
    assert.match(validateCredentialsPath("https://example.com/key.json") ?? "", /local/);
    assert.match(validateCredentialsPath("~/Secrets/key.pem") ?? "", /\.json/);
  });
});

describe("validatePagespeedApiKey", () => {
  it("accepts a key string and rejects a URL or spaces", () => {
    assert.equal(validatePagespeedApiKey(""), undefined);
    assert.equal(validatePagespeedApiKey("AIzaSyExampleKey"), undefined);
    assert.match(
      validatePagespeedApiKey("https://console.cloud.google.com/") ?? "",
      /not a URL/,
    );
    assert.match(validatePagespeedApiKey("AIza with spaces") ?? "", /spaces/);
  });
});

describe("initOutputPath", () => {
  it("defaults to audit-config-analytics.toml unless --config is set", () => {
    assert.equal(initOutputPath(), "audit-config-analytics.toml");
    assert.equal(initOutputPath("custom.toml"), "custom.toml");
  });
});

describe("collectInitAnswers", () => {
  it("writes both sources when the user keeps Yes", async () => {
    const prompt = scriptedPrompt(
      ["yes", "yes"],
      [
        "Studio site",
        "https://studio.example/",
        "sc-domain:studio.example",
        "123456789",
        "",
        "",
      ],
    );
    const collected = await collectInitAnswers(prompt);
    assert.deepEqual(collected.answers, {
      project: "Studio site",
      baseUrl: "https://studio.example/",
      searchConsoleSiteUrl: "sc-domain:studio.example",
      ga4PropertyId: "123456789",
    });
    assert.deepEqual(prompt.selectLabels, ["Search Console", "GA4"]);
    assert.deepEqual(prompt.textLabels, [
      "Project name",
      "URL",
      "Search Console property",
      "GA4 property id",
      "Service account JSON",
      "PageSpeed API key",
    ]);
    assert.equal(DEFAULT_PROJECT_NAME, "Analytics audit");
  });

  it("strips a properties/ prefix from the typed GA4 id", async () => {
    const prompt = scriptedPrompt(
      ["skip", "yes"],
      ["Analytics audit", "https://example.com", "properties/987654321", "", ""],
    );
    const collected = await collectInitAnswers(prompt);
    assert.equal(collected.answers.searchConsoleSiteUrl, undefined);
    assert.equal(collected.answers.ga4PropertyId, "987654321");
  });

  it("skips the unused source question text", async () => {
    const prompt = scriptedPrompt(
      ["yes", "skip"],
      ["Analytics audit", "https://example.com", "https://example.com/", "", ""],
    );
    const collected = await collectInitAnswers(prompt);
    assert.equal(collected.answers.searchConsoleSiteUrl, "https://example.com/");
    assert.equal(collected.answers.ga4PropertyId, undefined);
    assert.equal(prompt.textLabels.includes("GA4 property id"), false);
  });

  it("re-asks when both sources are skipped", async () => {
    const prompt = scriptedPrompt(
      ["skip", "skip", "yes", "skip"],
      ["Analytics audit", "https://example.com", "sc-domain:example.com", "", ""],
    );
    const collected = await collectInitAnswers(prompt);
    assert.equal(collected.answers.searchConsoleSiteUrl, "sc-domain:example.com");
    assert.deepEqual(prompt.selectLabels, [
      "Search Console",
      "GA4",
      "Search Console",
      "GA4",
    ]);
  });

  it("writes credentialsPath when a JSON path is typed", async () => {
    const prompt = scriptedPrompt(
      ["yes", "skip"],
      [
        "Analytics audit",
        "https://example.com",
        "sc-domain:example.com",
        "~/Secrets/analytics-sa.json",
        "",
      ],
    );
    const collected = await collectInitAnswers(prompt);
    assert.equal(collected.answers.credentialsPath, "~/Secrets/analytics-sa.json");
  });

  it("writes pagespeedApiKey when a key is typed", async () => {
    const prompt = scriptedPrompt(
      ["yes", "skip"],
      [
        "Analytics audit",
        "https://example.com",
        "sc-domain:example.com",
        "",
        "AIzaSyExampleKey",
      ],
    );
    const collected = await collectInitAnswers(prompt);
    assert.equal(collected.answers.pagespeedApiKey, "AIzaSyExampleKey");
  });
});

describe("formatInitSummary", () => {
  it("names the written file and the configured sources", () => {
    const text = formatInitSummary({
      path: "audit-config-analytics.toml",
      answers: {
        project: "Analytics audit",
        baseUrl: "https://example.com",
        searchConsoleSiteUrl: "sc-domain:example.com",
        ga4PropertyId: "123456789",
      },
    });
    assert.match(text, /Wrote audit-config-analytics.toml/);
    assert.match(text, /Search Console sc-domain:example.com/);
    assert.match(text, /GA4 123456789/);
  });

  it("names the credentials path when init stored one", () => {
    const text = formatInitSummary({
      path: "audit-config-analytics.toml",
      answers: {
        project: "Analytics audit",
        baseUrl: "https://example.com",
        searchConsoleSiteUrl: "sc-domain:example.com",
        credentialsPath: "~/Secrets/analytics-sa.json",
      },
    });
    assert.match(text, /Credentials ~\/Secrets\/analytics-sa.json/);
  });

  it("names PageSpeed without echoing the key", () => {
    const text = formatInitSummary({
      path: "audit-config-analytics.toml",
      answers: {
        project: "Analytics audit",
        baseUrl: "https://example.com",
        searchConsoleSiteUrl: "sc-domain:example.com",
        pagespeedApiKey: "AIzaSySecretMustNotPrint",
      },
    });
    assert.match(text, /PageSpeed key stored/);
    assert.doesNotMatch(text, /AIzaSySecretMustNotPrint/);
  });
});
