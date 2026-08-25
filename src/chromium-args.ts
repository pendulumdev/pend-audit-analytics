/** Shared Chromium launch args for the optional observe probe. */
export const CHROMIUM_LAUNCH_ARGS = [
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-sandbox",
] as const;
