import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import {
  ANALYTICS_STANDARD,
  type AnalyticsConfig,
  type AnalyticsEngineConfig,
} from "./types.js";

export const DEFAULT_ANALYTICS_CONFIG = "audit-config-analytics.toml";

export type InitAnswers = {
  project: string;
  baseUrl: string;
  searchConsoleSiteUrl?: string;
  ga4PropertyId?: string;
  credentialsPath?: string;
  pagespeedApiKey?: string;
};

function initSourceBlock(answers: InitAnswers): string {
  const gsc = answers.searchConsoleSiteUrl
    ? `[analytics.searchConsole]
siteUrl = ${tomlString(answers.searchConsoleSiteUrl)}`
    : `# [analytics.searchConsole]
# siteUrl = "sc-domain:example.com"`;
  const ga4 = answers.ga4PropertyId
    ? `[analytics.ga4]
propertyId = ${tomlString(answers.ga4PropertyId)}`
    : `# [analytics.ga4]
# propertyId = "123456789"`;
  return `${gsc}

${ga4}`;
}

function credentialsLine(answers: InitAnswers): string {
  if (answers.credentialsPath) {
    return `credentialsPath = ${tomlString(answers.credentialsPath)}`;
  }
  return `# credentialsPath = ""          # empty -> GOOGLE_APPLICATION_CREDENTIALS`;
}

function pagespeedLine(answers: InitAnswers): string {
  if (answers.pagespeedApiKey) {
    return `pagespeedApiKey = ${tomlString(answers.pagespeedApiKey)}`;
  }
  return `# pagespeedApiKey = ""          # empty -> PAGESPEED_API_KEY`;
}

export function defaultInitToml(answers: InitAnswers): string {
  return `# pend-analytics - Search Console / GA4 pull (unscored).
# Write with: pend-analytics audit --out out/analytics.json
# Full setup: docs/input.md and docs/analytics.md

project = ${tomlString(answers.project)}
standard = "${ANALYTICS_STANDARD}"
baseUrl = ${tomlString(answers.baseUrl)}

[analytics]
enabled = true
${credentialsLine(answers)}
${pagespeedLine(answers)}
rangeDays = 28
comparePrevious = true
# observeEvents = false         # Chromium collect intercept; or ANALYTICS_OBSERVE=1

${initSourceBlock(answers)}
`;
}

