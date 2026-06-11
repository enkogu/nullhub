#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
TEST_HOME="$(mktemp -d "${TMPDIR:-/tmp}/nullhub-backend.XXXXXX")"
MIN_BACKEND_UNIT_TESTS=700

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

run_unit_tests_with_count_guard() {
  local output_file="$TEST_HOME/zig-build-test.out"
  local status
  local summary_count
  local passed_tests

  set +e
  zig build test -Dembed-ui=false -Dbuild-ui=false --summary all 2>&1 | tee "$output_file"
  status=${PIPESTATUS[0]}
  set -e

  if (( status != 0 )); then
    return "$status"
  fi

  summary_count="$(grep -Eo '[0-9]+/[0-9]+ tests passed' "$output_file" | tail -n 1 || true)"
  if [[ -z "$summary_count" ]]; then
    echo "error: missing Zig test summary line matching 'N/M tests passed'" >&2
    return 1
  fi

  passed_tests="${summary_count%%/*}"
  echo "Backend unit test-count guard: ${summary_count} (minimum ${MIN_BACKEND_UNIT_TESTS})"

  if (( passed_tests < MIN_BACKEND_UNIT_TESTS )); then
    echo "error: backend unit test-count guard failed: ${passed_tests} tests passed, expected at least ${MIN_BACKEND_UNIT_TESTS}" >&2
    return 1
  fi
}

cd "$PACKAGE_ROOT"
export HOME="$TEST_HOME"

run_unit_tests_with_count_guard
run_with_timeout zig build test-integration -Dembed-ui=false -Dbuild-ui=false --summary all
