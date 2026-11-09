/**
 * Crawl-store writer. Contract version 1 lives in the Arc database.
 * This file does not import Arc. A retried chunk advances
 * `pages_persisted` by the rows actually inserted.
 */

export const CRAWL_STORE_CONTRACT_VERSION = 1;
export const CRAWL_STORE_CHUNK_SIZE = 50;

export class CrawlStoreStopped extends Error {
  constructor() {
    super("crawl store run is no longer running");
    this.name = "CrawlStoreStopped";
  }
}

export class CrawlStoreContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrawlStoreContractError";
  }
}

export type CrawlSql = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

export type CrawlFindingWrite = {
  ordinal: number;
  checkId: string;
  impact: string | null;
  payload: Record<string, unknown>;
};

export type CrawlPageWrite = {
  id: string;
  ordinal: number;
  url: string;
  finalUrl: string | null;
  viewport: string;
  theme: string;
  httpStatus: number | null;
  score: number | null;
  violationCount: number;
  incompleteCount: number;
  error: string | null;
  title: string | null;
  description: string | null;
  headings: { level: number; text: string }[];
  durationMs: number | null;
  payload: Record<string, unknown>;
  findings: CrawlFindingWrite[];
  content: { intro: string | null; bodyText: string | null } | null;
};

export type CrawlSectionWrite = {
  section: string;
  payload: Record<string, unknown>;
};

type ReturnedId = { id: string };

export async function assertCrawlContract(
  db: CrawlSql,
  runId: string,
  expected = CRAWL_STORE_CONTRACT_VERSION,
): Promise<void> {
  const version = await db.query<{ version: number }>(
    `SELECT version FROM audit_store_contract WHERE id = 'default'`,
  );
  const found = version.rows[0]?.version;
  if (found !== expected) {
    throw new CrawlStoreContractError(
      `crawl store contract ${found ?? "missing"} is not ${expected}`,
    );
  }
  const run = await db.query<{ status: string }>(
    `SELECT status FROM audit_runs WHERE id = $1`,
    [runId],
  );
  if (run.rows[0]?.status !== "running") {
    throw new CrawlStoreContractError(`audit run ${runId} is not running`);
  }
}

export async function setPagesExpected(
  db: CrawlSql,
  runId: string,
  count: number,
): Promise<void> {
  await db.query(
    `UPDATE audit_runs SET pages_expected = $2 WHERE id = $1 AND status = 'running'`,
    [runId, count],
  );
}

/**
 * Insert a chunk. Returns how many page rows were new.
 * Findings and content are written only for those rows.
 * Throws CrawlStoreStopped when the run is no longer `running`.
 */
