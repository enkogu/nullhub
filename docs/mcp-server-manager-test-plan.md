# MCP Server Manager Test Plan

Status: active
Scope: NullHub managed NullClaw MCP manager

## Goals

- Protect MCP config mutation from writing runtime-invalid `config.json`.
- Protect secrets and credentials from accidental exposure or stale retention.
- Protect the Svelte editor from corrupting command args, env maps, or headers.
- Keep MCP reload/probe/read routes aligned with managed NullClaw CLI behavior.

## Backend Coverage

Run:

```sh
zig build test -Dembed-ui=false -Dbuild-ui=false --summary all
```

Covered by `src/api/instances.zig` tests:

- MCP server name validation.
- HTTP URL policy: remote `http` rejection, local/private `http` allowance, malformed IPv6 rejection, fragment/space rejection.
- HTTP header name/value validation, including CR/LF injection rejection.
- Full draft validation for stdio and HTTP transports.
- Partial PATCH validation for env/header-only updates.
- Read routes:
  - `GET /mcp`
  - `GET /mcp?name=...`
  - `POST /mcp-probe?name=...`
  - `POST /mcp-reload`
- Mutation routes:
  - validate
  - create
  - duplicate create rejection
  - name mismatch rejection
  - partial PATCH merge
  - explicit env/header replace and clear
  - delete
  - missing delete target rejection
- Config safety:
  - atomic writes preserve existing file mode.
  - service-only flags are not persisted.
  - invalid config roots are rejected.
  - invalid `mcp_servers` shapes are rejected.
  - invalid JSON config is rejected.
- Component boundary:
  - unsupported components reject MCP read/write.
  - missing instances return `404`.

## Frontend Coverage

Run:

```sh
npm run test:mcp
```

Covered by `ui/src/lib/mcpEditor.test.mjs`:

- Empty editor draft defaults.
- Transport normalization.
- Args serialization preserves commas inside one arg.
- Env/header text parsing preserves values containing `=`.
- Editor hydration never exposes secret values.
- HTTP edits omit hidden headers by default.
- Explicit replace flags send empty maps for credential clearing.
- Mutation result messaging.

## Build Coverage

Run:

```sh
npm run build
zig build --summary all
```

These catch Svelte syntax, route imports, embedded UI generation, and full NullHub binary compilation.

## Manual Smoke

After a successful build:

```sh
NULLHUB_HOME=$(mktemp -d /tmp/nullhub-mcp.XXXXXX) ./zig-out/bin/nullhub serve --host 127.0.0.1 --port 19810 --no-open
curl -fsS http://127.0.0.1:19810/api/status
curl -fsS http://127.0.0.1:19810/api/components
```

Expected:

- root page returns HTTP 200.
- `/api/status` reports `overall_status:"ok"`.
- `/api/components` lists `nullclaw`.
