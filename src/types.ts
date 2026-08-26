export type AnalyticsInsightSeverity = "info" | "watch" | "action";

export interface AnalyticsSearchConsoleConfig {
  siteUrl: string;
}

export interface AnalyticsGa4Config {
  propertyId: string;
}

/** GSC / GA4 pull knobs. Running `pend-analytics audit` force-enables sources. */
export interface AnalyticsConfig {
  enabled: boolean;
  /** Path to service-account JSON; empty/omit → GOOGLE_APPLICATION_CREDENTIALS. */
  credentialsPath?: string;
  /** Inclusive day count for the primary window (default 28). */
  rangeDays: number;
  /** YYYY-MM-DD overrides; when both set, rangeDays is ignored. */
  startDate?: string;
  endDate?: string;
  /** Compare against the immediately preceding window of equal length. */
  comparePrevious: boolean;
  searchConsole?: AnalyticsSearchConsoleConfig;
  ga4?: AnalyticsGa4Config;
  /**
   * Optional Chromium probe: intercept GA collect on a cold load, then abort
   * so client GA4 is not inflated. Off unless set, or ANALYTICS_OBSERVE=1.
   */
  observeEvents?: boolean;
  /** Named rival https origins. Public HTML + CrUX only. */
  rivals?: string[];
}

export interface AnalyticsEngineConfig {
  project: string;
  standard: "Pendulum_Analytics_v1";
  baseUrl?: string;
  outDir: string;
  analytics: AnalyticsConfig;
}

export interface AnalyticsRange {
  start: string;
  end: string;
  previousStart?: string;
  previousEnd?: string;
}

