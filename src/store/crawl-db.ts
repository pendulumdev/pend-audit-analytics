/**
 * Database connection for an analytics run. Contract version 1 lives in the
 * Arc database. This file does not import Arc.
 */

export const CRAWL_STORE_CONTRACT_VERSION = 1;

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
    Client: new (opts: { connectionString: string; keepAlive?: boolean }) => PgClient;
  };
  const client = new pg.Client({ connectionString: databaseUrl, keepAlive: true });
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

/** Connect, check the contract, run `write`, and close. */
export async function withCrawlStore(
  argv: readonly string[],
  write: (sql: CrawlSql, runId: string) => Promise<void>,
): Promise<void> {
  const args = crawlStoreArgs(argv);
  const databaseUrl = process.env.AUDIT_DATABASE_URL?.trim();
  if (!args || !databaseUrl) {
    throw new CrawlStoreContractError(
      "database mode needs AUDIT_DATABASE_URL and --run-id",
    );
  }
  const connection = await connectCrawlSql(databaseUrl);
  try {
    await assertCrawlContract(connection.sql, args.runId, args.contract);
    await write(connection.sql, args.runId);
  } finally {
    await connection.close();
  }
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
