#!/usr/bin/env node
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SwiftBridge } from "./bridge/swift.js";
import { registerCalendarTools } from "./tools/calendar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
) as { version: string };

const server = new McpServer({
  name: "apple-calendar",
  version: pkg.version,
});

const bridge = new SwiftBridge();
registerCalendarTools(server, bridge);

const transport = new StdioServerTransport();
try {
  await server.connect(transport);
  console.error(`apple-calendar MCP server running (v${pkg.version})`);
} catch (e) {
  console.error("Failed to start apple-calendar MCP server:", e);
  process.exit(1);
}
