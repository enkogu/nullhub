#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

PORT="${NULLHUB_PORT:-19802}"
BASE_URL="${NULLHUB_URL:-http://127.0.0.1:$PORT}"
TEST_HOME=""
SERVER_LOG=""
SERVER_PID=""

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    echo "Stopping server..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${TEST_HOME:-}" ]; then
    rm -rf "$TEST_HOME"
  fi
}
trap cleanup EXIT

server_is_running() {
  if [ -z "${SERVER_PID:-}" ]; then
    return 1
  fi
  kill -0 "$SERVER_PID" 2>/dev/null
}

fail_if_server_exited() {
  context=$1
  if server_is_running; then
    return 0
  fi

  exit_code=0
  set +e
  wait "$SERVER_PID"
  exit_code=$?
  set -e

  echo "FAIL: nullhub exited unexpectedly during $context (exit $exit_code)" >&2
  if [ -f "$SERVER_LOG" ]; then
    echo "--- nullhub server log ---" >&2
    cat "$SERVER_LOG" >&2
    echo "--- end nullhub server log ---" >&2
  fi
  exit 1
}

start_server_if_needed() {
  if [ -n "${NULLHUB_URL:-}" ]; then
    return 0
  fi

  TEST_HOME=$(mktemp -d "${TMPDIR:-/tmp}/nullhub-mission-smoke.XXXXXX")
  SERVER_LOG="$TEST_HOME/nullhub-server.log"

  echo "Building nullhub..."
  zig build

  echo "Starting nullhub on port $PORT..."
  HOME="$TEST_HOME" ./zig-out/bin/nullhub serve --host 127.0.0.1 --port "$PORT" --no-open >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!

  echo "Waiting for server..."
  for i in $(seq 1 30); do
    fail_if_server_exited "startup"
    if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null | grep -q "200"; then
      echo "Server ready after ${i} attempt(s)."
      return 0
    fi
    sleep 0.25
  done

  echo "Server failed to start after 30 attempts" >&2
  if [ -f "$SERVER_LOG" ]; then
    cat "$SERVER_LOG" >&2
  fi
  exit 1
}

start_server_if_needed

node - "$BASE_URL" <<'NODE'
const base = process.argv[2];

async function api(path, method = 'GET') {
  const res = await fetch(base + path, { method });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  return { status: res.status, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let response = await api('/api/mission-control/reset', 'POST');
assert(response.status === 200, `reset returned ${response.status}`);
assert(response.body.schema_version === 1, 'missing schema_version');
assert(response.body.mode === 'deterministic_local_replay', 'unexpected mission mode');
assert(response.body.status === 'idle', `expected idle, got ${response.body.status}`);

response = await api('/api/mission-control/recover', 'POST');
assert(response.status === 409, `early recover returned ${response.status}`);
assert(response.body.error?.code === 'mission_not_recoverable', 'missing recover conflict code');

response = await api('/api/mission-control/launch', 'POST');
assert(response.status === 200, `launch returned ${response.status}`);
assert(response.body.status === 'running', `expected running, got ${response.body.status}`);

response = await api('/api/mission-control/launch', 'POST');
assert(response.status === 409, `duplicate launch returned ${response.status}`);
assert(response.body.error?.code === 'mission_already_started', 'missing launch conflict code');

await sleep(10_500);
response = await api('/api/mission-control/state');
assert(response.status === 200, `state returned ${response.status}`);
assert(response.body.status === 'intervention_required', `expected intervention_required, got ${response.body.status}`);
assert(response.body.controls.can_recover === true, 'expected recover control');
assert(response.body.failure?.run_id === 'run-mission-code-red-failed', 'missing failed replay failure panel');
assert(response.body.replay_comparison === null, 'replay comparison must not expose recovered artifact before recovery');
const failedEvent = response.body.events.find((event) => event.title === 'Validation failed');
assert(failedEvent?.trace?.run_id === 'run-mission-code-red-failed', 'missing failed run trace ref');
assert(failedEvent?.trace?.eval_key === 'tool_success', 'missing failed eval trace ref');

response = await api('/api/mission-control/recover', 'POST');
assert(response.status === 200, `recover returned ${response.status}`);
assert(response.body.recovered_run_id === 'run-mission-code-red-recovered', 'missing recovered run id');

await sleep(12_000);
response = await api('/api/mission-control/state');
assert(response.status === 200, `final state returned ${response.status}`);
assert(response.body.status === 'completed', `expected completed, got ${response.body.status}`);
assert(response.body.telemetry.verdict === 'pass', `expected pass verdict, got ${response.body.telemetry.verdict}`);
assert(response.body.replay_comparison?.recovered?.run_id === 'run-mission-code-red-recovered', 'missing recovered replay artifact comparison');
assert(response.body.replay_comparison?.delta?.checkpoint_reused === true, 'missing replay artifact checkpoint reuse');
const recoveredEvent = response.body.events.find((event) => event.title === 'Recovered tests passed');
assert(recoveredEvent?.trace?.run_id === 'run-mission-code-red-recovered', 'missing recovered run trace ref');
const finalState = response.body;

response = await api('/api/mission-control/replay');
assert(response.status === 200, `replay export returned ${response.status}`);
assert(response.body.artifact_kind === 'nullhub.mission_control.replay', 'unexpected replay artifact kind');
assert(response.body.snapshot?.status === 'completed', 'replay export missing completed snapshot');
assert(response.body.snapshot?.replay_comparison?.recovered?.verdict === 'pass', 'replay export missing recovered artifact comparison');
assert(response.body.replay_fixture?.scenario_id === 'mission-code-red', 'replay export missing source fixture');
assert(response.body.ecosystem_mapping?.nullwatch?.trace_ref_source === 'events[].trace', 'replay export missing nullwatch mapping');

response = await api('/api/mission-control/replay/save', 'POST');
assert(response.status === 200, `replay save returned ${response.status}`);
const savedReplayId = response.body.record?.id;
assert(savedReplayId, 'replay save missing durable record id');
assert(response.body.record?.phase === 'completed', 'replay save missing completed phase');

response = await api('/api/mission-control/replays');
assert(response.status === 200, `replay list returned ${response.status}`);
assert(response.body.items?.some((item) => item.id === savedReplayId), 'saved replay not listed');

response = await api(`/api/mission-control/replays/${encodeURIComponent(savedReplayId)}`);
assert(response.status === 200, `stored replay read returned ${response.status}`);
assert(response.body.artifact_kind === 'nullhub.mission_control.replay', 'stored replay missing artifact kind');
assert(response.body.snapshot?.phase === 'completed', 'stored replay missing completed snapshot');

console.log(`mission-control smoke ok: ${finalState.status}, ${finalState.telemetry.spans} spans, ${finalState.telemetry.evals} evals`);
NODE
