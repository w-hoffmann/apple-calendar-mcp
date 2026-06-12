# Fix drifted docs and version metadata

## Why

Two documentation defects remain in the repo, plus one already-fixed version behavior that is not yet captured as a spec:

- **Broken access-grant docs:** the README Option 1 (install/access) shows two `npx apple-calendar-mcp doctor` commands that hang — the npm bin is a pure stdio MCP server that ignores its argv, so the call blocks on stdin instead of running diagnostics. The same access docs (README Option 1 + Troubleshooting, CLAUDE.md) recommend `tccutil reset Calendar`, which is not how the project owner grants access (manually, via System Settings).
- **Undocumented headline tool:** neither the README "Verification" block nor the CLAUDE.md "Verify Swift binary" block documents `update_event`, the main write tool.
- **Version drift (already resolved):** `src/index.ts` now reads the version from `package.json` (single source of truth) and `package.json` is at `1.1.0` — landed in commit `16ac968`. This change captures that behavior as the `server-metadata` capability so it cannot silently regress.

## What Changes

- **[Done, commit `16ac968`]** `src/index.ts` reads the server version from `package.json` via `readFileSync` + `JSON.parse` (single source of truth) instead of a hardcoded literal; `package.json` is bumped to `1.1.0` (minor bump for the `update_event` addition).
- **Rewrite the access-grant docs:** replace the whole README Option 1 "grant calendar access" flow (lines 36-47 — both hanging `npx ... doctor` lines and the `tccutil reset Calendar` block) with an accurate instruction: the macOS prompt appears on the first calendar tool call, and access is re-granted via System Settings if denied. Apply the same `tccutil reset Calendar` → System Settings fix to the README Troubleshooting block (line 125) and CLAUDE.md (line 85). The working `swift/.build/release/apple-bridge doctor` form stays for Option 2.
- **Document `update_event`:** add an `apple-bridge update-event --id <ID> --title "New title"` example to the README "Verification" block and the CLAUDE.md "Verify Swift binary" block.
- **No CHANGELOG entry needed:** CHANGELOG.md already records the version-sourcing under `[1.1.0]`; the remaining changes are documentation-only and need no changelog edit.
- **[Done]** `REVIEW.md` is already absent (never tracked in git) — no deletion needed.

## Capabilities

### New Capabilities

- `server-metadata`: the MCP server must report a version consistent with package.json in the initialize handshake.

### Modified Capabilities

<!-- none -->

## Impact

- `src/index.ts` — **[done]** version sourced from `package.json` via `readFileSync` instead of a literal
- `package.json` — **[done]** version `1.1.0`
- `README.md` — rewrite the Option 1 access flow (36-47: hanging `doctor` lines + `tccutil reset`) and the Troubleshooting `tccutil` line (125) into System-Settings-based steps; add `update-event` example to the Verification block
- `CLAUDE.md` — add `update-event` example to the "Verify Swift binary" block; replace the `tccutil reset Calendar` troubleshooting line (85) with System Settings guidance
- `CHANGELOG.md` — **[no change]** version-sourcing already recorded under `[1.1.0]`; doc-only fixes need no entry
- `REVIEW.md` — **[done]** already absent (never tracked)
- `openspec/specs/server-metadata/` — new capability spec (created at archive)
