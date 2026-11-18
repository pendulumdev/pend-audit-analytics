import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth, JWT } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

/**
 * Deliberately just the token. The service account email is available on the
 * client, but carrying it would put a credential-adjacent value one careless
 * template literal away from `run.json` - see `docs/security.md`.
 */
export interface GoogleAccessToken {
  token: string;
}

/**
 * Load a Google access token from a service-account JSON path or
 * GOOGLE_APPLICATION_CREDENTIALS / ADC.
 */
export async function getGoogleAccessToken(
  credentialsPath?: string,
): Promise<GoogleAccessToken> {
  const client = await authClient(credentialsPath);
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error(
      "failed to obtain Google access token - check credentialsPath or GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  return { token };
}

async function authClient(credentialsPath?: string) {
  const keyFile = resolveCredentialsPath(credentialsPath);
  if (!keyFile) return new GoogleAuth({ scopes: SCOPES }).getClient();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(keyFile, "utf8"));
  } catch {
    throw new Error("analytics credentials file is not valid JSON");
  }
  const record =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const email = record.client_email;
  const key = record.private_key;
  if (typeof email !== "string" || typeof key !== "string" || !email || !key) {
    throw new Error("analytics credentials file is missing client_email or private_key");
  }
  return new JWT({ email, key, scopes: SCOPES });
}

function resolveCredentialsPath(credentialsPath?: string): string | undefined {
  const fromConfig = credentialsPath?.trim();
  if (fromConfig) {
    const abs = resolve(fromConfig);
    if (!existsSync(abs)) {
      throw new Error(`analytics credentials file not found: ${abs}`);
    }
    return abs;
  }
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (fromEnv) {
    const abs = resolve(fromEnv);
    if (!existsSync(abs)) {
      throw new Error(`GOOGLE_APPLICATION_CREDENTIALS file not found: ${abs}`);
    }
    return abs;
  }
  return undefined;
}
