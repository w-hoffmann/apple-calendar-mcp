#!/usr/bin/env node
// Fake `apple-bridge` binary for contract tests. Selected via FAKE_BRIDGE_MODE.
// It emits canned JSON envelopes (shapes copied from real apple-bridge output)
// or misbehaves on purpose, so SwiftBridge's parse/error/timeout/buffer paths
// can be exercised without EventKit or TCC.
//
// Invoked via APPLE_BRIDGE_BIN pointed at this file's absolute path. The
// contract test chmod's it executable in beforeAll so the exec bit can never
// drift across a CI checkout (the shebang then runs it under node).
//
// Envelope contract — keep in sync with `BridgeOutput<T>` in
// swift/Sources/AppleBridgeCore/Models.swift: `{ status: "ok" | "error",
// data?: T, error?: string }`. If that envelope shape changes (renamed fields,
// new status), update the `ok`/`error` cases below to match.
const mode = process.env.FAKE_BRIDGE_MODE ?? "ok";

switch (mode) {
  case "ok": {
    // Shape copied from `apple-bridge calendars` (CalendarInfo[]).
    const data = [
      {
        id: "FAKE-CAL-1",
        title: "Fake Calendar",
        type: "local",
        source: "Local",
        color: "#FF0000",
        isImmutable: false,
      },
    ];
    process.stdout.write(JSON.stringify({ status: "ok", data }) + "\n");
    break;
  }
  case "error":
    // Shape copied from a real failure envelope.
    process.stdout.write(
      JSON.stringify({ status: "error", error: "fake bridge failure message" }) +
        "\n"
    );
    break;
  case "malformed-json":
    // Not a valid JSON envelope — exits 0 with garbage on stdout.
    process.stdout.write("this is definitely not json {");
    break;
  case "empty-stdout":
    // Clean exit but no output at all — must still surface a clear parse error
    // rather than returning undefined data.
    process.exit(0);
    break;
  case "nonzero-exit":
    // Non-zero exit AND no stdout — the "apple-bridge failed (exit N)" path.
    process.stderr.write("fake bridge crashed");
    process.exit(3);
    break;
  case "oversized": {
    // Emit far more than the injected maxBuffer so the limit trips.
    process.stdout.write("x".repeat(256 * 1024));
    break;
  }
  case "hang":
    // Never write, never exit — forces the injected timeout to fire.
    setInterval(() => {}, 1 << 30);
    break;
  default:
    process.stderr.write(`unknown FAKE_BRIDGE_MODE: ${mode}`);
    process.exit(2);
}
