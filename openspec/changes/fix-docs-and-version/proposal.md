# Fix drifted docs and version metadata

## Why

The MCP server hardcodes version `1.0.0` while package.json declares `1.0.1`, so the initialize handshake reports a version inconsistent with the package; the README also documents commands that hang, and a stale untracked REVIEW.md describes a removed tool and the wrong fork owner.

## What Changes

- Read the server version from package.json (single source of truth) instead of hardcoding it in `src/index.ts`, and bump package.json to `1.1.0` to account for the `update_event` tool added since `1.0.x`.
- Remove the two `npx apple-calendar-mcp doctor` lines from README.md (lines 39 and 46) that hang because the npm bin is a pure stdio MCP server; the working `swift/.build/release/apple-bridge doctor` form already appears elsewhere.
- Add an `apple-bridge update-event --id <ID> --title "New title"` example to the README Verification block and the CLAUDE.md "Verify Swift binary" block (update_event is the headline tool but is undocumented there).
- Retire the stale REVIEW.md (delete): its still-open items are now tracked by other openspec changes, and it references the removed `delete_event` tool and an incorrect fork owner.

## Capabilities

### New Capabilities

- `server-metadata`: the MCP server must report a version consistent with package.json in the initialize handshake.

### Modified Capabilities

<!-- none -->

## Impact

- `src/index.ts` — version sourced from package.json instead of literal `1.0.0`
- `package.json` — version bumped to `1.1.0`
- `README.md` — remove hanging `doctor` lines (39, 46); add `update-event` example to Verification block
- `CLAUDE.md` — add `update-event` example to "Verify Swift binary" block
- `REVIEW.md` — deleted
- `openspec/specs/server-metadata/` — new capability spec (created at archive)