export interface GscMetricRow {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscDailyRow extends GscMetricRow {
  date: string;
}

export interface GscPageRow extends GscMetricRow {
  page: string;
}

export interface GscQueryRow extends GscMetricRow {
  query: string;
}

export interface GscAnalyticsBundle {
  siteUrl: string;
  daily: GscDailyRow[];
  topPages: GscPageRow[];
  topQueries: GscQueryRow[];
  totals: GscMetricRow;
  previousTotals?: GscMetricRow;
}

export interface Ga4DailyRow {
  date: string;
  sessions: number;
  totalUsers: number;
  engagedSessions: number;
}

export interface Ga4LandingPageRow {
  path: string;
  sessions: number;
  engagementRate: number;
}

export interface Ga4NamedCount {
  name: string;
  sessions: number;
}

export interface Ga4OrganicDailyRow {
  date: string;
  sessions: number;
}

export interface Ga4NewReturningDailyRow {
  date: string;
  newUsers: number;
  returningUsers: number;
}

export interface Ga4AnalyticsBundle {
  propertyId: string;
  daily: Ga4DailyRow[];
  landingPages: Ga4LandingPageRow[];
  /** Organic Search sessions by day. */
  organicDaily: Ga4OrganicDailyRow[];
  /** Period totals by default channel group. */
  channels: Ga4NamedCount[];
  /** Period totals by device category. */
  devices: Ga4NamedCount[];
  /** New vs returning users by day. */
  newReturningDaily: Ga4NewReturningDailyRow[];
  totals: { sessions: number; totalUsers: number; engagedSessions: number };
  previousTotals?: { sessions: number; totalUsers: number; engagedSessions: number };
}

export interface RemediationCopy {
  engineer: string;
  client: string;
}

export interface AnalyticsInsight {
  id: string;
  severity: AnalyticsInsightSeverity;
  title: string;
  detail: string;
  remediation: RemediationCopy;
}

export interface AnalyticsError {
  source: "gsc" | "ga4" | "auth" | "tags" | "observe" | "crux" | "psi" | "rival";
  message: string;
}

export type GoogleTagSnippetKind = "gtm" | "gtag" | "ua" | "other";
export type GoogleTagLocation = "head" | "body" | "unknown";
export type GoogleDestinationFamily =
  | "gtm"
  | "ga4"
  | "ua"
  | "ads"
  | "floodlight"
  | "consent";
export type GoogleTagCollisionCode =
  | "multiple-ga4-ids"
  | "gtm-plus-standalone-gtag"
  | "multiple-gtm"
  | "ua-leftover"
  | "bound-property-missing"
  | "url-drift";

export interface GoogleSetupSnippet {
  kind: GoogleTagSnippetKind;
  location: GoogleTagLocation;
  text: string;
  fingerprint: string;
}

export interface GoogleSetupDestination {
  family: GoogleDestinationFamily;
  id: string;
}

export interface GoogleSetupPage {
  url: string;
  snippets: GoogleSetupSnippet[];
  destinations: GoogleSetupDestination[];
}

export interface GoogleSetupGtmContainer {
  containerId: string;
  tagTypeCounts?: Record<string, number>;
  destinations?: string[];
  parseError?: string;
}

export interface GoogleSetupCollision {
  code: GoogleTagCollisionCode;
  severity: "action" | "watch" | "info";
  detail: string;
  urls?: string[];
}

export interface GoogleSetupBundle {
  pages: GoogleSetupPage[];
  gtm?: GoogleSetupGtmContainer[];
  collisions: GoogleSetupCollision[];
}

export interface GoogleSetupEventsBundle {
  configured: Array<{
    name: string;
    source: "html" | "gtm";
    trigger?: string;
  }>;
  received: Array<{ name: string; count: number }>;
  /** Present when the Chromium observe probe ran (may be empty). */
  observed?: Array<{ name: string; count: number }>;
}

/** Origin Chrome UX Report field vitals (p75). */
export interface CruxOriginBundle {
  origin: string;
  collectionStart?: string;
  collectionEnd?: string;
  lcpMs?: number;
  inpMs?: number;
  cls?: number;
}

export type PsiStrategy = "mobile" | "desktop";

export type PsiLabMetricId = "fcp" | "lcp" | "tbt" | "cls" | "si";

export interface PsiLabMetric {
  id: PsiLabMetricId;
  value: number;
  displayValue?: string;
  score?: number;
}

export type PsiInsightKind = "opportunity" | "diagnostic" | "insight";

export interface PsiInsight {
  id: string;
  title: string;
  kind: PsiInsightKind;
  savingsMs?: number;
  savingsBytes?: number;
  score?: number;
  displayValue?: string;
  description?: string;
}

export interface PsiPageRow {
  url: string;
  strategy: PsiStrategy;
  score?: number;
  opportunities?: Array<{ id: string; title: string; savingsMs?: number }>;
  metrics?: PsiLabMetric[];
  insights?: PsiInsight[];
  lighthouseVersion?: string;
  fetchTime?: string;
  error?: string;
  screenshot?: string;
}

export interface PsiLabBundle {
  pages: PsiPageRow[];
}

export interface RivalPageObservation {
  url: string;
  title?: string;
  description?: string;
  h1?: string;
  schemaTypes?: string[];
  wordCount?: number;
  headingCount?: number;
}

export interface RivalOriginObservation {
  host: string;
  pages: RivalPageObservation[];
  crux?: CruxOriginBundle;
  error?: string;
}

export interface AnalyticsBundle {
  range: AnalyticsRange;
  gsc?: GscAnalyticsBundle;
  ga4?: Ga4AnalyticsBundle;
  googleSetup?: GoogleSetupBundle;
  events?: GoogleSetupEventsBundle;
  crux?: CruxOriginBundle;
  psi?: PsiLabBundle;
  rivals?: RivalOriginObservation[];
  insights: AnalyticsInsight[];
  errors?: AnalyticsError[];
}

export interface IssueBurden {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  uniqueRules: number;
}

export interface ManualProgress {
  total: number;
  completed: number;
  percent: number;
}

export type ScoreBand = "Excellent" | "Good" | "Needs work" | "Critical gaps";

/** Unscored envelope kept so consumers that read `score` still parse. */
export interface ScoreSummary {
  automatedReadiness: number;
  worstPageScore: number;
  band: ScoreBand;
  burden: IssueBurden;
  manual: ManualProgress;
}

export interface AuditTiming {
  totalMs: number;
  browserLaunchMs: number;
  crawlMs: number;
  analyzeMs: number;
  postProcessMs?: number;
  urlCount: number;
  navigationCount: number;
  pageConcurrency: number;
  pages: [];
}

/**
 * Analytics run.json envelope. `pages` and `findings` stay empty; the payload
 * is `analytics`. Score is zeros on purpose - this engine does not rate traffic.
 */
export interface AuditRun {
  version: 1;
  tool: string;
  generatedAt: string;
  project: string;
  standard: string;
  baseUrl?: string;
  catalogVersion: number;
  checkLinks: boolean;
  disclaimer: string;
  score: ScoreSummary;
  pages: [];
  findings: [];
  analytics: AnalyticsBundle;
  timing?: AuditTiming;
}
