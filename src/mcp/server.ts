#!/usr/bin/env node
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { VERSION } from "../version.js";
import { DOC_PAGES } from "./docs.js";
import { dispatchAnalyticsTool } from "./tools.js";

const INSTRUCTIONS = [
  "Pendulum Search Console and GA4 analytics pull (unscored).",
  "This is Google setup and traffic evidence, not a readiness score.",
  "Read docs_get, validate audit-config-analytics.toml with config_validate, then run analytics_audit_run.",
  "Always call run_summarize on a stored analytics JSON.",
  "Provider errors soft-fail into the report.",
].join(" ");

export function createAnalyticsMcpServer(): McpServer {
  const server = new McpServer(
    { name: "pend-analytics", version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  const tool = (
    name: string,
    title: string,
    description: string,
    inputSchema: z.ZodRawShape,
  ) => {
    server.registerTool(name, { title, description, inputSchema }, async (args) => {
      try {
        const data = await dispatchAnalyticsTool(name, args as Record<string, unknown>);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    });
  };

  tool(
    "docs_get",
    "Docs get",
    `Read a bundled engine doc page: ${DOC_PAGES.join(", ")}.`,
    { page: z.enum(DOC_PAGES) },
  );
  tool(
    "config_validate",
    "Config validate",
    "Parse audit-config-analytics.toml and list configured sources. Does not call Google APIs.",
    { config: z.string() },
  );
  tool(
    "analytics_audit_run",
    "Analytics audit run",
    "Pull Search Console / GA4 and write --out (default out/analytics.json). Returns a projected summary plus runPath. Score is zeros on purpose.",
    { config: z.string(), out: z.string().optional() },
  );
  tool(
    "run_summarize",
    "Run summarize",
    "Project a stored analytics JSON: sources, insight ids, error count. Score is unscored zeros.",
    { runPath: z.string() },
  );

  return server;
}

export type McpStartOptions = {
  http: boolean;
  port: number;
  bind: string;
};

export function parseMcpArgs(argv: string[]): McpStartOptions {
  const http = argv.includes("--http");
  const portFlag = argv.indexOf("--port");
  const bindFlag = argv.indexOf("--bind");
  const portRaw = portFlag >= 0 ? argv[portFlag + 1] : undefined;
  const bindRaw = bindFlag >= 0 ? argv[bindFlag + 1] : undefined;
  const port = portRaw ? Number(portRaw) : 3000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid --port: ${portRaw}`);
  }
  const bind = bindRaw?.trim();
  return {
    http,
    port,
    bind: bind ? bind : "127.0.0.1",
  };
}

export async function startMcp(opts: McpStartOptions): Promise<void> {
  if (!opts.http) {
    const server = createAnalyticsMcpServer();
    await server.connect(new StdioServerTransport());
    return;
  }

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== "/mcp" && url.pathname !== "/http") {
      res.writeHead(404).end("not found");
      return;
    }
    const server = createAnalyticsMcpServer();
    const transport = new StreamableHTTPServerTransport({});
    await server.connect(transport as never);
    await transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port, opts.bind, () => {
      console.error(`pend-analytics MCP HTTP on http://${opts.bind}:${opts.port}/mcp`);
      resolve();
    });
  });
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  startMcp(parseMcpArgs(process.argv.slice(2))).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: ${message}`);
    process.exit(1);
  });
}
