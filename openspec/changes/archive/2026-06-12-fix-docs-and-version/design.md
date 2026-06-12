# Design

## Context

The server name/version are passed to `new McpServer({ name, version })` in `src/index.ts` and surfaced to clients during the MCP initialize handshake. The version literal previously drifted from package.json; `src/index.ts` now reads the version from `package.json` at runtime, so the two can no longer diverge. Separately, README and CLAUDE.md carry documentation that either hangs (npm bin invoked with a `doctor` argv it ignores) or omits the headline `update_event` tool.

## Goals / Non-Goals

**Goals:**
- Make package.json the single source of truth for the reported server version.
- Bump the package version once to `1.1.0` to reflect the `update_event` addition.
- Fix README/CLAUDE.md so every documented command actually works and the access-grant flow matches how the project owner grants access (System Settings, not `tccutil reset`).
- Confirm no stale REVIEW.md remains (already absent — no action).

**Non-Goals:**
- No changes to tool behavior, the Swift bridge, or the JSON envelope.
- No automated tests added (project remains manual-verification only).
- Whether README Option 1's `npx apple-calendar-mcp` flow works end-to-end (the package is built locally and path-referenced, not published to npm) is a separate concern, out of scope here. This change only fixes the access-grant command shown within that documented flow.

## Decisions

- **Read version from package.json at runtime via `readFileSync` + `JSON.parse`.** `src/index.ts` resolves `package.json` from its own compiled location: `fileURLToPath(import.meta.url)` → `dirname` → `join(__dirname, "..", "package.json")`. From `build/index.js` this resolves to the package-root `package.json`. This avoids a JSON-import assertion and needs no `createRequire`. (Implemented in commit `16ac968`; an earlier draft of this design proposed `createRequire`, which was not used.)
- **Bump to 1.1.0, not 1.0.2.** A new MCP tool (`update_event`) is a backward-compatible feature addition, which is a minor bump under semver.
- **REVIEW.md needs no action — already absent.** It was never tracked in git and does not exist in the tree; its open items are captured by other openspec changes. Nothing to delete.
- **README Option 1 access: rewrite the whole block, not bare-remove lines.** The "After installation, grant calendar access" flow spans README lines 36-47: a `npx ... doctor` line (39) and an "If access was previously denied" block (42-47, containing `tccutil reset Calendar` on line 45 plus a second `npx ... doctor` on line 46). Both `doctor` lines hang (the stdio npm bin has no `doctor` subcommand) and bare-deleting them would orphan the surrounding prose and the `tccutil` line. Replace the whole flow with one accurate instruction: once the server is registered the macOS calendar (TCC) prompt appears on the first calendar tool call, and if access was denied, re-grant it in System Settings → Privacy & Security → Calendars. The Swift-binary `doctor` form stays documented in Option 2 / Verification for source builds.
- **Replace `tccutil reset Calendar` in the Troubleshooting docs too.** Beyond Option 1, `tccutil reset Calendar` also appears in the README Troubleshooting block (line 125) and CLAUDE.md (line 85). The project owner re-grants access via System Settings, not `tccutil reset`, so point these at System Settings → Privacy & Security → Calendars for consistency with the rewritten Option 1 flow.
- **No CHANGELOG entry for the doc fixes.** CHANGELOG.md already records "The server version is now sourced from `package.json`" under `[1.1.0]`, so the version work is covered. The remaining changes are documentation-only (no behavior or API change), which Keep a Changelog does not require an entry for; adding one would be noise.

## Risks / Trade-offs

- Resolving the package.json path from the compiled `build/index.js` via `readFileSync` is layout-sensitive; if the relative path is wrong the server throws at startup (fail-fast, not a silent wrong version). Mitigation: `node build/index.js` after build and confirm the reported version is `1.1.0` — already verified in the committed tree.
- npm always packs `package.json` at the package root, so `join(__dirname, "..", "package.json")` also resolves correctly for an installed package, not just a source checkout.
