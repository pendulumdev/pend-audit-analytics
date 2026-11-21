import type { CrawlSql } from "../../src/store/crawl-db.js";

type Row = Record<string, unknown> & { runId: string };

const CONFLICT_KEY: Record<string, readonly string[]> = {
  engine_analytics_crux: ["run_id", "host"],
  engine_analytics_psi_pages: ["run_id", "host", "strategy"],
  engine_analytics_psi_metrics: ["run_id", "host", "strategy", "metric_id"],
};

function cloneTables(tables: Map<string, Row[]>): Map<string, Row[]> {
  const copy = new Map<string, Row[]>();
  for (const [name, rows] of tables) {
    copy.set(
      name,
      rows.map((row) => ({ ...row })),
    );
  }
  return copy;
}

function columnList(text: string): string[] {
  const open = text.indexOf("(");
  const close = text.indexOf(")", open);
  if (open < 0 || close < 0) throw new Error(`No column list in ${text}`);
  return text
    .slice(open + 1, close)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function conflictKey(table: string, row: Row): string | null {
  const cols = CONFLICT_KEY[table];
  if (!cols) return null;
  return cols.map((col) => String(row[col])).join("|");
}

/**
 * In-memory stand-in for the analytics SQL this store emits.
 * Enough to seed a run and prove a later statement left other rows alone.
 */
export function memorySql(): {
  sql: CrawlSql;
  texts: string[];
  rows(table: string): Row[];
} {
  let tables = new Map<string, Row[]>();
  let snapshot: Map<string, Row[]> | null = null;
  const texts: string[] = [];

  function tableRows(name: string): Row[] {
    const found = tables.get(name);
    if (found) return found;
    const created: Row[] = [];
    tables.set(name, created);
    return created;
  }

  function applyInsert(text: string, values: unknown[]): void {
    const table = /INSERT INTO (\w+)/.exec(text)?.[1];
    if (!table) throw new Error(text);
    const cols = columnList(text);
    const scalars: unknown[] = [];
    const arrays: unknown[][] = [];
    for (const value of values) {
      if (Array.isArray(value)) arrays.push(value);
      else scalars.push(value);
    }
    if (scalars.length + arrays.length !== cols.length) {
      throw new Error(
        `${table} has ${cols.length} columns and ${scalars.length + arrays.length} values`,
      );
    }
    const width = arrays[0]?.length ?? 1;
    for (const list of arrays) {
      if (list.length !== width) throw new Error(`${table} unnest lengths differ`);
    }
    const rows = tableRows(table);
    const seen = new Set(
      rows.map((row) => conflictKey(table, row)).filter((key) => key != null),
    );
    for (let i = 0; i < width; i += 1) {
      const row: Row = { runId: "" };
      let scalar = 0;
      let array = 0;
      for (const col of cols) {
        const list = scalar < scalars.length ? undefined : arrays[array++];
        row[col] = scalar < scalars.length ? scalars[scalar++] : list?.[i];
      }
      row.runId = String(row.run_id);
      if (text.includes("ON CONFLICT")) {
        const key = conflictKey(table, row);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
      }
      rows.push(row);
    }
  }

  function applyDelete(text: string, values: unknown[]): void {
    const table = /DELETE FROM (\w+)/.exec(text)?.[1];
    if (!table) throw new Error(text);
    const runId = String(values[0]);
    if (table === "engine_analytics_runs") {
      for (const [name, rows] of tables) {
        tables.set(
          name,
          rows.filter((row) => row.runId !== runId),
        );
      }
      return;
    }
    const rivalScoped = text.includes("SELECT host FROM engine_analytics_rivals");
    const rivalHosts = rivalScoped
      ? new Set(
          tableRows("engine_analytics_rivals")
            .filter((row) => row.runId === runId)
            .map((row) => String(row.host)),
        )
      : null;
    const kind = text.includes("kind =") ? String(values[1]) : undefined;
    const source = text.includes("source =") ? String(values[1]) : undefined;
    const host = text.includes("host =") ? String(values[1]) : undefined;
    const strategies = text.includes("strategy = ANY")
      ? (values[2] as string[])
      : undefined;
    tables.set(
      table,
      tableRows(table).filter((row) => {
        if (row.runId !== runId) return true;
        if (rivalHosts) return !rivalHosts.has(String(row.host));
        if (kind !== undefined) return row.kind !== kind;
        if (source !== undefined) return row.source !== source;
        if (strategies) {
          return row.host !== host || !strategies.includes(String(row.strategy));
        }
        if (host !== undefined) return row.host !== host;
        return false;
      }),
    );
  }

  function applyUpdate(text: string, values: unknown[]): void {
    const table = /UPDATE (\w+)/.exec(text)?.[1];
    if (!table) throw new Error(text);
    const runId = String(values[0]);
    const assigns = [...text.matchAll(/(\w+)\s*=\s*\$(\d+)/g)];
    for (const row of tableRows(table)) {
      if (row.runId !== runId) continue;
      for (const match of assigns) {
        const column = match[1];
        const index = match[2];
        if (!column || !index) continue;
        row[column] = values[Number(index) - 1];
      }
    }
  }

  const sql: CrawlSql = {
    async query<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
      const statement = text.trim();
      texts.push(statement);
      if (statement === "BEGIN") {
        snapshot = cloneTables(tables);
        return { rows: [] as T[], rowCount: 0 };
      }
      if (statement === "COMMIT") {
        snapshot = null;
        return { rows: [] as T[], rowCount: 0 };
      }
      if (statement === "ROLLBACK") {
        if (snapshot) tables = snapshot;
        snapshot = null;
        return { rows: [] as T[], rowCount: 0 };
      }
      if (statement.startsWith("SELECT COALESCE(MAX(ordinal)")) {
        const runId = String(values[0]);
        const ordinals = tableRows("engine_analytics_errors")
          .filter((row) => row.runId === runId)
          .map((row) => Number(row.ordinal));
        const max = ordinals.length > 0 ? Math.max(...ordinals) : -1;
        return { rows: [{ max_ordinal: max }] as T[], rowCount: 1 };
      }
      if (statement.startsWith("DELETE")) applyDelete(statement, values);
      else if (statement.startsWith("UPDATE")) applyUpdate(statement, values);
      else if (statement.startsWith("INSERT")) applyInsert(statement, values);
      else throw new Error(`Unsupported SQL: ${statement}`);
      return { rows: [] as T[], rowCount: 0 };
    },
  };

  return {
    sql,
    texts,
    rows(table: string) {
      return (tables.get(table) ?? []).map((row) => ({ ...row }));
    },
  };
}
