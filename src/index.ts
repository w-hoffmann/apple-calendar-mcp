#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SwiftBridge } from "./bridge/swift.js";
import { registerCalendarTools } from "./tools/calendar.js";

const server = new McpServer({
  name: "apple-calendar",
  version: "1.0.0",
});

const bridge = new SwiftBridge();
registerCalendarTools(server, bridge);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("apple-calendar MCP server running");
