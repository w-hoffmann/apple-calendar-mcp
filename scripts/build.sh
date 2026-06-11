#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- Prerequisite checks ---
check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: $1 is not installed or not in PATH" >&2
    exit 1
  fi
}

check_command swift
check_command node
check_command npm

NODE_MAJOR=$(node -e 'console.log(process.version.slice(1).split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js >= 20 required, found v${NODE_MAJOR}" >&2
  exit 1
fi

# --- Build Swift bridge ---
echo "=== Building Swift bridge ==="
cd "$ROOT_DIR/swift"
swift build -c release 2>&1
codesign --force --sign - --entitlements apple-bridge.entitlements .build/release/apple-bridge

# Verify the Info.plist (TCC usage description) was embedded and the signature is valid
if ! otool -s __TEXT __info_plist .build/release/apple-bridge >/dev/null 2>&1; then
  echo "Error: Info.plist not embedded in apple-bridge — the macOS calendar prompt would have no usage text" >&2
  exit 1
fi
codesign --verify --strict .build/release/apple-bridge
echo "Swift bridge built: swift/.build/release/apple-bridge"

# --- Build TypeScript MCP server ---
echo ""
echo "=== Building TypeScript MCP server ==="
cd "$ROOT_DIR"

if [ ! -d node_modules ]; then
  echo "node_modules not found, running npm install..."
  npm install
fi

npm run build
echo "TypeScript server built: build/index.js"

echo ""
echo "=== Build complete ==="
