import type { ManualProgress, ScoreSummary } from "./types.js";

export function emptyManualProgress(total = 0): ManualProgress {
  return { total, completed: 0, percent: 0 };
}

export function unscoredSummary(): ScoreSummary {
  return {
    automatedReadiness: 0,
    worstPageScore: 0,
    band: "Critical gaps",
    burden: {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      uniqueRules: 0,
    },
    manual: emptyManualProgress(0),
  };
}
