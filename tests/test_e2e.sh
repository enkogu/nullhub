#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

PASSED=0
FAILED=0
PORT="${NULLHUB_PORT:-19800}"  # Use high port to avoid conflicts
BASE="http://127.0.0.1:$PORT"
TEST_HOME=$(mktemp -d "${TMPDIR:-/tmp}/nullhub-e2e.XXXXXX")
SERVER_LOG="$TEST_HOME/nullhub-server.log"
SERVER_PID=""

# Cleanup on exit
cleanup() {
    if [ -n "${SERVER_PID:-}" ]; then
        echo "Stopping server..."
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    rm -rf "$TEST_HOME"
}
trap cleanup EXIT

server_is_running() {
    if [ -z "${SERVER_PID:-}" ]; then
        return 1
    fi
    kill -0 "$SERVER_PID" 2>/dev/null
}

fail_if_server_exited() {
    local context="$1"

    if server_is_running; then
        return 0
    fi

    local exit_code=0
    set +e
    wait "$SERVER_PID"
    exit_code=$?
    set -e

    echo -e "${RED}FAIL${NC}: nullhub exited unexpectedly during $context (exit $exit_code)"
    if [ -f "$SERVER_LOG" ]; then
        echo "--- nullhub server log ---"
        cat "$SERVER_LOG"
        echo "--- end nullhub server log ---"
    fi
    exit 1
}

# Build
echo "Building nullhub..."
zig build
EXPECTED_VERSION=$(./zig-out/bin/nullhub --version 2>&1 | awk '{print $2}' | sed 's/^v//')

# Start server in background
echo "Starting nullhub on port $PORT..."
HOME="$TEST_HOME" ./zig-out/bin/nullhub serve --port "$PORT" --no-open >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# Wait for server to be ready (retry loop instead of fixed sleep)
echo "Waiting for server..."
for i in $(seq 1 20); do
    fail_if_server_exited "startup"
    if curl -s -o /dev/null -w "%{http_code}" "$BASE/health" 2>/dev/null | grep -q "200"; then
        echo "Server ready after ${i} attempt(s)."
        break
    fi
    if [ "$i" -eq 20 ]; then
        echo "Server failed to start after 20 attempts"
        exit 1
    fi
    sleep 0.25
done

# Test helper
assert_status() {
    local description="$1"
    local expected="$2"
    local method="$3"
    local url="$4"
    local body="${5:-}"
    local actual=""
    local curl_exit=0

    fail_if_server_exited "$description (before request)"

    set +e
    if [ -n "$body" ]; then
        actual=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$body" "$url")
    else
        actual=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url")
    fi
    curl_exit=$?
    set -e

    fail_if_server_exited "$description (after request)"

    if [ "$curl_exit" -ne 0 ]; then
        actual="CURL_ERROR($curl_exit, HTTP ${actual:-000})"
    fi

    if [ "$actual" = "$expected" ]; then
        echo -e "${GREEN}PASS${NC}: $description (HTTP $actual)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}FAIL${NC}: $description (expected $expected, got $actual)"
        FAILED=$((FAILED + 1))
    fi
}

assert_json_field() {
    local description="$1"
    local url="$2"
    local field="$3"
    local expected="$4"
    local response=""
    local curl_exit=0
    local actual=""

    fail_if_server_exited "$description (before request)"
    set +e
    response=$(curl -s "$url")
    curl_exit=$?
    set -e
    fail_if_server_exited "$description (after request)"

    if [ "$curl_exit" -ne 0 ]; then
        actual="CURL_ERROR($curl_exit)"
    else
        actual=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)$field)" 2>/dev/null || echo "PARSE_ERROR")
    fi

    if [ "$actual" = "$expected" ]; then
        echo -e "${GREEN}PASS${NC}: $description ($field = $actual)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}FAIL${NC}: $description (expected $expected, got $actual)"
        FAILED=$((FAILED + 1))
    fi
}

assert_json_request_field() {
    local description="$1"
    local expected_status="$2"
    local method="$3"
    local url="$4"
    local field="$5"
    local expected="$6"
    local body="${7:-}"
    local response_file="$TEST_HOME/response.json"
    local actual_status=""
    local curl_exit=0
    local actual=""

    fail_if_server_exited "$description (before request)"
    set +e
    if [ -n "$body" ]; then
        actual_status=$(curl -s -o "$response_file" -w "%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$body" "$url")
    else
        actual_status=$(curl -s -o "$response_file" -w "%{http_code}" -X "$method" "$url")
    fi
    curl_exit=$?
    set -e
    fail_if_server_exited "$description (after request)"

    if [ "$curl_exit" -ne 0 ]; then
        actual="CURL_ERROR($curl_exit)"
    else
        actual=$(python3 -c "import sys,json; print(json.load(sys.stdin)$field)" < "$response_file" 2>/dev/null || echo "PARSE_ERROR")
    fi

    if [ "$actual_status" = "$expected_status" ] && [ "$actual" = "$expected" ]; then
        echo -e "${GREEN}PASS${NC}: $description (HTTP $actual_status, $field = $actual)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}FAIL${NC}: $description (expected HTTP $expected_status and $field = $expected, got HTTP ${actual_status:-000} and $actual)"
        if [ -s "$response_file" ]; then
            echo "--- response body ---"
            sed -n '1,40p' "$response_file"
            echo "--- end response body ---"
        fi
        FAILED=$((FAILED + 1))
    fi
}

