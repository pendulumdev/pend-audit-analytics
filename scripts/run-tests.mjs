/**
 * Discover and run every test file under test/.
 *
 * Exists because the alternative was a hand-maintained list of paths in the
 * `test` script, and that list silently rots: a new test file that nobody
 * remembers to add never runs, and never fails, so it reads as passing coverage
 * that does not exist. Discovery removes the human step.
 *
 * Zero dependencies and hand-rolled recursion on purpose. Node's own runner
 * cannot do this on our supported floor (Node 20): passing a directory finds no
 * `.ts` files, and glob arguments only landed in Node 21. Raising the floor to
 * suit the test script would be the tail wagging the dog for a published CLI.
 *
 *   node scripts/run-tests.mjs              # everything
 *   node scripts/run-tests.mjs score        # only paths containing "score"
 */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = "test";
const SUFFIX = ".test.ts";

function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTests(path));
    else if (entry.name.endsWith(SUFFIX)) out.push(path);
  }
  return out;
}

const filters = process.argv.slice(2);
const all = findTests(TEST_DIR).sort();
const files = filters.length
  ? all.filter((f) => filters.some((needle) => f.includes(needle)))
  : all;

if (files.length === 0) {
  // Never exit 0 here. A test run that quietly matched nothing is the exact
  // failure this script was written to prevent.
  console.error(
    filters.length
      ? `No test files under ${TEST_DIR}/ match: ${filters.join(", ")}`
      : `No ${SUFFIX} files found under ${TEST_DIR}/`,
  );
  process.exit(1);
}

const child = spawn("npx", ["tsx", "--test", ...files], { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
