## 1. Version single-source-of-truth (already implemented — commit `16ac968`)

- [x] 1.1 `src/index.ts` reads the version from `package.json` via `readFileSync(join(__dirname, "..", "package.json"))` + `JSON.parse` (not `createRequire`), so the initialize handshake satisfies the `server-metadata` spec.
- [x] 1.2 `package.json` version is `1.1.0` (minor bump for the `update_event` tool addition).

## 2. Documentation fixes

- [x] 2.1 In `README.md` Option 1 (install/access, lines ~36-47), replace the whole "grant calendar access" flow — both hanging `npx apple-calendar-mcp doctor` lines AND the `tccutil reset Calendar` block — with an accurate instruction: once the server is registered the macOS/TCC prompt appears on the first calendar tool call, and if access was denied, re-grant it in System Settings → Privacy & Security → Calendars. Leave no dangling step and no `npx ... doctor` / `tccutil reset` recommendation.
- [x] 2.2 In the `README.md` "Verification" block, add `swift/.build/release/apple-bridge update-event --id <ID> --title "New title"`.
- [x] 2.3 In `CLAUDE.md`, add the same `update-event` example to the "Verify Swift binary" block under Build & Run.
- [x] 2.4 Replace the remaining `tccutil reset Calendar` recommendations with System Settings guidance: `README.md` Troubleshooting (line 125) and `CLAUDE.md` (line 85), consistent with how the project grants calendar access.

## 3. Stale review

- [x] 3.1 `REVIEW.md` — already absent (was never tracked in git); nothing to delete.

## 4. Verification

- [x] 4.1 `npm run build` (tsc) compiles with no errors.
- [x] 4.2 `node build/index.js` reports MCP server version `1.1.0`, matching `package.json` (per the `server-metadata` spec). Already true in the committed tree; re-confirm after doc edits.
- [x] 4.3 Every command in the README "Verification" block and the CLAUDE.md "Verify Swift binary" block runs without hanging, including the new `update-event` example.