echo ""
echo "=== Health ==="
assert_status "GET /health returns 200" "200" GET "$BASE/health"

echo ""
echo "=== Status API ==="
assert_status "GET /api/status returns 200" "200" GET "$BASE/api/status"
assert_json_field "Status has hub version" "$BASE/api/status" "['hub']['version']" "$EXPECTED_VERSION"

echo ""
echo "=== Components API ==="
assert_status "GET /api/components returns 200" "200" GET "$BASE/api/components"
assert_status "POST /api/components/refresh returns 200" "200" POST "$BASE/api/components/refresh"

echo ""
echo "=== Instances API ==="
assert_status "GET /api/instances returns 200" "200" GET "$BASE/api/instances"

echo ""
echo "=== Wizard API ==="
assert_status "GET /api/wizard/nullclaw returns 200" "200" GET "$BASE/api/wizard/nullclaw"
assert_status "GET /api/wizard/unknown returns 404" "404" GET "$BASE/api/wizard/unknown"

echo ""
echo "=== Updates API ==="
assert_status "GET /api/updates returns 200" "200" GET "$BASE/api/updates"

echo ""
echo "=== Settings API ==="
assert_status "GET /api/settings returns 200" "200" GET "$BASE/api/settings"
assert_status "PUT /api/settings returns 200" "200" PUT "$BASE/api/settings" "{\"port\":$PORT}"

echo ""
echo "=== Service API ==="
assert_status "GET /api/service/status returns 200" "200" GET "$BASE/api/service/status"

echo ""
echo "=== Market install/export round trip ==="
assert_json_request_field "POST /api/spaces creates ops Space" "201" POST "$BASE/api/spaces" "['id']" "ops" '{"id":"ops","name":"Operations","kind":"workspace","stage":"active"}'
assert_json_request_field "POST /api/spaces creates fresh Space" "201" POST "$BASE/api/spaces" "['id']" "fresh" '{"id":"fresh","name":"Fresh","kind":"workspace","stage":"active"}'

MULTIPLICATION_INSTALL_BODY=$(cat <<'JSON'
{
  "manifest": {
    "id": "test.multiplication-demo",
    "name": "Multiplication Demo Kit",
    "version": "1.0.0",
    "scale": "kit",
    "requires": [
      { "kind": "secret_ref", "name": "fake_llm", "secret_ref": "providers.fake_llm.api_key" }
    ],
    "contributes": [
      { "kind": "order_template", "name": "Multiplication Demo Loop" }
    ],
    "config": {
      "secrets": [
        { "name": "fake_llm", "secret_ref": "providers.fake_llm.api_key" }
      ]
    },
    "seeds": [
      {
        "kind": "order",
        "id": "multiplication-demo-loop",
        "title": "Multiplication Demo Loop",
        "summary": "Multiply fixture inputs and attach Work evidence.",
        "order_kind": "loop",
        "status": "active",
        "schedule": "manual",
        "content": "Run the fake-provider multiplication demo and record 6 x 7 = 42."
      }
    ],
    "extends": [],
    "charter": {
      "mission": "Exercise install, package tagging, export, and import with fake providers only."
    }
  }
}
JSON
)

assert_json_request_field "POST /api/market/install applies multiplication kit" "201" POST "$BASE/api/market/install?space=ops" "['status']" "installed" "$MULTIPLICATION_INSTALL_BODY"
assert_json_field "Installed package source tag is traceable" "$BASE/api/market/installed?space=ops" "['packages'][0]['id']" "test.multiplication-demo"
assert_json_field "Installed order is visible in Orders" "$BASE/api/orders?space=ops" "['orders'][0]['title']" "Multiplication Demo Loop"

EXPORT_BODY='{"id":"export.ops.multiplication-blueprint","scope":"space","name":"Multiplication Space Blueprint","summary":"Recreates the multiplication demo Space."}'
assert_json_request_field "POST /api/market/export packs ops Space as Blueprint" "201" POST "$BASE/api/market/export?space=ops" "['package_id']" "export.ops.multiplication-blueprint" "$EXPORT_BODY"
assert_status "GET exported Blueprint manifest returns 200" "200" GET "$BASE/api/market/library/export.ops.multiplication-blueprint.json?space=ops"

EXPORTED_BLUEPRINT=$(curl -s "$BASE/api/market/library/export.ops.multiplication-blueprint.json?space=ops")
BLUEPRINT_INSTALL_BODY=$(printf '%s' "$EXPORTED_BLUEPRINT" | python3 -c 'import json,sys; print(json.dumps({"manifest": json.load(sys.stdin)}))')
assert_json_request_field "POST exported Blueprint installs into fresh Space" "201" POST "$BASE/api/market/install?space=fresh" "['status']" "installed" "$BLUEPRINT_INSTALL_BODY"
assert_json_field "Fresh Space library contains exported Blueprint" "$BASE/api/market/installed?space=fresh" "['packages'][0]['id']" "export.ops.multiplication-blueprint"
assert_json_field "Fresh Space contains recreated order" "$BASE/api/orders?space=fresh" "['orders'][0]['title']" "Multiplication Demo Loop"

echo ""
echo "=== Unknown routes ==="
assert_status "GET /api/nonexistent returns 404" "404" GET "$BASE/api/nonexistent"

echo ""
echo "================================"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo "================================"

fail_if_server_exited "final result collection"

if [ $FAILED -gt 0 ]; then
    exit 1
fi