export function loadConfig(configPath: string): AnalyticsEngineConfig {
  const abs = resolve(configPath);
  if (!existsSync(abs)) {
    throw new Error(`config not found: ${abs}`);
  }
  const raw: unknown = parseToml(readFileSync(abs, "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${abs}: config must be a TOML table`);
  }
  return normalizeConfig(raw as Record<string, unknown>, abs);
}

function normalizeConfig(
  raw: Record<string, unknown>,
  source: string,
): AnalyticsEngineConfig {
  if (raw.outDir !== undefined) {
    throw new Error(`${source}: outDir is no longer a config key; pass --out <path>`);
  }
  const project = asString(raw.project, "project");
  const standard = asString(raw.standard ?? ANALYTICS_STANDARD, "standard");
  if (standard !== ANALYTICS_STANDARD && standard !== "Pendulum_SEO_v1") {
    throw new Error(
      `${source}: standard must be "${ANALYTICS_STANDARD}" (legacy Pendulum_SEO_v1 still accepted)`,
    );
  }

  const baseUrl = optionalString(raw.baseUrl);

  // Nested [analytics] is the engine contract. Top-level rangeDays /
  // comparePrevious / credentialsPath fold in as fallbacks.
  const nested = raw.analytics;
  const merged: Record<string, unknown> =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? { ...(nested as Record<string, unknown>) }
      : {};
  if (merged.rangeDays == null && raw.rangeDays != null) {
    merged.rangeDays = raw.rangeDays;
  }
  if (merged.comparePrevious == null && raw.comparePrevious != null) {
    merged.comparePrevious = raw.comparePrevious;
  }
  if (merged.credentialsPath == null && raw.credentialsPath != null) {
    merged.credentialsPath = raw.credentialsPath;
  }
  if (merged.pagespeedApiKey == null && raw.pagespeedApiKey != null) {
    merged.pagespeedApiKey = raw.pagespeedApiKey;
  }
  if (merged.searchConsole == null && raw.searchConsole != null) {
    merged.searchConsole = raw.searchConsole;
  }
  if (merged.ga4 == null && raw.ga4 != null) {
    merged.ga4 = raw.ga4;
  }
  if (merged.rivals == null && raw.rivals != null) {
    merged.rivals = raw.rivals;
  }
  if (merged.enabled == null) merged.enabled = true;

  const analytics = parseAnalytics(merged, source);
  if (!analytics.searchConsole && !analytics.ga4) {
    throw new Error(
      `${source}: provide [analytics.searchConsole] and/or [analytics.ga4]`,
    );
  }

  return {
    project,
    standard: ANALYTICS_STANDARD,
    ...(baseUrl !== undefined && { baseUrl }),
    analytics,
  };
}

function parseAnalytics(raw: Record<string, unknown>, source: string): AnalyticsConfig {
  const enabled = asBool(raw.enabled ?? true, "analytics.enabled");
  const credentialsPath = optionalString(raw.credentialsPath);
  const pagespeedApiKey = optionalString(raw.pagespeedApiKey);
  const rangeDays = asPositiveInt(raw.rangeDays ?? 28, "analytics.rangeDays");
  if (rangeDays > 90) {
    throw new Error(`${source}: analytics.rangeDays must be <= 90`);
  }
  const startDate = optionalString(raw.startDate);
  const endDate = optionalString(raw.endDate);
  if ((startDate && !endDate) || (!startDate && endDate)) {
    throw new Error(
      `${source}: analytics.startDate and analytics.endDate must be set together`,
    );
  }
  if (startDate && endDate) {
    assertYmd(startDate, "analytics.startDate");
    assertYmd(endDate, "analytics.endDate");
    if (startDate > endDate) {
      throw new Error(`${source}: analytics.startDate must be <= analytics.endDate`);
    }
  }
  const comparePrevious = asBool(
    raw.comparePrevious ?? true,
    "analytics.comparePrevious",
  );
  const observeEvents = asBool(raw.observeEvents ?? false, "analytics.observeEvents");

  let searchConsole: AnalyticsConfig["searchConsole"];
  if (raw.searchConsole != null) {
    if (typeof raw.searchConsole !== "object" || Array.isArray(raw.searchConsole)) {
      throw new Error(`${source}: analytics.searchConsole must be a table`);
    }
    const sc = raw.searchConsole as Record<string, unknown>;
    searchConsole = { siteUrl: asString(sc.siteUrl, "analytics.searchConsole.siteUrl") };
  }

  let ga4: AnalyticsConfig["ga4"];
  if (raw.ga4 != null) {
    if (typeof raw.ga4 !== "object" || Array.isArray(raw.ga4)) {
      throw new Error(`${source}: analytics.ga4 must be a table`);
    }
    const g = raw.ga4 as Record<string, unknown>;
    const propertyId = asString(g.propertyId, "analytics.ga4.propertyId").replace(
      /^properties\//,
      "",
    );
    if (!/^\d+$/.test(propertyId)) {
      throw new Error(`${source}: analytics.ga4.propertyId must be numeric`);
    }
    ga4 = { propertyId };
  }

  let rivals: string[] | undefined;
  if (raw.rivals != null) {
    if (!Array.isArray(raw.rivals) || raw.rivals.some((row) => typeof row !== "string")) {
      throw new Error(`${source}: analytics.rivals must be an array of strings`);
    }
    rivals = [...new Set(raw.rivals.map((row) => row.trim()).filter(Boolean))];
  }

  if (enabled && !searchConsole && !ga4) {
    throw new Error(
      `${source}: analytics.enabled requires analytics.searchConsole and/or analytics.ga4`,
    );
  }

  return {
    enabled,
    rangeDays,
    comparePrevious,
    observeEvents,
    ...(credentialsPath !== undefined && { credentialsPath }),
    ...(pagespeedApiKey !== undefined && { pagespeedApiKey }),
    ...(startDate !== undefined && { startDate }),
    ...(endDate !== undefined && { endDate }),
    ...(searchConsole !== undefined && { searchConsole }),
    ...(ga4 !== undefined && { ga4 }),
    ...(rivals !== undefined && { rivals }),
  };
}

function assertYmd(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
}

export function writeInitConfig(
  path: string,
  force: boolean,
  answers: InitAnswers,
): string {
  const abs = resolve(path);
  if (existsSync(abs) && !force) {
    throw new Error(`${abs} already exists (use --force to overwrite)`);
  }
  writeFileSync(abs, defaultInitToml(answers), "utf8");
  return abs;
}

function asString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
  return v.trim();
}

function optionalString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v !== "string") throw new Error("expected string");
  const t = v.trim();
  return t === "" ? undefined : t;
}

function asPositiveInt(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return v;
}

function asBool(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return v;
}

function tomlString(s: string): string {
  return JSON.stringify(s);
}
