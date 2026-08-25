import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

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
  const keyFile = resolveCredentialsPath(credentialsPath);
  const auth = new GoogleAuth({
    scopes: SCOPES,
    ...(keyFile ? { keyFile } : {}),
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error(
      "failed to obtain Google access token - check credentialsPath or GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  return { token };
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
