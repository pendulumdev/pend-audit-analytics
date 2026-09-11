import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../paths.js";

export const DOC_PAGES = ["input", "output", "analytics", "security"] as const;

export type DocPage = (typeof DOC_PAGES)[number];

export function isDocPage(value: string): value is DocPage {
  return (DOC_PAGES as readonly string[]).includes(value);
}

export function readDocPage(page: DocPage): { page: DocPage; markdown: string } {
  const markdown = readFileSync(join(packageRoot(), "docs", `${page}.md`), "utf8");
  return { page, markdown };
}
