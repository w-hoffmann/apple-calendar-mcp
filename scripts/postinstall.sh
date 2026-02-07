#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Skip if apple-bridge already built
if [ -f "$ROOT_DIR/swift/.build/release/apple-bridge" ]; then
  exit 0
fi

# Check for Swift
if ! command -v swift &>/dev/null; then
  echo "Warning: swift not found. Apple Calendar MCP requires Swift to build the native bridge." >&2
  echo "Install Xcode or Swift toolchain, then run: cd swift && swift build -c release" >&2
  exit 0
fi

echo "Building apple-bridge (Swift)..."
cd "$ROOT_DIR/swift"
swift build -c release 2>&1
codesign --force --sign - --entitlements apple-bridge.entitlements .build/release/apple-bridge
echo "apple-bridge built successfully."
