import { DEFAULT_ANALYTICS_CONFIG, type InitAnswers, writeInitConfig } from "./config.js";
import { promptSelect, promptText } from "./prompt.js";

export type { InitAnswers };

export type InitPrompt = {
  select: <T>(
    label: string,
    options: Array<{ value: T; label: string }>,
    defaultIndex: number,
  ) => Promise<T>;
  text: (
    label: string,
    opts?: {
      default?: string;
      required?: boolean;
      validate?: (value: string) => string | undefined;
    },
  ) => Promise<string>;
};

export const DEFAULT_PROJECT_NAME = "Analytics audit";

export function initOutputPath(config?: string): string {
  return config ?? DEFAULT_ANALYTICS_CONFIG;
}

export function validateHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "URL must start with http:// or https://";
    }
    return undefined;
  } catch {
    return "URL must start with http:// or https://";
  }
}

export function validateGscSiteUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Search Console property is required";
  if (trimmed.startsWith("sc-domain:")) {
    const host = trimmed.slice("sc-domain:".length).trim();
    if (!host || host.includes("/") || /\s/.test(host)) {
      return "sc-domain: must be followed by a host (sc-domain:example.com)";
    }
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "URL-prefix property must start with http:// or https://";
    }
    if (!trimmed.endsWith("/")) {
      return "URL-prefix property must end with /";
    }
    return undefined;
  } catch {
    return "use sc-domain:example.com or an http(s) URL with a trailing /";
  }
}

export function validateGa4PropertyId(value: string): string | undefined {
  const trimmed = value.trim().replace(/^properties\//, "");
  if (!/^\d+$/.test(trimmed)) {
    return "GA4 property id must be numeric";
  }
  return undefined;
}

export function validateCredentialsPath(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) {
    return "credentials path must be a local JSON file, not a URL";
  }
  if (!trimmed.toLowerCase().endsWith(".json")) {
    return "credentials path must end with .json";
  }
  return undefined;
}

export function validatePagespeedApiKey(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) {
    return "PageSpeed key must be the API key string, not a URL";
  }
  if (/\s/.test(trimmed)) {
    return "PageSpeed key must not contain spaces";
  }
  return undefined;
}

export type CollectedInit = {
  answers: InitAnswers;
};

export type InitResult = CollectedInit & { path: string };

export async function collectInitAnswers(prompt: InitPrompt): Promise<CollectedInit> {
  const project = await prompt.text("Project name", {
    default: DEFAULT_PROJECT_NAME,
    required: true,
  });
  const baseUrl = await prompt.text("URL", {
    required: true,
    validate: validateHttpUrl,
  });
  for (;;) {
    const includeGsc = await prompt.select<"yes" | "skip">(
      "Search Console",
      [
        { value: "yes", label: "Yes" },
        { value: "skip", label: "Skip" },
      ],
      0,
    );
    const searchConsoleSiteUrl =
      includeGsc === "yes"
        ? await prompt.text("Search Console property", {
            required: true,
            validate: validateGscSiteUrl,
          })
        : undefined;
    const includeGa4 = await prompt.select<"yes" | "skip">(
      "GA4",
      [
        { value: "yes", label: "Yes" },
        { value: "skip", label: "Skip" },
      ],
      0,
    );
    const ga4PropertyId =
      includeGa4 === "yes"
        ? normalizeGa4PropertyId(
            await prompt.text("GA4 property id", {
              required: true,
              validate: validateGa4PropertyId,
            }),
          )
        : undefined;
    if (searchConsoleSiteUrl || ga4PropertyId) {
      const credentialsRaw = await prompt.text("Service account JSON", {
        validate: validateCredentialsPath,
      });
      const credentialsPath = credentialsRaw.trim() || undefined;
      const pagespeedRaw = await prompt.text("PageSpeed API key", {
        validate: validatePagespeedApiKey,
      });
      const pagespeedApiKey = pagespeedRaw.trim() || undefined;
      return {
        answers: {
          project,
          baseUrl,
          ...(searchConsoleSiteUrl !== undefined && { searchConsoleSiteUrl }),
          ...(ga4PropertyId !== undefined && { ga4PropertyId }),
          ...(credentialsPath !== undefined && { credentialsPath }),
          ...(pagespeedApiKey !== undefined && { pagespeedApiKey }),
        },
      };
    }
    process.stderr.write("provide Search Console and/or GA4\n");
  }
}

export function formatInitSummary(result: InitResult): string {
  const lines = [`Wrote ${result.path}`];
  if (result.answers.searchConsoleSiteUrl) {
    lines.push(`Search Console ${result.answers.searchConsoleSiteUrl}`);
  }
  if (result.answers.ga4PropertyId) {
    lines.push(`GA4 ${result.answers.ga4PropertyId}`);
  }
  if (result.answers.credentialsPath) {
    lines.push(`Credentials ${result.answers.credentialsPath}`);
  }
  if (result.answers.pagespeedApiKey) {
    lines.push("PageSpeed key stored");
  }
  return `${lines.join("\n")}\n`;
}

export async function runInit(opts: {
  force: boolean;
  config?: string;
}): Promise<InitResult> {
  const collected = await collectInitAnswers({
    select: promptSelect,
    text: promptText,
  });
  const path = writeInitConfig(
    initOutputPath(opts.config),
    opts.force,
    collected.answers,
  );
  return { ...collected, path };
}

function normalizeGa4PropertyId(value: string): string {
  return value.trim().replace(/^properties\//, "");
}
