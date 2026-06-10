# Documentation

Project documentation lives in [README.md](README.md) and `docs/`.

- Read first: `README.md`

# Monorepo Context

When this repo is checked out as a submodule of `nullclaw-multitenant`
(`apps/nullstack/nullhub`), the canonical specifications live in the parent at
`../../../docs/specs/` and govern all work here:

- `../../../docs/specs/product.md` — product model, vocabulary, target IA.
- `../../../docs/specs/frontend.md` — UI platform, screen/component registry,
  oversized-component decomposition rules, Storybook policy.
- `../../../docs/specs/testing.md` — required test layers and exact commands
  per artifact type (components, routes, API clients, Zig backend).
- `../../../docs/specs/reliability.md` — failure classes and gates; remounted
  routes must never blank/freeze the app.
- `../../../AGENTS.md` — engineering protocol (beads task contract, merge and
  submodule push rules: push this submodule first, parent pointer second).

# Build & Test

```bash
zig build test -Dembed-ui=false -Dbuild-ui=false --summary all  # backend tests
zig build test-integration                                      # integration
npm --prefix ui run build                                       # UI build
```

# UI Implementation

- Use shadcn/shadcn-svelte components and patterns for UI by default across React, Svelte, and other frontend surfaces unless the user explicitly asks for another design system.
- Prefer existing shadcn primitives from `ui/src/lib/components/ui` before adding custom controls; keep controls compact and consistent with the local shadcn theme.
- Do not add new features inside a component that is already over 500 lines
  without first extracting the section you touch (parent `frontend.md`).

# Product Terminology

- User-facing agent work cycles are called `Loops`, not `Processes`.
- Under the hood, a `Loop` is a ticket-backed NullTickets work cycle (the code-level entity is still named `pipeline` internally — never surface that word in UI); do not add a separate runtime/entity for `Loop` unless explicitly requested.
- Keep `Workflow` reserved for NullBoiler graph/orchestration concepts.
- See `../../../docs/specs/product.md` for the product boundary.
