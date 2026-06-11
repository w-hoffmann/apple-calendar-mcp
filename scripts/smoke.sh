#!/usr/bin/env bash
# Local smoke test of the apple-bridge validation paths.
#
# Access-independent checks always run. The create-path checks need calendar
# access — grant it first (apple-bridge doctor) and pass a writable calendar id:
#
#   ./scripts/smoke.sh --calendar-id <CALENDAR_ID>
#
set -uo pipefail
BIN="${APPLE_BRIDGE_BIN:-swift/.build/release/apple-bridge}"
fail=0

check() {
  local desc="$1"; shift
  local out; out="$("$@" 2>&1)"
  if echo "$out" | grep -q '"status" : "error"'; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc"; echo "       $out"; fail=1
  fi
}

echo "# Access-independent validation"
check "unknown --span rejected"            "$BIN" update-event --id X --span sideways
check "conflicting all-day flags rejected" "$BIN" update-event --id X --all-day --no-all-day

if [ "${1:-}" = "--calendar-id" ] && [ -n "${2:-}" ]; then
  CAL="$2"
  echo "# Access-dependent validation (calendar $CAL)"
  check "empty title rejected (create)"    "$BIN" create-event --calendar-id "$CAL" --title "" --start 2026-07-01T10:00:00Z --end 2026-07-01T11:00:00Z
  check "inverted range rejected (create)" "$BIN" create-event --calendar-id "$CAL" --title T --start 2026-07-01T12:00:00Z --end 2026-07-01T10:00:00Z
  check "invalid time zone rejected"       "$BIN" create-event --calendar-id "$CAL" --title T --start 2026-07-01T10:00:00Z --end 2026-07-01T11:00:00Z --time-zone Mars/Phobos
else
  echo "# Skipping access-dependent checks (pass --calendar-id <ID> to run them)"
fi

exit $fail
