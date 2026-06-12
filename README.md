# apple-calendar-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for Apple Calendar via native EventKit API with proper recurring event support.

## Why This Exists

AppleScript-based calendar integrations fail to correctly expand recurring events — they return the master event instead of individual occurrences. This project uses Apple's native EventKit framework with `predicateForEvents`, which properly expands recurring events into their individual occurrences within a date range.

## Architecture

```
Claude Code ──stdio JSON-RPC──▶ TypeScript MCP Server ──execa──▶ Swift CLI (apple-bridge) ──EventKit──▶ macOS Calendar
```

- **TypeScript layer** — MCP server with 6 tools, Zod validation, JSON-RPC over stdio
- **Swift layer** — CLI binary using EventKit, returns JSON envelope `{status, data, error}`

## Prerequisites

- macOS 13+ (Ventura or later)
- Swift 5.9+ (included with Xcode 15+)
- Node.js 20+

## Installation

### Option 1: npm (recommended)

```bash
claude mcp add --scope user apple-calendar -- npx apple-calendar-mcp
```

This will automatically download the package, compile the Swift bridge, and register the MCP server. Requires macOS with Xcode or Swift toolchain installed.

After installation, grant calendar access. The first time Claude invokes a calendar tool, macOS prompts for Calendar access — grant **Full Access**. If you previously denied access, re-enable it under **System Settings → Privacy & Security → Calendars**.

### Option 2: From source

```bash
git clone https://github.com/w-hoffmann/apple-calendar-mcp.git
cd apple-calendar-mcp
./scripts/build.sh
```

Grant calendar access:

```bash
swift/.build/release/apple-bridge doctor
```

Connect to Claude Code using one of these methods:

**Project-level `.mcp.json`**

Copy `.mcp.json.example` to `.mcp.json` in your project and update paths:

```json
{
  "mcpServers": {
    "apple-calendar": {
      "command": "node",
      "args": ["/path/to/apple-calendar-mcp/build/index.js"],
      "env": {
        "APPLE_BRIDGE_BIN": "/path/to/apple-calendar-mcp/swift/.build/release/apple-bridge"
      }
    }
  }
}
```

**User-level CLI registration**

```bash
claude mcp add --scope user apple-calendar \
  node /path/to/apple-calendar-mcp/build/index.js \
  -e APPLE_BRIDGE_BIN=/path/to/apple-calendar-mcp/swift/.build/release/apple-bridge
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_calendars` | List all calendars with their IDs and colors |
| `get_events` | Get events in a date range (properly expands recurring events) |
| `get_today_events` | Get all of today's events |
| `search_events` | Search events by title, location, or notes |
| `create_event` | Create a new calendar event |
| `update_event` | Update an existing event (reschedule, rename, move between calendars, edit location/notes) |

The write tools validate input and return a clear error instead of failing silently: `create_event` and `update_event` reject an empty title, an inverted date range (start after end), and an invalid time-zone identifier; `update_event` also rejects an unknown `span` and conflicting all-day flags. All-day events may span a single day.

## Verification

```bash
# Check system diagnostics
swift/.build/release/apple-bridge doctor

# List calendars
swift/.build/release/apple-bridge calendars

# Today's events
swift/.build/release/apple-bridge today

# Events in a date range (recurring events expanded)
swift/.build/release/apple-bridge events --start "2026-02-01T00:00:00Z" --end "2026-02-28T23:59:59Z"

# Update an event (reschedule, rename, move between calendars, …)
swift/.build/release/apple-bridge update-event --id <ID> --title "New title"
```

## Testing

The suite is layered so everything except the opt-in E2E layer runs without
any calendar access (and runs in CI):

```bash
npm test          # builds, then runs the vitest `unit` project:
                  #   schema + arg-builder unit tests, bridge contract tests
                  #   (fake binary), and in-process MCP integration tests
npm run typecheck # tsc --noEmit
cd swift && swift test   # AppleBridgeCore unit tests (models, validation,
                         # recurring slot matching) — EventKit-free
```

**E2E (opt-in, writes to a self-created calendar).** The E2E suite exercises
the full stack against a calendar it creates itself. It is **disabled by
default** and never runs in CI. It writes only to a calendar named
`MCP-E2E-<runId>`, asserts that target before every write, and deletes it
(and any leftover `MCP-E2E-*` calendars) on teardown. Pre-existing calendars
are never touched. Run it explicitly, with Full Calendar Access granted:

```bash
E2E_CALENDAR_TESTS=1 npm run test:e2e
```

It is **doubly gated**: both the `e2e` vitest project must be selected (only
`npm run test:e2e` does this — `npm test` runs the `unit` project) **and**
`E2E_CALENDAR_TESTS=1` must be set. If either gate is missing, or Full
Calendar Access is not granted, the suite **skips** rather than failing.

## Troubleshooting

**Calendar access denied**
Enable access under **System Settings → Privacy & Security → Calendars** (grant **Full Access**), then re-run:
```bash
swift/.build/release/apple-bridge doctor
```

**Recurring events not expanding**
This is the exact problem this project solves. Ensure you're using the MCP tools (which use `predicateForEvents`) rather than AppleScript-based alternatives.

**ISO 8601 parse error**
The Swift binary expects dates in format `2026-02-07T10:00:00Z` or `2026-02-07T10:00:00.000Z`.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `./scripts/build.sh` to verify the build
5. Run `npm test`, `npm run typecheck`, and `swift test` (see [Testing](#testing))
6. Submit a pull request

## License

[MIT](LICENSE)