export async function flushPageChunk(
  db: CrawlSql,
  runId: string,
  pages: readonly CrawlPageWrite[],
): Promise<number> {
  if (pages.length === 0) return 0;
  await db.query("BEGIN");
  try {
    const inserted = await db.query<ReturnedId>(
      `INSERT INTO audit_run_pages (
         id, run_id, ordinal, url, final_url, viewport, theme,
         http_status, score, violation_count, incomplete_count, error,
         title, description, headings, duration_ms, payload
       )
       SELECT
         u.id, $1, u.ordinal, u.url, NULLIF(u.final_url, ''), u.viewport, u.theme,
         u.http_status, u.score, u.violation_count, u.incomplete_count,
         NULLIF(u.error, ''), NULLIF(u.title, ''), NULLIF(u.description, ''),
         u.headings::jsonb, u.duration_ms, u.payload::jsonb
       FROM unnest(
         $2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[],
         $8::int[], $9::numeric[], $10::int[], $11::int[], $12::text[],
         $13::text[], $14::text[], $15::text[], $16::int[], $17::text[]
       ) AS u(
         id, ordinal, url, final_url, viewport, theme,
         http_status, score, violation_count, incomplete_count, error,
         title, description, headings, duration_ms, payload
       )
       ON CONFLICT (run_id, url, viewport, theme) DO NOTHING
       RETURNING id`,
      [
        runId,
        pages.map((p) => p.id),
        pages.map((p) => p.ordinal),
        pages.map((p) => p.url),
        pages.map((p) => p.finalUrl ?? ""),
        pages.map((p) => p.viewport),
        pages.map((p) => p.theme),
        pages.map((p) => p.httpStatus),
        pages.map((p) => p.score),
        pages.map((p) => p.violationCount),
        pages.map((p) => p.incompleteCount),
        pages.map((p) => p.error ?? ""),
        pages.map((p) => p.title ?? ""),
        pages.map((p) => p.description ?? ""),
        pages.map((p) => JSON.stringify(p.headings)),
        pages.map((p) => p.durationMs),
        pages.map((p) => JSON.stringify(p.payload)),
      ],
    );
    const ids = new Set(inserted.rows.map((row) => row.id));
    const fresh = pages.filter((page) => ids.has(page.id));
    const findings = fresh.flatMap((page) =>
      page.findings.map((finding) => ({ pageId: page.id, ...finding })),
    );
    if (findings.length > 0) {
      await db.query(
        `INSERT INTO audit_findings (run_id, page_id, ordinal, check_id, impact, payload)
         SELECT $1, u.page_id, u.ordinal, u.check_id, NULLIF(u.impact, ''), u.payload::jsonb
         FROM unnest($2::text[], $3::int[], $4::text[], $5::text[], $6::text[])
           AS u(page_id, ordinal, check_id, impact, payload)`,
        [
          runId,
          findings.map((f) => f.pageId),
          findings.map((f) => f.ordinal),
          findings.map((f) => f.checkId),
          findings.map((f) => f.impact ?? ""),
          findings.map((f) => JSON.stringify(f.payload)),
        ],
      );
    }
    const content = fresh.filter((page) => page.content);
    if (content.length > 0) {
      await db.query(
        `INSERT INTO audit_page_content (page_id, run_id, intro, body_text)
         SELECT u.page_id, $1, NULLIF(u.intro, ''), NULLIF(u.body_text, '')
         FROM unnest($2::text[], $3::text[], $4::text[]) AS u(page_id, intro, body_text)
         ON CONFLICT (page_id) DO NOTHING`,
        [
          runId,
          content.map((p) => p.id),
          content.map((p) => p.content?.intro ?? ""),
          content.map((p) => p.content?.bodyText ?? ""),
        ],
      );
    }
    const advanced = await db.query(
      `UPDATE audit_runs
          SET pages_persisted = pages_persisted + $2
        WHERE id = $1 AND status = 'running'`,
      [runId, fresh.length],
    );
    if ((advanced.rowCount ?? 0) === 0) {
      throw new CrawlStoreStopped();
    }
    await db.query("COMMIT");
    return fresh.length;
  } catch (err) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

export async function writeCrawlSections(
  db: CrawlSql,
  runId: string,
  sections: readonly CrawlSectionWrite[],
): Promise<void> {
  if (sections.length === 0) return;
  await db.query("BEGIN");
  try {
    await db.query(
      `INSERT INTO audit_run_sections (run_id, section, payload)
       SELECT $1, u.section, u.payload::jsonb
       FROM unnest($2::text[], $3::text[]) AS u(section, payload)
       ON CONFLICT (run_id, section) DO UPDATE SET payload = EXCLUDED.payload`,
      [
        runId,
        sections.map((s) => s.section),
        sections.map((s) => JSON.stringify(s.payload)),
      ],
    );
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

export type CrawlPageSync = {
  url: string;
  viewport: string;
  theme: string;
  score: number | null;
  violationCount: number;
  payload: Record<string, unknown>;
  lateFindings: CrawlFindingWrite[];
};

/** Score and findings added after the chunk insert (duplicate and link checks). */
export async function syncPageChunk(
  db: CrawlSql,
  runId: string,
  pages: readonly CrawlPageSync[],
): Promise<void> {
  if (pages.length === 0) return;
  await db.query("BEGIN");
  try {
    await db.query(
      `UPDATE audit_run_pages AS p
          SET score = u.score,
              violation_count = u.violation_count,
              payload = u.payload::jsonb
         FROM unnest($2::text[], $3::text[], $4::text[], $5::numeric[], $6::int[], $7::text[])
           AS u(url, viewport, theme, score, violation_count, payload)
        WHERE p.run_id = $1
          AND p.url = u.url
          AND p.viewport = u.viewport
          AND p.theme = u.theme`,
      [
        runId,
        pages.map((p) => p.url),
        pages.map((p) => p.viewport),
        pages.map((p) => p.theme),
        pages.map((p) => p.score),
        pages.map((p) => p.violationCount),
        pages.map((p) => JSON.stringify(p.payload)),
      ],
    );
    const findings = pages.flatMap((page) =>
      page.lateFindings.map((finding) => ({
        url: page.url,
        viewport: page.viewport,
        theme: page.theme,
        ...finding,
      })),
    );
    if (findings.length > 0) {
      await db.query(
        `INSERT INTO audit_findings (run_id, page_id, ordinal, check_id, impact, payload)
         SELECT $1, p.id, u.ordinal, u.check_id, NULLIF(u.impact, ''), u.payload::jsonb
           FROM unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::text[], $7::text[], $8::text[])
             AS u(url, viewport, theme, ordinal, check_id, impact, payload)
           JOIN audit_run_pages p
             ON p.run_id = $1
            AND p.url = u.url
            AND p.viewport = u.viewport
            AND p.theme = u.theme`,
        [
          runId,
          findings.map((f) => f.url),
          findings.map((f) => f.viewport),
          findings.map((f) => f.theme),
          findings.map((f) => f.ordinal),
          findings.map((f) => f.checkId),
          findings.map((f) => f.impact ?? ""),
          findings.map((f) => JSON.stringify(f.payload)),
        ],
      );
    }
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

export function chunkPages<T>(rows: readonly T[], size = CRAWL_STORE_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

type PgClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

export async function connectCrawlSql(databaseUrl: string): Promise<{
  sql: CrawlSql;
  close(): Promise<void>;
}> {
  const pg = (await import("pg")) as unknown as {
    Client: new (opts: { connectionString: string }) => PgClient;
  };
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  return {
    sql: {
      async query<T = Record<string, unknown>>(text: string, values?: unknown[]) {
        const result = await client.query(text, values);
        return { rows: result.rows as T[], rowCount: result.rowCount };
      },
    },
    close: () => client.end(),
  };
}

/** Connect, check the contract, run `write`, and close. Returns false when no database URL is set. */
export async function withCrawlStore(
  argv: readonly string[],
  write: (sql: CrawlSql, runId: string) => Promise<void>,
): Promise<boolean> {
  const args = crawlStoreArgs(argv);
  const databaseUrl = process.env.AUDIT_DATABASE_URL?.trim();
  if (!args || !databaseUrl) return false;
  const connection = await connectCrawlSql(databaseUrl);
  try {
    await assertCrawlContract(connection.sql, args.runId, args.contract);
    await write(connection.sql, args.runId);
  } finally {
    await connection.close();
  }
  return true;
}

export function crawlStoreArgs(argv: readonly string[]): {
  runId: string;
  contract: number;
} | null {
  const url = process.env.AUDIT_DATABASE_URL?.trim();
  if (!url) return null;
  const runIndex = argv.indexOf("--run-id");
  const runId = runIndex >= 0 ? argv[runIndex + 1] : undefined;
  if (!runId) {
    throw new CrawlStoreContractError("--run-id is required with AUDIT_DATABASE_URL");
  }
  const contractIndex = argv.indexOf("--store-contract");
  const contractRaw = contractIndex >= 0 ? argv[contractIndex + 1] : undefined;
  const contract = contractRaw ? Number(contractRaw) : CRAWL_STORE_CONTRACT_VERSION;
  if (contract !== CRAWL_STORE_CONTRACT_VERSION) {
    throw new CrawlStoreContractError(
      `store contract ${contract} is not ${CRAWL_STORE_CONTRACT_VERSION}`,
    );
  }
  return { runId, contract };
}
