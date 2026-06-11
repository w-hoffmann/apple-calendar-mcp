# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-06-11

### Added

- Input validation at the Swift bridge trust boundary: `create_event` and
  `update_event` reject an empty title, an inverted date range (start after
  end), and an invalid time-zone identifier; `update-event` rejects an unknown
  `--span` value and conflicting `--all-day`/`--no-all-day` flags.
- Unit tests (vitest) for the tool input schemas and the CLI argument builders,
  plus a GitHub Actions CI job (build + typecheck + test) on macOS.
- `Info.plist` (`NSCalendarsFullAccessUsageDescription`) is now embedded into
  the `apple-bridge` binary so the macOS calendar-access prompt has usage text.

### Changed

- The Swift CLI uses async/await (`AsyncParsableCommand`) for the EventKit
  access request instead of a blocking `DispatchSemaphore`.
- MCP tools are registered through the current `registerTool` API and tool
  errors now surface the real error message.
- All-day events may span a single day (`start == end`); timed events still
  require `start < end`.
- The server version is now sourced from `package.json` instead of a hardcoded
  literal.

### Fixed

- `update_event` no longer crashes when returning a detached recurring
  occurrence whose event identifier is nil.
- `create_event` no longer silently ignores an invalid time zone.
