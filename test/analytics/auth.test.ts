import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getGoogleAccessToken } from "../../src/analytics/auth.js";

describe("getGoogleAccessToken", () => {
  it("does not warn about keyFilename for a key file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "analytics-auth-"));
    const file = join(dir, "sa.json");
    await writeFile(
      file,
      JSON.stringify({
        client_email: "analytics@example.iam.gserviceaccount.com",
        private_key: "not-a-real-key",
      }),
    );
    const warnings: string[] = [];
    // biome-ignore lint/suspicious/noConsole: the test asserts this warning stays quiet
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    let thrown = false;
    try {
      await getGoogleAccessToken(file);
    } catch {
      thrown = true;
    } finally {
      console.warn = original;
      await rm(dir, { recursive: true, force: true });
    }
    assert.equal(thrown, true);
    assert.equal(
      warnings.some((line) => /keyFilename|credentials option is deprecated/.test(line)),
      false,
    );
  });

  it("accepts an authorized_user file without the service-account fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "analytics-auth-user-"));
    const file = join(dir, "oauth.json");
    await writeFile(
      file,
      JSON.stringify({
        type: "authorized_user",
        client_id: "client",
        client_secret: "secret",
        refresh_token: "refresh",
      }),
    );
    const warnings: string[] = [];
    // biome-ignore lint/suspicious/noConsole: the test asserts this warning stays quiet
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    let message = "";
    try {
      await getGoogleAccessToken(file);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    } finally {
      console.warn = original;
      await rm(dir, { recursive: true, force: true });
    }
    assert.equal(message.includes("client_email"), false);
    assert.equal(message.includes("missing client_id"), false);
    assert.equal(
      warnings.some((line) => /keyFilename|credentials option is deprecated/.test(line)),
      false,
    );
  });
});
