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
swift/.build/release/apple-bridge update-event --id <ID> --title "New title"

# Test MCP server (interactive)
APPLE_BRIDGE_BIN=swift/.build/release/apple-bridge npx @anthropic-ai/sdk mcp-run build/index.js
```

### Tests

```bash
npm test          # builds, then runs the vitest `unit` project
npm run typecheck # tsc --noEmit
cd swift && swift test                  # AppleBridgeCore unit tests (Swift Testing), EventKit-free
./scripts/smoke.sh --calendar-id <ID>   # Swift bridge validation smoke (needs calendar access)
E2E_CALENDAR_TESTS=1 npm run test:e2e   # opt-in E2E (writes to a self-created marker calendar)
```

Test layers (all CI-safe except E2E):

- **`unit` vitest project** (`npm test` → `vitest run --project unit`): tool input schemas, CLI arg builders, **bridge contract tests** (against the fake binary `test/fixtures/fake-bridge.mjs` injected via `APPLE_BRIDGE_BIN` — covers envelope parsing, error propagation, non-zero exit, timeout, oversized output), and **in-process MCP integration tests** (`InMemoryTransport.createLinkedPair()` — a real `Client` exercises all 6 tools, plus one full path through a real `SwiftBridge` → fake binary). No calendar access.
- **`swift test`**: `AppleBridgeCore` unit tests — ISO8601 parsing/envelope contract, validation rules, and the pure recurring slot-matching logic. EventKit-free.
- **`e2e` vitest project** (`npm run test:e2e`): full stack against a self-created `MCP-E2E-<runId>` calendar. **Strictly opt-in** — needs both the `e2e` project selected AND `E2E_CALENDAR_TESTS=1`, and Full Calendar Access; skips (does not fail) otherwise. Writes only to the marker calendar (asserted before every write), sweeps leftover `MCP-E2E-*` calendars at setup, and deletes its calendar on teardown. **Never runs in CI.**

CI runs build + typecheck + `npm test` (unit project) + `swift test` on macOS (`.github/workflows/ci.yml`); it never invokes `test:e2e`.

**Toolchain note:** the Swift package stays `swift-tools-version: 5.9`, but Swift Testing (`import Testing`) requires the **Xcode 16+ / Swift 6 toolchain** installed (it ships bundled, no manifest bump or package dependency). CI's `macos-latest` provides it. README's "Swift 5.9+" stays correct for *building* the binary.

## Architecture

```
Claude Code ──stdio JSON-RPC──▶ TypeScript MCP Server ──execa──▶ Swift CLI (apple-bridge) ──EventKit──▶ macOS Calendar
```

**TypeScript layer** (`src/`):
- `index.ts` — McpServer with StdioServerTransport, reads `APPLE_BRIDGE_BIN` env var
- `bridge/swift.ts` — SwiftBridge class: calls binary via execa, parses JSON envelope `{status, data, error}`, 30s timeout
- `tools/calendar.ts` — 6 MCP tools registered via `registerTool`, with Zod validation: get_calendars, get_events, get_today_events, search_events, create_event, update_event (delete_event removed for safety; updates preserve event IDs and invitations). Input schemas are exported (`createEventInput`, `updateEventInput`, …) for unit tests; `create_event`/`update_event` require a non-empty title (`.min(1)`). A `wrap()` helper shapes results and surfaces the real error message

**Swift layer** — split into a library target and an executable target:

`AppleBridgeCore` (`swift/Sources/AppleBridgeCore/`) — EventKit-free, unit-tested via `swift test`:
- `Models.swift` — `public` Codable DTOs, BridgeOutput<T> JSON envelope, ISO8601 parsing (two formats: with/without fractional seconds), BridgeError enum with LocalizedError (incl. `invalidTimeZone`, `invalidInput`), `printJSON`/`printError`
- `Validation.swift` — `Validation` namespace: non-empty title, `start<end` (`<=` for all-day), time-zone identifier, `parseSpan` (this/future). The executable and `CalendarService` delegate to it
- `SlotMatching.swift` — the recurring slot-matching decision as a **pure function** (`SlotMatcher`) over a plain `StoredEvent` value struct (`eventId`, `externalId`, `occurrenceDate`, `hasRecurrenceRules`); matches on `occurrenceDate` within a 1 ms tolerance, by either id form
- `TestCalendar.swift` — `TestCalendar.isValidTestCalendarName` (marker-prefix guard `MCP-E2E-`) and `WritableSource.preferredIndex` (Local-preferred source selection), both pure/unit-tested

`apple-bridge` executable (`swift/Sources/AppleBridge/`) — depends on `AppleBridgeCore`:
- `AppleBridge.swift` — ArgumentParser CLI (`AsyncParsableCommand`); `@main` entry point (the file is no longer named `main.swift`, so `-parse-as-library` is gone). 6 public subcommands mirror the MCP tools, plus a hidden `test-calendar create|delete` (`shouldDisplay: false`, not an MCP tool) for the E2E suite — it refuses any non-`MCP-E2E-` name *before* touching EventKit. `update-event` validates `--span`/all-day flags before requesting access
- `CalendarService.swift` — EventKit wrapper; `predicateForEvents` expands recurring events; `requestAccess()` is `async` (`requestFullAccessToEvents`/`requestAccess(to:)`); `#available(macOS 14.0, *)`. Delegates validation to `Validation` and slot matching to `SlotMatcher` (mapping `EKEvent` → `StoredEvent` via a thin, untested shim). `createTestCalendar`/`deleteTestCalendar` use `saveCalendar`/`removeCalendar(_, commit: true)`

**Key detail**: `search_events` filters on the TypeScript side (client-side), not in Swift.

## Important Conventions

- **stdout is reserved for MCP JSON-RPC** — in TypeScript use only `console.error()` for logs
- **Swift CLI always returns JSON envelope**: `{"status":"ok","data":...}` or `{"status":"error","error":"..."}`
- **ESM modules**: package.json `"type": "module"`, imports with `.js` extension
- **Swift `@main`**: the entry point lives in `AppleBridge.swift` (not a `main.swift`), so no `-parse-as-library` flag is needed. `AppleBridgeCore` types crossing into the executable must be `public` (with explicit `public init` on the structs)
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

- **Calendar access denied**: enable access in System Settings → Privacy & Security → Calendars (Full Access), then re-run `apple-bridge doctor`
- **Recurring events not expanding**: ensure `predicateForEvents` is being used, not direct `EKEvent` access
- **ISO8601 parse error**: Swift expects format `2026-02-07T10:00:00Z` or `2026-02-07T10:00:00.000Z`
