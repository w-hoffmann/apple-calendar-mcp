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

After installation, grant calendar access:

```bash
npx apple-calendar-mcp doctor
```

Grant **Full Access** when prompted. If access was previously denied:

```bash
tccutil reset Calendar
npx apple-calendar-mcp doctor
```

### Option 2: From source

```bash
git clone https://github.com/EgorKurito/apple-calendar-mcp.git
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
| `delete_event` | Delete an event (single occurrence or all future occurrences) |

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
```

## Troubleshooting

**Calendar access denied**
Reset TCC permissions and re-run:
```bash
tccutil reset Calendar
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
5. Submit a pull request

## License

[MIT](LICENSE)
