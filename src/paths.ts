import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve package root whether running from src (tsx) or dist. */
export function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, ".."), join(here, "../..")];
  for (const c of candidates) {
    if (existsSync(join(c, "package.json"))) {
      return c;
    }
  }
  return join(here, "..");
}
