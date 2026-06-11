# Design

## Context

The server name/version are passed to `new McpServer({ name, version })` in `src/index.ts` and surfaced to clients during the MCP initialize handshake. The version literal `1.0.0` drifted from package.json's `1.0.1`. Separately, README and CLAUDE.md carry documentation that either hangs (npm bin invoked with a `doctor` argv it ignores) or omits the headline `update_event` tool.

## Goals / Non-Goals

**Goals:**
- Make package.json the single source of truth for the reported server version.
- Bump the package version once to `1.1.0` to reflect the `update_event` addition.
- Fix README/CLAUDE.md so every documented command actually works.
- Remove the stale REVIEW.md.

**Non-Goals:**
- No changes to tool behavior, the Swift bridge, or the JSON envelope.
- No automated tests added (project remains manual-verification only).
- No fix to the `author`/`repository` fork-owner fields in package.json (out of scope for this change).

## Decisions

- **Read version from package.json at runtime.** ESM has no JSON import enabled in this tsconfig, so import via `createRequire(import.meta.url)("../package.json")` to stay synchronous and avoid a JSON-import assertion. The build output is `build/index.js`, so the path resolves to `../package.json` from the built file — verify the relative path against the build layout during implementation.
- **Bump to 1.1.0, not 1.0.2.** A new MCP tool (`update_event`) is a backward-compatible feature addition, which is a minor bump under semver.
- **Delete REVIEW.md rather than archive it.** Its open items are captured by other openspec changes and most of its content is obsolete (removed `delete_event`, wrong fork). Keeping a superseded copy adds noise.
- **README doctor lines: remove, not rewrite.** The user-facing install flow does not need a CLI doctor invocation; the Swift-binary doctor form is already documented in the Verification section for source builds.

## Risks / Trade-offs

- Resolving the package.json path from the compiled `build/index.js` is layout-sensitive; if the relative path is wrong the server fails to start. Mitigation: verify with `node build/index.js` after build and confirm the reported version is `1.1.0`.
- Deleting REVIEW.md loses history, but it is untracked and stale, so the loss is acceptable.
