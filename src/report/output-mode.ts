export type AnalyticsOutputMode = "database" | "json";

/** JSON when neither half is present. Database when both are present. One half throws. */
export function chooseAnalyticsOutput(
  env: { databaseUrl?: string | null | undefined },
  argv: readonly string[],
): AnalyticsOutputMode {
  const hasUrl = Boolean(env.databaseUrl?.trim());
  const runIndex = argv.indexOf("--run-id");
  const hasRun = runIndex >= 0 && Boolean(argv[runIndex + 1]?.trim());
  if (!hasUrl && !hasRun) return "json";
  if (!hasUrl) {
    throw new Error("AUDIT_DATABASE_URL is required for database mode");
  }
  if (!hasRun) {
    throw new Error("--run-id is required for database mode");
  }
  return "database";
}
