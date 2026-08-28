import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "./paths.js";

export const VERSION: string = (() => {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(join(packageRoot(), "package.json"), "utf8"),
    );
    if (typeof raw === "object" && raw != null && "version" in raw) {
      const version = (raw as { version: unknown }).version;
      if (typeof version === "string") return version;
    }
  } catch {
    // A missing manifest must not stop a pull.
  }
  return "0.0.0";
})();

export const USER_AGENT = `pend-analytics/${VERSION} (+https://github.com/pendulumdev/pend-audit-analytics)`;
