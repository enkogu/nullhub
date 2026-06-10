#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
TEST_HOME="$(mktemp -d "${TMPDIR:-/tmp}/nullhub-backend.XXXXXX")"

cleanup() {
  rm -rf "$TEST_HOME"
}
trap cleanup EXIT

run_with_timeout() {
  if command -v timeout >/dev/null 2>&1 && timeout --version >/dev/null 2>&1; then
    timeout 300s "$@"
  else
    "$@"
  fi
}

cd "$PACKAGE_ROOT"
export HOME="$TEST_HOME"

zig build test -Dembed-ui=false -Dbuild-ui=false --summary all
run_with_timeout zig build test-integration -Dembed-ui=false -Dbuild-ui=false --summary all
