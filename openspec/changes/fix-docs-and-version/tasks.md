## 1. Version single-source-of-truth

- [ ] 1.1 In `src/index.ts`, replace the hardcoded `version: "1.0.0"` by reading the version from package.json (e.g. `createRequire(import.meta.url)("../package.json").version`), so the initialize handshake satisfies the `server-metadata` spec.
- [ ] 1.2 Bump `version` in `package.json` from `1.0.1` to `1.1.0` (minor bump for the `update_event` tool addition).

## 2. Documentation fixes

- [ ] 2.1 In `README.md`, remove the two hanging `npx apple-calendar-mcp doctor` lines (lines 39 and 46) under the install/access section.
- [ ] 2.2 In the `README.md` Verification block (around line 104-116), add an example: `swift/.build/release/apple-bridge update-event --id <ID> --title "New title"`.
- [ ] 2.3 In `CLAUDE.md`, add the same `apple-bridge update-event --id <ID> --title "New title"` example to the "Verify Swift binary" block under Build & Run.

## 3. Retire stale review

- [ ] 3.1 Delete `REVIEW.md` (stale prior review: wrong fork owner, references the removed `delete_event` tool; open items are tracked by other openspec changes).

## 4. Verification

- [ ] 4.1 Run `npm run build` (tsc) and confirm it compiles with no errors.
- [ ] 4.2 Start the server (`node build/index.js`) and confirm the reported MCP server version is `1.1.0`, matching package.json (per the `server-metadata` spec).
- [ ] 4.3 Confirm every command shown in the README Verification block and CLAUDE.md "Verify Swift binary" block runs without hanging, including the new `update-event` example.
