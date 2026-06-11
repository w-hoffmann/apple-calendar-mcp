# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apple Calendar MCP server — an MCP server for Apple Calendar via the native EventKit API. Solves the problem of incorrect recurring event handling in the AppleScript approach. Two-layer architecture: TypeScript MCP server calls a Swift CLI binary (`apple-bridge`) via execa.

## Build & Run

```bash
# Full build (Swift + TypeScript)
./scripts/build.sh

# Swift bridge only
cd swift && swift build -c release && codesign --force --sign - --entitlements apple-bridge.entitlements .build/release/apple-bridge

# TypeScript only
npm run build    # tsc → build/

# Verify Swift binary
swift/.build/release/apple-bridge doctor
swift/.build/release/apple-bridge calendars
swift/.build/release/apple-bridge today

# Test MCP server (interactive)
APPLE_BRIDGE_BIN=swift/.build/release/apple-bridge npx @anthropic-ai/sdk mcp-run build/index.js
```

### Tests

```bash
npm test          # builds, then runs vitest (tool-schema + arg-builder unit tests)
npm run typecheck # tsc --noEmit
./scripts/smoke.sh --calendar-id <ID>   # Swift bridge validation smoke (needs calendar access)
```

Unit tests cover the tool input schemas and CLI argument builders (pure, no EventKit). Runtime EventKit behavior is still verified manually via the CLI commands above. CI runs build + typecheck + tests on macOS (`.github/workflows/ci.yml`).

## Architecture

```
Claude Code ──stdio JSON-RPC──▶ TypeScript MCP Server ──execa──▶ Swift CLI (apple-bridge) ──EventKit──▶ macOS Calendar
```

**TypeScript layer** (`src/`):
- `index.ts` — McpServer with StdioServerTransport, reads `APPLE_BRIDGE_BIN` env var
- `bridge/swift.ts` — SwiftBridge class: calls binary via execa, parses JSON envelope `{status, data, error}`, 30s timeout
- `tools/calendar.ts` — 6 MCP tools registered via `registerTool`, with Zod validation: get_calendars, get_events, get_today_events, search_events, create_event, update_event (delete_event removed for safety; updates preserve event IDs and invitations). Input schemas are exported (`createEventInput`, `updateEventInput`, …) for unit tests; `create_event`/`update_event` require a non-empty title (`.min(1)`). A `wrap()` helper shapes results and surfaces the real error message

**Swift layer** (`swift/Sources/AppleBridge/`):
- `main.swift` — ArgumentParser CLI (`AsyncParsableCommand`) with 6 subcommands (mirrors MCP tools); `update-event` validates `--span` and the all-day flags *before* requesting access (fail-fast, testable without TCC)
- `CalendarService.swift` — EventKit wrapper; `predicateForEvents` expands recurring events; `requestAccess()` is `async` (`requestFullAccessToEvents`/`requestAccess(to:)`, no semaphore); `#available(macOS 14.0, *)` for compatibility. `createEvent`/`updateEvent` validate before `store.save`: non-empty title, valid time zone, and `start < end` (`<=` for all-day, which may span a single day)
- `Models.swift` — Codable DTOs, BridgeOutput<T> JSON envelope, ISO8601 parsing (two formats: with/without fractional seconds), BridgeError enum with LocalizedError (incl. `invalidTimeZone`, `invalidInput`)

**Key detail**: `search_events` filters on the TypeScript side (client-side), not in Swift.

## Important Conventions

- **stdout is reserved for MCP JSON-RPC** — in TypeScript use only `console.error()` for logs
- **Swift CLI always returns JSON envelope**: `{"status":"ok","data":...}` or `{"status":"error","error":"..."}`
- **ESM modules**: package.json `"type": "module"`, imports with `.js` extension
- **Swift**: `-parse-as-library` flag in Package.swift is required for @main + ArgumentParser
- **TCC permissions**: binary must be signed with entitlements (`apple-bridge.entitlements`) for calendar access
- **TCC usage string**: `swift/Info.plist` (`NSCalendarsFullAccessUsageDescription`) is embedded into the binary via `linkerSettings` in `Package.swift` (`-sectcreate __TEXT __info_plist`); required for the macOS 14+ access prompt to appear
- **APPLE_BRIDGE_BIN** — the only way to pass the Swift binary path to the MCP server

## MCP Integration

Via `.mcp.json` in a consumer project or `claude mcp add --scope user`:
```json
{
  "mcpServers": {
    "apple-calendar": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": { "APPLE_BRIDGE_BIN": "/path/to/swift/.build/release/apple-bridge" }
    }
  }
}
```

## Troubleshooting

- **Calendar access denied**: `tccutil reset Calendar` → re-run `apple-bridge doctor` for a new TCC prompt
- **Recurring events not expanding**: ensure `predicateForEvents` is being used, not direct `EKEvent` access
- **ISO8601 parse error**: Swift expects format `2026-02-07T10:00:00Z` or `2026-02-07T10:00:00.000Z`
